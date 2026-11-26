# UX paradigms — contributor guide

A **UX paradigm** is a complete way to navigate, structure, group and visualise the same
information. Three ship as mockups so one can be chosen (docs/VISION.md, docs/milestones.md M1):

| id | root component | idea |
| --- | --- | --- |
| `instrument` | `src/ux/instrument/InstrumentUx.svelte` | Cockpit: stage → inspector, nothing to drill into on its own scenes |
| `ionic` | `src/ux/ionic/IonicUx.svelte` | Hero: one thing at a time, zoom through physical levels |
| `taskmgr` | `src/ux/taskmgr/TaskmgrUx.svelte` | Tabs + master/detail, in the spirit of Windows Task Manager |

All three read **one store**, reuse **the same scene primitives** and compose **the same
shell** — the side menu, the mode row and the part views (`src/shell/`, `src/levels/`). They
differ only in layout, navigation, chrome and theme. Switch with the floating control
(top-right) or `Ctrl+1/2/3`.

Every UX offers the same six sections — Overview · Processor · Memory · Storage · Graphics ·
Applications — and opens the same part views. A section lands on whatever that UX shows for it:
its own scene or page where it has one, the shared view where it doesn't. A part clicked there
opens the shared view of that part, and Esc climbs back out. What is each UX's own: the scenes
and pages it shows for a section, where the menu and the mode row sit, its theme, and the chrome
around the stage.

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
- **Compose the shell; don't rebuild it.** Navigation between sections is `SideMenu` →
  `LevelNav` → `PartView`; the reading of the colours is `ModeRow` (both under "The shell"
  below). A UX owns exactly one `LevelNav`.
- **Telemetry is mutated in place.** `app.tele` keeps its identity from tick to tick. Whatever
  must update every tick reads `app.version` (or `app.stats`, which is a fresh object) inside
  its own `$derived` / template expression; a `$derived.by` has to return a fresh value.
  Don't rely on `app.tele` changing — and don't judge liveness on a paused page.

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
| `hist` | `{mem, cached, cpu, temp, gpu, gpuTemp, storage}: number[]` | two-minute rings at 2 Hz (most recent last): percent / °C; `storage` is the busiest drive's busy time |
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

| overlay | memory | cpu | gpu | storage |
| --- | --- | --- | --- | --- |
| **pages** | real, per page | not applicable | not applicable | not applicable |
| **temperature** | one sensor per DIMM is real → per die **estimated** | per core **measured** | sensors real → die spread **modelled** | an NVMe drive's composite temperature **measured**; a drive with no sensor is **no data** |
| **activity** | per page **modelled** (Windows exposes no per-page access) | per thread **measured** | per engine real → die map **modelled** | per drive **measured** → the split between partitions **modelled** |
| **power** | **estimated** (no sensor on DIMMs) | package real → per core **estimated** | board real → per unit **estimated** | **estimated** (no drive exposes its draw) |

`TRUTH[mode][component]` gives the word; `TRUTH_LABEL` renders it; `TRUTH_NOTE` is the
one-line reason for tooltips. `DOMAIN[mode][component]` is the value range of the ramp and
`THROTTLE[component]` the temperature at which it starts to throttle.

A reading and the overlay built on it are not the same claim. A module's sensor is
**measured**; the per-die spread derived from it is **estimated**. The word always belongs to
the thing it is printed next to: a guide's word is the overlay's, the side menu's is the
figure's ([`sectionLive`](#the-shell--srcshell)).

Storage has a fourth state the others don't need: **no data**. A drive without a temperature
sensor is `null` — drawn in the theme's no-data colour and written "—" or "no sensor". Never
fill it from activity, never average it from the other drives.

### One model, defined once

Never re-derive a memory block's overlay value. `src/mock/telemetry.ts` is the definition —
grids, tiles, legends and tooltips all call it:

```ts
import { cellValue, cellHeat, cellTemperature, cellActivity, cellPower } from '../../mock/telemetry';
cellValue(mode, tele, chip, block, cell = -1)   // a board block; pass `cell` ≥ 0 for a finer cell of a zoomed grid
//   temperature  die estimate from the module sensor, warmer where pages work   (estimated)
//   activity     the block's modelled page heat, shared out to its cells          (modelled)
//   power        0.9 W + heat × 3.1 W                                           (estimated)
```

