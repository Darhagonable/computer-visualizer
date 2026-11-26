# Data sources — Windows (primary target)

Status: researched & key mechanisms verified 2026-11 · primary RAM-view platform
Privilege legend: 🟢 no elevation · 🔴 admin (+privilege) · 🔵 user-approved driver (PawnIO)

## Overview

| Need | Mechanism | Priv |
| --- | --- | --- |
| Per-page state & use class | Superfetch PFN queries via `NtQuerySystemInformation` | 🔴 |
| Page → owning process | same PFN query (`UniqueProcessKey`) + process list correlation | 🔴 |
| Page → backing file name | PFN query file keys + **FileInfo driver** correlation (RamMap's method) | 🔴 |
| DIMM inventory (slots, maker, PN, serial, speed, type, size, rank) | SMBIOS via `GetSystemFirmwareTable('RSMB')` → parse Type 17 | 🟢 |
| Full SPD read / DDR5 module temp sensors | SMBus/SPD via PawnIO modules (RAMSPDToolkit-class) | 🔵 |
| Per-core temp / freq / package power | MSRs & SMN via PawnIO | 🔵 |
| CPU topology & usage | `GetLogicalProcessorInformationEx`, per-thread times | 🟢 |
| Memory list maintenance ops | `NtSetSystemInformation(SystemMemoryListInformation, …)` | 🔴 |
| Process address space, residency, sharing | `VirtualQueryEx`, `QueryVirtualMemoryInformation`, `QueryWorkingSetEx`, `GetMappedFileName` | 🟢 accessible processes |
| Per-process footprint counters | `GetProcessMemoryInfo` | 🟢 |
| Allocation / fault tracing | ETW kernel session (`EVENT_TRACE_FLAG_VIRTUAL_ALLOC`, `EVENT_TRACE_FLAG_MEMORY_HARD_FAULTS`) | 🔴 opt-in |
| GPU utilisation, per engine and per process | performance counters `\GPU Engine(*)` | 🟢 |
| VRAM total and per process | `\GPU Adapter Memory(*)`, `\GPU Process Memory(*)` | 🟢 |
| GPU temperature, power, fans, clocks | NVML (NVIDIA) / ADLX (AMD) — vendor libraries that ship with the driver | 🟢 |
| DIMM temperature | SPD hub sensor, one per DDR5 module (SMBus) | 🔵 |
| Drives: model, bus type, serial | `IOCTL_STORAGE_QUERY_PROPERTY` (`StorageDeviceProperty`) on `\\.\PhysicalDrive*N*` | 🟢 ⚠ |
| Partitions, capacity per volume | `IOCTL_VOLUME_GET_VOLUME_DISK_EXTENTS`, `GetVolumeInformation`, `GetDiskFreeSpaceEx` | 🟢 |
| Drive activity: busy time, bytes read / written | counters `\PhysicalDisk(*)\% Idle Time`, `Disk Read Bytes/sec`, `Disk Write Bytes/sec` | 🟢 |
| NVMe temperature, wear, power-on hours, thresholds | NVMe SMART log and Identify via `IOCTL_STORAGE_QUERY_PROPERTY` (protocol-specific) | 🟢 ⚠ |

## 1. Per-page physical memory truth — the RamMap mechanism (🔴)

Verified against: Sysinternals RamMap behavior, the OutFlank reverse-engineering writeup
(2023), zodiacon's MemInfo sample, and RbMm's published implementation.

RamMap reads **PFN-database identities for every physical page from user mode** through
the Superfetch information channel:

1. **Enumerate physical memory ranges.**
   `NtQuerySystemInformation(SystemSuperfetchInformation, …)` with a
   `SUPERFETCH_INFORMATION` request of class `SuperfetchMemoryRangesQuery` returns a
   `PF_PHYSICAL_MEMORY_RANGE_INFO`: the list of usable physical ranges (base PFN +
   page count each). Physical memory is *not contiguous* — everything downstream is
   range-relative, matching our `PageSnapshot.ranges` design.

2. **Query page identities in chunks.**
   For each range, repeatedly issue `SuperfetchPfnQuery` with a `PF_PFN_PRIO_REQUEST`
   carrying a batch of PFNs; the system fills an `MMPFN_IDENTITY` per page:
   - `PageFrameIndex`
   - **Use description** (`MMPFNUSE_*`): our 12 use-classes —
     `0 PROCESSPRIVATE, 1 FILE, 2 PAGEFILEMAPPED, 3 PAGETABLE, 4 PAGEDPOOL,
     5 NONPAGEDPOOL, 6 SYSTEMPTE, 7 SESSIONPRIVATE, 8 METAFILE, 9 AWEPAGE,
     10 DRIVERLOCKPAGE, 11 KERNELSTACK`
   - **List/priority**: active, standby (priority 0–7), modified, free, zeroed
   - Flags incl. **modified** bit
   - Identity: owning process (`UniqueProcessKey`) for private pages; file key for
     `FILE` pages (→ §2)

3. **Privileges:** run elevated **and** enable `SeProfileSingleProcessPrivilege` in the
   process token before querying (RamMap does the same; without it the queries fail).

⚠ **Stability risk & mitigation:** these classes are undocumented (stable in practice
since Vista — RamMap, MemInfo, and community code rely on them across Win10/11), but
struct version/magic constants and bit layouts *can* shift between builds. Mitigations
baked into the provider: (a) transcribe layouts from `MemInfo.h` (zodiacon) as the
canonical reference at implementation time; (b) probe with a one-page query first and
validate the returned shape; (c) on any inconsistency, drop the `PageStates` capability
live and show the honest empty state instead of rendering garbage.

Performance: batches of ~4K–64K PFNs per call (chunk size tunable in M2); a full
16 GiB sweep must stay under ~250 ms on a mid-range machine (measure in M2, adjust
cadence).

## 2. Page → file names (🔴)

Superfetch gives file-backed pages only as opaque file keys. RamMap resolves names
through the in-box **FileInfo driver** (`\Device\FileInfo`, present by default): its
IOCTLs enumerate volume/file metadata keyed by `UniqueFileObjectKey`, which correlates
1:1 with the PFN query's file identity. Implementation plan: open `\Device\FileInfo`,
enumerate the file+volume tables at startup and on change, build the u32-name
dictionary ([architecture.md §5](../architecture.md)); pages then reference dictionary
ids. If the device is unavailable (filter drivers, unusual lockdown), degrade: file
pages render with use-class but no names — capability `PageOwnerFile` drops,
`PageUseClasses` stays.

## 3. Page → process correlation (🔴)

PFN identities reference processes by `UniqueProcessKey`, whose meaning differs by
Windows version (PID on some, kernel object pointer on others — per the OutFlank
writeup). Correlate via `NtQuerySystemInformation(SystemExtendedProcessInformation)`,
which exposes both PID and the key, mapping to our name table. Sessions/kernel-space
pages keep their use-class only.

## 4. DIMM inventory — SMBIOS (🟢)

`GetSystemFirmwareTable('RSMB', 0, …)` (documented API, no admin) returns
`RawSMBIOSData { UsedCallingMethod, MajorVersion, MinorVersion, DmiRevision, Length,
SMBIOSTableData[] }`. Walk the table generically:

- Each structure: `BYTE Type; BYTE Length; WORD Handle;` formatted area (`Length`
  bytes) + string area (NUL-terminated strings, **1-based** indices, `0` = unset,
  double-NUL ends the list). Stop at Type 127.
- **Type 16** — Physical Memory Array: groups devices, gives location/error-correction
  types (array handle for Type 17 linkage).
- **Type 17** — Memory Device (one per slot, **including empty** slots —
  `Size == 0` ⇒ empty):

| Offset (spec 2.7+) | Field |
| --- | --- |
| 0x0C | Size (MB; `0` empty; bit 15 set ⇒ use Extended Size) |
| 0x0D | Form factor (DIMM/SO-DIMM/…) → stick drawing shape |
| 0x0E/0x0F | Device/Bank locator strings (slot naming) |
| 0x12 | Memory type — **DMTF values**: `0x18` DDR3, `0x1A` DDR4, `0x1B` LPDDR, `0x1C` LPDDR2, `0x1D` LPDDR3, `0x1E` LPDDR4, `0x22` **DDR5**, `0x23` LPDDR5, `0x24` HBM3, `0x25` MRDIMM ⚠ beware stale third-party enum tables circulating with wrong DDR4/DDR5 values — the DMTF DSP0134 PDF is canonical |
| 0x15/0x16 | Speed / Configured speed (MT/s) |
| 0x17–0x1A | Manufacturer / Serial / AssetTag / PartNumber strings |
| 0x1B | Attributes: bits 3–0 = **rank count** (input to chip inference) |
| 0x1C | Extended Size (dword, MB units; required ≥ 32 GiB) |
| 0x28+ | (3.2+) Extended speed, type details — parse when present |

Also: **Type 19/20** (mapped-address ranges) are supposed to give physical
address→DIMM mapping but are **rarely populated by PC firmware** — read opportunistically,
never depend on them (and never treat them as ground truth for our modeled placement).

Implementation shortcuts: the Rust crate **`smbios-lib`** (docs.rs) already parses Type
16/17/19/20 incl. extended fields — use it rather than hand-rolling. WMI alternatives
(`Win32_PhysicalMemory`, `MSSmBios_RawSMBiosTables`) exist for spot-checks/tests.

**Known limits:** no chip count (inferred per [ram-model.md §2](../ram-model.md));
locator strings are OEM-formatted free text (parse loosely, display raw); VMs/locked-down
firmware may return no table (capability `DimmInventory` drops cleanly).

## 5. Sensors & MSRs — PawnIO (🔵)

**Context (verified, decision-relevant):** the historical community driver WinRing0 is
finished — Microsoft Defender now flags it (`VulnerableDriver:WinNT/Winring0`,
`HackTool:Win32/Winring0`, CVE-2020-14979 BYOVD) and quarantines apps shipping it.
LibreHardwareMonitor ≥ 0.9.5 and FanControl replaced it with **PawnIO** (by namazso):
a Microsoft-attestation-signed kernel driver that loads *modules* — small audited
Pawn-language programs, each whitelisting exact operations — and enforces an
admin-only ACL. Installed by the user via winget (`namazso.PawnIO`); our app only
detects and uses it.

What it gives us (module → capability):

- **IntelMSR module** — whitelisted read MSRs incl. `0x19C IA32_THERM_STATUS`
  (per-core digital readout; temp = TjMax from `0x1A2` − readout), `0x1B1` package
  thermal status, `0x198 IA32_PERF_STATUS`, `0xE7/0xE8 MPERF/APERF` (frequency),
  RAPL `0x606/0x611/0x639/0x619` (units/package/core/DRAM energy → power).
  Per-core reads require pinning the calling thread to the target logical processor.
- **AMD modules** (family 17h+, 10h–16h, 0Fh) — MSR + **SMN** access: Zen temperature
  (`THM_TCON_CUR_TMP` with family-specific Tctl offset), SVI2/3 voltage telemetry,
  package energy (`MSR_PKG_ENERGY_STAT`).
- **SMBus / SPD modules** (RAMSPDToolkit-class, as LibreHardwareMonitor uses for RAM
  info) — live SPD reads (exact chip counts, full timings — Thaiphoon-tier data) and
  **DDR5 SPD-hub temperature sensors** (per-module temp on the stick drawings).

Our client: open `\\?\GLOBALROOT\Device\PawnIO`, `LoadBinary` the module,
`DeviceIoControl` `Execute`-style calls with function name + args — mirror the
pattern LibreHardwareMonitor's `PawnIo.cs` established (their code is the reference
implementation; ours is Rust).

