<script lang="ts">
  /**
   * Memory chain · the entry the Memory section opens — the modules. Every populated module
   * large, in a 2 × 2, each the real scene primitive: its grids are live and coloured by the
   * mode, and a tile above it carries its readings — slot, capacity and type, how much of it
   * is in use, its own sensor, and under an overlay the overlay's value for the module with
   * the overlay's truth word. Each module is a door: click it, or its tile, to open it; the
   * wheel over a module zooms into that one. Empty slots are dashed ghosts, never silicon.
   * The reading guide under the mini-map says what the colours mean.
   *
   * A reading and the overlay built on it are not the same claim. A module's sensor says
   * "measured" next to its figure; the dies that are spread out from it say what telemetry.ts
   * says they are (TRUTH / TRUTH_LABEL — never written out here).
   *
   * `app.tele` keeps its identity from tick to tick, so everything that reads it states its
   * dependency on the tick and returns a fresh value.
   */
  import { app, getMachine, hoverCard, hoverOut, selectFile, selectProcess } from '../mock/store.svelte';
  import { CELLS_PER_CHIP, fmtMiB, type Dimm, type Slot } from '../mock/model';
  import { TRUTH, TRUTH_LABEL, type Overlay, type Truth } from '../mock/telemetry';
  import DimmStick from '../scene/DimmStick.svelte';
  import AreaGraph from '../scene/AreaGraph.svelte';
  import Icon from '../scene/Icon.svelte';
  import { STICK } from '../scene/geometry';
  import {
    BOARD_CELL_SIZE,
    HERO_COL,
    MEMORY_GAP,
    MINI,
    cellPos,
    diePos,
    heroCols,
    levelWheel,
    memoryLayout,
    patchHover,
    pulsesOf,
    stateSegments,
    type Level,
    type Target,
  } from './nav';
  import Guide from './Guide.svelte';
  import { allChips, chipsHeat, chipsOf, fmt, heatWatts, labelled, overlayOf, truthRow, warmestDimm } from './live';

  interface Props {
    w: number;
    h: number;
    go: (l: Level) => void;
    down: (target?: Target) => void;
  }
  let { w, h, go, down }: Props = $props();

  const m = getMachine();
  const EMPTY = m.slots.filter((s) => !s.dimm);
  const totalGiB = m.dimms.reduce((s, d) => s + d.capacityGiB, 0);
  const d0 = m.dimms[0];
  const kit = `${m.dimms.length} × ${d0.capacityGiB} GiB ${d0.type.split(' ')[0]}-${d0.speedMts}`;
  const slotLabel = (dimm: number) => m.slots[m.dimms[dimm]?.slot ?? 0]?.label ?? `DIMM ${dimm}`;

  // ---- what the grids are coloured by ----------------------------------------------------
  const mode = $derived(app.mode);
  /** The overlay on the modules' grids; null in "Pages", where they show page data. */
  const ov = $derived(overlayOf(mode, 'memory'));
  /** The overlay's truth word for memory — telemetry.ts's, never reworded. */
  const word = $derived(ov ? TRUTH_LABEL[TRUTH[ov].memory] : '');

  // ---- the modules and their readings ----------------------------------------------------
  interface Mod {
    d: Dimm;
    slot: Slot;
    /** Share of its blocks that are live (active + modified). */
    used: number;
    /** °C — the module's one sensor. Measured. */
    temp: number;
    /** 0–1 — mean modelled page heat of its blocks. */
    heat: number;
    /** Estimated watts per block, on average: the mean of the estimates its grids are coloured by. */
    watts: number;
    /** °C — the mean of its dies' estimates. */
    dies: number;
    dieCount: number;
  }
  const mods = $derived.by((): Mod[] => {
    void app.version; // the telemetry is mutated in place: this read is what keeps the figures live
    const s = app.stats;
    const t = app.tele;
    return m.dimms.map((d) => {
      const heat = t ? chipsHeat(t, chipsOf(m, d.index)).mean : 0;
      return {
        d,
        slot: m.slots[d.slot],
        used: s?.dimmUsed[d.index] ?? 0,
        temp: t?.dimmTemp[d.index] ?? 0,
        heat,
        watts: heatWatts(heat),
        dies: t ? d.chips.reduce((sum, c) => sum + t.dieTemp[c.index], 0) / d.chips.length : 0,
        dieCount: d.chips.length,
      };
    });
  });

  /** Why an overlay's value for a module is what it is — the tooltip's second row. */
  const WHY: Record<Overlay, (x: Mod) => string> = {
    temperature: (x) => `the mean of its ${x.dieCount} dies, spread out from the sensor`,
    activity: () => 'mean page heat of its blocks',
    power: () => 'DIMMs have no power sensor',
  };

  /** The overlay's own value for a module, or null in "Pages". */
  const modeValue = (x: Mod): number | null => {
    if (ov === 'temperature') return x.dies;
    if (ov === 'activity') return x.heat * 100;
    if (ov === 'power') return x.watts;
    return null;
  };
  /** The same value as the third figure of a module's tile: what it is, and the overlay's truth. */
  const modeStat = (x: Mod): { big: string; unit: string; what: string; truth: Truth } | null => {
    if (!ov) return null;
    const truth = TRUTH[ov].memory;
    if (ov === 'temperature') return { big: `≈ ${fmt(x.dies, 1)}`, unit: '°C', what: 'dies', truth };
    if (ov === 'activity') return { big: fmt(x.heat * 100), unit: '%', what: 'page heat', truth };
    return { big: `≈ ${fmt(x.watts, 2)}`, unit: 'W', what: 'per block', truth };
  };

  // ---- the whole memory ------------------------------------------------------------------
  const st = $derived(app.stats);
  const use = $derived(st ? (st.inUse / st.total) * 100 : 0);
  /** The module with the most of it in use. */
  const fullest = $derived(mods.length ? mods.reduce((a, x) => (x.used > a.used ? x : a)) : null);
  /** Active / Modified / Standby / Free — how every block is split (the bar shows it in "Pages"). */
  const segs = $derived(st ? stateSegments(st.byState) : []);

  /** Who holds the most memory: one process, one cached file. */
  const topProc = $derived.by(() => (st ? [...st.procs].sort((a, b) => b.blocks - a.blocks)[0] ?? null : null));
  const topFile = $derived.by(() => {
    if (!st) return null;
    return m.files.map((f) => ({ f, blocks: st.byOwner[String(f.id)]?.blocks ?? 0 })).sort((a, b) => b.blocks - a.blocks)[0] ?? null;
  });
  const lit = $derived(app.highlight?.kind === 'owner' ? app.highlight.id : null);
  const procName = (id: number) => m.processes.find((p) => p.id === id)?.name ?? '?';
  const base = (p: string) => p.split('\\').pop() ?? p;

  /** The reading guide's figure: the overlay's own value for the whole memory. */
  const guide = $derived.by(() => {
    void app.version; // reads the telemetry, which is mutated in place
    const t = app.tele;
    if (ov === 'temperature' && t && m.chips.length) {
      let hot = m.chips[0];
      for (const c of m.chips) if (t.dieTemp[c.index] > t.dieTemp[hot.index]) hot = c;
      const dm = m.dimms[hot.dimm];
      return {
        note: `hottest die · ${word}`,
        k: `≈ ${fmt(t.dieTemp[hot.index], 1)}`,
        u: '°C',
        sub: `on ${slotLabel(dm.index)} · its sensor reads ${fmt(t.dimmTemp[dm.index], 1)} °C, measured`,
      };
    }
    if ((ov === 'activity' || ov === 'power') && t) {
      const hs = chipsHeat(t, allChips(m));
      return ov === 'activity'
        ? { note: `per block · ${word}`, k: fmt(hs.mean * 100), u: '%', sub: `mean page heat of every block · most in ${slotLabel(m.chips[hs.atChip]?.dimm ?? 0)}` }
        : { note: `per block · ${word}`, k: `≈ ${fmt(heatWatts(hs.mean), 2)}`, u: 'W', sub: 'per 4 MiB block, on average · DIMMs have no power sensor' };
    }
    return { note: '', k: null, u: '', sub: 'hue: what a live page is for · brightness: its state' };
  });

  /** The module worth pointing at under the overlay — a door to it. */
  const pick = $derived.by(() => {
    const t = app.tele; // mutated in place; `mods` below has already put this on the tick
    if (!ov || !t || !mods.length) return null;
    if (ov === 'temperature') {
      const w = warmestDimm(t, m);
      return { dimm: w.dimm, em: 'Warmest module', big: fmt(w.temp, 1), u: '°C', sub: `${slotLabel(w.dimm)} · its sensor, measured · click to open` };
    }
    const top = mods.reduce((a, x) => (x.heat > a.heat ? x : a));
    return ov === 'activity'
      ? { dimm: top.d.index, em: 'Most active module', big: fmt(top.heat * 100), u: '%', sub: `${slotLabel(top.d.index)} · mean page heat, ${word} · click to open` }
      : { dimm: top.d.index, em: 'Most estimated power', big: `≈ ${fmt(top.watts, 2)}`, u: 'W', sub: `${slotLabel(top.d.index)} · per block, on average, ${word} · click to open` };
  });

  // ---- layout ----------------------------------------------------------------------------
  /** The modules' scale and columns are the layout's; the rows are centred by the stage (the tiles above them have a height of their own). */
  const lay = $derived(memoryLayout(w, h));
  /**
   * memoryLayout floors the modules' scale, and below about 1050 px of stage a centred hero is
   * then a few pixels too wide to clear the mini-map — which shares the hero's top band on
   * every stage under ~680 px. There the 2 × 2 steps left by exactly what would run under it.
   */
  const nudge = $derived.by(() => {
    const W = w || 1200;
    if (h >= 680) return 0;
    return Math.max(0, lay.x0 + lay.w - (W - 12 - MINI.w - 16));
  });
  /** The hero's left edge and width, as the right-hand column sees them. */
  const hero = $derived({ x: lay.x0 - nudge, w: lay.w });
  /** The right-hand column hugs the hero — or waits under the mini-map. */
  const right = $derived(heroCols(hero, w, h));
  /** The left-hand one takes what is left between the stage's margin and the hero. */
  const left = $derived.by(() => {
    const x = Math.max(24, Math.round(hero.x - 24 - HERO_COL));
    return { x, w: Math.max(172, Math.min(HERO_COL, hero.x - x - 16)) };
  });
  /** A module's tile is as wide as its module: how its readings are set out follows that. */
  const tier = $derived(lay.at(0).w < 220 ? 'narrow' : lay.at(0).w < 330 ? 'mid' : 'wide');
  /** The modules two to a row, as memoryLayout places them. */
  const rows = $derived.by(() => Array.from({ length: Math.ceil(mods.length / 2) }, (_, r) => mods.slice(2 * r, 2 * r + 2)));
  /** Under 620 px of stage. The right-hand column then keeps only the reading guide: with the page legend in it there is no room for more. */
  const short = $derived(h > 0 && h < 620);

  /** Board blocks that changed this tick, per module — the modules visibly breathe. */
  const pulses = $derived.by(() =>
    m.dimms.map((d) =>
      pulsesOf(
        app.version,
        (chip) => m.chips[chip].dimm === d.index,
        (chip, cell) => {
          const p = diePos(chip);
          const c = cellPos(cell);
          return { x: p.x + c.x, y: p.y + c.y };
        },
      ),
    ),
  );

  // ---- the modules are doors -------------------------------------------------------------
  const open = (dimm: number) => go({ kind: 'stick', dimm });

  /** Everything a module is, each reading with its truth word. */
  function moduleCard(x: Mod) {
    const v = modeValue(x);
    return {
      title: `${x.slot.label} · ${x.d.capacityGiB} GiB ${x.d.type}`,
      sub: `${x.d.manufacturer} ${x.d.partNumber}`,
      rows: [
        { k: 'in use', v: `${Math.round(x.used * 100)} %`, mono: true },
        ...labelled('temperature', `${fmt(x.temp, 1)} °C module sensor`, 'measured'),
        ...(ov && v !== null ? truthRow(ov, 'memory', v, WHY[ov](x)) : []),
        { k: 'holds', v: `${fmt(x.dieCount * CELLS_PER_CHIP)} blocks of 4 MiB`, mono: true },
      ],
      hint: 'click to open this module',
    };
  }

  /**
   * Over a module: its card. Over one of its blocks the grid has already shown the block's
   * own card, which promises an owner highlight — here a click opens the module, so say so.
   */
  function onMove(e: PointerEvent, x: Mod) {
    const t = e.target instanceof Element ? e.target : null;
    if (t?.closest('[data-chip]')) return patchHover(`click to open ${x.slot.label} — its dies and blocks`);
    hoverCard(moduleCard(x), e);
  }
  /**
   * Enter or Space on a focused module opens it — the tile is a button and the shared stick
   * is one too — and that is all the key does: Space is "pause" everywhere else in the app
   * and must not both open a level and stop the clock.
   */
  function swallow(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
  }

  let root: HTMLDivElement;
  $effect(() => {
    const onWheel = levelWheel((dir, e) => {
      if (dir < 0) return go({ kind: 'machine' }); // the board is the hub
      const mod = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-dimm]') : null;
      down({ dimm: mod?.dataset.dimm ? Number(mod.dataset.dimm) : undefined });
    });
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  });
</script>

