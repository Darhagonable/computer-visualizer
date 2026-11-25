# Architecture

Status: decided 2026-11 · supersedes nothing (initial) · researched/verified unless marked ⚠

## 1. Stack decision record

**Chosen: Tauri 2 + Rust backend + web-frontend SVG renderer.**

| Option | Verdict | Why |
| --- | --- | --- |
| **Tauri 2 + Rust + web SVG** | ✅ chosen | One language (Rust) covers every low-level data source (NT internals, `/proc`, Mach/IOKit) with no native-module bridging. The OS webview renders SVG + CSS/JS animation — by far the best environment for the line-art aesthetic. Small binaries, real native windows on all three OSes. |
| Electron + Node | rejected | All low-level data would need N-API/C++ addons or sidecars; two toolchains, heavy process, large binaries; SVG story identical to Tauri but everything else worse. |
| Qt (C++/PySide) | rejected | Excellent native custom drawing, but animated, styled SVG line art means reimplementing what the web platform gives for free; slower iteration on the visual identity, which *is* the product. |
| Flutter desktop | rejected | Solid custom painting, but FFI to OS internals is more friction than Rust's direct syscalls, and SVG asset workflows are second-class. |

Frontend framework choice (React/Solid/Svelte/vanilla) is deliberately left open until M1;
the renderer will be a pure `state → SVG` component tree either way.

## 2. Process model

```
┌─────────────────────────────────────────────────────────────┐
│  Rust core (Tauri backend process)                          │
│                                                             │
│  providers/            sampler/            ipc/             │
│  ┌──────────────┐      ┌────────────┐     ┌──────────────┐  │
│  │ mock         │      │ cadence    │     │ Tauri cmds   │  │
│  │ windows      │─────▶│ pool       │────▶│ Tauri events │  │
│  │ linux        │      │ diff/compress│  │ (push)       │  │
│  │ macos        │      └────────────┘     └──────┬───────┘  │
│  └──────────────┘                                │          │
│         ▲ traits + capability flags              │          │
└─────────┼────────────────────────────────────────┼──────────┘
          │                                        │ JSON snapshots / diffs
          │ OS APIs                                ▼
   NT / /proc / Mach            ┌──────────────────────────────┐
   (admin/root where needed)    │  Webview UI                  │
   (PawnIO optional driver)     │  scene graph → SVG           │
                                │  LOD renderer, interactions  │
                                └──────────────────────────────┘
```

- **Providers** own all OS specifics. They never render, never guess UI.
- **Sampler** polls providers on per-data-class cadences, builds compact snapshots,
  computes diffs against the last pushed frame, emits to the UI.
- **UI** is a pure function of the latest snapshot state. It never calls OS APIs.

## 3. Repository layout (planned)

```
computer-visualizer/
  crates/
    core/                 # snapshot types, traits, interleave model, diff codec, name tables
    provider-mock/        # synthetic machine: deterministic, scriptable scenarios
    provider-windows/     # NT internals, SMBIOS, PawnIO client
    provider-linux/       # /proc, /sys, DMI, hwmon
    provider-macos/       # Mach, IORegistry, SMC
  app/                    # Tauri 2 shell (main.rs, sampler wiring, updater)
  ui/                     # frontend: scenes, SVG components, themes
  assets/die-layouts/     # CPU die layout database (JSON, versioned)
  docs/
```

## 4. Provider model