Policy: never bundle or auto-install drivers. Detect → offer a "install via winget"
deep link → user consents → UAC does its thing. No PawnIO ⇒ temps/power/SPD layers
show their honest empty states.

## 6. CPU topology & usage (🟢)

- `GetLogicalProcessorInformationEx` with `RelationProcessorPackage` (packages/dies,
  groups), `RelationProcessorCore` (+`EfficiencyClass` for P/E), `RelationCache`
  (L1/L2/L3 with sharing masks — **L3 mask ⇒ CCX**).
- Usage: per-thread times via the NT process information classes we already query for
  §3 — no extra privilege.
- AMD CCD/CCX composition: L3-sharing masks are the robust primary signal; CPUID
  `0x8000001E` node ids as cross-check ⚠ (verify per family in M6, see
  [cpu-model.md](../cpu-model.md)).

## 7. Memory maintenance ops (🔴, opt-in UI actions)

Verified mechanism (community reverse-engineering of RamMap's Empty menu): enable
`SeProfileSingleProcessPrivilege`, then `NtSetSystemInformation` with
`SystemMemoryListInformation` and commands `MemoryEmptyWorkingSets` /
`MemoryFlushModifiedList` / `MemoryPurgeStandbyList`. These are legitimate
administrator maintenance operations; exposed as clearly-labeled buttons, not
"optimization" theater ([VISION.md non-goals](../VISION.md)).

## 8. Per-process memory — address space, residency, sharing (🟢)

Feeds Application Focus layers A and B ([app-focus.md](../app-focus.md) §4–5).

- **Walk:** `VirtualQueryEx` → `MEMORY_BASIC_INFORMATION` (`BaseAddress`, `RegionSize`,
  `State`, `Protect`, `Type` = `MEM_IMAGE` / `MEM_MAPPED` / `MEM_PRIVATE`).
- **Allocation-level detail:** `QueryVirtualMemoryInformation(…, MemoryRegionInfo, …)`
  (Win10 1607+) → `WIN32_MEMORY_REGION_INFORMATION`: `AllocationBase`,
  `AllocationProtect`, `RegionSize`, **`CommitSize`**, and flags `Private`,
  `MappedDataFile`, `MappedImage`, `MappedPageFile`, `MappedPhysical`, `DirectMapped`.
  Fails for unallocated addresses — so walk with `VirtualQueryEx` first. The documented
  struct is broken in 32-bit mode (`ERROR_BAD_LENGTH`); we are x64-only. NT
  `MemoryRegionInformationEx` additionally returns `PartitionId` / `NodePreference` ⚠
  (phnt — undocumented, verify per build).
- **Backing file:** `GetMappedFileName`; NT `MemoryMappedFilenameInformation`.
- **Per-page residency & sharing:** `QueryWorkingSetEx` → per address `Valid`,
  `Shared`, `Shareable`, `ShareCount`, `Node`, `Protection` ⚠ (bit layout per
  `psapi.h`). Shareable ∧ Shared = truly shared (dithered on the board);
  Shareable ∧ ¬Shared = copy-on-write private.
- **VA → PFN:** invert the Superfetch PFN identity (`UniqueProcessKey`, `VirtualAddress`
  per page, §1) and cross-check with `QueryWorkingSetEx` — no privilege beyond the PFN
  query. This is what links a region to its pages on the chips.
- **Labels:** images via `EnumProcessModulesEx` + module names; heaps via
  `RtlQueryProcessDebugInformation` ⚠; thread stacks via thread enumeration → TEB
  `StackBase` / `StackLimit` ⚠. Everything else is honestly "private".
- **Footprint counters:** `GetProcessMemoryInfo` (`PROCESS_MEMORY_COUNTERS_EX`).
- **Protected processes (PPL):** handles can't be opened — access-denied state, no
  workaround.

## 9. Allocation tracing — ETW kernel session (🔴, opt-in)

Feeds Application Focus layer C ([app-focus.md](../app-focus.md) §6–7). Verified against
Microsoft's ETW class docs and the WPT memory exercises.

- **Virtual memory operations:** `EVENT_TRACE_FLAG_VIRTUAL_ALLOC` → event types **98
  `VirtualAlloc`** / **99 `VirtualFree`** (`PageFault_VirtualAlloc`: `BaseAddress`,
  `RegionSize`, `ProcessId`, `Flags` = the `flAllocationType` passed to `VirtualAllocEx`,
  so reserve / commit / release / decommit are distinguishable). Process and thread IDs
  also come from `EVENT_TRACE_HEADER`.
- **Hard faults:** `EVENT_TRACE_FLAG_MEMORY_HARD_FAULTS` → event type **32
  `PageFault_HardFault`** — the faulting address and the file object + byte offset
  being paged in ⚠ field names. Low volume.
- **All faults:** `EVENT_TRACE_FLAG_MEMORY_PAGE_FAULTS` (types 10 transition, 11
  demand-zero, 12 COW, 13 guard, 14 hard, 15 access violation) — volume-prohibitive for
  long captures; burst mode only.
- **Call stacks:** `EVENT_TRACE_TYPE_VIRTUAL_ALLOC` (Kernel Trace Control API) enables
  stack walking for VirtualAlloc events — the basis of WPA's *VirtualAlloc Commit
  Lifetimes*. Resolve with `dbghelp`; symbols opt-in.
- **Session:** since Windows 8, kernel keywords can run on a custom-named session (no
  collision with the `NT Kernel Logger`; coexists with WPR/xperf). Caveats: some
  keywords are NT-Kernel-Logger-only (`ReferenceSet`) and several fail *silently* on the
  wrong session — probe each keyword in the M5 spike ⚠.
- **Attribution keywords** (run together): `Process` (start/stop rundown — names for
  exited processes, safe against PID reuse), `ImageLoad`, `ProcessCounters` (final
  working-set / commit snapshot for reconciliation). "VirtualAlloc End Rundown" events
  give the baseline of existing commits when attaching mid-run ⚠.
- **Not included:** heap-object allocations (ETW Heap tracing — a per-process `IFEO
  TracingFlags` registry setting — or WPR heap snapshots; out of scope, see app-focus
  §10). The `Microsoft-Windows-Kernel-Memory` manifest provider emits periodic
  snapshots, not per-operation events.
- **Consumer:** `StartTrace` → `EnableTraceEx2` → `ProcessTrace` (real-time,
  `EVENT_RECORD`). Surface `EventsLost`; never drop silently. Rust API path is an M5
  spike question (architecture §8).

## 10. GPU telemetry (🟢)

Feeds the GPU scenes and the Temperature / Activity / Power overlays
([../VISION.md](../VISION.md)). Decided 2026-11: the GPU is in scope at **summary level**.
There is no page-level VRAM data on any OS.

| Need | Mechanism | Priv |
| --- | --- | --- |
| Per-engine utilisation, per process | Performance counters `\GPU Engine(*)\Utilization Percentage` and `\Running Time`. The instance name encodes pid, adapter and engine type (`…_pid_4128_…_phys_0_eng_0_engtype_3D`): 3D, Compute, Copy, VideoDecode, VideoEncode | 🟢 |
| VRAM total, per adapter | `\GPU Adapter Memory(*)\Dedicated Usage`, `Shared Usage` | 🟢 |
| VRAM per process | `\GPU Process Memory(*)\Dedicated Usage`, `Shared Usage` — the source Task Manager's GPU column uses (Windows 10 1709+) | 🟢 |
| Temperature, power, fans, clocks | **NVIDIA:** NVML — `nvmlDeviceGetTemperature` (GPU and memory sensors), `nvmlDeviceGetPowerUsage` (mW), `nvmlDeviceGetFanSpeed` / `…GetFanSpeedRPM`, `nvmlDeviceGetClockInfo`, `nvmlDeviceGetTemperatureThreshold`. **AMD:** ADLX (ADL on older drivers). **Intel:** ⚠ verify (Level Zero / IGCL) | 🟢 |
| Hotspot (junction) temperature | AMD: exposed. **NVIDIA: not in NVML** — tools read it through NVAPI's undocumented IDs, "on some cards" | 🟢 ⚠ |

- **No driver of ours.** Everything here is user-mode: PDH counters and vendor libraries
  that ship with the GPU driver. That is why the GPU work needs no PawnIO.
- **What is not there:** which VRAM chip holds what, and which unit of the die is busy.
  The UI *models* those from the real totals and labels them `modelled`.
- **Reading PDH from Rust:** `windows` crate PDH APIs or a dedicated crate ⚠ (decide in the
  milestone). Sample at 1 Hz; the first query of a counter path is slow (warm-up).
- **Counter caveats:** instance names embed the pid, so instances of exited processes
  linger until the next enumeration; per-process `Dedicated Usage` may include shared
  allocations ⚠ — reconcile per-process sums against the adapter total in tests.

## 11. Storage telemetry (🟢)

Feeds the Storage section and the same three overlays. Decided 2026-11: storage is in scope as
**drives and partitions** — capacity, activity, temperature and health. There is no file-level
placement data on any OS.

| Need | Mechanism | Priv |
| --- | --- | --- |
| Drives: model, bus type, serial | `IOCTL_STORAGE_QUERY_PROPERTY` with `StorageDeviceProperty` on `\\.\PhysicalDrive*N*`: vendor, product, revision, `BusType` (`BusTypeNvme`, `BusTypeSata`, `BusTypeUsb` …), serial. The friendly name and enumerator come from SetupAPI (`GUID_DEVCLASS_DISKDRIVE`, `DEVPKEY_Device_*`) | 🟢 ⚠ |
| Partitions: letter, label, file system, size | Volume → drive and extent: `IOCTL_VOLUME_GET_VOLUME_DISK_EXTENTS` on `\\.\C:` gives `DiskNumber`, `StartingOffset`, `ExtentLength`. Label and file system: `GetVolumeInformationW`. Free space: `GetDiskFreeSpaceExW` | 🟢 |
| Partitions without a letter (EFI, recovery) | `IOCTL_DISK_GET_DRIVE_LAYOUT_EX` on the drive: partition type GUIDs, offsets, sizes; GUID volume names by `FindFirstVolumeW` | 🟢 ⚠ |
| Activity: bytes read / written, how busy | Counters `\PhysicalDisk(*C:)\Disk Read Bytes/sec`, `…\Disk Write Bytes/sec`, `…\% Idle Time`, `Avg. Disk sec/Read`, `Avg. Disk sec/Write`, `Current Disk Queue Length` — or deltas of `IOCTL_DISK_PERFORMANCE` (`DISK_PERFORMANCE`: `BytesRead`, `BytesWritten`, `IdleTime`, `QueryTime`), busy time being 1 − ΔIdle / ΔQuery | 🟢 |
| Temperature, an NVMe drive | `IOCTL_STORAGE_QUERY_PROPERTY` with `StorageDeviceProtocolSpecificProperty` (protocol NVMe): the SMART / health log (page 02h) carries the composite temperature in kelvin; Identify carries `wctemp` and `cctemp`, the drive's own warning and critical thresholds | 🟢 ⚠ |
| Temperature, a SATA or USB drive | No standard unelevated path. SMART attribute 194 needs `IOCTL_ATA_PASS_THROUGH` and vendor-aware parsing; `MSFT_StorageReliabilityCounter.Temperature` returns a value for some drives only | 🔴 ⚠ |
| Health: wear, power-on hours | NVMe SMART log: Percentage Used (the drive's own estimate of life consumed), Power On Hours, Media and Data Integrity Errors, Unsafe Shutdowns. A SATA SSD's wear lives in vendor-specific SMART attributes; `MSFT_PhysicalDisk.Wear` where populated ⚠ | 🟢 / 🔴 ⚠ |
| Power | Not exposed by any standard interface | — |

- **⚠ at implementation time:** open a physical drive for query only (`DesiredAccess = 0`) so
  none of this needs elevation, and verify each handle type accepts the I/O control codes
  above unelevated; verify the NVMe log and Identify field offsets against the specification.
- **What is not there:** how a drive's I/O divides between its partitions — the counters are
  per physical disk, and per-process disk I/O is accounted by file, not by volume — and how
  much power a drive draws. The UI *models* the partition split and *estimates* watts, and
  labels both.
- **A missing sensor is no data.** Where no temperature is exposed the drive is drawn in the
  no-data colour. It is never inferred from activity.
- **Thresholds are the drive's.** The mock uses 85 °C as a common default for an NVMe drive's
  warning composite-temperature threshold; the real app reads each drive's `wctemp`.
- **USB bridges** often report the bridge as the device ("USB SATA Bridge") and hide what is
  behind it; some pass SCSI-to-ATA translation through ⚠.

## 12. Testing matrix

| Dimension | Coverage plan |
| --- | --- |
| Windows editions | Win 10 22H2, Win 11 23H2/24H2+ (PFN struct validation per build) |
| Memory sizes | 8 / 32 / 64 GiB (perf budgets from architecture §5) |
| Module mixes | DDR4 & DDR5, 1–4 sticks incl. mixed capacities, empty slots, ECC server DIMMs if accessible |
| CPUs | Intel hybrid (P/E), AMD multi-CCD, AMD monolithic APU, Intel monolithic |
| Application Focus | own vs protected (PPL) processes; high-region-count processes (browsers); WOW64 targets |
| Tracing | custom session alongside WPR/xperf; event loss under load; target exits mid-trace (rundown); attach vs launch |
| GPU | NVIDIA / AMD / Intel / no GPU / iGPU + dGPU; hybrid-graphics laptops; per-process VRAM sums vs adapter total |
| Storage | NVMe (PCIe 3 / 4 / 5), SATA SSD, hard disk, USB bridge; drives with and without a temperature sensor; several partitions incl. letter-less EFI and recovery; BitLocker volumes; busy-time sum against `% Idle Time` |
| Degradation | non-admin launch, Defender-blocked driver states, PawnIO absent/present, VM (no SMBIOS) |

## References

- OutFlank — *Mapping Virtual to Physical Addresses Using Superfetch* (PFN/Superfetch/FileInfo mechanism):
  <https://www.outflank.nl/blog/2023/12/14/mapping-virtual-to-physical-adresses-using-superfetch>
- zodiacon — WindowsInternals / MemInfo sample (canonical `MMPFN_IDENTITY` layouts):
  <https://github.com/zodiacon/WindowsInternals>
- RbMm — Superfetch range/PFN query implementation (Stack Overflow):
  <https://stackoverflow.com/questions/53737778/get-driver-locked-memory-programmatically>
- Sysinternals RAMMap: <https://learn.microsoft.com/en-us/sysinternals/downloads/rammap>
- Memory-list operations via NT API: <https://mouri.moe/en/2021/11/14/Defrag-memory-with-NT-API>
- `GetSystemFirmwareTable` (RSMB): <https://learn.microsoft.com/en-us/windows/win32/api/sysinfoapi/nf-sysinfoapi-getsystemfirmwaretable>
- DMTF SMBIOS spec DSP0134 (Type 17 reference): <https://www.dmtf.org/sites/default/files/standards/documents/DSP0134_3.5.0.pdf>
- `smbios-lib` (Rust): <https://docs.rs/smbios-lib>
- `Win32_PhysicalMemory`: <https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-physicalmemory>
- ETW page-fault / virtual-alloc event types: <https://learn.microsoft.com/en-us/windows/win32/etw/pagefault-v2>
- `PageFault_VirtualAlloc` class: <https://learn.microsoft.com/en-us/windows/win32/etw/pagefault-virtualalloc>
- WPT — track user-mode allocations (VirtualAlloc Commit Lifetimes): <https://learn.microsoft.com/en-us/windows-hardware/test/wpt/memory-footprint-optimization-exercise-2>
- `QueryVirtualMemoryInformation` / `WIN32_MEMORY_REGION_INFORMATION`: <https://learn.microsoft.com/en-us/windows/win32/api/memoryapi/nf-memoryapi-queryvirtualmemoryinformation>
- Sysinternals VMMap: <https://learn.microsoft.com/en-us/sysinternals/downloads/vmmap>
- GPU counters and their Windows version requirement: <https://docs.rainmeter.net/manual/plugins/usagemonitor/>
- `GPU Engine` instance naming: <https://github.com/prometheus-community/windows_exporter/issues/1005>
- NVIDIA NVML API reference: <https://docs.nvidia.com/deploy/nvml-api/latest/api/group__nvmlDeviceQueries.html>
- AMD ADLX: <https://gpuopen.com/learn/adlx-2-0-extending-graphics-control-to-ai-agents-apps/>
- PawnIO: <https://github.com/namazso/PawnIO> · modules: <https://github.com/namazso/PawnIO.Modules>
- LibreHardwareMonitor WinRing0→PawnIO migration: PR #1857, issue #1660
- Defender WinRing0 block: <https://support.microsoft.com/en-us/windows/microsoft-defender-antivirus-alert-vulnerabledriver-winnt-winring0-eb057830-d77b-41a2-9a34-015a5d203c42>
