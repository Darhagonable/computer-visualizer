<script lang="ts">
  /**
   * The device view — what makes this Task Manager different: the hardware itself, drawn, and a
   * door into its part views.
   *   Memory → the DIMM board with the real mock pages: a module is a door into its part view
   *   CPU    → the package and a table of its cores: a core or a chiplet is a door
   *   GPU / Storage → GpuDevice.svelte / StorageDevice.svelte
   *
   * What the colours mean is stated once, by the mode row above the page (the reading guide
   * with its truth label). Block values come from `cellValue` and ramp ranges from `rangeFor`
   * (through `norm`): the one model.
   */
  import { app, getMachine, hoverCard, hoverOut, setHighlight, stateName, useName } from '../../mock/store.svelte';
  import { CELLS_PER_CHIP, STATE_NAMES, USE_FAMILY_NAMES, type CoreLive, type Dimm } from '../../mock/model';
  import { MODE_META, TRUTH, TRUTH_LABEL, cellValue, type Overlay } from '../../mock/telemetry';
  import { norm, rampColor } from '../../scene/paint.svelte';
  import CpuDie from '../../scene/CpuDie.svelte';
  import PanZoom from '../../scene/PanZoom.svelte';
  import RamBoard from '../../scene/RamBoard.svelte';
  import TruthChip from '../../levels/TruthChip.svelte';
  import { CPU_DIE, RAM_BOARD } from '../../scene/geometry';
  import { patchHover, type Level } from '../../levels/nav';
  import { fmt, labelled } from '../../levels/live';
  import { describeKinds } from '../../levels/drives.live';
  import Glyph from './Glyph.svelte';
  import GpuDevice from './GpuDevice.svelte';
  import StorageDevice from './StorageDevice.svelte';
  import { RESOURCES, type ResId } from './resources';

  let { res, onnavigate, gpuTemp = [] }: { res: ResId; onnavigate: (l: Level) => void; gpuTemp?: number[] } = $props();

  const m = getMachine();
  const kinds = (app.tele?.storage ?? []).map((d) => d.kind);
  const TEXT: Record<ResId, { title: string; note: string; hint: string }> = {
    memory: {
      title: `DIMM board · ${m.dimms.length} modules · ${m.chips.length} DRAM dies`,
      note: 'placement: modelled',
      hint: 'Which chip a page lives in is modelled — the OS does not expose the memory controller’s interleave map',
    },
    cpu: {
      title: 'Processor package · 2 CCD + I/O die',
      note: 'layout: modelled',
      hint: 'A generic stand-in package: the real die layout arrives with the layout database',
    },
    disk: {
      title: kinds.length ? `${kinds.length} drives · ${describeKinds(kinds)}` : 'no drives',
      note: 'drawings are illustrations',
      hint: 'How many flash packages or platters a drawing shows is line art — the mock has no such data. Every reading is the drive’s own.',
    },
    gpu: {
      title: 'GPU 0 · graphics card, cooler lifted off',
      note: 'placement: modelled',
      hint: 'Which VRAM chip holds which process is modelled — no OS exposes VRAM placement. How load and heat spread across the die is modelled too.',
    },
  };
  const meta = $derived(RESOURCES.find((r) => r.id === res) ?? RESOURCES[0]);
  const text = $derived(TEXT[res] ?? TEXT.memory);
  const st = $derived(app.stats);
  const slotLabel = (dimm: number) => m.slots[m.dimms[dimm]?.slot ?? 0]?.label ?? `DIMM ${dimm}`;

  /** The overlay on show. "Pages" is memory-only: the CPU scene paints temperature then. */
  const pages = $derived(app.mode === 'pages');
  const ov = $derived<Overlay>(app.mode === 'pages' ? 'temperature' : app.mode);
  const unit = $derived(MODE_META[ov].unit);

  /** One line about whatever dims the board. */
  const hlText = $derived.by(() => {
    const h = app.highlight;
    if (!h) return '';
    if (h.kind === 'owner') return m.owners[h.id]?.name.split('\\').pop() ?? 'one owner';
    if (h.kind === 'family') return USE_FAMILY_NAMES[h.family];
    if (h.kind === 'state') return `${STATE_NAMES[h.state]} pages`;
    return useName(h.use);
  });

  // ---- Memory: what each module's bar shows -------------------------------------------
  /** Its share of live pages — or, in an overlay mode, the quantity the board is painted with,
   *  averaged over the module's blocks (`cellValue`: the one definition the grid paints by). */
  const mods = $derived.by(() => {
    void app.version; // the telemetry is mutated in place: this read is what keeps the figures live
    const t = app.tele;
    return m.dimms.map((d) => {
      const used = st?.dimmUsed[d.index] ?? 0;
      if (pages || !t) return { pct: used * 100, text: `${Math.round(used * 100)}%`, color: '', note: 'live blocks of this module' };
      let sum = 0;
      for (const ch of d.chips) for (let c = 0; c < CELLS_PER_CHIP; c++) sum += cellValue(ov, t, ch.index, c);
      const v = sum / (d.chips.length * CELLS_PER_CHIP);
      // `norm` reads the range the ramp spans right now (`rangeFor`) — memory temperature follows
      // the module sensors, so a fixed range here would disagree with the board
      const k = Math.max(0, Math.min(1, norm(ov, 'memory', v)));
      // watts sit near the bottom of a 0–6 W range: two decimals tell the modules apart
      const num = ov === 'power' ? v.toFixed(2) : v < 10 ? v.toFixed(1) : String(Math.round(v));
      return { pct: k * 100, text: `${num} ${unit}`, color: rampColor(ov, k), note: `${MODE_META[ov].label.toLowerCase()} per module` };
    });
  });

  /** Everything a module is, each reading under its truth word, and what a click does. */
  function moduleCard(d: Dimm) {
    const v = mods[d.index];
    const t = app.tele;
    return {
      title: `${slotLabel(d.index)} · ${d.capacityGiB} GB ${d.type}`,
      sub: `${d.manufacturer} ${d.partNumber}`,
      rows: [
        { k: 'in use', v: `${Math.round((st?.dimmUsed[d.index] ?? 0) * 100)} %`, mono: true },
        ...labelled('temperature', t ? `${fmt(t.dimmTemp[d.index], 1)} °C module sensor` : '—', 'measured'),
        ...(pages ? [] : labelled(MODE_META[ov].label.toLowerCase(), v.text, TRUTH[ov].memory)),
      ],
      hint: 'click to open this module',
    };
  }

  /** A click anywhere on a module — its body, a die or a single block — opens the module. */
  function openModule(dimm: number) {
    hoverOut();
    onnavigate({ kind: 'stick', dimm });
  }
  /**
   * Over a block the grid has already shown the block's own card, which promises an owner
   * highlight; here a click opens the module, so say so.
   */
  function onBoardMove(e: PointerEvent) {
    const t = e.target instanceof Element ? e.target : null;
    const stick = t?.closest<HTMLElement>('[data-stick]');
    if (!stick) return;
    const d = m.dimms[Number(stick.dataset.stick)];
    if (!d) return;
    if (t?.closest('[data-chip]')) return patchHover(`click to open ${slotLabel(d.index)} — its dies and blocks`);
    if (!app.hover) hoverCard(moduleCard(d), e);
  }

  // ---- CPU ------------------------------------------------------------------------------
  const cores = $derived(app.cpu?.cores ?? []);
  const ccd = (i: number) => cores.filter((c) => c.ccd === i);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const hot = $derived(cores.reduce<CoreLive | null>((a, c) => (!a || c.temp > a.temp ? c : a), null));
  const busiest = $derived(cores.reduce<CoreLive | null>((a, c) => (!a || c.load > a.load ? c : a), null));
  const power = $derived(app.cpu?.power ?? 0);
  /** What a core's colour encodes, for whoever reads the package instead of seeing it. */
  const dieAria = $derived.by(() => {
    const truth = TRUTH_LABEL[TRUTH[ov].cpu];
    return ov === 'activity'
      ? `Processor package. Each core is split into its two threads, coloured by load (${truth}). Click a core or a chiplet to open it`
      : `Processor package. Each core is coloured by ${ov === 'power' ? 'estimated watts' : 'temperature'} (${truth}); the bar under it is its load. Click a core or a chiplet to open it`;
  });
  /** Enter or Space on a focused core row opens it — and nothing else: Space is "pause" everywhere else in the app. */
  function coreKey(e: KeyboardEvent, c: number) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    onnavigate({ kind: 'core', core: c });
  }