The range a ramp spans comes from `rangeFor(mode, component)` (`scene/paint.svelte.ts`) — not
from `DOMAIN` directly. Memory temperature follows the module sensors: module sensors sit in
a narrow band, so a fixed 30–85 °C ramp would paint everything one colour. The scale spans
coolest … warmest, never narrower than 12 °C, and still states the throttle point.

`app.tele` (created once, **mutated in place every tick** — see the ground rules for how to stay live):

```ts
tele.dimmTemp[dimm]       // °C, one sensor per DIMM
tele.dieTemp[chip]        // °C, estimated per DRAM die
tele.heat[block]          // 0–255 modelled page heat per board block
tele.corePower[core]      // estimated watts
tele.threadLoad[thread]   // % per thread (two per core)
tele.gpu                  // temp, hotspot, vramTemp, fanPct, fanRpm, power, powerLimit, clockMhz,
                          // engines {3d, copy, decode, encode}, unitLoad[96], chipUsage[12],
                          // vramUsedMiB / vramTotalMiB, procs[] {name, mib}
                          // tele.storage[] — DriveLive: index, kind (nvme | ssd | hdd), model, bus, totalGiB, usedGiB,
                          //   partitions[] {letter, label, fs, usedGiB, totalGiB, share}, readBps, writeBps, busyPct,
                          //   tempC (null when the drive has no sensor), wearPct (number | null), powerOnHours, power (estimated)
procOnChip(gpu, procIndex, chip)   // MiB of a process on a VRAM chip: the modelled placement, published — never re-derive it
```

Per-core temperature, load and clock stay on `app.cpu.cores[i]`. `app.hist.gpu` (3D load %)
and `app.hist.gpuTemp` are the 60 s rings.

### Colouring