```rust
/// What a provider can actually deliver on this machine *right now*.
/// Computed at startup after probing; drives UI degradation, never guessed.
#[derive(Clone, Copy, PartialEq)]
pub enum Capability {
    // --- application focus (app-focus.md) ---
    ProcessList,         // process picker
    ProcessFocus,        // per-process page ownership on the board
    ProcessTimeline,     // per-process footprint over time
    ProcessSharedPages,  // share count / shared+shareable per page
    ProcessAddressSpace, // VMMap-style region map + region↔pages linkage
    ProcessAllocTrace,   // allocation/fault event tracing (privileged, opt-in)
    PageStates,          // per-PFN state (active/standby/modified/free/zeroed)
    PageUseClasses,      // per-PFN use (private/file/pagefile/kernel/...)
    PageOwnerProcess,    // per-PFN owning process
    PageOwnerFile,       // per-PFN backing file path
    DimmInventory,       // populated slots: maker/PN/serial/speed/type/size/rank
    SpdFull,             // live SPD read (chip-count ground truth)
    DimmTemps,           // DDR5 SPD-hub temperature sensors
    ListFlushOps,        // maintenance ops (trim working sets, purge standby)
    CpuTopology,         // packages/dies/complexes/cores/threads + caches
    CpuPerCoreTemp,
    CpuPerCoreFreq,
    CpuPackagePower,
}

pub trait MemoryProvider: Send {
    fn capabilities(&self) -> &[Capability];
    fn inventory(&self) -> Result<DimmInventory>;                 // slow, on demand
    fn page_snapshot(&self) -> Result<PageSnapshot>;              // fast, on cadence
    fn maintenance(&self, op: MaintenanceOp) -> Result<()>;       // opt-in, admin
}

pub trait CpuProvider: Send {
    fn capabilities(&self) -> &[Capability];
    fn topology(&self) -> Result<CpuTopology>;                    // slow, on demand
    fn live(&self) -> Result<CpuLive>;                            // fast, on cadence
}
```

Startup sequence: probe → capability set → UI renders exactly what is available, with
explicit "not available on this OS / needs elevation / needs driver" affordances for what
isn't. A provider whose privileged data source fails at runtime *drops capabilities live*
rather than crashing.

/// Per-application deep-dive — see app-focus.md. Implemented by the same per-OS
/// providers; the mock ships synthetic processes, regions and a scripted trace.
pub trait ProcessProvider: Send {
    fn capabilities(&self) -> &[Capability];
    fn processes(&self) -> Result<Vec<ProcessInfo>>;              // on demand
    fn process_stats(&self, pid: Pid) -> Result<ProcessStats>;    // on cadence (timeline)
    fn address_space(&self, pid: Pid) -> Result<Vec<Region>>;     // on demand / slow refresh
    fn trace(&self, ctl: TraceControl) -> Result<TraceHandle>;    // opt-in, privileged
}

### Privilege model

| OS | Baseline (no elevation) | Elevated | Optional driver |
| --- | --- | --- | --- |
| Windows | CPU topology, usage, SMBIOS inventory (`GetSystemFirmwareTable` needs no admin), summary memory | **Admin + `SeProfileSingleProcessPrivilege`:** Superfetch PFN queries (page states/owners) | **PawnIO** (per-core temps, power, MSRs, SMN; optionally SPD/SMBus) |
| Linux | CPU usage/topology, hwmon temps (often), summary memory | **root:** `/proc/pagemap`, `kpageflags`, `kpagecount`, DMI tables | none needed |
| macOS | summary, topology, inventory | mostly unchanged | none |

**Opt-in elevation — tracing.** Application Focus layer C
([app-focus.md §6](app-focus.md)) is the only feature that *records events* rather than
sampling state: an ETW kernel session on Windows (admin), tracepoints on Linux (root),
not available on macOS. It is off by default, starts only on explicit user action, and
always reports event loss.

### Driver policy (Windows)

No self-shipped kernel drivers — ever. Signing (EV cert + Microsoft attestation) is out
of reach for FOSS, and the WinRing0 saga (blocked by Defender as
`VulnerableDriver:WinNT/Winring0`, CVE-2020-14979 — see
[data-sources/windows.md](data-sources/windows.md)) is the cautionary tale. Sensor access
goes through **PawnIO** (winget package `namazso.PawnIO`), installed *by the user's
choice*, detected at runtime, and strictly optional: without it the app simply omits
temperature/power sensors.

## 5. Snapshot schema & wire format

