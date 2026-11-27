<script lang="ts">
  /**
   * "You are here" — the same motherboard as the machine level, small and passive, veiled
   * except for the part the level is in: the modules (the modules view outlines every one of
   * them), a module with the die and the block inside it, the socket with its chiplet and core,
   * the graphics card with its die or its VRAM, the drive bays with one drive. The trail beside
   * it repeats the breadcrumb.
   *
   * The board also shows the components the level is NOT about — the processor's cores, the
   * GPU's units and VRAM, the drives — each coloured by its own overlay with its own truth.
   * The level's own guides cover only the level's own component, so each of the others gets its
   * truth chip here, on every stage height: a coloured reading is never shown without its word.
   * The words are TRUTH's (mock/telemetry.ts), as every guide's are.
   *
   * In "Pages" the processor, the GPU and the drives are on their temperature colours — a mode
   * the switch does not show — so there the chips are introduced by one line that says so.
   *
   * Size. The part views leave a mini-map the place nav.MINI describes (316 × 158, 12 px from
   * the stage's top-right corner) and lay their columns out below it. This one is narrower —
   * 280 px — because the views also put things beside that place whose arithmetic does not
   * know it: the die's and the block's package comes to within 300 px of the stage's right
   * edge (nav.boxLayout) and the card's KPI band to within 340, so a 316-px map sits 28 px on
   * top of the package's corner. At 280 it clears both, and it never grows taller than the
   * place the views leave: 8 px of padding and a board of 114 px (96 on a short stage) make
   * 133–151 px, against 158.
   */
  import { fade } from 'svelte/transition';
  import { app, getMachine } from '../../mock/store.svelte';
  import { MOTHERBOARD } from '../../scene/geometry';
  import type { Component } from '../../mock/telemetry';
  import Motherboard from '../../scene/Motherboard.svelte';
  import { MOBO, PART, crumbsOf, hereOf, seatGpuCard, type Box, type Level } from '../../levels/nav';
  import { overlayOf } from '../../levels/live';
  import TruthChip from '../../levels/TruthChip.svelte';

  let { level, h }: { level: Level; h: number } = $props();

  const m = getMachine();
  const W = MOTHERBOARD.width;
  const H = MOTHERBOARD.height;

  let el = $state<SVGSVGElement>();
  // the card sits in its PCIe slot here too (see nav.seatGpuCard)
  $effect(() => seatGpuCard(el));

  interface Spot {
    part: Box;
    inner: Box | null;
    dot: { x: number; y: number } | null;
  }

  /** What the map outlines: the level's place (`hereOf`); the modules view is in every module at once. */
  const spots = $derived.by((): Spot[] => {
    if (level.kind === 'memory') return m.dimms.map((d) => ({ part: MOBO.slot(d.slot), inner: null, dot: null }));
    const here = hereOf(level, m);
    return here ? [here] : [];
  });
  /** The modules sit 7 board units apart: the veil may not bridge the gap between two of them. */
  const pad = $derived(level.kind === 'memory' ? 2 : 12);
  /** Dims everything but the part(s), so the outline is the one bright thing on the map. */
  const veil = $derived.by(() => {
    let d = `M0 0H${W}V${H}H0Z`;
    for (const s of spots) {
      const p = s.part;
      const x = p.x - pad;
      const y = p.y - pad;
      const w = p.w + 2 * pad;
      const hh = p.h + 2 * pad;
      d += ` M${x} ${y}h${w}v${hh}h-${w}Z`;
    }
    return d;
  });

  const trail = $derived(crumbsOf(level, m));
  /** A short stage (under 620 px, as the part views see it): the views compact their tiles there. */
  const short = $derived(h > 0 && h < 620);
  /** The board's width in px; its height follows the board's own shape. */
  const board = $derived(short ? 96 : 114);
  /** Short stages: the board, its name and the words — the trail is in the top bar anyway. */
  const brief = $derived(short);
  const pages = $derived(app.mode === 'pages');
  /** The components that are coloured on this map but are not what the level is about. */
  const others = $derived.by(() => {
    const own = PART[level.kind];
    const out: { c: Component; ov: NonNullable<ReturnType<typeof overlayOf>> }[] = [];
    // the drives are drawn here too, coloured by the storage overlay: they get their word as the rest do
    for (const c of ['memory', 'cpu', 'gpu', 'storage'] as Component[]) {
      const ov = overlayOf(app.mode, c);
      if (c !== own && ov) out.push({ c, ov });
    }
    return out;
  });
