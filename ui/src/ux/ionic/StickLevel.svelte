<script lang="ts">
  /**
   * Level 1 · stick — one module fills the stage. Hovering frames the die under the
   * pointer; clicking it zooms in. Live pages bloom and each changed block pulses.
   */
  import { untrack } from 'svelte';
  import { app, getMachine } from '../../mock/store.svelte';
  import { fmtMiB } from '../../mock/model';
  import DimmStick from '../../scene/DimmStick.svelte';
  import { STICK } from '../../scene/geometry';
  import {
    levelWheel,
    pulsesOf,
    svgPoint,
    diePos,
    cellPos,
    BOARD_CELL_SIZE,
    DIE,
    stickLayout,
    type Level,
  } from './nav';

  interface Props {
    dimm: number;
    w: number;
    h: number;
    go: (l: Level) => void;
    down: (target?: { chip?: number }) => void;
  }
  let { dimm, w, h, go, down }: Props = $props();

  const m = getMachine();
  // the component is re-created for every location on the chain, so identity is read once
  const d = untrack(() => m.dimms[dimm]);
  const slot = m.slots[d.slot];
  // where the dies sit on the module (DimmStick's layout, via nav.diePos)
  const X0 = diePos(0).x;
  const STEP = diePos(1).x - X0;
  const ROW_Y = [diePos(0).y, diePos(8).y]; // rank 0 (front), rank 1 (back)
  const COLS = 8;

  const st = $derived(app.stats);
  const used = $derived(st?.dimmUsed[dimm] ?? 0);
  const totalBlocks = d.chips.length * 256;

  /** ≈ 2.2 × native size, shrunk to fit smaller windows. */
  const stickW = $derived(stickLayout(w, h).w);

  const pulses = $derived.by(() =>
    pulsesOf(
      app.version,
      (chip) => m.chips[chip].dimm === dimm,
      (chip, cell) => {
        const p = diePos(chip);
        const c = cellPos(cell);
        return { x: p.x + c.x, y: p.y + c.y };
      },
    ),
  );

  // ---- die under the pointer ------------------------------------------------------
  const dieAt = (x: number, y: number): number | null => {
    const col = Math.floor((x - X0) / STEP);
    const row = y >= ROW_Y[1] && y < ROW_Y[1] + DIE.h ? 1 : y >= ROW_Y[0] && y < ROW_Y[0] + DIE.h ? 0 : -1;
    return col >= 0 && col < COLS && row >= 0 ? d.chips[col + row * COLS].index : null;
  };

  let svg: SVGSVGElement;
  let pos = $state({ chip: d.chips[COLS].index, ...diePos(d.chips[COLS].index) });
  let hot = $state(false);
  const hotDie = $derived(m.chips[pos.chip]);
  const hotPct = $derived(Math.round((st?.chipHot[pos.chip] ?? 0) * 100));

  function onMove(e: PointerEvent) {
    const p = svgPoint(svg, e);
    const chip = dieAt(p.x, p.y);
    if (chip === null) {
      hot = false;
      return;
    }
    if (!hot || chip !== pos.chip) pos = { chip, ...diePos(chip) };
    hot = true;
    // The shared tooltip always promises an owner highlight; on this level a click opens
    // the die, so say so in its note.
    const note = `click opens die ${(chip & 7) + 1} — pages below board zoom are modeled`;
    const h = app.hover;
    if (h && h.card.hint !== note) {
      app.hover = { ...h, card: { ...h.card, hint: note }, d: h.d ? { ...h.d, note } : undefined };
    }
  }

  let root: HTMLDivElement;
  $effect(() => {
    const onWheel = levelWheel((dir, e) => {
      if (dir < 0) return go({ kind: 'machine' });
      const p = svgPoint(svg, e);
      down({ chip: dieAt(p.x, p.y) ?? undefined });
    });
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  });
</script>

