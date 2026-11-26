<script lang="ts">
  /**
   * GPU 0 — the mock graphics card with its cooler lifted off (scene/GpuCard.svelte): the die
   * with its 96 units, the 12 VRAM chips, the fans and the power input, all live. Click the die
   * or a chip to select it. The column beside the card is the reading guide (the shared
   * ScaleLegend) and the details of whatever is selected.
   *
   * What is modelled — and said to be, next to the numbers: how load and heat spread across the
   * die, and which VRAM chip holds which process. Temperatures, board power, clocks and the
   * per-engine loads are whole-device figures.
   */
  import { fmtInt } from '../../mock/model';
  import { app } from '../../mock/store.svelte';
  import {
    GPU_ENGINES,
    GPU_UNITS,
    GPU_UNITS_PER_ENGINE,
    TRUTH,
    TRUTH_LABEL,
    TRUTH_NOTE,
    VRAM_CHIP_MIB,
    type Overlay,
  } from '../../mock/telemetry';
  import { norm, rampColor } from '../../scene/paint.svelte';
  import GpuCard from '../../scene/GpuCard.svelte';
  import PanZoom from '../../scene/PanZoom.svelte';
  import ScaleLegend from '../../scene/ScaleLegend.svelte';
  import Sparkline from '../../scene/Sparkline.svelte';
  import { GPU_CARD } from '../../scene/geometry';
  import Glyph from './Glyph.svelte';
  import { chipParts, fmtBytes } from './resources';

  type Sel = { kind: 'card' } | { kind: 'die' } | { kind: 'vram'; i: number };
  interface Part {
    name: string;
    mib: number;
  }

  /** The GPU temperature ring (`app.hist.gpuTemp`), cut to the same window as the header graph. */
  let { tempSeries }: { tempSeries: number[] } = $props();

  let sel = $state<Sel>({ kind: 'card' });

  const g = $derived(app.tele?.gpu ?? null);
  /** "Pages" is memory-only: the card paints temperature while it is on. */
  const ov = $derived.by<Overlay>(() => (app.mode === 'pages' ? 'temperature' : app.mode));
  const truth = $derived(TRUTH[ov].gpu);

  // ---- what the colour means ----------------------------------------------------------
  /** A die unit or a VRAM chip is a small part of the board, so "power" needs its own range —
   *  the same two ranges GpuCard paints with (board watts would render every unit black). */
  const UNIT_POWER: [number, number] = [0, 6];
  const CHIP_POWER: [number, number] = [0, 5];
  const onChip = $derived(sel.kind === 'vram');
  const domain = $derived<[number, number] | undefined>(ov === 'power' ? (onChip ? CHIP_POWER : UNIT_POWER) : undefined);
  const note = $derived(ov === 'power' ? (onChip ? 'per chip' : 'per unit') : '');

  // ---- temperature: the second ring --------------------------------------------------
  const temp = $derived(g?.temp ?? 0);
  const tempColor = $derived(rampColor('temperature', norm('temperature', 'gpu', temp)));
  /** The trend line spans the window's own range — GPU temperature moves by a few degrees, so a
   *  fixed 0–100 scale would be a flat line. Never narrower than 10 °C, and the range is on the tooltip. */
  const tRange = $derived.by(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of tempSeries) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (!Number.isFinite(lo)) return { lo: 30, hi: 100 };
    const mid = (lo + hi) / 2;
    const half = Math.max(5, (hi - lo) / 2 + 1);
    return { lo: mid - half, hi: mid + half };
  });

  // ---- VRAM ---------------------------------------------------------------------------
  /** Every process on the GPU, largest allocation first. */
  const procs = $derived.by(() => (g?.procs ?? []).map((p) => ({ name: p.name, mib: p.mib })).sort((a, b) => b.mib - a.mib));
  /** VRAM that belongs to no process: driver and desktop composition. */
  const overhead = $derived((g?.vramUsedMiB ?? 0) - procs.reduce((s, p) => s + p.mib, 0));
  const largest = $derived(procs[0]?.mib ?? 1);
  const bar = (mib: number) => Math.max(1.5, Math.min(100, (mib / largest) * 100));
  /** Inside one chip the meaningful scale is the chip itself. */
  const chipBar = (mib: number) => Math.max(1.5, Math.min(100, (mib / VRAM_CHIP_MIB) * 100));

  /** The selected VRAM chip: how full it is and which processes the mock has placed on it. */
  const chip = $derived.by(() => {
    if (sel.kind !== 'vram' || !g) return null;
    const i = sel.i;
    const used = (g.chipUsage[i] ?? 0) * VRAM_CHIP_MIB;
    const parts = g.procs
      .map((p, pi): Part | null => {
        const mib = chipParts(pi)[i];
        return mib > 0.5 ? { name: p.name, mib } : null;
      })
      .filter((p): p is Part => p !== null)
      .sort((a, b) => b.mib - a.mib);
    return { i, used, parts, rest: used - parts.reduce((s, p) => s + p.mib, 0) };
  });

  // ---- the die ------------------------------------------------------------------------
  /** Mean load of each shader engine's units, in %. */
  const engineLoad = $derived.by(() =>
    Array.from({ length: GPU_ENGINES }, (_, e) => {
      let s = 0;
      for (let k = 0; k < GPU_UNITS_PER_ENGINE; k++) s += g?.unitLoad[e * GPU_UNITS_PER_ENGINE + k] ?? 0;
      return (s / GPU_UNITS_PER_ENGINE) * 100;
    }),
  );
  /** In Activity mode the die's units are painted by load — the engine bars use the same ramp. */
  const engineColor = (v: number) => (ov === 'activity' ? rampColor('activity', v / 100) : 'var(--rc)');

  function pick(next: Sel) {
    const same = sel.kind === next.kind && (next.kind !== 'vram' || (sel.kind === 'vram' && sel.i === next.i));
    sel = same ? { kind: 'card' } : next;
  }

