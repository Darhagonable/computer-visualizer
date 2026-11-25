# Data sources — macOS

Status: researched 2026-11 · tier-2 platform — the doc is as much about *what macOS
does not expose* as what it does.

## The honest headline

macOS has **no public equivalent of a PFN database**: no per-page state enumeration, no
page→file mapping, no working-set-by-PFN walk. Memory compression further means "used"
doesn't map 1:1 onto Windows/Linux concepts. The app will render macOS' *real* summary
data beautifully and **state clearly that page-level detail is not available** —
capability flags handle this automatically ([architecture.md §4](../architecture.md)),
and the macOS RAM scene is designed for it ([ram-model.md §7](../ram-model.md)).

## Overview

| Need | Mechanism | Priv |
| --- | --- | --- |
| System memory summary | Mach `host_statistics64(HOST_VM_INFO64)` (free/active/inactive/wired/compressed, pageins/outs); `vm_stat` CLI as cross-check | 🟢 |
| Memory pressure | `host_statistics64` pressure pages / `memory_pressure` syscall ⚠ | 🟢 |
| Per-process memory | `task_vm_info` (`phys_footprint` — the number Activity Monitor's Memory column approximates), `proc_pid_rusage` | 🟢 (own processes; others via task_for_pid limits) |
| Swap/compression stats | `sysctl vm.swapusage`; compressor info in VM stats | 🟢 |
| Per-process address space | `mach_vm_region_recurse` (`share_mode`, `pages_resident`, `user_tag`), `proc_regionfilename` | 🟢 own / 🔴 others |
| Allocation tracing | ✗ no public facility (Instruments is Xcode-private) | — |
| GPU utilisation and memory (whole GPU) | IORegistry `IOGPU` → `PerformanceStatistics` ⚠ | 🟢 |
| DIMM inventory (Intel Macs) | IORegistry: `AppleSMBIOS`/`IOPlatformDevice` "SMBMemory" entries ⚠; `IODeviceTree:memory` (per-DIMM dicts) ⚠; easiest reliable path: `system_profiler SPMemoryDataType` (parse its output or call the private SPIllumination… no — parse the tool) | 🟢 |
| Memory hardware (Apple Silicon) | none needed: unified memory on package; capacity/type/speed via `sysctl hw.memsize` + IORegistry device properties ⚠ | 🟢 |
| CPU topology | `sysctl hw.packages/hw.physicalcpu/hw.logicalcpu`; Apple Silicon perflevels: `hw.perflevel0.*` (P) / `hw.perflevel1.*` (E) | 🟢 |
| CPU usage | Mach `host_processor_info(PROCESSOR_CPU_LOAD_INFO)` per-cpu ticks | 🟢 |
| CPU/temps/fans | SMC keys via `AppleSMC` IOService ⚠ (sensor set is model-specific; mostly package-level) | 🟢/⚠ |
| Power | `powermetrics` (root, sampled) — not a persistent source | 🔴 ⚠ |

## 1. Memory summary — the real data we do get (🟢)

`host_statistics64` with `HOST_VM_INFO64` returns `vm_statistics64_data_t`: page counts
for free, active, inactive, wired, compressed (+ compressor page size, pages
swapped in/out). These map to our canonical buckets:

| Model bucket | macOS stat |
| --- | --- |
| Wired (≈ kernel/locked) | `wire_count` |
| Active (working sets) | `active_count` |
| Standby-ish (cached, evictable) | `inactive_count` + `purgeable_count` |
| Compressed (macOS-specific, render as its own layer) | `compressor_page_count` |
| Free | `free_count` |

The Apple Silicon scene ([ram-model.md §7](../ram-model.md)) renders these as live
proportions of the unified memory fabric — a *real-data* scene, just not per-page.
`phys_footprint` per process (top-N processes) populates a process sidebar, since
page-level owners don't exist.

## 2. Per-process address space (🟢 own / 🔴 others)

Feeds Application Focus layer B ([app-focus.md](../app-focus.md) §5) — a real
VMMap-style region map, even though page-level data does not exist here.

- **Walk:** `mach_vm_region_recurse(task, &addr, &size, &depth, info, &count)` with
  `vm_region_submap_info_data_64_t` ⚠ (field list per `mach/vm_region.h`) —
  protection / max protection, **`share_mode`** (`vmmap(1)` prints it as `SM=` COW /
  PRV / NUL / ALI / SHM), `pages_resident`, `ref_count`, **`user_tag`**
  (`VM_MEMORY_MALLOC`, `VM_MEMORY_MALLOC_SMALL`, `VM_MEMORY_STACK`, …) — the purpose
  label in `vmmap`'s left column.
- **Backing file:** `proc_regionfilename(pid, address, buf, &size)`.
- **No VA → PFN:** there is no pagemap, so regions can't be linked to physical pages.
  The scene shows region maps and footprint, and says why the board linkage is absent.
- **Tracing:** ✗ no public facility; Instruments' Allocations / VM Tracker are
  Xcode-private frameworks. Honest empty state.

## 3. GPU (🟢, summary only)

- `ioreg -c IOGPU -d 1` → `PerformanceStatistics` with `Device Utilization %`, `In use
  system memory`, `Alloc system memory` ⚠ (one source so far — verify the keys at
  implementation). IORegistry is readable in-process through IOKit; no need to shell out.
- **No per-process GPU memory, no per-engine split, no public temperatures.** On Apple
  Silicon the GPU shares unified memory, so "VRAM" is a slice of system RAM.
- The GPU scene on macOS is therefore a summary card, labelled as such.

## 4. DIMM inventory — Intel Macs only (🟢)

Intel Macs expose SMBIOS-derived per-slot data in the IORegistry: entries under the
AppleSMBIOS service ("SMBMemory" arrays) and per-DIMM dictionaries in the device tree
(`ioreg -r -c IODeviceTree:memory` shows DIMM dicts with form factor, type, speed,
size, maker, part number, serial). ⚠ Exact node shapes vary by era — at implementation
time, enumerate and normalize, and fall back to parsing `system_profiler
SPMemoryDataType` output (stable, human-readable) for the same fields. ECC status from
the same sources.

Apple Silicon: RAM is LPDDR(LPDDR5…) packages on the SoC substrate — there are **no
DIMMs and no slots**. The scene draws the memory fabric + packages (capacity real,
package count/die layout from the die-layout DB concept in [cpu-model.md §2](../cpu-model.md),
badged as approximate).

## 5. CPU (🟢)

- Apple Silicon hybrid topology comes free via `hw.perflevel{0,1}.physicalcpu`,
  `logicalcpu`, `lperflevels`/`eperflevels` — P and E clusters map directly onto our
  Complex/Die model (clusters per die from perflevel + cluster hints ⚠).
- Per-cpu usage ticks via `host_processor_info` — per-core utilization renders fine.
- Frequency per core: not directly exposed; approximate via load/Fmax or omit (render
  as "frequency not exposed" rather than guessing) ⚠.
- Temperatures: SMC (AppleSMC) exposes a model-specific key set (package CPU die temp,
  GPU, fans on Intel; more restricted on Apple Silicon ⚠) — enumerate keys at runtime,
  map known ones, degrade gracefully.

## 6. Distribution constraints (Tauri app)

- Hardened runtime + notarization required for distribution outside "right-click open".
- No kernel extensions/drivers story at all — everything stays in the documented
  user-space API surface. No entitlement exceptions expected for the data above
  (`task_for_pid` on other processes is restricted; we only use it for self/allowed
  processes, else top-N via `proc_listallpids` + `proc_pid_rusage`).

## References

- Mach API: `host_statistics64`, `host_processor_info`, `task_info` (man pages / <https://developer.apple.com/>)
- `vm_stat(1)`, `system_profiler(8)`, `ioreg(8)`
- Apple Silicon unified memory background: <https://developer.apple.com/documentation/>
  (WWDC "Explore unified memory") — conceptual, cited in-app for the macOS scene
