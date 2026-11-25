# UX paradigms — contributor guide

A **UX paradigm** is a complete way to navigate, structure, group and visualise the same
information. Three ship as mockups so one can be chosen (docs/VISION.md, docs/milestones.md M1):

| id | root component | idea |
| --- | --- | --- |
| `instrument` | `src/ux/instrument/InstrumentUx.svelte` | Cockpit: rail → stage → inspector, nothing to drill into |
| `ionic` | `src/ux/ionic/IonicUx.svelte` | Hero: one thing at a time, zoom through physical levels |
| `taskmgr` | `src/ux/taskmgr/TaskmgrUx.svelte` | Tabs + master/detail, in the spirit of Windows Task Manager |

All three read **one store** and reuse **the same scene primitives**. They differ only in
layout, navigation and chrome. Switch with the floating control (top-right) or `Ctrl+1/2/3`.

## Ground rules

- A UX lives entirely under `src/ux/<id>/`. Its root component fills the viewport.
- **Never** change files outside your UX folder to make a UX work. If a shared piece is
  missing or wrong, note it in your PR instead.
- Keep the top-right `var(--chrome-safe) × 42px` clear — the floating UX switcher and mock
  controls live there. A global page tooltip already exists (driven by `app.hover`);
  don't add another.
- Style with **tokens only** (`var(--ink)`, `var(--panel)`, `var(--c-private)` …). Each UX
  theme is a token set in `src/app.css` under `:root[data-ux='<id>']`; add UX-local
  variables on your root element if you need more.
- Svelte 5 (runes, `onclick={}` handlers, snippets). `pnpm run check` must report
  0 errors for your files.
  Warnings of the kind *"reference only captures the initial value"* (geometry props are
  static on purpose) and a11y hints on SVG shapes with pointer handlers (they are pointer
  canvases; keyboard access lives in the UX) are expected — don't chase them.
- Everything is **mock data**; say so in the UI. Never present modeled placement as measured.
- **Every overlay shows its truth label.** A temperature / activity / power view is only as
  honest as the badge next to it (see the matrix below). Never hide or reword
  "estimated" / "modelled" into something that sounds measured.

## The store — `src/mock/store.svelte.ts`

```ts
import { app, getMachine, boardPage, hoverPage, selectProcess, selectFile, selectDimm,
         setHighlight, toggleHighlightOwner, setStateVisible, stateName, useName } from '../../mock/store.svelte';
```

| `app.` | type | meaning |
| --- | --- | --- |
| `version` | number | bumped every tick — re-read typed arrays when it changes |
| `tick`, `running`, `speed`, `tickMs` | | simulation clock / controls |
| `stats` | `Stats \| null` | fresh object every tick (see below) |
| `cpu` | `CpuLive \| null` | `cores[16] {index, ccd, load, temp, freq}`, `avgLoad`, `maxTemp`, `power` |
| `hist` | `{mem, cached, cpu, temp}: number[]` | 60 s rings (most recent last), percent / °C |
| `hover` | `HoverInfo \| null` | `{x, y, d: PageDetails}` — set via `hoverPage(details, event)` |
| `highlight` | `Highlight` | `{kind:'owner',id} \| {kind:'state',state} \| {kind:'use',use} \| {kind:'family',family} \| null` |
| `visible` | boolean[] | per page state — legend show/hide |
| `selectedDimm`, `selectedProcess`, `selectedFile` | `number \| null` | current selection (process/file = owner id) |
| `procHist` | number[] | blocks owned by the selected process over time |
| `log` | string[] | scenario log lines |
| `native` | `string \| null` | e.g. `Windows x86_64` inside the Tauri shell, `null` in a browser |
| `ux` | `UxId` | current paradigm |

`getMachine()` returns the `Machine` (not deeply reactive — cells are mutated in place):

```ts
machine.slots   // {index, label:'DIMM_A1', channel, dimm: Dimm|null} — includes empty slots
machine.dimms   // {index, slot, capacityGiB, type, speedMts, manufacturer, partNumber, serial, chips: Chip[]}
machine.chips   // flat; Chip {index, dimm, rank, sub, cells: Uint8Array(256), owners: Uint16Array(256)}
machine.owners  // Owner {id, kind:'process'|'file'|'kernel', name, shared}   (owners[0] = none)
machine.processes // {id, pid, name, weight, baseCpu, cpuPct, threads, alive}
machine.files     // {id, path, weight}
machine.total     // 16384 blocks
```

A cell is one byte: `(use << 4) | state`. Use `stateOf(v)` / `useOf(v)` from `model.ts`.
`State`: 0 Zeroed, 1 Free, 2 Standby, 3 Modified, 4 Active, 5 Bad. `Use`: 0 ProcessPrivate,
1 File, 2 PagefileMapped, 3 PageTable, 4 PagedPool, 5 NonPagedPool, 6 SystemPTE,
7 SessionPrivate, 8 Metafile, 9 AWE, 10 DriverLocked, 11 KernelStack, 15 none.
One block = 1024 pages = 4 MiB.

