# Data sources — Linux

Status: researched 2026-11 (kernel-documented interfaces; ⚠ items to re-verify against
kernel docs at implementation time)

Linux is the richest platform: per-page kernel data is exposed through procfs, DIMM data
through DMI/SPD, sensors through hwmon sysfs. The main cost: everything page-related
needs **root**.

## Overview

| Need | Mechanism | Priv |
| --- | --- | --- |
| Per-page flags/state | `/proc/kpageflags` | 🔴 root |
| Per-page map count | `/proc/kpagecount` | 🔴 root |
| Virtual→physical (page → file/process) | `/proc/<pid>/pagemap` + `/proc/<pid>/maps` | 🔴 root (PFN fields zeroed for unprivileged since kernel 4.0) |
| Page size | `getpagesize()` / `/proc/kernel/…` (base 4 KiB; THP/hugetlb pages flagged in kpageflags) | 🟢 |
| DIMM inventory | DMI tables (`dmidecode -t 16/17/19/20`, or raw `/sys/firmware/dmi/tables/DMI` + entry file) | 🔴 root |
| Full SPD (chip-count ground truth) | `decode-dimms` (i2c-tools) with `ee1004`/`eeprom`/`spd5118` ⚠ drivers; DDR5 SPD-hub temps via `spd5118` hwmon | 🔴 root (i2c dev + module load) |
| Memory errors | EDAC sysfs `/sys/devices/system/edac/mc/` | 🟢/🔴 |
| CPU topology | `/sys/devices/system/cpu/cpu*/topology/*`, `lscpu` | 🟢 |
| Temps | hwmon: `coretemp` (Intel), `k10temp` (AMD) | 🟢 |
| Frequencies | cpufreq sysfs; APERF/MPERF via `/dev/cpu/N/msr` | 🟢/🔴 |
| Usage | `/proc/stat` per-cpu | 🟢 |
| GPU utilisation and VRAM, per process | DRM `fdinfo` (`/proc/<pid>/fdinfo/<fd>`: `drm-engine-*`, `drm-memory-vram`, …) | 🟢 |
| GPU temperature, power, fans, clocks | hwmon (amdgpu: `temp1..3` edge / junction / memory), NVML on NVIDIA | 🟢 |
| Per-process footprint & regions | `/proc/<pid>/{statm,status,smaps,smaps_rollup,maps}`, `numa_maps` | 🟢 own / 🔴 others |
| Allocation / fault tracing | tracepoints `kmem:mm_page_alloc`, `kmem:mm_page_free`, `syscalls:sys_enter_mmap`…, `exceptions:page_fault_user` | 🔴 root, opt-in |

## 1. Per-page physical memory truth (🔴)

Documented in the kernel's *admin-guide/mm/pagemap* — stable, parsed as binary arrays
indexed by PFN:

- **`/proc/kpageflags`** — 8 bytes per PFN, one flag bitfield. Bits we consume
  (kernel `KPF_*` names):
  `0 LOCKED, 2 REFERENCED, 4 DIRTY, 5 LRU, 6 ACTIVE, 7 SLAB, 8 WRITEBACK,
  9 RECLAIM, 10 BUDDY (free), 11 MMAP, 12 ANON, 13 SWAPCACHE, 14 SWAPBACKED,
  15/16 COMPOUND_HEAD/TAIL, 17 HUGE, 18 UNEVICTABLE, 19 HWPOISON, 20 NOPAGE,
  21 KSM, 22 THP, 23 OFFLINE, 24 ZERO_PAGE, 25 IDLE, 26 PGTABLE` ⚠ (transcribe the
  full authoritative table from the kernel doc during implementation)
- **`/proc/kpagecount`** — 8 bytes per PFN: map count (0 ⇒ free/unused).

**Linux → canonical model mapping** (target state set from [ram-model.md §5](../ram-model.md)):

| Model state | Linux signal |
| --- | --- |
| `Free` | `BUDDY` set, count 0 |
| `Zeroed` | `ZERO_PAGE` / zeroed buddy (bucket with Free when indistinguishable) |
| `Active` | mapped (`count > 0`) — use-class from flags: `SLAB`⇒kernel, `PGTABLE`⇒page-table, `ANON`⇒private/anonymous, `MMAP`-ish file pages ⇒ file |
| `Modified` | `DIRTY` / `WRITEBACK` |
| `Standby` | LRU file pages not in any working set (inactive/active file buckets; no per-page priority on Linux — priority rendered as the file/anon LRU bucket) |
| `Bad` | `HWPOISON` |