```rust
pub struct PageSnapshot {
    pub page_size: u32,                  // typically 4096; read, not assumed
    pub ts_ms: u64,
    pub ranges: Vec<PfnRange>,           // physical memory ranges (non-contiguous!)
    pub cells: Vec<u8>,                  // 1 byte per page: low nibble state, high nibble use
    pub owners: Option<Vec<OwnerRef>>,   // sparse: only pages with owners, dictionary-coded
    pub names: NameTable,                // u32 id ↔ process name / file path
}
```

- **1 byte per page**: 4 bits state (16 values — exactly enough for
  zeroed/free/standby-0..7/modified/active/bad), 4 bits use-class (12 Windows classes fit;
  Linux flags get bucketed).
- **Owners are sparse**: most pages have no interesting owner; only pages that are
  active-with-owner carry an `OwnerRef { pfn, kind: Process(File(id)) }`.
- **Names dictionary**: file paths and process names interned once per session; snapshots
  reference `u32` ids, so a 40-byte path costs 4 bytes per owning page.
- First push is a full snapshot; subsequent pushes are **per-range dirty segments**
  (coalesced runs of changed cells) + dictionary deltas.

### Performance budget (per full snapshot)

| RAM | Pages (4 KiB) | `cells` size | Full @1 Hz | Diff-only typical |
| --- | --- | --- | --- | --- |
| 8 GiB | 2,097,152 | 2 MiB | fine | tens of KiB |
| 16 GiB | 4,194,304 | 4 MiB | fine | tens of KiB |
| 32 GiB | 8,388,608 | 8 MiB | acceptable | < 100 KiB |
| 64 GiB | 16,777,216 | 16 MiB | worker-thread only, measure | < 200 KiB |

Rules: snapshot building never touches the UI thread; diff computation happens in Rust
before IPC; the renderer only ever materializes the pages visible at the current LOD.

### Cadences

| Data | Rate |
| --- | --- |
| Page cells (heatmap feel) | 1–2 Hz |
| CPU usage | 2–4 Hz |
| Temps / power | 1 Hz |
| Inventory (DIMMs, topology) | on demand + slow refresh (60 s) |
| Process stats (focus timeline) | 1 Hz per focused process |
| Address space (region map) | on demand + slow refresh (5 s while focused) |
| Trace events (opt-in) | batched pushes every 100–250 ms; board replay keyed by full snapshots |

## 6. Mock provider & recordings

- `provider-mock` emits a deterministic synthetic machine (N sticks, chips, scripted
  allocation/file-cache churn) implementing the same traits. **M1 builds the entire UI
  against it** — visual development is never blocked on OS plumbing.
- The mock also models **processes**: a handful of synthetic processes with region maps
  and a deterministic, scripted allocation trace, so the Application Focus UI
  ([app-focus.md](app-focus.md)) is fully buildable against mock data.
- Every real snapshot stream can be recorded to JSONL (`snapshot-recordings/*.jsonl`,
  one file per data class) and replayed through the same pipeline — this doubles as the
  bug-report format ("attach the recording") and the UI test fixture set.

## 7. Degradation philosophy

1. Never fake data. A missing capability renders as an honest empty state with the
   reason ("needs administrator", "not exposed by macOS", "requires PawnIO driver").
2. Modeled visualizations (page→chip placement, die floor-plans) are always live-badged
   (small "MODEL" chip in the corner, hover explains the model and links the doc).
3. Capabilities can be lost at runtime (driver uninstalled, privilege dropped): scenes
   gray-out the affected layer, they don't freeze or blank.

## 8. Open questions

- Frontend framework pick (M1 spike: Solid vs Svelte vs vanilla + lit-html on a large
  SVG scene; measure 100k-node page grids).
- Whether owners-for-every-active-page is affordable at 64 GiB on Windows (measure
  `SuperfetchPfnQuery` chunk throughput in M2 before committing the UI density).
- Recording format: keep JSONL forever, or add a compact binary framing once volumes
  grow (decide in M9).
- Tauri updater/signing story for the three platforms (M9).
- Rust ETW real-time consumption path (`windows` crate vs dedicated crates) and
  stack-walk payload parsing — M5 spike ([app-focus.md §11](app-focus.md)).
- Trace board-replay fidelity: keyframe cadence vs event volume (M5).