<!--
  the doors that are not modules: under an overlay the module worth opening, in "Pages" the
  largest process and cached file (picking one lights its pages up on every module)
-->
{#snippet doors()}
  {#if pick}
    <button class="io-tile part door" onclick={() => open(pick.dimm)} title="Open {slotLabel(pick.dimm)}">
      <em>{pick.em}</em>
      <b>{pick.big}<i>{pick.u}</i></b>
      <span>{pick.sub}</span>
    </button>
  {:else if topProc}
    <button class="io-tile part door" class:on={lit === topProc.id} onclick={() => selectProcess(lit === topProc.id ? null : topProc.id)} title="Show this process's pages">
      <em>Largest process</em>
      <b class="io-name">{procName(topProc.id)}</b>
      <span>{fmtMiB(topProc.blocks)} · click to show its pages</span>
    </button>
    {#if topFile && topFile.blocks}
      <button class="io-tile part door file extra" class:on={lit === topFile.f.id} onclick={() => selectFile(lit === topFile.f.id ? null : topFile.f.id)} title={topFile.f.path}>
        <em>Largest cached file</em>
        <b class="io-name">{base(topFile.f.path)}</b>
        <span>{fmtMiB(topFile.blocks)} · click to show its pages</span>
      </button>
    {/if}
  {/if}
{/snippet}

<div class="lv lv-scope" bind:this={root} data-short={short ? '1' : '0'}>
  <!-- left: what is installed, and how it is used -->
  <div class="col l" style="left:{left.x}px; width:{left.w}px">
    <div class="stack">
      <button
        class="io-tile part summary"
        onclick={() => fullest && open(fullest.d.index)}
        disabled={!fullest}
        title={fullest ? `Open ${slotLabel(fullest.d.index)}, the fullest module` : ''}
      >
        <em><Icon name="memory" size={13} />Memory in use</em>
        <b>{Math.round(use)}<i>%</i></b>
        <span>{st ? `${fmtMiB(st.inUse)} of ${totalGiB} GiB in use · ${kit}` : 'waiting for the mock'}</span>
        <span class="slots" title="Populated slots carry a module; the empty ones are drawn empty">
          <span class="count">{m.dimms.length} of {m.slots.length} slots populated</span>
          {#each EMPTY as s (s.index)}<span class="ghost">{s.label} · empty</span>{/each}
        </span>
        <span>{EMPTY.length} empty, drawn empty · mock board</span>
      </button>

      {#if mode === 'pages'}
        <div class="io-tile extra">
          <em>Memory by state</em>
          <div class="io-bar">
            {#each segs as s (s.l)}<i style="flex-basis:{st ? (s.n / st.total) * 100 : 0}%; background: {s.c}"></i>{/each}
          </div>
          <div class="io-legend">
            {#each segs as s (s.l)}<span><i style="background: {s.c}"></i>{s.l}<b>{s.pct}%</b></span>{/each}
          </div>
        </div>
      {/if}

      <div class="io-tile extra">
        <em>Memory · last 2 minutes</em>
        <div class="graph"><AreaGraph values={app.hist.mem} max={100} color="var(--c-private)" unit="%" label="in use" /></div>
        <div class="graph"><AreaGraph values={app.hist.cached} max={100} color="var(--c-file)" unit="%" label="standby cache" /></div>
      </div>

      {#if short}
        {@render doors()}
      {/if}
    </div>
  </div>

  <!-- the hero: every module, two to a row -->
  <div class="hero" style="left:{hero.x}px; width:{hero.w}px; gap:{MEMORY_GAP}px">
    {#each rows as row (row[0].d.index)}
      <div class="mrow" style="gap:{MEMORY_GAP}px">
        {#each row as x (x.d.index)}
          {@const box = lay.at(x.d.index)}
          {@const ms = modeStat(x)}
          <!-- svelte-ignore a11y_no_static_element_interactions (the tile and the shared stick are the controls; these handlers only show hover cards) -->
          <div
            class="mod"
            data-dimm={x.d.index}
            style="width:{box.w}px"
            onpointermove={(e) => onMove(e, x)}
            onpointerleave={hoverOut}
            onkeydown={swallow}
          >
            <button
              class="io-tile part head"
              class:narrow={tier === 'narrow'}
              class:mid={tier === 'mid'}
              onclick={() => open(x.d.index)}
            >
              <em>
                <span class="slot">{x.slot.label}</span>
                <i class="kit">{x.d.capacityGiB} GiB<span class="type"> · {x.d.type}</span></i>
              </em>
              <span class="stats">
                <span class="st" class:on={ov === null} title="Active and modified blocks: what the system counts as in use">
                  <b>{Math.round(x.used * 100)}<i>%</i></b>
                  <small>in use</small>
                </span>
                <span class="st" title="One temperature sensor per DDR5 module — its reading is measured">
                  <b>{fmt(x.temp, 1)}<i>°C</i></b>
                  <small><span class="what">sensor</span><span class="truth" data-truth="measured">{TRUTH_LABEL.measured}</span></small>
                </span>
                {#if ms}
                  <span class="st on" title="{ms.what} · what this module's grids are coloured by">
                    <b>{ms.big}<i>{ms.unit}</i></b>
                    <small><span class="what">{ms.what}</span><span class="truth" data-truth={ms.truth}>{TRUTH_LABEL[ms.truth]}</span></small>
                  </span>
                {/if}
              </span>
              <!-- what the button does, for whoever does not see the hover card -->
              <span class="vh">— open this module</span>
            </button>
            <svg class="art" style="height:{box.h}px" viewBox="0 0 {STICK.width} {STICK.height}">
              <DimmStick dimm={x.d} onstick={(dm) => open(dm.index)} onchip={(dm) => open(dm.index)} />
              <g class="pulses">
                {#each pulses[x.d.index] ?? [] as p (p.key)}
                  <rect x={p.x - 0.5} y={p.y - 0.5} width={BOARD_CELL_SIZE + 1} height={BOARD_CELL_SIZE + 1} rx="0.7" class="pulse" />
                {/each}
              </g>
            </svg>
          </div>
        {/each}
      </div>
    {/each}
  </div>

  <!-- right: how to read the colours, and — where the column has room — the module worth opening -->
  <div class="col r" style="left:{right.rightX}px; top:{right.rightTop}px; width:{right.rightW}px">
    <Guide component="memory" note={guide.note} k={guide.k} u={guide.u} accent={guide.k !== null} sub={guide.sub} compact />
    {#if !short}
      {@render doors()}
    {/if}
  </div>
</div>

<style>
  .lv {
    position: absolute;
    inset: 0;
  }

  /* ---- the hero: four modules, two rows, centred on the stage ---- */
  .hero {
    position: absolute;
    top: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .mrow {
    display: flex;
  }
  .mod {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* ---- a module's tile: its identity on top, its readings in a row ---- */
  .head {
    width: 100%;
    min-width: 0;
  }
  .slot {
    flex: none;
  }
  .kit {
    flex: 1 1 auto;
    min-width: 0;
    padding-right: 14px; /* the door's dot sits in the corner */
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: right;
    text-transform: none;
    letter-spacing: 0;
    font: 400 10.5px var(--font-ui);
    color: var(--ink3);
  }
  .stats {
    display: flex;
    gap: 12px;
    margin-top: 6px;
    white-space: normal;
  }
  .st {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .st b {
    font: 300 24px/1.15 var(--font-ui);
    letter-spacing: -0.02em;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .st b i {
    font-style: normal;
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0;
    color: var(--ink3);
    margin-left: 3px;
  }
  /* what the figure is, then its truth word — two unbreakable halves, so a narrow cell breaks between them */
  .st small {
    display: block;
    font-size: 10px;
    line-height: 1.25;
    color: var(--ink3);
  }
  .st .what,
  .st .truth {
    display: inline-block;
    white-space: nowrap;
  }
  .st .what::after {
    content: ' ·';
  }
  /* the word wears its colour, as the guide's badge does */
  .st .truth[data-truth='measured'] {
    color: var(--good);
  }
  .st .truth[data-truth='estimated'] {
    color: var(--warn);
  }
  .st .truth[data-truth='modelled'] {
    color: var(--accent);
  }
  /* the figure the grids are coloured by right now */
  .st.on b {
    color: var(--accent);
    text-shadow: 0 0 18px var(--accent-glow);
  }
  .st.on b i {
    color: var(--accent);
    opacity: 0.7;
  }
  /* read out, never seen */
  .vh {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  /* a narrower module: smaller figures */
  .head.mid .st b {
    font-size: 19px;
  }
  .head.mid .st b i {
    font-size: 10px;
  }
  .head.mid .st small {
    font-size: 9.5px;
  }
  /* a narrow module keeps its capacity and drops the type (it is on the summary tile, and in the hover card) */
  .head.narrow {
    padding-right: 12px;
  }
  .head.narrow .kit {
    font-size: 10px;
  }
  .head.narrow .kit .type {
    display: none;
  }
  .head.narrow .stats {
    gap: 6px;
  }
  .head.narrow .st {
    gap: 0;
  }
  .head.narrow .st b {
    font-size: 15px;
    line-height: 1.25;
  }
  .head.narrow .st b i {
    font-size: 9px;
    margin-left: 2px;
  }
  .head.narrow .st small {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    font-size: 9px;
  }
  .head.narrow .st .what::after {
    content: none;
  }

  /* ---- the module itself ---- */
  .art {
    display: block;
    width: 100%;
    overflow: visible;
  }
  /* live pages bloom (the Ionic host defines the filter); the grids are a doorway */
  .art :global(g.chip-grid) {
    filter: url(#io-glow-xs);
    cursor: pointer;
  }
  /* the tile and the module are one door: hovering either lights the module */
  .mod:hover :global(.stick .s-pcb),
  .mod:focus-within :global(.stick .s-pcb) {
    stroke: var(--accent);
    filter: drop-shadow(0 0 6px var(--accent-glow));
  }

  .pulse {
    fill: none;
    stroke: var(--ink);
    stroke-width: 0.4;
    opacity: 0;
    transform-box: fill-box;
    transform-origin: center;
    animation: memory-pulse 560ms ease-out forwards;
    pointer-events: none;
  }
  @keyframes memory-pulse {
    0% {
      opacity: 0.85;
      transform: scale(1);
    }
    100% {
      opacity: 0;
      transform: scale(2.6);
    }
  }

  /* ---- the columns ---- */
  .col {
    position: absolute;
    display: flex;
    flex-direction: column;
    gap: 12px;
    /* a stage too short for a column scrolls it instead of losing its tail under the chrome */
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
  }
  .col.l {
    top: 16px;
    bottom: 16px;
  }
  /* a definite height, so that a stage too short for it makes it scroll rather than run off-stage */
  .col.r {
    bottom: 16px;
  }
  /* centred while it fits; from the top once it has to scroll */
  .stack {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-block: auto;
  }
  .col > :global(.guide) {
    padding: 0 2px;
  }
  /* a door's caption may wrap: on a short stage it stands in the narrower left-hand column */
  .door > span {
    white-space: normal;
  }

  /* ---- the summary tile: the empty slots as dashed ghosts ---- */
  /* its lines wrap when a narrow stage leaves the column little room */
  .summary > span {
    white-space: normal;
  }
  .slots {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
    margin-top: 8px;
  }
  .ghost {
    display: inline-flex;
    align-items: center;
    height: 24px;
    padding: 0 10px;
    border-radius: 7px;
    border: 1.5px dashed var(--line2);
    font: 500 10.5px var(--font-mono);
  }

  .graph {
    height: 58px;
    margin-top: 8px;
  }
</style>
