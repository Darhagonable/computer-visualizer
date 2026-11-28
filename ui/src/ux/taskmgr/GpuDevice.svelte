<script lang="ts">
  /**
   * GPU 0 — the mock graphics card with its cooler lifted off (scene/GpuCard.svelte): the die
   * with its 96 units, the 12 VRAM chips, the fans and the power input, all live. The die and
   * every chip are doors: click one and its part view opens. The column beside the card carries
   * the second ring — temperature — the two doors, and the card's memory by process.
   *
   * What is modelled — and said to be, next to the numbers: how load and heat spread across the
   * die, and which VRAM chip holds which process. Temperatures, board power, clocks and the
   * per-engine loads are whole-device figures. What the colours of the card mean is the mode row
   * above the page.
   */
  import { fmtInt } from '../../mock/model';
  import { app } from '../../mock/store.svelte';
  import { TRUTH_LABEL, VRAM_CHIP_MIB } from '../../mock/telemetry';
  import { norm, rampColor } from '../../scene/paint.svelte';
  import GpuCard from '../../scene/GpuCard.svelte';
  import Sparkline from '../../scene/Sparkline.svelte';
  import { GPU_CARD } from '../../scene/geometry';
  import TruthChip from '../../levels/TruthChip.svelte';
  import type { Level } from '../../levels/nav';
  import Glyph from './Glyph.svelte';
  import { fmtBytes } from './resources';

  /** The GPU temperature ring (`app.hist.gpuTemp`), cut to the same window as the header graph. */
  let { tempSeries, onnavigate }: { tempSeries: number[]; onnavigate: (l: Level) => void } = $props();

  /**
   * What the card shows, read fresh every tick: the mock mutates the GPU's readings in place and
   * `app.tele` keeps its identity, so the tick is read here.
   */
  const view = $derived.by(() => {
    void app.version;
    const g = app.tele?.gpu ?? null;
    if (!g) return null;
    return { temp: g.temp, hotspot: g.hotspot, vramTemp: g.vramTemp, vramTotalMiB: g.vramTotalMiB, vramUsedMiB: g.vramUsedMiB, procs: g.procs.map((p) => ({ name: p.name, mib: p.mib })) };
  });
  const temp = $derived(view?.temp ?? 0);
  const tempColor = $derived(rampColor('temperature', norm('temperature', 'gpu', temp)));

  // ---- temperature: the second ring --------------------------------------------------
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
  const procs = $derived.by(() => (view?.procs ?? []).slice().sort((a, b) => b.mib - a.mib));
  /** VRAM that belongs to no process: driver and desktop composition. */
  const overhead = $derived((view?.vramUsedMiB ?? 0) - procs.reduce((s, p) => s + p.mib, 0));
  const largest = $derived(procs[0]?.mib ?? 1);
  const bar = (mib: number) => Math.max(1.5, Math.min(100, (mib / largest) * 100));

  const open = (l: Level) => onnavigate(l);
</script>

