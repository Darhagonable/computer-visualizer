# Milestones

Status: 2026-11 · each milestone is shippable/demoable; acceptance criteria are hard.

Order: the RAM story is completed first (page truth → your sticks → per-application deep
dive → tracing), then the CPU view, then the other platforms, then polish. M4/M5 are
Windows-first; Application Focus arrives on Linux with M7 and on macOS (layers A-summary
and B) with M8. Tracing never lands on macOS — the OS offers no public facility.

## M0 — Documentation ✅ (this)

The repo is the design: vision, architecture, per-OS data sources, RAM & CPU models,
application focus, sources, this roadmap. Docs stay living — every implementation
decision that deviates updates the relevant doc in the same PR.

## M1 — Scaffold + mock + RAM scene

Tauri 2 app skeleton (`app/`, `ui/`, `crates/core`, `provider-mock`), the full RAM
scene rendering against the mock provider: line-art board with sticks → chips →
page-grid LOD, live states animating at 1–2 Hz, hover tooltips, owner highlight,
"modeled placement" badging, dark/light theme. The mock also ships synthetic processes,
region maps and a scripted allocation trace so the Application Focus UI can be built
before any privileged plumbing exists.

**Accept when:**
- `tauri dev` shows the scene on Windows, macOS, Linux with ≥60 fps at stick and chip
  zoom, ≥30 fps at 4096-cell page zoom.
- Frontend framework spike done and chosen (decision recorded in architecture.md).
- Wire format (architecture §5) survives a 32 GiB-mock stress: full snapshot < 50 ms
  serialize, diff < 10 ms.
- Mock provider exposes processes, regions and a deterministic scripted trace through
  the real `ProcessProvider` trait.
- Zero real-OS code paths — mock only.

## M2 — Windows: real page truth

`provider-windows`: Superfetch range + PFN queries (windows.md §1), privilege probe +
`SeProfileSingleProcessPrivilege` handling, capability negotiation, real use-count and
physical-page-grid rendering; summary parity bar vs RamMap Use Counts.

**Accept when:**
- On a Win 11 x64 test machine (admin): per-page grid live at ≥1 Hz, 32 GiB within the
  performance budget (architecture §5), no UI jank from snapshot work.
- Use-count totals match RamMap's Use Counts tab within 1% on the test matrix
  (Win10 22H2 + Win11).
- Non-admin launch degrades to the honest empty state; elevation prompts per design.

## M3 — Windows: sticks that are *your* sticks + files + focus

SMBIOS inventory (windows.md §4 via `smbios-lib`): real sticks, slots, form factors;
tier-1 chip inference; FileInfo driver correlation (windows.md §2) + process
correlation (§3); hover shows real file paths; click-file highlights across chips;
maintenance ops (§7) with honest labeling. **Application Focus layer A**
([app-focus.md §4](app-focus.md)): process picker, focus mode with dithered shared
pages, side-panel totals, footprint timeline.

**Accept when:**
- Drawn board matches the machine's actual DIMMs (spot-check vs CPU-Z/Task Manager:
  slots, sizes, speeds, part numbers).
- File tooltip shows correct paths for a known mmap'd test file; highlight matches the
  file's actual page count within a small tolerance (owner pass semantics documented).
- "Purge standby list" runs and the grid visibly settles (and recovers honestly).
- Focusing a process highlights its pages; working-set and private totals match Task
  Manager / RAMMap's Processes tab; standby attribution reported honestly per the
  empirical result (app-focus §4).

## M4 — Application Focus: address space + compare

Layer B ([app-focus.md §5](app-focus.md)): region map (`VirtualQueryEx`,
`QueryVirtualMemoryInformation`, working-set cross-check), kind labels (images, mapped
files, heaps/stacks where exposed), compressed strip + treemap, **region ↔ chips
linkage**, snapshot pins, compare view and leak finder. Windows-first, mock-driven UI.

**Accept when:**
- For a test app, the per-kind Size / Committed / Private breakdown matches VMMap within
  a small tolerance.
- Selecting a region highlights exactly the right pages: verified with a test app that
  touches known offsets of an mmap'd file and compared against RAMMap's file view.
- Compare of two pins for a scripted scenario matches VMMap "Show Changes" (added /
  removed regions).
- A protected process (PPL) shows the access-denied state; nothing is guessed.

## M5 — Allocation tracing

Layer C ([app-focus.md §6–7](app-focus.md)) on Windows: ETW kernel session (custom
session name, `VirtualAlloc` + hard faults, optional stack walks), attribution keywords,
real-time consumer with loss accounting, event river, board replay with keyframes,
lifetimes / never-released view. Linux tracepoint design is specified here and
implemented with M7.

**Accept when:**
- A test app performing a scripted sequence of reserve / commit / free produces exactly
  the expected events (count, base, size, type).
