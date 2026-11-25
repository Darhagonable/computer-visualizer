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

Frontend framework choice was deliberately left open until M1. **Provisional pick for the M1
UX spike: Svelte 5 + Vite + TypeScript.** Compact for several presentational variants,
first-class SVG, built-in transitions. The decision is recorded as provisional because the
performance question behind it is not yet answered: board zoom currently uses ~16k
imperative SVG `<rect>`s with per-tick delta repaint (fast), and the LOD spike for finer
zoom levels decides between SVG and a canvas/WebGL layer.

Before one UX is chosen, three **UX paradigms** are built as switchable roots over a single
store (`ui/UX-GUIDE.md`): *Instrument* (cockpit), *Ionic* (hero, physical zoom),
*Task Manager* (tabs + master/detail). They share every scene primitive and differ only in
navigation, structure and grouping.

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

## 3. Repository layout

Current (M1 spike) and planned:

```
computer-visualizer/
  ui/                     frontend (Svelte 5): mock engine, scene primitives, UX paradigms
  app/                    Tauri 2 shell (Rust): window + one command proving IPC
  scripts/                build-windows.sh · bin/clang-cl (driver shim)
  assets/                 app icon source; die-layouts/ (CPU floor-plans, M6) will live here
  docs/
  crates/                 planned from M1 on — not started yet:
    core/                 # snapshot types, traits, interleave model, diff codec, name tables
    provider-mock/        # synthetic machine: deterministic, scriptable scenarios
    provider-windows/     # NT internals, SMBIOS, PawnIO client
    provider-linux/       # /proc, /sys, DMI, hwmon
    provider-macos/       # Mach, IORegistry, SMC
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
    DimmTemperature,     // one sensor per DDR5 module (SPD hub)
    GpuTelemetry,        // temperatures, power, fans, clocks, per-engine load
    GpuPerProcessMemory, // VRAM per process
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

/// Summary-level GPU state. There is no page-level VRAM data on any OS: chip placement and
/// die maps are modelled in the UI and labelled as such (docs/VISION.md).
pub trait GpuProvider: Send {
    fn capabilities(&self) -> &[Capability];
    fn gpus(&self) -> Result<Vec<GpuInfo>>;                  // on demand
    fn live(&self) -> Result<Vec<GpuLive>>;                  // on cadence: temps, power, engines, per-process VRAM
}

/// Per-application deep-dive — see app-focus.md. Implemented by the same per-OS
/// providers; the mock ships synthetic processes, regions and a scripted trace.
pub trait ProcessProvider: Send {
    fn capabilities(&self) -> &[Capability];
    fn processes(&self) -> Result<Vec<ProcessInfo>>;              // on demand
    fn process_stats(&self, pid: Pid) -> Result<ProcessStats>;    // on cadence (timeline)
    fn address_space(&self, pid: Pid) -> Result<Vec<Region>>;     // on demand / slow refresh
    fn trace(&self, ctl: TraceControl) -> Result<TraceHandle>;    // opt-in, privileged
}

### Overlays

Besides page data, scenes can encode temperature, activity or power. The choice is a single
piece of global state (`mode`), so one switch recolours every grid. Each provider publishes
values *with a truth label* — `measured`, `estimated` or `modelled` — per overlay and per
component, and the UI must show that label next to every scale. The matrix is in
[VISION.md](VISION.md); in the M1 spike it lives in `ui/src/mock/telemetry.ts` so the mock
already carries the shape the real providers will fill.

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
- **Status (M1 UX spike): the mock currently lives in the frontend** (`ui/src/mock/`), so the
  UX-paradigm mockups could start before the wire format was fixed. It is already shaped
  like the provider will be — seeded, deterministic, scripted scenarios, RamMap's state and
  use-class vocabulary — and moves to `crates/provider-mock` behind the real IPC format as
  soon as a UX is chosen.
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

- Frontend: Svelte 5 is the provisional pick (§1). Still open is the *rendering strategy*
  below board zoom (SVG rects vs a canvas/WebGL layer) — decide with the M1 LOD spike on
  100k-cell grids.
- Whether owners-for-every-active-page is affordable at 64 GiB on Windows (measure
  `SuperfetchPfnQuery` chunk throughput in M2 before committing the UI density).
- Recording format: keep JSONL forever, or add a compact binary framing once volumes
  grow (decide in M9).
- Tauri updater/signing story for the three platforms (M9).
- Rust ETW real-time consumption path (`windows` crate vs dedicated crates) and
  stack-walk payload parsing — M5 spike ([app-focus.md §11](app-focus.md)).
- Trace board-replay fidelity: keyframe cadence vs event volume (M5).
- Content-Security-Policy: `app/tauri.conf.json` has `csp: null` for the mockup. The UI
  sets inline `style` attributes (bar widths, tooltip position), so tightening it needs
  either `style-src 'unsafe-inline'` or a refactor to CSS variables — do this before any
  release.

## 9. Building the Windows app from WSL

Verified 2026-11 on Ubuntu 24.04 (WSL2) → Windows 11. No Visual Studio, no Node on the
Windows side — in fact nothing is installed on Windows at all.

| Piece | Where | Why |
| --- | --- | --- |
| Rust | WSL, via rustup | Ubuntu's `rustc` (1.75) is far older than Tauri 2 requires (1.92) |
| Target | `rustup target add x86_64-pc-windows-msvc` | the MSVC ABI — the only Windows target Tauri supports |
| Linker | LLVM via apt: `clang lld llvm clang-tools-18` | rustc needs a linker that emits MSVC-ABI binaries *on Linux*: `lld-link`, driven by `clang-cl`. `llvm-rc` compiles the icon/manifest resource |
| CRT + Windows SDK | downloaded by cargo-xwin (x64 only; accepts Microsoft's license) | supplies `kernel32.lib`, `ucrt.lib`, … |
| UI bundle | `pnpm build` in WSL | static files, embedded into the exe by `tauri::generate_context!` |
| Runtime on Windows | WebView2 Evergreen + the MSVC runtime DLLs | both already present on the target machine — checked *before* choosing this route |

`scripts/build-windows.sh` does it in one go: build the UI → `cargo xwin build --target
x86_64-pc-windows-msvc --features custom-protocol` → copy the exe to
`%LOCALAPPDATA%\computer-visualizer\` → launch it.

What it took to find out (each cost time):

- **`clang-cl` is not in Ubuntu's `clang` package.** It lives in `clang-tools-18`, and even
  then only as `clang-cl-18` (plus an unversioned copy in `/usr/lib/llvm-18/bin/`). The
  script looks there; `scripts/bin/clang-cl` is a last-resort shim — `clang
  --driver-mode=cl`, which is all clang-cl is.
- **`custom-protocol` must be passed by hand.** The Tauri CLI adds it for `tauri build`;
  a plain `cargo build` would otherwise expect a dev server and show a blank window.
- **Never build from the `\\wsl.localhost` share with Windows tools.** `cmd.exe` rejects
  UNC working directories and cargo is fragile there. Everything stays in the WSL
  filesystem; only the finished exe is copied across — and it is *run* from
  `%LOCALAPPDATA%`, never from the share.
- **LNK4099 noise.** The MSVC CRT import libraries reference PDBs that xwin doesn't
  fetch; `app/.cargo/config.toml` passes `/ignore:4099`.
- **First run** downloads the SDK to `~/.cache/cargo-xwin`; `XWIN_ARCH=x86_64` keeps arm64
  out of it.
- **Debug profile by default.** It compiles faster and UI speed lives in WebView2 anyway.

How to check a native window when you can't see the screen: capture *only the app's
rectangle*, and only while it is the foreground window — never the whole desktop. Use
`DwmGetWindowAttribute(DWMWA_EXTENDED_FRAME_BOUNDS)` for the rectangle: `GetWindowRect`
includes ~7 px of invisible resize border, which leaks slivers of neighbouring windows.