`app.stats` (`Stats`): `total`, `byState[6]`, `byUse[16]`, `byUseState[use][state]`,
`byOwner[id] {blocks, active, modified, standby}`, `inUse` (active + modified blocks),
`chipHot[chipIndex]` (0–1 live fraction), `dimmUsed[dimm]`, `procs[] {id, blocks, active,
modified, standby, cpuPct, alive, wsMiB, sharedMiB}`.

Actions: `selectProcess(id|null)` / `selectFile(id|null)` (also highlight the owner),
`selectDimm(i|null)`, `setHighlight(h)`, `toggleHighlightOwner(id)`, `setStateVisible(s, on)`,
`trigger('fileChurn'|'allocBurst'|'closeApp'|'purgeStandby', ownerName?)`, `toggleRunning()`.

## Overlays — what the colours mean

Besides page data ("Pages"), scenes can encode three physical quantities. The mode is
**global** — switching it recolours every grid and heat map in every scene.

```ts
import { app, setMode } from '../../mock/store.svelte';
import { MODES, MODE_META, modeApplies, DOMAIN, THROTTLE, TRUTH, TRUTH_LABEL, TRUTH_NOTE } from '../../mock/telemetry';
```

`app.mode` is `'pages' | 'temperature' | 'activity' | 'power'` (persisted; `?mode=` in the URL;
`Alt+1…4`). "Pages" only exists for system memory: `modeApplies(mode, 'cpu')` is false for it.

### The honesty matrix — what is really measured

| overlay | memory | cpu | gpu |
| --- | --- | --- | --- |
| **pages** | real, per page | not applicable | not applicable |
| **temperature** | one sensor per DIMM is real → per die **estimated** | per core **measured** | sensors real → die spread **modelled** |
| **activity** | per page **modelled** (Windows exposes no per-page access) | per thread **measured** | per engine real → die map **modelled** |
| **power** | **estimated** (no sensor on DIMMs) | package real → per core **estimated** | board real → per unit **estimated** |

`TRUTH[mode][component]` gives the word; `TRUTH_LABEL` renders it; `TRUTH_NOTE` is the
one-line reason for tooltips. `DOMAIN[mode][component]` is the value range of the ramp and
`THROTTLE[component]` the temperature at which it starts to throttle.

### Where the numbers live

`app.tele` (new object every tick — read it in `$derived`):

```ts
tele.dimmTemp[dimm]       // °C, one sensor per DIMM
tele.dieTemp[chip]        // °C, estimated per DRAM die
tele.heat[block]          // 0–255 modelled page heat per board block
tele.corePower[core]      // estimated watts
tele.threadLoad[thread]   // % per thread (two per core)
tele.gpu                  // temp, hotspot, vramTemp, fanPct, fanRpm, power, powerLimit, clockMhz,
                          // engines {3d, copy, decode, encode}, unitLoad[96], chipUsage[12],
                          // vramUsedMiB / vramTotalMiB, procs[] {name, mib}
```

Per-core temperature, load and clock stay on `app.cpu.cores[i]`. `app.hist.gpu` (3D load %)
and `app.hist.gpuTemp` are the 60 s rings.

### Colouring

`src/scene/paint.svelte.ts`: `rampColor(mode, t01)`, `norm(mode, component, value)` → 0–1,
`metricColor(component, value)` (null → "no data" colour), `rampCss(mode)` for gradients.
The ramps are CSS variables (`--ramp-thermal`, `--ramp-activity`, `--ramp-power`) so themes
can restyle them. `rampColor` is reactive: it re-runs whenever the ramps (re)load, so it is
safe to call from a `$derived` or a template expression. For a *part* of a component (one GPU unit ≈ 1–4 W, not board watts) pass
its own range: `rampColor(mode, scale(value, [0, 6]))`.