- Lifetimes view reports unreleased commits correctly for a deliberate leak scenario.
- Hard faults appear when the test app touches a large cold file; the file is named.
- Events-lost reads zero under normal load and is displayed whenever it isn't.
- Runs alongside a concurrent WPR session without either failing.
- Non-admin launch shows the opt-in elevation prompt / empty state.
- Symbols are opt-in; with symbols off, no network symbol requests are made.

## M6 — CPU view

`CpuProvider` on Windows (+ Linux where cheap): topology via GLPIEx, usage per thread,
frequency; PawnIO client (detect / deep-link / degrade) for temps + power; die-layout DB
seeded per [cpu-model.md §2](cpu-model.md); delidded/die scenes with heat + load
rendering; IHS toggle.

**Accept when:**
- Topology (packages/CCX/L3 groups/SMT/hybrid P-E) correct on Intel-hybrid and
  multi-CCD AMD test machines.
- With PawnIO: per-core temps match LibreHardwareMonitor within noise; hot core
  visibly identifiable in <2 s.
- Without PawnIO: scene fully renders minus temp/power layers, with correct badges.

## M7 — Linux providers

`provider-linux`: kpageflags/kpagecount pass, pagemap+maps owner pass (linux.md §1–2),
DMI inventory + shared SMBIOS parser, sysfs CPU/topology/hwmon temps, cpufreq; polkit
elevation design implemented. Application Focus A/B via `smaps` / `numa_maps`, and
tracing (C) via `mm_page_alloc` / `mm_page_free` and syscall tracepoints with a
kernel-side pid filter.

**Accept when:**
- Parity with Windows RAM scene where the OS allows (page grid, file owners, real
  DIMMs; per-page priority honestly absent).
- Unelevated run shows summary + full CPU view; elevated unlocks pages (single prompt).
- A traced test allocation shows the real PFN landing on the grid; freeing it clears it.

## M8 — macOS providers

`provider-macos`: summary stats → unified-memory scene (Apple Silicon) / DIMM board
(Intel), process sidebar via `proc_pid_rusage`, perflevel topology + usage, SMC temps
where keys exist; Application Focus layer B for accessible processes via
`mach_vm_region_recurse`; notarized build pipeline.

**Accept when:**
- Scene is real-data-only (no fake page grids); "page data not available on macOS"
  state is clear and honest.
- Region map of our own process matches `vmmap`'s region list (count and ranges).
- Notarized app runs on current macOS (Intel + AS).

## M9 — Polish & sustainability

Snapshot recordings (JSONL) + playback UI + export (PNG/CSV of current view/state);
recorded traces replay exactly; settings (cadence, theme, elevation policy, symbols);
CI building installers for the three OSes; update mechanism decision (architecture §8).

**Accept when:** a user can record a memory scenario or trace, send it to us, and we can
replay it exactly; CI artifacts green per push.

## Risk register

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Superfetch PFN structs change in a Windows update | low (stable for years) | high (loses M2/M3 core) | probe-and-validate, capability drop, versioned layouts per build (windows.md §1) |
| ETW keyword/session quirks (NT-Kernel-Logger-only keywords, silent failures) | medium | medium (M5) | M5 spike validates every keyword on a custom session before UI work; documented probe step |
| Trace volume / event loss under load | medium | medium | kernel-side filtering (Linux), low-volume keywords by default (Windows), loss accounting shown, burst mode for full faults |
| Protected processes (PPL) and Apple platform binaries are unreadable | certain | low | honest access-denied states; never a workaround |
| Symbol resolution leaks loaded-module names to a symbol server | certain if on | low | symbols strictly opt-in; local-cache first; UI states what is sent |
| ASLR makes cross-run comparisons meaningless | certain | low | compare only within one process lifetime; stated in-UI |
| Standby pages not attributable to processes | unknown | low | report as unattributed cache; never guess (app-focus §4) |
| Defender/AV flags anything we ship | low (no drivers, no injection) | medium | never bundle drivers; PawnIO via winget only; no DLL injection; monitor false-positive reports |
| SMBIOS OEM variance (locators, missing types, junk fields) | high | low | loose parsing, raw-string display, capability drops |
| Perf blowup at 64 GiB+ page grids | medium | medium | worker-thread snapshots, diff-only pushes, LOD budgets (architecture §5); measure in M2 |
| `maps`+pagemap owner sweep too slow on huge-process Linux systems | medium | low | layered cadence, incremental per-process updates (linux.md §2) |
| macOS API surface shifts/keys undocumented | medium | low | tier-2 expectations, runtime enumeration, graceful degradation |
| Scope creep (GPUs, NICs, disks next) | high 😄 | medium | this roadmap says RAM + CPU (+ application focus); future hardware goes through the same provider/scene pattern — design for it, don't build it |
