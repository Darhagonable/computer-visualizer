<script lang="ts">
  /**
   * "You are here" — the same motherboard as the machine level, small and passive, veiled
   * except for the part the level is in: a module, the socket, the graphics card, and inside
   * it the die, the chiplet, the VRAM. The trail beside it repeats the breadcrumb.
   *
   * The board shows two more components than the level is about, each coloured by its own
   * overlay with its own truth — so both get their truth chip here (the level's own legend
   * covers only the level's own component).
   */
  import { fade } from 'svelte/transition';
  import { app, getMachine } from '../../mock/store.svelte';
  import { MOTHERBOARD } from '../../scene/geometry';
  import type { Component } from '../../mock/telemetry';
  import Motherboard from '../../scene/Motherboard.svelte';
  import { MINI, PART, crumbsOf, hereOf, miniBoard, seatGpuCard, type Level } from './nav';
  import { overlayOf } from './live';
  import TruthChip from './TruthChip.svelte';

  let { level, h }: { level: Level; h: number } = $props();

  const m = getMachine();
  const W = MOTHERBOARD.width;
  const H = MOTHERBOARD.height;

  let el = $state<SVGSVGElement>();
  // the card sits in its PCIe slot here too (see nav.seatGpuCard)
  $effect(() => seatGpuCard(el));

  const here = $derived(hereOf(level, m));
  const trail = $derived(crumbsOf(level, m));
  const board = $derived(miniBoard(h));
  /** Short stages: the board only — the trail is in the top bar anyway. */
  const brief = $derived(board < MINI.board);
  /** Dims everything but the part, so the outline is the one bright thing on the map. */
  const veil = $derived.by(() => {
    const p = here?.part;
    if (!p) return '';
    const pad = 12;
    const x = p.x - pad;
    const y = p.y - pad;
    const w = p.w + 2 * pad;
    const hh = p.h + 2 * pad;
    return `M0 0H${W}V${H}H0Z M${x} ${y}h${w}v${hh}h-${w}Z`;
  });
  /** The components that are coloured on this map but are not what the level is about. */
  const others = $derived.by(() => {
    const own = PART[level.kind];
    const out: { c: Component; ov: NonNullable<ReturnType<typeof overlayOf>> }[] = [];
    for (const c of ['memory', 'cpu', 'gpu'] as Component[]) {
      const ov = overlayOf(app.mode, c);
      if (c !== own && ov) out.push({ c, ov });
    }
    return out;
  });
</script>

<aside class="mini" aria-label="You are here" transition:fade={{ duration: 220 }}>
  <svg bind:this={el} viewBox="0 0 {W} {H}" width={board} height={Math.round((board * H) / W)}>
    <Motherboard interactive={false} labels={false} />
    {#if here}
      <path class="veil" fill-rule="evenodd" d={veil} />
      <rect class="here" x={here.part.x} y={here.part.y} width={here.part.w} height={here.part.h} rx="6" />
      {#if here.inner}
        <rect class="here inner" x={here.inner.x} y={here.inner.y} width={here.inner.w} height={here.inner.h} rx="4" />
      {/if}
      {#if here.dot}
        <circle class="dot" cx={here.dot.x} cy={here.dot.y} r="11" />
      {/if}
    {/if}
  </svg>
  <div class="txt">
    <em>You are here</em>
    <b>{trail.at(-1)?.label}</b>
    {#if !brief}
      {#if trail.length > 2}
        <span class="trail" title={trail.slice(1, -1).map((c) => c.label).join(' › ')}>{trail.slice(1, -1).map((c) => c.label).join(' › ')}</span>
      {/if}
      <div class="chips">
        {#each others as o (o.c)}
          <!-- the mode is named only where it is not the one the switch shows -->
          <TruthChip component={o.c} ov={o.ov} showMode={app.mode === 'pages'} />
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
    width: 316px;
    padding: 10px 12px 10px 10px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 2px 14px;
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
  }
</style>