`ChipGrid` paints overlays by itself: board chips take the mock telemetry
(`boardOverlay`), derived grids pass `overlay={(cell) => value}` (return `null` for "no
data") and optionally `domain={[lo, hi]}`; `component` picks the default range. In an
overlay mode a grid recolours fully every tick.

## Scene primitives — `src/scene/`

| component | props | notes |
| --- | --- | --- |
| `RamBoard.svelte` | `interactive?`, `compact?`, `onstick?(dimm)`, `onchip?(dimm, chipIndex)` | every slot, grouped by channel. Canvas 1260 × 672 (`compact`: 592) |
| `DimmStick.svelte` | `dimm`, `interactive?`, `labels?`, `onstick?`, `onchip?` | line-art UDIMM, 2 ranks × 8 dies, each die a live grid. Canvas 560 × 162 |
| `ChipGrid.svelte` | `chip`, `x y w h`, `cols?=16 rows?=16 gap?=0.22 rx?=0.3`, `cells? owners?`, `details?(cell)=>PageDetails`, `interactive?=true`, `oncellclick?(cell)` | imperative rects; only changed cells repaint. Pass `cells`/`owners`/`details` for derived (zoomed) grids |
| `CpuDie.svelte` | `interactive?=true`, `labels?=true`, `onccd?(ccd)`, `oncore?(core)`, `selectedCore?=null`, `selectedCcd?=null` | mock package: 2 CCDs + I/O die. Mode-aware: a core's colour is its temperature / load (one half per SMT thread) / estimated watts. Hover cards built in. Canvas 460 × 390 |
| `Legend.svelte` | `compact?` | state toggles + use-family highlight (pages mode only) |
| `ModeSwitch.svelte` | `component?='memory'`, `compact?` | the segmented control: Pages · Temperature · Activity · Power. Pages is disabled for `cpu` / `gpu` |
| `ScaleLegend.svelte` | `component?='memory'`, `compact?`, `note?`, `domain?` | the reading guide for the current mode: the page legend in Pages, otherwise the ramp's scale with throttle marker **and the truth label**. On `cpu` / `gpu` it shows the *temperature* scale in Pages mode, because the primitives fall back to temperature there. Use this instead of `Legend` wherever an overlay can appear |
| `GpuCard.svelte` | `interactive?=true`, `labels?=true`, `ondie?()`, `onvram?(chip)`, `oncard?()`, `selected?=null` (`'card'` / `'die'` / chip index) | graphics card, cooler lifted off: die (96 units in 6 engines), 12 VRAM chips (usage bars), turning fans, power input. Mode-aware, hover cards built in. Canvas 780 × 420 |
| `Motherboard.svelte` | `interactive?=true`, `labels?=true`, `oncpu?()`, `ongpu?()`, `ondimm?(dimm)` | the whole board: socket (a `CpuDie`), memory slots (rotated `DimmStick`s), the card in its PCIe slot. Everything in it is the real primitive with its own data. Canvas 960 × 1000 |
| `PanZoom.svelte` | `width height min? max? initial?`, snippet `children`; exports `reset()`, `zoomBy(f)` | wheel-zoom / drag-pan SVG viewport |
| `AreaGraph.svelte` | `values`, `max?=100 min?=0 color? unit? label? decimals? grid?=4`, `readout?='overlay'` (`'above'` keeps the number out of short plots, `'none'` when the caller shows it) | live area graph with readout |
| `Sparkline.svelte` | `values`, `max? min? color? width?=84 height?=22` | tiny trend line |
| `Icon.svelte` | `name`, `size?=18` | `overview memory cpu gpu apps search play pause bolt broom x home arrowLeft chevronRight layers` |

Colours: **hue = use class** (`--c-private` blue, `--c-file` green, `--c-pagefile` violet,
`--c-kernel` orange), **intensity = page state** (active = solid, standby = 34 %, modified =
`--c-modified`, free/zeroed/bad = `--c-free` / `--c-zeroed` / `--c-bad`). Hidden states use
`--c-hidden`, dimmed (not matching the highlight) `--c-dim`.

### Hover cards

The global tooltip shows a `HoverCard` — `{ title, sub?, swatch?, rows: [{k, v, mono?, dim?}], note?, hint? }`.

```ts
import { hoverCard, hoverOut, pageCard } from '../../mock/store.svelte';
// anything that is not a memory page (a core, a VRAM chip, a fan…):
onpointerenter={(e) => hoverCard({ title: 'Fan 1', sub: '42 % · 1260 rpm', rows: [{ k: 'temperature', v: '64 °C', mono: true }] }, e)}
onpointerleave={hoverOut}
```

Memory pages keep using `hoverPage(pageDetails, e)`. A `PageDetails` may carry `metrics`
(extra rows, e.g. for a zoomed grid) and `note` (replaces the default "what a click does"
hint). `app.hover.card` is what is shown; `app.hover.d` is the page, when it is one.

### Zoom levels below the board

`deriveGrid(key, parentValue, owner, n)` (`src/mock/derive.ts`) deterministically expands one
board block into `n` finer blocks that follow the parent's state. This is the modeled view
from docs/ram-model.md §4 — badge it as modeled in the UI.

## Screenshot hooks (dev only)

`?ux=<id>` picks the paradigm · `&ticks=60` pre-rolls the simulation ·
`&demo=hover|process|file|dimm|family` presets a selection · `&mode=pages|temperature|activity|power`
picks the overlay · `&dev=primitives` opens the scene-primitive workbench
(`src/dev/Primitives.svelte`) where every shared piece can be viewed on its own. A UX may read its own params
(e.g. `?level=`, `?page=`) to open on a specific view.

```bash
cd ui && pnpm dev                      # http://localhost:5173 — reachable from the Windows browser
cd ui && pnpm run check && pnpm build  # 0 errors required
```

Headless render check (Edge = the WebView2 engine; paths from WSL):

```bash
EDGE="/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
"$EDGE" --headless=new --disable-gpu --hide-scrollbars --no-first-run \
  --user-data-dir='C:\Users\dar\AppData\Local\Temp\cv-edge-profile' --window-size=1440,900 \
  --virtual-time-budget=7000 --screenshot='C:\Users\dar\AppData\Local\Temp\cv-shots\name.png' \
  'http://localhost:5173/?ux=ionic&ticks=60&level=stick'
# → /mnt/c/Users/dar/AppData/Local/Temp/cv-shots/name.png
```

## Native shell

`../app` is the Tauri 2 crate; the Windows exe is cross-built from WSL with
`scripts/build-windows.sh` (see docs/architecture.md).
