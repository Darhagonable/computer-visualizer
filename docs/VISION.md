# Vision

*Computer Visualizer* — see inside the machine.

## Elevator pitch

Every monitoring tool shows you *numbers*: 62% used, 71°C, 3.2 GHz. This app shows you the
**machine itself**. Your RAM is drawn as technical line-art sticks — the real sticks you
installed, with the real number of chips on each — and every chip carries a live grid of
the physical memory pages living inside it. Hover a page: see its state, its owning
process, the file it caches. Your CPU is drawn delidded: chiplets, IO die, every core,
each pulsing with its own temperature and load. It is Task Manager as if drawn by a
schematic artist; it is debugging at the level hardware engineers actually think in.

## Inspirations

| Inspiration | What we take from it |
| --- | --- |
| **[Sysinternals RAMMap](https://learn.microsoft.com/en-us/sysinternals/downloads/rammap)** | The ground truth: per-page physical memory data — use, list, priority, owning file. Our RAM view is RamMap rendered as hardware instead of a list view. |
| **Task Manager → Performance tab** | Live, glanceable telemetry; the feeling that the machine is breathing. |
| **[HWiNFO](https://www.hwinfo.com/)** / **[LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor)** | Sensor depth and breadth; the discipline of per-vendor, per-family register knowledge. |
| **[Thaiphoon Burner](https://en.wikipedia.org/wiki/Thaiphoon_Burner)** | Module forensics: reading SPD, understanding DRAM density/rank/organization, treating a DIMM as a real populated circuit board rather than a capacity number. |
| **Ionic RAM Defrag** | The aesthetic: clean, minimal, animated line-art memory sticks. The proof that memory visualization can be beautiful. *(No stable link survives — see [SOURCES.md](SOURCES.md).)* |
| **[AMD Radeon Memory Visualizer](https://gpuopen.com/rmv/)** | The interaction model for *per-application* memory: pick an app, timeline, snapshots, resource detail, dithered aliasing, compare + leak finder. It traces GPU memory through AMD's driver; we borrow the model for system RAM. |
| **[Sysinternals VMMap](https://learn.microsoft.com/en-us/sysinternals/downloads/vmmap)** | The system-RAM counterpart: a process's address space by type, a timeline of snapshots, "Show Changes" diffs. |

## The flagship views

### RAM view

- One drawn stick per populated memory slot, laid out like a board drawing (DDR5 UDIMMs,
  SO-DIMMs, whatever is actually installed — shape follows form factor).
- The **real number of chips per stick**, inferred from SPD/SMBIOS organization
  (see [ram-model.md](ram-model.md) for the inference rules and its honesty caveats).
- Each chip renders a **grid of physical memory pages**, live: colored by state
  (active / standby / modified / free / zeroed) and use (process-private / file-backed /
  pagefile / kernel).
- Hover any page: PFN, state, priority, use; owning process; backing file path when the
  page is file-backed.
- Click a file or process: its pages light up across **every chip on every stick** —
  interleave made visible.
- The Ionic-style "defrag" animation when flushing Windows memory lists
  (empty working sets / purge standby — real operations, honestly labeled; modern
  memory lists are not a defragmentable fragmentation problem, and we won't pretend
  otherwise).

### Application focus

- **Pick a process** and see *its* memory: its pages highlighted on the board with their
  real states, shared pages drawn dithered, a footprint timeline, and honest totals.
- **Its address space**, region by region (images, mapped files, heaps, stacks, private)
  — and the link nobody else draws: select a region, its resident pages light up on the
  chips. VMMap shows virtual, RAMMap shows physical; we connect them.
- **Pin two snapshots and compare** — added, removed, grown regions; the leak finder.
- **Opt-in allocation tracing** (admin / root): every `VirtualAlloc`/`mmap`-class
  operation, hard faults, and — on Linux — each physical page allocation, replayed
  against the page grid. Never-released commits are the leak candidates.

Specification: [app-focus.md](app-focus.md).

### Processor and GPU views

- The processor package drawn **delidded**: substrate, chiplets (CCDs on AMD, P/E core
  clusters on Intel hybrid), IO die, monolithic fallback layout.
- Every core rendered individually with live utilization, frequency, and temperature
  (driver-assisted on Windows); SMT siblings drawn as adjacent halves.
- Cache topology visible: L3 slices grouped per CCX, the "AMD cache latch" made obvious.
- The graphics card as an exploded drawing — cooler lifted off so the die and every VRAM
  chip stay visible — with temperatures, power, fans, per-engine load and per-process VRAM.
  A GPU has no page-level data on any OS (see the honesty principle), so this view is
  summary-level by nature.

### Overlays — what the colours mean

One switch changes what every cell in every scene encodes:

| Overlay | Colour means | Memory | Processor | GPU |
| --- | --- | --- | --- | --- |
| **Pages** | hue = what a page is for, intensity = its state | real, per page | not applicable | not applicable |
| **Temperature** | a thermal ramp, with the throttle point marked | one sensor per DIMM is real; per die **estimated** | per core **measured** | sensors **measured**; spread across the die **modelled** |
| **Activity** | how busy each unit is | per page **modelled** (Windows exposes no per-page access) | per thread **measured** | per engine **measured**; die map **modelled** |
| **Power** | watts per unit | **estimated** (DIMMs have no sensor) | package **measured**; per core **estimated** | board **measured**; per unit **estimated** |


- The package drawn **delidded**: substrate, chiplets (CCDs on AMD, P/E core clusters on
  Intel hybrid), IO die, monolithic fallback layout.
- Every core rendered individually with live utilization, frequency, and temperature
  (driver-assisted on Windows); SMT siblings drawn as adjacent halves.
- Cache topology visible: L3 slices grouped per CCX, the "AMD cache latch" made obvious.
- Heat as color, load as animation, frequency as a number per core — debuggable in
  great detail (stuck core? hot CCD? throttling single thread? visible at a glance).

## The honesty principle

**Every pixel is either a measurement or a labeled model — never a silent guess.**

Three things in this domain are *not knowable* from an operating system:

1. **Which physical chip on which DIMM a given page frame lives in.** Memory controllers
   interleave physical addresses across channels/ranks/chips and publish no interleave
   map. Our placement of pages onto chips uses a *documented deterministic interleave
   approximation* ([ram-model.md](ram-model.md)), rendered with an explicit
   **"modeled placement"** badge. The per-page *data* is real; the *address→chip
   assignment* is a model.
2. **The physical floor-plan of a specific CPU die.** We ship a die-layout database for
   known models and a clearly-generic fallback layout
   ([cpu-model.md](cpu-model.md)).
3. **Which VRAM chip holds which process's data, and which part of a GPU die is busy.** No
   OS exposes VRAM placement or per-unit load. We model both from the real totals and label
   them *modelled*.

Approximations that are honestly badged build more trust than false precision. This
principle governs every scene in the app.

The overlays use three words for it, and every scale shows the one that applies:
**measured** (read from a sensor or a counter), **estimated** (derived from a real
measurement of the same thing at coarser granularity — a DIMM's sensor, the CPU's package
power), **modelled** (a plausible pattern that no measurement backs — page heat, the busy
units of a GPU die). The matrix lives in
[ui/UX-GUIDE.md](../ui/UX-GUIDE.md) and the per-platform sources in
[data-sources/](data-sources/).

## Target users

- **Enthusiasts and overclockers** who want to *see* interleaving, cache topology, and
  thermals rather than read hex registers.
- **Developers and system debuggers** chasing memory pressure, file-cache behavior, or a
  misbehaving core.
- **Educators and the curious** — the app doubles as an anatomy lesson for a PC.

## Non-goals

- **Not a writer.** We never write SPD, MSRs, voltages, or fan curves. Read-only
  telemetry, with the sole exception of Windows memory-list maintenance operations
  (working-set trim / standby purge), which are ordinary administrator operations, not
  hardware writes.
- **Not a benchmark.** No scores. Live state only.
- **Not a "RAM optimizer".** We visualize; we don't sell snake oil. List-flush operations
  are presented as the diagnostic/maintenance tools they are.
- **Not remote/hostile-environment monitoring.** Local machine only, at least for the
  foreseeable roadmap.

## Platform tiers

Windows and Linux get the full experience (each via very different mechanisms — see the
[data-sources](data-sources/) docs). macOS is honest tier-2: summary statistics, DIMM
inventory on Intel Macs, a purpose-designed unified-memory scene on Apple Silicon, and a
clear "page-level data not available on this OS" state rather than fake data.

## Design language

Line art. Thin, precise strokes; schematic/datasheet aesthetics; restrained color used
only for data (page states, temperatures). Dark and light themes. Motion is data-driven
(usage pulses, heat ramps), never decorative. Zoom levels are physical: board → stick →
chip → bank block → page.