</script>

<div class="gpu">
  <div class="stage">
    <!-- the primitive's own `selected` ring; the whole card is not "selected" by default -->
    <PanZoom width={GPU_CARD.width} height={GPU_CARD.height}>
      <GpuCard
        selected={sel.kind === 'die' ? 'die' : sel.kind === 'vram' ? sel.i : null}
        ondie={() => pick({ kind: 'die' })}
        onvram={(c) => pick({ kind: 'vram', i: c })}
        oncard={() => (sel = { kind: 'card' })}
      />
    </PanZoom>
  </div>

  <aside class="side">
    <!-- the second ring: temperature, for the same window as the utilisation graph in the header -->
    <div
      class="tile"
      title="Sensor readings: GPU, hotspot and VRAM temperature. How the heat spreads across the die is modelled — that is what the scale below is about."
    >
      <div class="t-h">
        <b>GPU temperature</b>
        <span class="truth" data-truth="measured">{TRUTH_LABEL.measured}</span>
      </div>
      <div class="t-body">
        <span class="t-val">{temp.toFixed(1)}<i>°C</i></span>
        <span class="t-spark" title="GPU temperature over the same window as the graph above · {tRange.lo.toFixed(0)}–{tRange.hi.toFixed(0)} °C">
          <Sparkline values={tempSeries} min={tRange.lo} max={tRange.hi} color={tempColor} width={104} height={28} />
        </span>
      </div>
      <p class="t-sub">hotspot {Math.round(g?.hotspot ?? 0)} °C · VRAM {Math.round(g?.vramTemp ?? 0)} °C</p>
    </div>

    <!-- the reading guide for the card's colours, with its truth label (hover: why it is what it is);
         on a GPU the shared legend shows the temperature scale in Pages mode too -->
    <div class="sc" title={TRUTH_NOTE[ov].gpu}>
      <ScaleLegend component="gpu" {domain} {note} />
    </div>

    <!-- details: the whole card's memory, or what is selected on it -->
    <div class="slot">
      {#if chip}
        {@const usedPct = Math.min(100, (chip.used / VRAM_CHIP_MIB) * 100)}
        <div class="s-h">
          <h4>VRAM chip {chip.i + 1}<span class="hint">{VRAM_CHIP_MIB / 1024} GB GDDR6X</span></h4>
          <button class="back" onclick={() => (sel = { kind: 'card' })} title="Back to the whole card" aria-label="Back to the whole card">
            <Glyph name="x" size={11} />
          </button>
        </div>
        <p class="facts">{usedPct.toFixed(0)} % in use · {fmtInt(Math.round(chip.used))} of {fmtInt(VRAM_CHIP_MIB)} MiB</p>
        <p class="facts dim">VRAM temperature {Math.round(g?.vramTemp ?? 0)} °C</p>
        <h5>Processes on this chip <span class="hint">bars: share of the chip</span></h5>
        <ul class="parts">
          {#each chip.parts as p (p.name)}
            <li title="{p.name} — {fmtBytes(p.mib)} modelled on this chip, {chipBar(p.mib).toFixed(0)} % of it">
              <span class="pname">{p.name}</span>
              <span class="pbar"><i style="width: {chipBar(p.mib)}%"></i></span>
              <b>{fmtBytes(p.mib)}</b>
            </li>
          {:else}
            <li class="empty">No process is modelled on this chip</li>
          {/each}
          <li class="dim" title="Driver and desktop composition overhead — it belongs to no process">
            <span class="pname">driver &amp; desktop</span>
            <span class="pbar"><i style="width: {chipBar(chip.rest)}%"></i></span>
            <b>{fmtBytes(chip.rest)}</b>
          </li>
        </ul>
        <p class="sub">Which chip holds which process is <b>modelled</b><span class="why"> — no OS exposes VRAM placement</span>.</p>
      {:else if sel.kind === 'die'}
        <div class="s-h">
          <h4>GPU die<span class="hint">{GPU_UNITS} units · {GPU_ENGINES} shader engines</span></h4>
          <button class="back" onclick={() => (sel = { kind: 'card' })} title="Back to the whole card" aria-label="Back to the whole card">
            <Glyph name="x" size={11} />
          </button>
        </div>
        <p class="facts">{temp.toFixed(1)} °C · hotspot {Math.round(g?.hotspot ?? 0)} °C</p>
        <p class="facts dim">{Math.round(g?.power ?? 0)} W of {g?.powerLimit ?? 0} W · 3D {Math.round(g?.engines['3d'] ?? 0)} %</p>
        <h5>Shader engines · load</h5>
        <ul class="parts">
          {#each engineLoad as v, e (e)}
            <li title="Shader engine {e + 1}: its {GPU_UNITS_PER_ENGINE} units average {v.toFixed(0)} % load">
              <span class="pname">Engine {e + 1}</span>
              <span class="pbar"><i style="width: {Math.max(1.5, v)}%; background: {engineColor(v)}"></i></span>
              <b>{Math.round(v)} %</b>
            </li>
          {/each}
        </ul>
        <p class="sub">What the colour shows: <b>{ov}</b> · <b>{TRUTH_LABEL[truth]}</b>. How load and heat spread across the units is <b>modelled</b>.</p>
      {:else}
        <h4>GPU memory<span class="hint">by process</span></h4>
        <p class="sub">Which chip holds which process is <b>modelled</b><span class="why"> — no OS exposes VRAM placement</span>.</p>
        <ul class="parts">
          {#each procs as p (p.name)}
            <li title="{p.name} — {fmtBytes(p.mib)} of {fmtBytes(g?.vramTotalMiB ?? 0)} dedicated GPU memory">
              <span class="pname">{p.name}</span>
              <span class="pbar"><i style="width: {bar(p.mib)}%"></i></span>
              <b>{fmtBytes(p.mib)}</b>
            </li>
          {/each}
          <li class="dim" title="Driver and desktop composition overhead — it belongs to no process">
            <span class="pname">driver &amp; desktop</span>
            <span class="pbar"><i style="width: {bar(overhead)}%"></i></span>
            <b>{fmtBytes(overhead)}</b>
          </li>
        </ul>
      {/if}
    </div>
  </aside>
</div>

<style>
  /* Fills the device card's body, like the `.body` of every other resource: the stage and the
     details column take their height from it (a content-sized root would let the card overflow). */
  .gpu {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 244px;
    grid-template-rows: minmax(0, 1fr);
  }
  .stage {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: radial-gradient(circle, var(--line2) 1px, transparent 1.3px) 0 0 / 24px 24px;
  }
  /* The zoom controls go to the stage's bottom-right: at every size that corner of the card is
     blank board (the edge connector is on the left). The hint lives in the status bar. */
  .stage :global(.pz-ctl) {
    left: auto;
    right: 10px;
  }
  .stage :global(.pz-hint) {
    display: none;
  }
  /* ---- the column beside the card ---- */
  .side {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    padding: 10px 12px;
    border-left: 1px solid var(--line);
  }
  h4 {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
    margin: 0;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--ink);
    white-space: nowrap;
  }
  h4 .hint {
    font-weight: 400;
    color: var(--ink3);
  }
  h5 {
    margin: 8px 0 3px;
    font-size: 10.5px;
    font-weight: 600;
    color: var(--ink3);
    white-space: nowrap;
  }
  h5 .hint {
    font-weight: 400;
  }

  /* temperature tile — the same truth badge the ScaleLegend uses */
  .tile {
    flex: none;
  }
  .t-h {
    display: flex;
    align-items: center;
    gap: 7px;
    font: 500 11px var(--font-ui);
    color: var(--ink2);
  }
  .t-h b {
    font-weight: 650;
    color: var(--ink);
    white-space: nowrap;
  }
  .truth {
    flex: none;
    padding: 0 6px;
    border-radius: 7px;
    border: 1px solid currentColor;
    color: var(--good);
    font: 600 9px var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    line-height: 15px;
  }
  .t-body {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 8px;
    margin-top: 3px;
  }
  .t-val {
    font-size: 21px;
    font-weight: 600;
    line-height: 1.15;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .t-val i {
    margin-left: 3px;
    font-style: normal;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--ink2);
  }
  .t-spark {
    display: block;
    flex: none;
  }
  .t-sub {
    margin-top: 2px;
    font-size: 11px;
    color: var(--ink3);
    white-space: nowrap;
  }

  /* the reading guide, as a column */
  .sc {
    flex: none;
  }
  .sc :global(.scale) {
    min-width: 0;
    max-width: none;
  }
  .sc :global(.scale .meta) {
    flex-wrap: nowrap;
  }

  /* details */
  .slot {
    flex: 1;
    min-height: 0;
    padding-top: 9px;
    overflow-y: auto;
    scrollbar-width: thin;
    border-top: 1px solid var(--line);
  }
  .s-h {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .s-h h4 {
    overflow: hidden;
  }
  .back {
    display: grid;
    place-items: center;
    flex: none;
    width: 20px;
    height: 20px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--ink3);
  }
  .back:hover {
    background: color-mix(in srgb, var(--ink) 8%, transparent);
    color: var(--ink);
  }
  .facts {
    margin-top: 3px;
    font-size: 12px;
    font-weight: 600;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .facts.dim {
    font-weight: 400;
    color: var(--ink2);
  }
  .sub {
    margin: 3px 0 5px;
    font-size: 11px;
    line-height: 1.4;
    color: var(--ink3);
  }
  .sub b {
    color: var(--ink2);
  }
  .parts {
    list-style: none;
    margin: 4px 0 0;
    padding: 0;
    display: grid;
    gap: 1px;
  }
  .parts li {
    display: grid;
    grid-template-columns: 96px minmax(0, 1fr) 56px;
    align-items: center;
    gap: 8px;
    height: 21px;
    font-size: 11.5px;
    color: var(--ink2);
    white-space: nowrap;
  }
  .pname {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pbar {
    display: block;
    height: 6px;
    border-radius: 3px;
    overflow: hidden;
    background: var(--line);
  }
  .pbar i {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: var(--rc);
    transition: width 300ms ease;
  }
  .parts b {
    text-align: right;
    font-weight: 600;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .parts li.dim {
    color: var(--ink3);
  }
  .parts li.dim b {
    color: var(--ink3);
  }
  .parts li.empty {
    display: block;
    height: auto;
    padding: 3px 0;
    font-size: 11px;
    line-height: 1.4;
    color: var(--ink3);
  }

  /* Short card (720p class): the tile drops its second line and the rows pack tighter. */
  @container (max-height: 429px) {
    .side {
      gap: 8px;
      padding-top: 8px;
      padding-bottom: 6px;
    }
    .t-sub,
    .why {
      display: none;
    }
    .slot {
      padding-top: 6px;
    }
    .sub {
      margin: 0 0 3px;
      line-height: 1.35;
    }
    .parts li {
      height: 18px;
    }
    h5 {
      margin-top: 6px;
    }
  }
  /* Tiny card (600 px-tall window): the same column, packed — the list scrolls under its first rows. */
  @container (max-height: 299px) {
    .side {
      gap: 7px;
      padding: 7px 10px 6px;
    }
    .t-body {
      margin-top: 1px;
    }
    .t-h,
    .sc :global(.scale .meta) {
      line-height: 1.3;
    }
    .t-val {
      font-size: 19px;
    }
    .t-spark :global(svg) {
      height: 22px;
    }
    .slot {
      padding-top: 6px;
    }
    .sub {
      margin: 2px 0 3px;
    }
    .parts li {
      height: 17px;
    }
  }
</style>