</script>

<aside class="mini" aria-label="You are here" transition:fade={{ duration: 220 }}>
  <svg bind:this={el} viewBox="0 0 {W} {H}" width={board} height={Math.round((board * H) / W)} class:many={spots.length > 1}>
    <Motherboard interactive={false} labels={false} />
    {#if spots.length}
      <path class="veil" fill-rule="evenodd" d={veil} />
      {#each spots as s (s.part.x + ':' + s.part.y)}
        <rect class="here" x={s.part.x} y={s.part.y} width={s.part.w} height={s.part.h} rx="6" />
        {#if s.inner}
          <rect class="here inner" x={s.inner.x} y={s.inner.y} width={s.inner.w} height={s.inner.h} rx="4" />
        {/if}
        {#if s.dot}
          <circle class="dot" cx={s.dot.x} cy={s.dot.y} r="11" />
        {/if}
      {/each}
    {/if}
  </svg>
  <div class="txt">
    <em>You are here</em>
    <b>{trail.at(-1)?.label}</b>
    {#if !brief && trail.length > 2}
      <span class="trail" title={trail.slice(1, -1).map((c) => c.label).join(' › ')}>{trail.slice(1, -1).map((c) => c.label).join(' › ')}</span>
    {/if}
    {#if others.length}
      <div class="chips">
        {#if pages}<span class="on">on temperature colours</span>{/if}
        {#each others as o (o.c)}
          <!-- the mode is the one the switch shows: the chips name the part and its word -->
          <TruthChip component={o.c} ov={o.ov} showMode={false} />
        {/each}
      </div>
    {/if}
  </div>
</aside>

<style>
  .mini {
    position: absolute;
    z-index: 5;
    top: 12px;
    right: 12px;
    width: 280px;
    padding: 8px 10px 8px 8px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 2px 12px;
    align-items: center;
    border-radius: var(--r-tile);
    background: var(--panel);
    border: 1px solid var(--line);
    box-shadow: inset 0 1px 0 var(--glass-hi), var(--shadow);
    backdrop-filter: blur(18px) saturate(1.25);
    -webkit-backdrop-filter: blur(18px) saturate(1.25);
    pointer-events: none; /* a locator, not a scene: no tooltips, no doors */
  }
  .mini > svg {
    display: block;
    border-radius: 10px;
    background: color-mix(in srgb, var(--bg) 55%, transparent);
  }
  /* the shared board's hairlines vanish at this size — draw them a little heavier */
  .mini :global(.board) {
    stroke-width: 6;
  }
  .mini :global(.s-pcb) {
    stroke-width: 7;
  }
  .mini :global(.s-chip) {
    stroke-width: 6;
  }
  .mini :global(.socket-frame) {
    stroke-width: 7;
  }
  .mini :global(.slot-empty) {
    stroke-width: 9;
    stroke-dasharray: 12 10;
  }
  .mini :global(.pcb) {
    stroke-width: 5;
  }
  .mini :global(.shroud) {
    stroke-width: 5;
  }
  .veil {
    fill: var(--bg);
    opacity: 0.62;
  }
  .here {
    fill: none;
    stroke: var(--accent);
    stroke-width: 13;
    filter: drop-shadow(0 0 5px var(--accent-glow));
  }
  /* several outlines side by side (the four modules, 7 board units apart): heavy enough to read, light enough not to merge */
  .many .here {
    stroke-width: 9;
  }
  .here.inner {
    stroke: var(--ink);
    stroke-width: 11;
  }
  .dot {
    fill: var(--bad);
    stroke: var(--ink);
    stroke-width: 4;
  }

  .txt {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .txt em {
    font: 600 9.5px var(--font-mono);
    font-style: normal;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink3);
  }
  .txt b {
    font: 650 14px/1.2 var(--font-ui);
    color: var(--accent);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* what the part is inside, without the machine (it is always the machine) and without the part itself (named above) */
  .trail {
    font-size: 11px;
    line-height: 1.35;
    color: var(--ink3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .chips {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    margin-top: 3px;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
  }
  /* every chip keeps to one line: its component and its word (the longest, "storage measured", is 122 px) */
  .chips :global(.tc) {
    flex-wrap: nowrap;
    max-width: none;
  }
  .on {
    font-size: 10px;
    line-height: 1.3;
    color: var(--ink3);
    white-space: nowrap;
  }
</style>
