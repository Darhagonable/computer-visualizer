# Application Focus — per-application memory deep-dive

Status: specified 2026-11 · lineage: AMD **Radeon Memory Visualizer** (interaction model) +
Sysinternals **VMMap** / **RAMMap** (system-RAM mechanisms) · tracing mechanisms researched
and verified against primary docs; items to re-check per OS version are marked ⚠

## 1. What this is

Pick a process. See *its* memory on the board — which pages are physically resident, in
what state, shared with whom; its address space region by region; a timeline of its
footprint; snapshot compare with a leak finder; and — opt-in, privileged — an event trace
of how it allocates and faults memory, replayed against the physical page grid.

The board view answers *what is in RAM*. Application Focus answers *who put it there,
and how*.

## 2. Lineage — what we borrow, and what is different

| RMV concept | RMV (GPU memory; AMD driver instrumentation) | Ours (system RAM) |
| --- | --- | --- |
| Select an application | Radeon Developer Panel → executable → "Memory Trace" | Process picker (attach to running) or "launch under trace" |
| Timeline | Resource usage size over time | Per-process footprint over time + (traced) event river |
| Snapshot | "Add snapshot at" on the timeline | Pin any instant; two pins → compare |
| Heap overview | Local / Invisible / Host VRAM heaps | Physical placement: NUMA node (real), DIMM (modeled), page states (real) |
| Resource overview | Resources sized and colored by type & status | Address-space regions sized and colored by type & residency |
| Resource details | Residency history; paging over the resource's lifetime | Per region: commit vs resident vs standby, page-state histogram, (traced) fault history |
| Aliasing | Dithered = resource shares memory | Dithered = page is shared (share count > 1) |
| Compare / leak finder | Delta two snapshots; resources unique to one | Delta two region maps; regions added / removed / grown; (traced) commits never released |
| Named resources | `VK_EXT_debug_util` / D3D12 debug names | File paths, module names, heap / stack labels where the OS exposes them |

**The honest difference.** RMV sees *graphics allocations* (heaps, resources) because AMD
instruments its own driver, and its target is an app the developer builds. We look at the
*system RAM of any process* through OS facilities, so our granularity is the OS's:
virtual reservations and commits, mapped views, page faults — and, on Linux, individual
physical page allocations. We do **not** see heap objects (`malloc`/`new`): those live
inside the app's own allocator. VMMap's trace mode gets them by *injecting* a Detours
instrumentation library into a process it launches; we deliberately don't inject (§10).

So "trace how it allocates" here means: every `VirtualAlloc`/`mmap`-class operation,
every hard fault that pages a file in, every physical page alloc/free (Linux) — attributed
to the process, with call stacks on Windows where symbols allow.

## 3. Capability & privilege summary

| Layer | Windows | Linux | macOS |
| --- | --- | --- | --- |
| **A** focus · timeline · shared pages | 🔴 admin (PFN owners); 🟢 `QueryWorkingSetEx` for accessible processes | 🔴 root (pagemap / kpagecount) | footprint summary only — no page owners |
| **B** address space · region↔pages · compare | 🟢 own / accessible processes; protected processes: access denied | 🟢 own; 🔴 root for others | 🟢 own; 🔴 root for others; Apple platform binaries off-limits ⚠ |
| **C** allocation tracing | 🔴 admin — ETW session | 🔴 root — tracepoints (perf / ftrace / BPF) | ✗ not available — honest empty state |

## 4. Layer A — Focus, timeline, physical footprint