Physical ranges: `/proc/iomem` ("System RAM" ranges, root) → snapshot `ranges`.

## 2. Page → process/file correlation (🔴)

Walk every `/proc/<pid>/maps` entry; for each virtual page read the corresponding
`/proc/<pid>/pagemap` entry (64-bit: bit 63 present, bits 0–54 PFN ⚠ width per kernel
doc). For present pages with a PFN: record `pfn → (pid, vma)`. File-backed VMAs carry
the file path + page offset → `pfn → (file, file_offset)`; anonymous VMAs → process
private; special mappings (`[heap]`, `[stack]`, `vdso`, hugetlb) labeled accordingly.

Semantics to document honestly in-UI: this sees **resident pages via each process's
page tables**. Page-cache pages not mapped by any process (clean cache) and kernel pages
won't get owners — they render with state/use-class only, the inverse of Windows where
the PFN walk owns everything. The two providers fill the same wire format from opposite
directions.

Cost: full-system sweep is expensive (page tables for all processes) — budget it as a
separate, lower-cadence owner pass (e.g. 0.2–0.5 Hz) layered onto the cheap
kpageflags pass (1–2 Hz), with per-process incremental updates on `maps` changes.

## 3. DIMM inventory & SPD

- **Inventory (SMBIOS/DMI):** `dmidecode -t memory` output parsed in-process? No —
  parse the raw tables ourselves: read `/sys/firmware/dmi/tables/DMI` (raw table) +
  `/sys/firmware/dmi/tables/smi_entry_point` (anchor), decode Type 16/17/19/20 with the
  same parser as Windows (share `core` code + `smbios-lib`). Same Type 17 field map and
  chip-inference rules as [windows.md §4](windows.md).
- **Full SPD (tier 2, exact chip counts + DDR5 temps):** the kernel exposes SPD EEPROMs
  on I²C buses: `eeprom`/`ee1004` (DDR4 and older) drivers create per-DIMM files under
  `/sys/bus/i2c/…`; `decode-dimms` (i2c-tools) is the reference decoder. DDR5 modules
  use an SPD hub (SPD5118) with integrated temperature sensors; kernel `spd5118` hwmon
  driver ⚠ (verify minimum kernel version — believed 6.7+) exposes per-DIMM temps as
  standard hwmon inputs, which is our `DimmTemps` capability on Linux for free.
  Requires the `i2c-dev`/driver modules loaded and root.
- **Errors:** EDAC mc sysfs (correctable/uncorrectable counts per DIMM/rank) when
  supported — render as chip-level warning overlays.

## 4. CPU (🟢)

- Topology: `topology/{physical_package_id, die_id, core_id, thread_siblings_list,
  cluster_cpus_list}` — `cluster`/L3 sharing gives CCX on AMD ⚠ (verify `die_id` vs
  `cluster_id` semantics per kernel version); caches under `cpu*/cache/*`.
- Temps: `coretemp` (Intel: per-core + package, TjMax attribute), `k10temp` (AMD:
  Tctl/Tdie per package; per-CCD sensors on multi-CCD ⚠ verify attribute names per
  family). `zenpower` is out-of-tree — mention in UI as unavailable, don't depend.
- Frequency: `cpufreq/stats/time_in_state` + `scaling_cur_freq` per cpu; APERF/MPERF
  via `/dev/cpu/N/msr` (msr module, root) when present.
- Power: RAPL via `/sys/class/powercap/intel-rapl*/*` (energy_uj; Intel) or AMD
  energy counters via MSR ⚠.
- Usage: `/proc/stat` `cpuN` deltas.

## 5. Per-process memory & tracing

Feeds Application Focus ([app-focus.md](../app-focus.md)) layers A–C.

- **Regions:** `/proc/<pid>/maps` (range, perms, offset, dev, inode, pathname; named
  tags `[heap]`, `[stack]`, `[stack:<tid>]`, `[anon:…]`); `/proc/<pid>/smaps` per VMA —
  `Rss`, `Pss`, `Shared_Clean` / `Shared_Dirty`, `Private_Clean` / `Private_Dirty`,
  `Anonymous`, `AnonHugePages`, `Swap`; `smaps_rollup` for totals (cheap timeline
  source); `statm` / `status` (`VmRSS`, `RssAnon`, `RssFile`, `VmSwap`).