<div class="lv" bind:this={root}>
  <div class="hero" style="width:{stickW}px; height:{stickLayout(w, h).h}px">
    <svg
      bind:this={svg}
      viewBox="0 0 {STICK.width} {STICK.height}"
      class="stick-svg"
      role="application"
      aria-label="Memory module, one grid per die — hover a die to frame it, click to open it"
      onpointermove={onMove}
      onpointerleave={() => (hot = false)}
    >
      <DimmStick dimm={d} onchip={(_d, chip) => go({ kind: 'die', chip })} />
      <g class="pulses">
        {#each pulses as p (p.key)}
          <rect x={p.x - 0.5} y={p.y - 0.5} width={BOARD_CELL_SIZE + 1} height={BOARD_CELL_SIZE + 1} rx="0.7" class="pulse" />
        {/each}
      </g>
      <!-- the die under the pointer, framed -->
      <rect
        class="frame"
        width={DIE.w + 5}
        height={DIE.h + 5}
        rx="5"
        style="transform: translate({pos.x - 2.5}px, {pos.y - 2.5}px); opacity: {hot ? 1 : 0}"
      />
      <g class="tag" style="transform: translate({pos.x + DIE.w / 2}px, 65px); opacity: {hot ? 1 : 0}">
        <rect x="-31" y="-4.7" width="62" height="9.4" rx="4.7" />
        <text y="1.75" text-anchor="middle">open die {(pos.chip & 7) + 1} ›</text>
      </g>
    </svg>

    <div class="row top">
      <div class="io-tile">
        <em>Capacity</em>
        <b>{d.capacityGiB}<i>GiB</i></b>
        <span>{slot.label} · {slot.channel}</span>
      </div>
      <div class="io-tile">
        <em>In use</em>
        <b class="accent">{Math.round(used * 100)}<i>%</i></b>
        <span>{fmtMiB(Math.round(used * totalBlocks))} live</span>
      </div>
      <div class="io-tile">
        <em>Organization</em>
        <b>{d.chips.length}<i>dies</i></b>
        <span>2 ranks × 8 dies · {totalBlocks} blocks</span>
      </div>
      <div class="io-tile">
        <em>Speed</em>
        <b>{d.speedMts}<i>MT/s</i></b>
        <span>{d.manufacturer} · {d.type}</span>
      </div>
    </div>

    <div class="row bot">
      <div class="io-tile ids">
        <em>Module</em>
        <div class="kv">
          <span>part</span><b class="plain">{d.partNumber}</b>
          <span>serial</span><b class="plain">{d.serial}</b>
          <span>slot</span><b class="plain">{slot.label} · {slot.channel}</b>
        </div>
      </div>
      <div class="legendbox">
        <div class="legendline"><i class="sw live"></i>live page · <i class="sw cache"></i>standby · <i class="sw dirty"></i>modified</div>
        <div class="readout" class:on={hot}>
          {#if hot}
            die {(pos.chip & 7) + 1} · rank {hotDie.rank} · subchannel {hotDie.sub === 0 ? 'A' : 'B'} · <b>{hotPct}%</b> live
          {:else}
            R1 is the back rank, R0 the front · hover a die to frame it
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .lv {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
  }
  .hero {
    position: relative;
  }
  .stick-svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  /* live pages bloom; the die under the pointer is a doorway */
  .hero :global(g.chip-grid) {
    filter: url(#io-glow-sm);
    cursor: pointer;
  }

  .frame {
    fill: color-mix(in srgb, var(--accent) 10%, transparent);
    stroke: var(--accent);
    stroke-width: 1.5;
    pointer-events: none;
    filter: drop-shadow(0 0 5px var(--accent-glow));
    transition: transform 200ms cubic-bezier(0.2, 0.75, 0.25, 1), opacity 160ms ease;
  }
  .tag {
    pointer-events: none;
    transition: transform 200ms cubic-bezier(0.2, 0.75, 0.25, 1), opacity 160ms ease;
  }
  .tag rect {
    fill: var(--tip-bg);
    stroke: var(--accent);
    stroke-width: 0.5;
  }
  .tag text {
    fill: var(--ink);
    font: 600 4.7px var(--font-ui);
    letter-spacing: 0.02em;
  }

  .pulse {
    fill: none;
    stroke: var(--ink);
    stroke-width: 0.35;
    opacity: 0;
    transform-box: fill-box;
    transform-origin: center;
    animation: io-stick-pulse 560ms ease-out forwards;
    pointer-events: none;
  }
  @keyframes io-stick-pulse {
    0% {
      opacity: 0.9;
      transform: scale(1);
    }
    100% {
      opacity: 0;
      transform: scale(2.6);
    }
  }

  .row {
    position: absolute;
    left: 0;
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }
  .row.top {
    bottom: calc(100% + 56px);
  }
  .row.bot {
    top: calc(100% + 56px);
    right: 0;
    justify-content: space-between;
  }
  .row.top .io-tile {
    width: 196px;
  }
  .accent {
    color: var(--accent);
    text-shadow: 0 0 18px var(--accent-glow);
  }

  .ids {
    min-width: 330px;
  }
  .kv {
    display: grid;
    grid-template-columns: 46px auto;
    gap: 1px 10px;
    margin-top: 6px;
    font-size: 11.5px;
  }
  .kv span {
    color: var(--ink3);
    font: 500 10px var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    padding-top: 2px;
  }

  .legendbox {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    padding: 6px 4px 0;
    text-align: right;
  }
  .legendline {
    font-size: 11.5px;
    color: var(--ink3);
    white-space: nowrap;
  }
  .sw {
    display: inline-block;
    width: 9px;
    height: 9px;
    margin: 0 5px 0 10px;
    border-radius: 2.5px;
    vertical-align: -1px;
  }
  .sw:first-child {
    margin-left: 0;
  }
  .sw.live {
    background: linear-gradient(90deg, var(--c-private), var(--c-file), var(--c-pagefile), var(--c-kernel));
  }
  .sw.cache {
    background: color-mix(in srgb, var(--c-private) 42%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c-private) 60%, transparent);
  }
  .sw.dirty {
    background: var(--c-modified);
  }
  .readout {
    min-height: 32px;
    padding: 5px 14px;
    border-radius: 999px;
    background: var(--panel);
    border: 1px solid var(--line);
    box-shadow: inset 0 1px 0 var(--glass-hi);
    backdrop-filter: blur(14px);
    color: var(--ink3);
    font-size: 12px;
    white-space: nowrap;
    transition: border-color 200ms ease, color 200ms ease;
  }
  .readout.on {
    border-color: var(--accent);
    color: var(--ink2);
  }
  .readout b {
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
</style>