**Interaction.** Process picker (search, sorted by resident size) → *focus*. The board
dims everything the process doesn't own; owned pages keep their real state colors;
**shared pages are drawn dithered** (RMV's aliasing idiom). A side panel shows totals and
a timeline strip shows the footprint over time.

**Side panel numbers** (each defined in §9): working set, private (commit), resident
shared vs exclusive, proportional share (PSS-like), standby *attributed* to the process
(only if the OS actually attributes it — see below), pagefile-backed-but-not-resident,
hard-fault rate (when traced or from process counters).

**Data sources.**

| Need | Windows | Linux | macOS |
| --- | --- | --- | --- |
| Per-page owner | PFN identity (`UniqueProcessKey`, `VirtualAddress`) — [windows.md §1/§3](data-sources/windows.md) | pagemap + `maps` owner pass — [linux.md §2](data-sources/linux.md) | — |
| Shared / shareable per page | `QueryWorkingSetEx` → `Shared`, `Shareable`, `ShareCount` ⚠ (per `psapi.h`) | `/proc/kpagecount` (map count) | — |
| Footprint counters | `GetProcessMemoryInfo` (`PROCESS_MEMORY_COUNTERS_EX`: WorkingSetSize, PrivateUsage, PagefileUsage) | `/proc/<pid>/{statm,status,smaps_rollup}` (VmRSS, RssAnon, RssFile, VmSwap, Pss) | `task_info(TASK_VM_INFO)` (`phys_footprint`), `proc_pid_rusage` |

⚠ **Standby attribution (determine empirically in M3).** Active working-set pages carry
owner identity. Whether *standby* pages are attributable to a process through the
Superfetch PFN data is not documented; if they are not, we report standby as unattributed
cache rather than guessing an owner.

## 5. Layer B — Address space, region↔pages linkage, compare & leak finder

**Normalized region model** (all platforms fill the same struct):

```rust
pub struct Region {
    pub base: u64, pub size: u64,                 // virtual range
    pub kind: RegionKind,   // Image | MappedFile{path} | PagefileMapped | SharedMem
                            // | Heap | Stack | Private | PageTable | Reserved | Free | Other
    pub protection: Prot,   // rwx, guard, noaccess
    pub state: State,       // committed | reserved | free
    pub commit: u64,        // commit charge
    pub resident: u32, pub shared: u32,           // page counts
    pub label: Option<String>,                    // module / file / heap / thread stack
    pub pages: Option<Vec<PageRef>>,              // VA → PFN for resident pages
}
```

**Per-OS sources.**

| Data | Windows | Linux | macOS |
| --- | --- | --- | --- |
| Walk regions | `VirtualQueryEx` → `MEMORY_BASIC_INFORMATION` (BaseAddress, RegionSize, State, Protect, Type) | `/proc/<pid>/maps` (range, perms, offset, inode, pathname) | `mach_vm_region_recurse` → `vm_region_submap_info_data_64_t` (protection, `share_mode`, `pages_resident`, `user_tag`) |
| Allocation-level detail | `QueryVirtualMemoryInformation(MemoryRegionInfo)` (Win10 1607+): AllocationBase, RegionSize, **CommitSize**, flags Private / MappedDataFile / MappedImage / MappedPageFile / MappedPhysical / DirectMapped. NT `MemoryRegionInformationEx` adds PartitionId / NodePreference ⚠ undocumented | `/proc/<pid>/smaps` (Rss, Pss, Shared_*, Private_*, Anonymous, Swap) | same info struct |
| Backing file | `GetMappedFileName`; `NtQueryVirtualMemory(MemoryMappedFilenameInformation)` | `maps` pathname | `proc_regionfilename(pid, addr)` |
| Labels: heaps, stacks | Heaps: `RtlQueryProcessDebugInformation` ⚠; stacks: thread enumeration → TEB StackBase / StackLimit ⚠; fallback "private" | `[heap]`, `[stack]`, `[stack:<tid>]`, `[anon:…]` tags | `user_tag` (`VM_MEMORY_MALLOC`, `…_MALLOC_SMALL`, `…_STACK`, …) |
| Images | `EnumProcessModulesEx` + module names → base + size | executable / `.so` paths | dyld image paths |
| VA → PFN | invert the PFN identity (`VirtualAddress` per page) and cross-check with `QueryWorkingSetEx` (Valid) | `pagemap` (present, PFN) | not available |
| Sharing class | Shareable ∧ Shared → true shared; Shareable ∧ ¬Shared → COW-private | map count > 1 | `share_mode`: COW / PRV / ALI / SHM / NUL |

**The differentiator — virtual ↔ physical, linked live.** Select a region → its resident
pages light up on the chips with their real states. Select a page → jump to its region.
VMMap shows only virtual; RAMMap shows only physical; nothing links the two.

**Address-space strip.** A 64-bit address space is almost entirely empty, so a linear
strip is useless. We render a **compressed strip** (regions proportional to size, gaps
collapsed into tick marks with a gap glyph) plus a **treemap** by kind and size (VMMap /
RMV style). The axis is explicitly non-linear and marked so.

**Snapshot pins, compare, leak finder.** Pin A and B on the timeline (or any two entries
of the refresh history). Compare view: per kind, added (green) / removed (red) / grown /
shrunk regions, with totals, and a filter for *unique to A* / *unique to B* — the leak
finder. Caveat shown in-UI: ASLR moves regions between runs, so only compare within one
process lifetime.

**Real NUMA placement constrains the model.** Where the OS reports the node of a page
(`QueryWorkingSetEx` Node bits ⚠, `/proc/<pid>/numa_maps`), pages with a known node are
placed only on that node's DIMMs in the board view — a measured constraint on the
otherwise modeled placement of [ram-model.md §3](ram-model.md).

**macOS access limits.** `task_for_pid` on another process requires root for ordinary
apps, and Apple platform binaries stay off-limits without a private entitlement (Apple's
own `vmmap` uses `com.apple.system-task-ports`). We show an access-denied state, never a
workaround.

## 6. Layer C — Allocation tracing (opt-in, privileged)

```rust
pub enum TraceEvent {
    Reserve   { pid, t, base, size },
    Commit    { pid, t, base, size, stack: Option<StackId> },
    Release   { pid, t, base, size },            // VirtualFree / munmap
    MapView   { pid, t, base, size, file: Option<NameId> },
    UnmapView { pid, t, base, size },
    Fault     { pid, tid, t, va, kind: Hard{file, offset} | DemandZero | Cow | Transition, pfn: Option<u64> },
    PageAlloc { pid, t, pfn, order },            // Linux
    PageFree  { pid, t, pfn, order },            // Linux
}
```

### Windows — ETW kernel session (🔴 admin)

- **Virtual memory ops.** Kernel trace session with `EVENT_TRACE_FLAG_VIRTUAL_ALLOC`
  emits event types **98 `VirtualAlloc`** / **99 `VirtualFree`** (MOF class
  `PageFault_VirtualAlloc`: `BaseAddress`, `RegionSize`, `ProcessId`, `Flags` =
  the `flAllocationType` of `VirtualAllocEx` — so reserve / commit / release / decommit
  are distinguishable). Documented by Microsoft; available since Windows 7.
- **Hard faults.** `EVENT_TRACE_FLAG_MEMORY_HARD_FAULTS` → event type **32
  `PageFault_HardFault`** (faulting VA plus the file object and byte offset being paged
  in ⚠ field names). "Orders of magnitude rarer than soft faults" — cheap to leave on.
- **All page faults.** `EVENT_TRACE_FLAG_MEMORY_PAGE_FAULTS` exists but is
  volume-prohibitive for multi-minute captures. Offered only as short burst captures
  (≤ 10 s) with loss detection.
- **Call stacks.** `EVENT_TRACE_TYPE_VIRTUAL_ALLOC` (Kernel Trace Control API) enables
  stack walking for the VirtualAlloc events; WPA's *VirtualAlloc Commit Lifetimes* graph
  is built on exactly this (Commit Stack · Commit Time · Decommit Time). We resolve
  stacks through `dbghelp` when symbols are available (opt-in, §11).
- **Session rules.** Since Windows 8 a kernel provider can run on a custom-named session,
  so we coexist with WPR/xperf and other tools instead of fighting over the `NT Kernel
  Logger`. Not every keyword works there (`ReferenceSet` is NT-Kernel-Logger-only), and
  several keywords "fail without an error" on the wrong session — probe in the M5 spike ⚠.
- **Attribution keywords.** Run alongside `Process` (start / stop rundown, so names
  resolve for processes that exit mid-trace and PID reuse can't misattribute),
  `ImageLoad`, and `ProcessCounters` (a final working-set / commit snapshot to reconcile
  the event stream against). "VirtualAlloc End Rundown" events supply the baseline of
  already-committed memory when attaching to a running process ⚠.
- **Not in this stream.** Heap-object allocations inside committed regions. Those need
  ETW Heap tracing (per-process `TracingFlags` under `Image File Execution Options`) or
  WPR heap snapshots — a different, far higher-volume workflow, deliberately out of scope
  (§10). The `Microsoft-Windows-Kernel-Memory` manifest provider emits periodic
  snapshots, not per-operation events; we don't need it.
- **Consumption.** `StartTrace` → `EnableTraceEx2` → `ProcessTrace` in real-time
  `EVENT_RECORD` mode. Events lost (`EventsLost` in the session properties) are surfaced
  as a badge, never silently dropped.

### Linux — tracepoints (🔴 root)

The most direct data in the whole project: **physical page allocation events with PFNs**.

- `kmem:mm_page_alloc` — `pfn`, `order`, `gfp_flags`, `migratetype`
- `kmem:mm_page_free` — `pfn`, `order` (plus `mm_page_free_batched`,
  `mm_page_alloc_zone_locked`) — documented in the kernel's *kmem tracepoints* page
- `syscalls:sys_enter_mmap` / `sys_exit_mmap`, `sys_enter_munmap`,
  `sys_enter_mprotect`, `sys_enter_brk` ⚠ names — virtual map / unmap events
- `exceptions:page_fault_user` — `address`, `ip`, `error_code`; architecture-specific
  (x86, arm64), high volume → kernel-side pid filter, or fall back to per-process
  `minflt` / `majflt` counters in `/proc/<pid>/stat`

Filtering must happen **in the kernel** (BPF with a pid filter, or tracefs `set_event_pid`
⚠) — user-space filtering of system-wide page allocations is hopeless. Attribution is
`common_pid`, the task current at event time, so kernel threads allocating on the
system's behalf are labeled *kernel*, not charged to a process.

### macOS

✗ No public facility; Instruments is Xcode-private. We show an honest empty state.

## 7. Trace UI — event river, replay, lifetimes

- **Controls.** Start (attach to a process, or launch a target *under trace* so early
  allocations are captured — a plain parent/child launch, **no injection**), Stop,
  buffer status, event-rate meter, events-lost badge.
- **Event river.** Time on x, one lane per event class; a playhead scrubs. The board
  **replays**: pages appear and change state as the playhead moves. Periodic full
  snapshots are keyframes that correct replay drift; between them, events drive the grid.
- **Lifetimes view** (RMV / WPA style). Each commit is a bar from commit time to release
  time. Bars still open at the end of the trace were **never released** — the leak
  candidates — grouped by call stack (Windows, with symbols) or by faulting instruction
  pointer (Linux).
- **Cross-navigation.** Event → region on the strip → pages on the board, and back.
- **Long runs.** RMV is designed for hours-long captures at low overhead; our recorder
  targets the same (bounded ring buffers, event compaction, loss accounting).

## 8. Data model & provider additions

Canonical definitions live in [architecture.md §4](architecture.md). Summary:

- Capabilities: `ProcessList`, `ProcessFocus`, `ProcessTimeline`,
  `ProcessSharedPages`, `ProcessAddressSpace`, `ProcessAllocTrace`.
- `ProcessProvider`: `processes()`, `process_stats(pid)` (on cadence),
  `address_space(pid)` (on demand / slow refresh), `trace(ctl)` (opt-in session).
- Recordings gain `process_stats`, `regions`, and `trace_event` record kinds, so a
  trace can be attached to a bug report and replayed exactly (M9).
- The mock provider ships synthetic processes, region maps and a scripted trace so the
  whole Application Focus UI is buildable before any privileged plumbing exists.

## 9. Semantics glossary (the honest definitions)

- **Working set** — pages currently mapped into the process's page tables. **Resident**
  is our word for the same pages seen from the physical side.
- **Private (commit)** — memory the process has charged against RAM-or-pagefile; it may
  not be resident. *Private − resident-private* is shown as "paged out / never touched",
  not folded into "used".
- **Reserved vs committed** — reserved is address space only; no storage is promised.
- **Shareable vs shared** — shareable pages *can* be shared; until another process maps
  them they are effectively private (copy-on-write). We only dither pages that really
  are shared.
- **Proportional share (PSS-like)** — each shared page counted as 1 / share-count, so
  per-process totals across processes sum to the physical total instead of double-counting.
- **Hard fault** — a fault satisfied from disk (file or pagefile); the stutter signal.
- **OS-granular allocations** — everything we trace is page-granular VM operations. A
  process that commits one large region and leaks small heap blocks inside it shows as
  a single commit; we say so in the UI.
- **Trace completeness** — a trace is only as good as its loss accounting. Lost events
  are reported, and analyses that would be invalidated by loss are marked unreliable.

## 10. Deliberately not adopted

| Technique | Used by | Why not |
| --- | --- | --- |
| DLL injection to instrument the target's allocators | VMMap trace mode (Detours) | Intrusive, antivirus-sensitive, requires owning the launch; contradicts our read-only posture |
| ETW Heap tracing / heap snapshots | WPR, UIforETW | Separate workflow, very high volume, and needs a per-process `IFEO TracingFlags` registry change to the target |
| Driver / allocator instrumentation for graphics resources | RMV, PIX, Nsight | GPU-memory specific; a possible future scene, not this one |
| Kernel drivers | WinRing0-era tools | Never — see [architecture.md](architecture.md) driver policy |

## 11. Open questions

- Rust ETW real-time consumption: `windows` crate ETW APIs vs dedicated crates — spike in
  M5 (consumer callbacks, stack-walk payload parsing, `EVENT_TRACE_TYPE_VIRTUAL_ALLOC`).
- Which kernel keywords are NT-Kernel-Logger-only in current Windows 11 builds ⚠.
- Symbols for stacks: `dbghelp` against a local cache is harmless; querying the
  Microsoft symbol server reveals which modules are loaded — **opt-in**, off by default.
- Linux: `aya` vs libbpf bindings; `perf_event_open` tracepoint parity vs tracefs.
- Board replay fidelity: keyframe cadence vs event volume.
- Whether standby pages carry process identity in Superfetch PFN data (§4).