<div class="gpu">
  <div class="stage">
    <!-- a fixed drawing, fitted into the box and centred: no panning, no zoom.
         The die and every VRAM chip are doors; a click elsewhere on the card does nothing -->
    <svg viewBox="0 0 {GPU_CARD.width} {GPU_CARD.height}" preserveAspectRatio="xMidYMid meet">
      <GpuCard ondie={() => open({ kind: 'gdie' })} onvram={() => open({ kind: 'vram' })} selected={null} />
    </svg>
  </div>

  <aside class="side">
    <!-- the second ring: temperature, for the same window as the utilisation graph in the header -->
    <div
      class="tile"
      title="Sensor readings: GPU, hotspot and VRAM temperature. How the heat spreads across the die is modelled — that is what the guide above the page is about."
    >
      <div class="t-h">
        <b>GPU temperature</b>
        <TruthChip truth="measured" />
      </div>
      <div class="t-body">
        <span class="t-val">{temp.toFixed(1)}<i>°C</i></span>
        <span class="t-spark" title="GPU temperature over the same window as the graph above · {tRange.lo.toFixed(0)}–{tRange.hi.toFixed(0)} °C">
          <Sparkline values={tempSeries} min={tRange.lo} max={tRange.hi} color={tempColor} width={104} height={28} />
        </span>
      </div>
      <p class="t-sub">hotspot {Math.round(view?.hotspot ?? 0)} °C · VRAM {Math.round(view?.vramTemp ?? 0)} °C</p>
    </div>

    <!-- the doors: the same two the drawing has, where a keyboard can reach them too -->
    <div class="doors">
      <button class="door" onclick={() => open({ kind: 'gdie' })} title="Open the GPU die: its 96 units in 6 shader engines">
        <b>GPU die</b><span>96 units · 6 engines</span><Glyph name="chevronRight" size={12} />
      </button>
      <button class="door" onclick={() => open({ kind: 'vram' })} title="Open VRAM: the 12 chips of 2 GB, and what is modelled to sit on each">
        <b>VRAM</b><span>12 × 2 GB</span><Glyph name="chevronRight" size={12} />
      </button>
    </div>

    <!-- the card's memory, by process -->
    <div class="slot">
      <h4>GPU memory <span class="hint">by process</span></h4>
      <p class="t-sub tot">{fmtBytes(view?.vramUsedMiB ?? 0)} of {fmtBytes(view?.vramTotalMiB ?? 0)} dedicated</p>
      <!-- the same claim in two lengths: the whole sentence, and the one a short card has room for -->
      <p class="sub full">How much each process has is a reading; which chip holds it is <TruthChip truth="modelled" /> — no OS exposes VRAM placement.</p>
      <p class="sub brief">Which chip holds it is <TruthChip truth="modelled" />.</p>
      <ul class="parts">
        {#each procs as p (p.name)}
          <li title="{p.name} — {fmtBytes(p.mib)} of {fmtBytes(view?.vramTotalMiB ?? 0)} dedicated GPU memory">
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
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  .stage > svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
  }
  /* ---- the column beside the card ---- */
  .side {
    display: flex;
    flex-direction: column;
    gap: 10px;
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

  /* temperature tile — the same truth badge the reading guides use */
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

  /* the two doors */
  .doors {
    flex: none;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .door {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0 6px;
    padding: 6px 8px 5px;
    border: 1px solid var(--line2);
    border-radius: 6px;
    background: var(--panel);
    color: var(--ink);
    text-align: left;
    white-space: nowrap;
    transition: border-color 100ms ease;
  }
  .door:hover {
    border-color: var(--accent);
  }
  .door:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .door b {
    font-size: 12px;
    font-weight: 600;
  }
  .door span {
    grid-column: 1;
    font-size: 11px;
    color: var(--ink3);
  }
  .door :global(svg) {
    grid-column: 2;
    grid-row: 1 / 3;
    color: var(--ink3);
  }
  .door:hover :global(svg) {
    color: var(--accent);
  }

  /* details */
  .slot {
    flex: 1;
    min-height: 0;
    padding-top: 8px;
    overflow-y: auto;
    scrollbar-width: thin;
    border-top: 1px solid var(--line);
  }
  .tot {
    margin-top: 1px;
  }
  .brief {
    display: none;
  }
  /* a sentence with the badge in the flow of the text */
  .sub {
    margin: 3px 0 5px;
    font-size: 11px;
    line-height: 1.4;
    color: var(--ink3);
  }
  .sub :global(.tc) {
    vertical-align: -3px;
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
    /* 20 px: nine rows then fit the column beside the card on a 900-px-tall window without a scroll bar */
    height: 20px;
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

  /* Short card (720p class): the tile drops its second line and the rows pack tighter. */
  @container (max-height: 429px) {
    .side {
      gap: 8px;
      padding-top: 8px;
      padding-bottom: 6px;
    }
    .t-sub {
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
  }
  /* Tiny card (600 px-tall window): the same column, packed — the tile keeps its figure but
     not its trend line, the note its one sentence, and the list scrolls under its first rows. */
  @container (max-height: 299px) {
    .side {
      gap: 7px;
      padding: 7px 10px 6px;
    }
    .t-body {
      margin-top: 1px;
    }
    .t-h {
      line-height: 1.3;
    }
    .t-val {
      font-size: 19px;
    }
    .t-spark,
    .tot {
      display: none;
    }
    .slot {
      padding-top: 6px;
    }
    .sub {
      margin: 2px 0 3px;
    }
    .sub.full {
      display: none;
    }
    .sub.brief {
      display: block;
    }
    .parts li {
      height: 17px;
    }
  }
</style>