</script>

<section class="dev" aria-label="Device view" style:--rc={meta.color}>
  <header class="bar">
    <span class="cap">Device view</span>
    <b>{text.title}</b>
    <span class="grow"></span>
    {#if hlText}
      <span class="hl">
        Highlighting <b>{hlText}</b>
        <button onclick={() => setHighlight(null)} title="Clear highlight (Esc at the Overview)" aria-label="Clear highlight"><Glyph name="x" size={11} /></button>
      </span>
    {/if}
    <span class="note" title={text.hint}>{text.note}</span>
  </header>

  {#if res === 'memory'}
    <!-- the real thing: every block is a mock page, every module a door -->
    <div class="body mem">
      <div class="board" onpointermove={onBoardMove}>
        <PanZoom width={RAM_BOARD.width} height={RAM_BOARD.height}>
          <RamBoard onstick={(d) => openModule(d.index)} onchip={(d) => openModule(d.index)} />
        </PanZoom>
      </div>
      <aside class="side">
        <div class="modbox">
          <h4>Modules <span class="hint">click to open</span></h4>
          {#if !pages}
            <!-- the bars are the overlay's ramp: their word, as the guide above states it -->
            <p class="modtruth"><TruthChip truth={TRUTH[ov].memory} name="{MODE_META[ov].label.toLowerCase()} per module" /></p>
          {/if}
          <ul class="mods">
            {#each m.dimms as d (d.index)}
              {@const v = mods[d.index]}
              <li>
                <button
                  class="mod"
                  onclick={() => openModule(d.index)}
                  onpointerenter={(e) => hoverCard(moduleCard(d), e)}
                  onpointermove={(e) => hoverCard(moduleCard(d), e)}
                  onpointerleave={hoverOut}
                  aria-label="Open {slotLabel(d.index)}, {d.capacityGiB} GB {d.type} · {v.note} {v.text}"
                >
                  <span>{slotLabel(d.index)}</span>
                  <span class="mbar"><i style="width: {v.pct}%" style:background={v.color || undefined}></i></span>
                  <b>{v.text}</b>
                </button>
              </li>
            {/each}
          </ul>
        </div>
      </aside>
    </div>
  {:else if res === 'cpu'}
    <div class="body cpu">
      <div class="die">
        <svg viewBox="0 0 {CPU_DIE.width} {CPU_DIE.height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label={dieAria}>
          <CpuDie onccd={(d) => onnavigate({ kind: 'ccd', ccd: d })} oncore={(c) => onnavigate({ kind: 'core', core: c })} />
        </svg>
      </div>
      <div class="cores">
        <div class="tables">
          {#each [0, 1] as i (i)}
            {@const cs = ccd(i)}
            <table>
              <caption>
                <button class="chiplet" onclick={() => onnavigate({ kind: 'ccd', ccd: i })} title="Open CCD {i}: its eight cores, in two CCX">
                  CCD{i}<span>8C / 16T</span><Glyph name="chevronRight" size={11} />
                </button>
              </caption>
              <thead>
                <tr><th>Core</th><th>Load</th><th>Temp</th><th>Clock</th></tr>
              </thead>
              <tbody>
                {#each cs as c (c.index)}
                  <!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_click_events_have_key_events a11y_no_noninteractive_tabindex -->
                  <tr
                    class:hot={c.index === hot?.index}
                    data-core={c.index}
                    tabindex="0"
                    aria-label="Core {c.index + 1} · click to open"
                    title="Core {c.index + 1} · click to open"
                    onclick={() => onnavigate({ kind: 'core', core: c.index })}
                    onkeydown={(e) => coreKey(e, c.index)}
                  >
                    <td>{String(c.index + 1).padStart(2, '0')}</td>
                    <td><span class="load"><span class="sbar"><i style="width: {c.load}%"></i></span><span>{Math.round(c.load)}%</span></span></td>
                    <td class="temp">{Math.round(c.temp)} °C</td>
                    <td>{c.freq.toFixed(2)}</td>
                  </tr>
                {/each}
                <tr class="sum">
                  <td>Avg</td>
                  <td>{Math.round(avg(cs.map((c) => c.load)))}%</td>
                  <td>{Math.round(Math.max(0, ...cs.map((c) => c.temp)))} °C</td>
                  <td>{avg(cs.map((c) => c.freq)).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          {/each}
        </div>
        <!-- the package at a glance -->
        <p class="cfoot">
          Package <b>{Math.round(power)} W</b>
          <span class="sep"></span>
          Hottest <b>Core {(hot?.index ?? 0) + 1}</b> at <b>{hot ? hot.temp.toFixed(1) : '–'} °C</b>
          <span class="sep"></span>
          Busiest <b>Core {(busiest?.index ?? 0) + 1}</b>
        </p>
      </div>
    </div>
  {:else if res === 'gpu'}
    <GpuDevice {onnavigate} tempSeries={gpuTemp} />
  {:else if res === 'disk'}
    <StorageDevice {onnavigate} />
  {/if}
</section>

<style>
  /* One inset card per resource; its contents lay themselves out from its own width and height. */
  .dev {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel2);
    container-type: size;
  }
  .bar {
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    height: 38px;
    padding: 0 12px 0 14px;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
    overflow: hidden;
  }
  .bar .cap {
    color: var(--ink3);
    font-size: 11px;
  }
  .bar b {
    font-size: 12.5px;
    font-weight: 600;
  }
  .grow {
    flex: 1;
  }
  .note {
    color: var(--ink3);
    font-size: 11.5px;
  }
  .hl {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    height: 24px;
    padding: 0 4px 0 9px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--accent) 13%, transparent);
    color: var(--accent);
    font-size: 11.5px;
  }
  .hl b {
    margin: 0 2px 0 3px;
    font-size: 11.5px;
  }
  .hl button {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: inherit;
  }
  .hl button:hover {
    background: color-mix(in srgb, var(--accent) 24%, transparent);
  }
  .body {
    flex: 1;
    min-height: 0;
  }
  h4 {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin: 0 0 4px;
    font-size: 11px;
    font-weight: 600;
    color: var(--ink3);
  }
  h4 .hint {
    font-weight: 400;
  }

  /* ---- Memory: the board, and the list of its modules ---- */
  .mem {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 184px;
  }
  .board {
    min-width: 0;
    min-height: 0;
    background: radial-gradient(circle, var(--line2) 1px, transparent 1.3px) 0 0 / 24px 24px;
  }
  .side {
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
    padding: 8px 12px 10px 10px;
    border-left: 1px solid var(--line);
  }
  .modbox {
    margin-top: 2px;
  }
  /* the word that belongs to the bars below it, as the guide states it for the board */
  .modtruth {
    margin: 2px 0 6px;
  }
  .mods {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 1px;
  }
  .mod {
    display: grid;
    grid-template-columns: 62px minmax(0, 1fr) 52px;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 26px;
    padding: 0 6px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--ink2);
    font-size: 11.5px;
    text-align: left;
    white-space: nowrap;
    transition: background 80ms ease, box-shadow 80ms ease;
  }
  .mod:hover {
    background: var(--panel);
    color: var(--ink);
    box-shadow: inset 0 0 0 1px var(--line2);
  }
  .mod:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .mod b {
    text-align: right;
    color: var(--ink);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .mbar {
    display: block;
    height: 5px;
    border-radius: 3px;
    overflow: hidden;
    background: var(--line);
  }
  .mbar i {
    display: block;
    height: 100%;
    background: var(--rc);
  }
  /* A card too short for the heading and its word keeps the modules; everything else gives way. */
  @container (max-height: 229px) {
    .side {
      padding-top: 5px;
    }
    h4 {
      margin-bottom: 2px;
    }
    .modtruth {
      display: none;
    }
    .mod {
      height: 21px;
    }
  }
  /* A narrow, tall card: the list drops under the board and flows sideways. */
  @container (max-width: 720px) and (min-height: 430px) {
    .mem {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(0, 1fr) auto;
    }
    .side {
      grid-row: 2;
      padding: 6px 12px 6px 10px;
      border-left: 0;
      border-top: 1px solid var(--line);
      overflow: visible;
    }
    .modbox {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      column-gap: 16px;
      align-items: center;
    }
    h4 {
      margin: 0;
    }
    .modtruth {
      display: none;
    }
    .mods {
      grid-column: 2;
      grid-template-columns: 1fr 1fr;
      column-gap: 10px;
    }
    .mod {
      height: 22px;
    }
  }
  @container (max-width: 720px) and (max-height: 429px) {
    .mem {
      grid-template-columns: minmax(0, 1fr) 168px;
    }
    .mod {
      grid-template-columns: 58px minmax(0, 1fr) 50px;
    }
  }

  /* ---- CPU: the package, and the per-core tables ---- */
  .cpu {
    display: grid;
    grid-template-columns: minmax(280px, 1fr) minmax(0, 1fr);
  }
  .die {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    padding: 10px 6px 10px 12px;
  }
  .die svg {
    flex: 1;
    min-height: 0;
    width: 100%;
  }
  .cores {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    padding: 10px 14px 10px 12px;
    border-left: 1px solid var(--line);
  }
  /* The tables get their own box, the footer sits outside it: the box scrolls if it must,
     instead of overprinting the last rows. */
  .tables {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px 18px;
    overflow-y: auto;
    scrollbar-width: thin;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    border-radius: 6px;
    font-size: 12px;
  }
  caption {
    padding: 2px 8px 8px;
    text-align: left;
    white-space: nowrap;
    transition: color 100ms ease;
  }
  /* the chiplet's name is a door into it, the same one the drawing's chiplet is */
  .chiplet {
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--ink);
    font-size: 12.5px;
    font-weight: 600;
    white-space: nowrap;
    transition: color 100ms ease;
  }
  .chiplet:hover {
    color: var(--accent);
  }
  .chiplet:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .chiplet span {
    color: var(--ink3);
    font-weight: 400;
    font-size: 11px;
  }
  .chiplet :global(svg) {
    align-self: center;
    color: var(--ink3);
  }
  th {
    padding: 4px 8px;
    border-bottom: 1px solid var(--line2);
    color: var(--ink3);
    font-size: 11px;
    font-weight: 500;
    text-align: right;
    white-space: nowrap;
  }
  td {
    height: 25px;
    padding: 0 8px;
    border-bottom: 1px solid var(--line);
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
  }
  th:first-child,
  td:first-child {
    padding-left: 6px;
    text-align: left;
  }
  td:first-child {
    color: var(--ink3);
    font-family: var(--font-mono);
    font-size: 10.5px;
  }
  .load {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .sbar {
    width: 40px;
    height: 5px;
    border-radius: 3px;
    overflow: hidden;
    background: var(--line);
  }
  .sbar i {
    display: block;
    height: 100%;
    background: var(--rc);
  }
  tbody tr {
    outline: none;
    cursor: pointer;
    transition: background 80ms ease;
  }
  tbody tr:hover td {
    background: color-mix(in srgb, var(--ink) 5%, transparent);
  }
  tbody tr:focus-visible td {
    background: color-mix(in srgb, var(--accent) 9%, transparent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  tr.hot td {
    background: color-mix(in srgb, var(--warn) 10%, transparent);
  }
  tr.hot .temp {
    color: var(--warn);
    font-weight: 600;
  }
  tr.sum td {
    border-bottom: 0;
    color: var(--ink2);
    font-weight: 600;
  }
  .cfoot {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    margin-top: 5px;
    align-items: center;
    gap: 2px 8px;
    min-width: 0;
    color: var(--ink3);
    font-size: 11.5px;
    white-space: nowrap;
  }
  .cfoot b {
    color: var(--ink2);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .sep {
    width: 1px;
    height: 12px;
    background: var(--line2);
  }
  /* Short card: every core still gets a row; the averages and the footer give way. */
  @container (max-height: 310px) {
    td {
      height: 21px;
    }
    th {
      padding-block: 2px;
    }
    .cores {
      padding-top: 4px;
      padding-bottom: 4px;
    }
    caption {
      padding-top: 0;
      padding-bottom: 5px;
    }
    .sum,
    .cfoot {
      display: none;
    }
    .die {
      padding-top: 6px;
      padding-bottom: 6px;
    }
  }
  /* Very short card (a 600 px-tall window): the header strip is slimmer — on every device page — and
     the rows pack, so the eighth row of each chiplet is still on screen without scrolling for it. */
  @container (max-height: 259px) {
    .bar {
      height: 30px;
    }
    td {
      height: 19px;
    }
    .cores {
      padding-top: 3px;
      padding-bottom: 3px;
    }
  }
  /* A card of medium height (a 720 px-tall window): rows of 22 px, so both tables fit their box whole —
     the averages row included — instead of scrolling for its last row. Above 358 px of card they fit at
     25 px; below 311 the short layout takes over. */
  @container (min-height: 311px) and (max-height: 357px) {
    td {
      height: 22px;
    }
  }
  /* A pane narrower than this cannot hold both tables side by side *with* the load bars — the
     Clock column of the second one ended up cut off at 1280 × 720. The percentages stay. */
  @container (max-width: 960px) {
    .sbar {
      display: none;
    }
    th,
    td {
      padding-left: 6px;
      padding-right: 6px;
    }
  }
  @container (max-width: 720px) {
    .cpu {
      grid-template-columns: minmax(200px, 0.7fr) minmax(0, 1.3fr);
      gap: 0;
    }
    .cores {
      padding-top: 8px;
      padding-bottom: 8px;
    }
  }
</style>