- **VA → PFN:** `pagemap` (§2) — links a region to its pages on the chips.
- **Sharing:** `kpagecount` map count > 1 ⇒ shared (dithered).
- **Real NUMA placement:** `/proc/<pid>/numa_maps` gives per-VMA page counts per node
  ⚠ (NUMA systems) — used to constrain the modeled placement of
  [ram-model.md §3](../ram-model.md) to the real node's DIMMs.
- **Tracing (🔴 root, opt-in)** — the most direct data in the project, **physical page
  allocation events with PFNs**:
  - `kmem:mm_page_alloc` (`pfn`, `order`, `gfp_flags`, `migratetype`),
    `kmem:mm_page_free` (`pfn`, `order`), `mm_page_free_batched`,
    `mm_page_alloc_zone_locked` — documented in the kernel's kmem tracepoints page;
    paths under `/sys/kernel/tracing/events/kmem/`.
  - Virtual map events: `syscalls:sys_enter_mmap` / `sys_exit_mmap`,
    `sys_enter_munmap`, `sys_enter_mprotect`, `sys_enter_brk` ⚠ names.
  - Faults: `exceptions:page_fault_user` (`address`, `ip`, `error_code`) —
    architecture-specific, high volume; filter by pid in the kernel, or use per-process
    `minflt` / `majflt` from `/proc/<pid>/stat`.
  - Filter **in the kernel** (BPF with a pid filter, or tracefs `set_event_pid` ⚠).
    Attribution is `common_pid` — the task current at event time — so kernel-thread
    allocations are labeled *kernel*, not charged to a process.
  - Rust path (`aya` vs libbpf bindings) — open question, decide in M7.

## 6. GPU (🟢)

Feeds the GPU scenes and the overlays ([../VISION.md](../VISION.md)); summary level only.

- **Utilisation and memory, per process:** DRM `fdinfo`. Every open DRM file descriptor
  reports, under `/proc/<pid>/fdinfo/<fd>`, `drm-driver`, `drm-client-id`, `drm-engine-*`
  (busy time per engine) with `drm-cycles-*` / `drm-total-cycles`, and memory keys such as
  `drm-memory-vram`. AMD since ~5.13; NVIDIA with driver ≥ 515 and `nvidia-drm.modeset=1`
  ⚠ verify per driver. Kernel doc: *DRM clients usage stats*.
- **Whole-GPU utilisation:** amdgpu sysfs `gpu_busy_percent`; NVIDIA via NVML / `nvidia-smi`.
- **Temperature, power, fans, clocks:** hwmon. amdgpu exposes `temp1..3_input` (edge,
  junction and memory on discrete parts, with `temp*_label`), power, `pwm1` / `fan1_input`
  and the memory clock — kernel doc *GPU Power/Thermal Controls and Monitoring*. The
  NVIDIA hwmon is limited; use NVML ⚠.
- **Without fdinfo:** `nvidia-smi --query-compute-apps` (compute processes only).
- **Not there either:** chip placement and die maps — modelled and labelled.

## 7. Privileges & packaging

- The app must work unelevated (summary + CPU view) and offer a privileged mode:
  polkit prompt (spawn a tiny root helper or ask the user to run elevated) — decide in
  M7; never silently require root.
- Distribution: AppImage + .deb/.rpm via CI; no kernel modules shipped.

## References

- Kernel pagemap/kpageflags doc: <https://docs.kernel.org/admin-guide/mm/pagemap.html>
- `dmidecode(8)`, `decode-dimms(8)` (i2c-tools)
- EDAC sysfs: <https://docs.kernel.org/driver-api/edac.html>
- kmem tracepoints (`mm_page_alloc`, `mm_page_free`): <https://docs.kernel.org/trace/events-kmem.html>
- amdgpu power / thermal hwmon: <https://docs.kernel.org/gpu/amdgpu/thermal.html>
- DRM fdinfo standardisation (memory keys): <https://lists.freedesktop.org/archives/dri-devel/2023-April/400164.html>
- hwmon coretemp/k10temp docs under Documentation/hwmon in the kernel tree
- CPU topology sysfs: Documentation/ABI/stable/sysfs-devices-system-cpu