`src/scene/paint.svelte.ts`: `rampColor(ramp, t01)`, `norm(ramp, component, value)` → 0–1,
`metricColor(ramp, component, value)` (pass the overlay the part is on; `null` → "no data"
colour), `rampCss(ramp)` for gradients.
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
| `ScaleLegend.svelte` | `component?='memory'`, `compact?`, `note?`, `domain?`, `explain?`, `noData?` | the reading guide for the current mode: the page legend in Pages, otherwise the ramp's scale with throttle marker **and the truth label**. On `cpu` / `gpu` it shows the *temperature* scale in Pages mode, because the primitives fall back to temperature there. With `explain` it also says why, in the sentence from telemetry.ts. With `noData` — nothing on stage has a reading for this overlay — its word is "not available" and it shows no throttle mark. Use this instead of `Legend` wherever an overlay can appear |
| `GpuCard.svelte` | `interactive?=true`, `labels?=true`, `ondie?()`, `onvram?(chip)`, `oncard?()`, `selected?=null` (`'card'` / `'die'` / chip index) | graphics card, cooler lifted off: die (96 units in 6 engines), 12 VRAM chips (usage bars), turning fans, power input. Mode-aware, hover cards built in. Canvas 780 × 420 — it is a nested `<svg>` with its own size: wrap it in `<svg viewBox="0 0 780 420">` when you place it in HTML, and keep that size inside `PanZoom` (a nested `<svg>` without `width` / `height` takes its parent's viewport, so zooming would change the `viewBox` without magnifying anything) |
| `Motherboard.svelte` | `interactive?=true`, `labels?=true`, `oncpu?()`, `ongpu?()`, `ondimm?(dimm)`, `ongpudie?()`, `ongpuvram?(chip)`, `onstorage?(drive)` (-1 for the bay itself) | the whole board: socket (a `CpuDie`), memory slots (rotated `DimmStick`s), the card in its PCIe slot. Everything in it is the real primitive with its own data, the drives included. Canvas 960 × 1000 |
| `Drive.svelte` | `drive` (index into `app.tele.storage`), `interactive?`, `labels?`, `partitions?` (the capacity bar), `selected?`, `labelScale?`, `ondrive?(drive)`, `onpartition?(drive, partition)` | a drive drawn as line art — M.2 stick, 2.5″ SSD, 3.5″ hard disk — coloured by the overlay. A drive without a temperature sensor is drawn in the no-data colour. Its `<script module>` is the one definition of a drive's canvas (`DRIVE_CANVAS`), readings, formats and hover cards (`driveCard`, `partitionCard`) — import those rather than writing a card for a drive. Canvas per kind, in `DRIVE_CANVAS` |
| `PanZoom.svelte` | `width height min? max? initial?`, snippet `children`; exports `reset()`, `zoomBy(f)` | wheel-zoom / drag-pan SVG viewport |
| `AreaGraph.svelte` | `values`, `max?=100 min?=0 color? unit? label? decimals? grid?=4`, `readout?='overlay'` (`'above'` keeps the number out of short plots, `'none'` when the caller shows it) | live area graph with readout |
| `Sparkline.svelte` | `values`, `max? min? color? width?=84 height?=22` | tiny trend line |
| `Icon.svelte` | `name`, `size?=18` | `overview memory cpu gpu storage apps search play pause bolt broom x home arrowLeft chevronRight layers` |

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

## Part views — `src/levels/`

A **part view** (a *level*) fills a stage with one part of the machine. The fourteen levels are
shared: every UX opens the same ones.

```
machine (the board) ├─ memory (the modules) › stick (DIMM) › die › block › pages     memory
                    ├─ package (CPU) › CCD › core                                    processor
                    ├─ card (GPU) › GPU die | VRAM                                   graphics
                    ├─ drives › drive                                                storage
                    └─ apps                                                          applications
```

| file | what it is |
| --- | --- |
| `nav.ts` | the map, no rendering: the `Level` union; `SECTION_LEVEL` (the level a section opens) and `sectionOf(level)` (the section a level belongs to); `upOf`, `orderOf`, `crumbsOf`, `anchorOf`; the `…Layout(w, h)` functions, which place a level's hero; the `zoom` transition; `levelWheel` |
| `nav.svelte.ts` | `LevelNav`, the driver: where the user is, `go`, `up`, `down`, `handleKey`, and where they last were at each depth |
| `PartView.svelte` | mounts the level the navigation is on — the UX's own view of it where it has one (`own`), otherwise the shared view — changing levels with the zoom-through transition |
| `*Level.svelte` | one component per level |
| `Guide.svelte`, `TruthChip.svelte`, `live.ts` | the reading guide with its truth label; a truth badge for a figure outside a guide; formatting and truth helpers |
| `levels.css` | the part views' shared styles (the `io-*` tiles). **Loaded once, by `App.svelte`, as its last import.** Never import it from a component |

### Hosting the part views

```svelte
<script lang="ts">
  import { untrack } from 'svelte';
  import { LevelNav } from '../../levels/nav.svelte';
  import PartView from '../../levels/PartView.svelte';
  import { sectionOf, type Level } from '../../levels/nav';
  import { sectionLevel } from '../../shell/sections';

  // once, at the top level of the script: creating it writes to the store,
  // which is not allowed inside a $derived or a template
  const nav = untrack(() => new LevelNav({ kind: 'machine' }));

  // Esc / Backspace go up one level, in the capture phase, before the app's own Esc
  $effect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (nav.handleKey(e)) e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
</script>

<SideMenu section={sectionOf(nav.level)} onselect={(s) => nav.go(sectionLevel(s))} />

<!-- a box with a size of its own: a grid or flex cell, or position: absolute; inset: 0 -->
<div class="stage">
  <PartView {nav} own={{ machine: overview, package: processor }} />
</div>

<!-- declared at the top level of the markup, and named in `own`.
     NOT nested inside the <PartView> tag: a snippet written there is passed to it as a prop. -->
{#snippet overview()}
  <!-- this UX's own Overview. Without it the root level is the shared board. -->
  <MyOverview onnavigate={(l: Level) => nav.go(l)} />
{/snippet}

{#snippet processor()}
  <!-- this UX's own view of a section it already has. A part clicked in it opens the shared view
       below it; going up comes back here. -->
  <MyProcessorScene onnavigate={(l: Level) => nav.go(l)} />
{/snippet}
```

- Every level has a shared part view. `own` is the levels this UX shows its own way, by kind:
  its Overview, and the scenes or pages it already has for some sections. A UX that passes
  nothing shows the shared views throughout (Ionic).
- `go`, `up`, `down` and `handleKey` are bound members: hand them to crumbs, docks and scenes
  as callbacks.
- `PartView` fills the box it is given and measures it. A box without a size of its own gives
  every level a size of 0.
- A snippet declared in the markup is in scope in the markup only. To build `own` in the script,
  hand the snippet in from the tag (`own={ownFor(view)}`).
- `handleKey` returns false at the root, so the key goes on to whatever else listens (the app
  clears the highlight on Esc). A popover of the UX's own takes Esc first; pass `typing` when
  the focus is in a text field.
- `down()` moves one level per gesture and ignores the rest of the task: a click on a part
  reaches its host by more than one road.
- `motion={false}` changes levels without the zoom, for a UX that animates its pages its own way.

### Writing a level

- Props `{ w, h, go, down }` plus its own selector. `w` and `h` are the stage in px (0 before
  the first measure); `go(level)` opens a level; `down(target?)` goes one level deeper.
- Root `<div class="lv lv-scope" bind:this={root} data-short={h > 0 && h < 620 ? '1' : '0'}>`,
  `position: absolute; inset: 0` in its own scoped styles. Under 620 px of stage the shared
  rules compact the tiles and hide the guides' reason line; hang the level's own compact rules
  on `data-short`.
- Tokens only. The same level runs under all three themes.
- Wherever a level colours by an overlay, a `<Guide component="…" />` is on stage with it. A
  part without pages (a processor, a drive) stays on its temperature colours in Pages mode, and
  `Guide` says so by itself. A part with **no reading** for the overlay — a drive without a
  temperature sensor — gets `noData` on its Guide: the word is then "not available". Never leave a
  guide badged "measured" above a dash.
- Wheel on the hero: `levelWheel(step)` from `nav.ts`. Enter on a focused hero: `down()`. No
  Escape handling — the host registers it.
- The board is the hub: `up` from a module returns to it, not to the modules view.
- A column of tiles that can be taller than the stage gets `overflow-y: auto`. The wheel yields
  to a column that can scroll (`levelWheel` checks), so nothing is ever left under the chrome.
- Fit by measurement. The Overview was sized from the heights of its tiles at every window size
  from 1440×900 to 1024×600; a new level deserves the same.

## The shell — `src/shell/`

### `SideMenu.svelte` — the six sections

```svelte
<SideMenu section={sectionOf(nav.level)} onselect={(s) => nav.go(sectionLevel(s))} variant="list">
  <button onclick={toggleRunning}>…</button>   <!-- optional: whatever belongs at the foot -->
</SideMenu>
```

| prop | |
| --- | --- |
| `section` | the section on stage — `sectionOf(nav.level)`; its row is marked current |
| `onselect(section)` | a row was clicked. `sectionLevel(section)` in `shell/sections.ts` is the level to open |
| `variant` | `list` (the default), `rail`, `stack` |
| `label` | the landmark's name |
| `children` | whatever the UX keeps at the foot of its menu |

| form | size, six rows | shows |
| --- | --- | --- |
| `list` | 256 × 310 | icon · label · the word beside the figure, over a sparkline and the caption |
| `rail` | 64 × 448 | icon over figure over word |
| `stack` | 88 × 556 | icon over label over figure over word |

A row's figure follows the global mode, because everything on screen does, and the word beside
it is the truth of **that figure**. `sectionLive(section)` in `shell/sections.ts` is the model;
read its header before changing a word. A narrow form may drop the label, the caption and the
sparkline — all of it stays in the tooltip. It never drops the word. Too short for its rows, the
menu scrolls. Restyle it from the host with the `--sm-*` properties it declares.

**Choosing a form is about the stage, not the menu.** The part views are laid out for a stage
about 1000 px wide and up; the Overview needs exactly 1001 for the board with a tile column
either side. Below that it changes shape on its own (`nav.MACHINE_NARROW`): the board and one
tile area, in two columns from 893 px of stage — so that all four components stay on screen
even on a stage only 410 px tall — and in one scrolling column below that. So `list` where the
window is 1280 px or wider; `rail` below that, which leaves a 1024-px window a stage of 960.

Measured, with reduced motion so nothing was caught mid-animation, at six widths from a 780 to a
1256 px stage in both the tall and the compact layout: every one of the fourteen part views fits
on a stage 960 px wide. Two need that much — the memory module view (`stick`) overflows below
900, the VRAM view (`vram`) below 960 — and the other twelve fit at every width measured.

### `ModeRow.svelte` — what the colours mean

```svelte
<ModeRow component={PART[nav.level.kind]} note="per core">
  <PinChip />   <!-- optional: whatever belongs beside it -->
</ModeRow>
```

| prop | |
| --- | --- |
| `component` | whose reading guide this is |
| `scale` | `always` (the default): the view paints exactly this component · `pages`: several components are on stage, so only the page legend belongs here · `never` |
| `note` | a short qualifier after the truth badge |
| `domain` | when the view paints against a range that is not the component's own |
| `compact` | a short stage: a smaller switch, no qualifier, no reason line |
| `children` | whatever belongs beside it |

It is the mode switch followed by the shared `ScaleLegend`, so the truth label is part of it. In
Pages mode a component without pages shows its temperature scale and says why.

## Screenshot hooks (dev only)

`?ux=<id>` picks the paradigm · `&ticks=60` pre-rolls the simulation · `&paused=1` freezes it ·
`&demo=hover|process|file|dimm|family` presets a selection · `&mode=pages|temperature|activity|power`
picks the overlay · `&level=<kind>` opens a part view (`part=storage|apps|memory` select one too;
`level=drive&drive=N`).

`&dev=primitives` opens the scene-primitive workbench (`src/dev/Primitives.svelte`), `&dev=levels` the
part views — one level in a plain box, driven by the real navigation (`src/dev/Levels.svelte`) — and
`&dev=shell` the side menu and the mode row (`src/dev/Shell.svelte`): where every shared piece can be
viewed on its own. A UX may read its own params (e.g. `?page=`) to open on a specific view, and must
honour the ones every UX shares.

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

### A frame is only as good as the page it came from

**Check that the page is sound before you trust a frame.** After bursts of edits the dev server can
keep an old transform of one module, whose imports carry an older `?t=` than everyone else's. One
file is then loaded under two URLs — twice. A second copy of the store is never initialised and reads
as its defaults: components disagree about the mode, a guide shows the reason for another overlay,
and every frame taken in that state lies. It has happened. It follows a burst of many files
changing at once, and it often clears by itself once the burst is over. It is caused, not cured,
by re-touching the whole tree to "refresh" the server: that is a mass invalidation, and the
server's log then shows `Soft-invalidated module … should not have existing transform result`.
Restart instead. In the page's console:

```js
const seen = new Map();
for (const e of performance.getEntriesByType('resource')) {
  const u = new URL(e.name);
  if (!u.pathname.startsWith('/src/') || u.searchParams.has('type')) continue;
  seen.set(u.pathname, (seen.get(u.pathname) ?? new Set()).add(u.search));
}
console.log([...seen].filter(([, s]) => s.size > 1)); // must print []
```

If it lists anything, restart `pnpm dev` and look again. And judge liveness on a running page:
`paused=1` makes frames reproducible, and hides everything that never updates.

The same trap is one `import()` away: importing a module in the page's console by a bare URL
(`/src/mock/store.svelte.ts`) makes a second copy of it — never initialised, reading as its
defaults. Import the URL exactly as the page loaded it:

```js
const loaded = (path) => performance.getEntriesByType('resource').map((e) => e.name).find((n) => new URL(n).pathname === path);
const { app } = await import(loaded('/src/mock/store.svelte.ts'));
```

## Native shell

`../app` is the Tauri 2 crate; the Windows exe is cross-built from WSL with
`scripts/build-windows.sh` (see docs/architecture.md).
