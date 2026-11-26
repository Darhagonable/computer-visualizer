# Computer Visualizer

A native desktop app (Windows / macOS / Linux) that renders your machine's hardware as
explorable, animated line-art schematics — a mix of **RamMap** (per-page physical memory
truth), the **Task Manager performance tab** (live telemetry), **HWiNFO/LibreHardwareMonitor**
(sensor depth), and **Thaiphoon Burner** (module forensics), drawn in the clean line-art
spirit of *Ionic RAM Defrag*.

First focus: **RAM** — memory sticks drawn as technical line art, showing the real number of
chips per stick, each chip carrying a live grid of physical memory pages (used / free /
standby / modified) and, where the OS allows it, which file or process owns each page.
Also **Application Focus** — pick a process and see how it allocates and uses memory:
its pages on the board, its address space, snapshot compare with a leak finder, and an
opt-in allocation trace.
Next: **CPU** — a "delidded" processor showing chiplets, the IO die, and every core with
its live temperature, frequency, and usage.

> **Status: M1 UX spike.** The native shell runs on Windows (cross-built from WSL) with
> three switchable UX mockups driven by **mock data** — no real hardware is read yet. The
> documentation below is the design the real data providers will follow.

## Try it

Everything you see is **mock data** — a synthetic, deterministic machine — so you can
explore the UX without any privileged access.

```bash
pnpm --dir ui install
pnpm --dir ui dev          # → http://localhost:5173
```

Three **UX paradigms** are mocked up side by side over the same data — switch with the
control at the top right or `Ctrl+1` / `Ctrl+2` / `Ctrl+3`. *Instrument* is a cockpit
(rail → stage → inspector), *Ionic* is a physical zoom (machine → component → part),
*Task Manager* is tabs + master/detail. See [ui/UX-GUIDE.md](ui/UX-GUIDE.md).

Each one covers the **whole machine** — memory, processor and graphics card — and a
**mode switch** changes what every colour means (`Alt+1…4`):

| Mode | What a cell's colour means |
| --- | --- |
| **Pages** | what a memory page is for, and whether it is live |
| **Temperature** | how warm each unit is — per core, per memory block, per GPU unit |
| **Activity** | how busy each unit is |
| **Power** | watts per unit |

Not every number in those views can be measured, so every scale says which word applies —
**measured**, **estimated** or **modelled** ([the matrix](docs/VISION.md)). A memory module
has one temperature sensor, so its per-block heatmap is an estimate; a GPU's busy units are
modelled from per-engine load.

**Native Windows app, cross-built from WSL** — no Visual Studio, nothing installed on
the Windows side:

```bash
scripts/build-windows.sh                 # build UI → cross-compile → copy → launch
scripts/build-windows.sh --release --no-run
```

Prerequisites, and the reasons behind them: [docs/architecture.md §9](docs/architecture.md).

## Documentation

| Document | Contents |
| --- | --- |
| [docs/VISION.md](docs/VISION.md) | Product vision, inspirations, the honesty principle, non-goals |
| [docs/architecture.md](docs/architecture.md) | Stack decision record, provider model, IPC, performance budget |
| [docs/data-sources/windows.md](docs/data-sources/windows.md) | Windows data sources — primary target (PFN database, SMBIOS, PawnIO) |
| [docs/data-sources/linux.md](docs/data-sources/linux.md) | Linux data sources (kpageflags/pagemap, dmidecode, sysfs) |
| [docs/data-sources/macos.md](docs/data-sources/macos.md) | macOS data sources and its hard limits |
| [docs/ram-model.md](docs/ram-model.md) | The RAM visualization model: real data vs. modeled placement, interleave model, page grids |
| [docs/app-focus.md](docs/app-focus.md) | Application Focus — per-process pages, address space, snapshot compare & leak finder, opt-in allocation tracing |
| [docs/cpu-model.md](docs/cpu-model.md) | The CPU visualization model: topology, die-layout database, sensors |
| [docs/SOURCES.md](docs/SOURCES.md) | Curated source catalog — inspirations, die-shot & annotation references, viewer tech, technical canon, layout sourcing policy |
| [docs/milestones.md](docs/milestones.md) | Phased roadmap with acceptance criteria and risk register |

## Platform support tiers

| Tier | Platform | RAM view | CPU view |
| --- | --- | --- | --- |
| 1 | Windows 10/11 x64 | Full: per-page states + owning file/process + DIMM inventory | Full: topology + usage + temps (driver-assisted) |
| 1 | Linux | Full: per-page flags + file mapping + SPD/DIMM inventory | Full: topology + usage + temps (sysfs) |
| 2 | macOS (Apple Silicon) | Summary + unified-memory scene (no DIMMs, no page map) | Topology (P/E cores) + usage; temps limited |
| 2 | macOS (Intel) | Summary + DIMM inventory; no page-level data | Topology + usage; temps limited |
