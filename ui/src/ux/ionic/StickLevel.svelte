<script lang="ts">
  /**
   * Level 1 · stick — one module fills the stage. Hovering frames the die under the
   * pointer; clicking it zooms in. Live pages bloom and each changed block pulses. The
   * module's grids are board grids, so they colour themselves in every mode; the reading
   * guide under the module says what the colours mean and how honest they are.
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
    patchHover,
    type Level,
    type Target,
  } from './nav';
  import Guide from './Guide.svelte';
  import { chipHeat, chipsHeat, heatWatts, overlayOf, fmt } from './live';

  interface Props {
    dimm: number;
    w: number;
    h: number;
    go: (l: Level) => void;
    down: (target?: Target) => void;
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
  const tele = $derived(app.tele);
  const mode = $derived(app.mode);
  const ov = $derived(overlayOf(mode, 'memory'));
  const used = $derived(st?.dimmUsed[dimm] ?? 0);
  const totalBlocks = d.chips.length * 256;
  const temp = $derived(tele?.dimmTemp[dimm] ?? 0);
  const heat = $derived(tele ? chipsHeat(tele, d.chips.map((c) => c.index)) : null);
  const s = $derived(stickLayout(w, h));
  /** The tile row hangs on the module's left edge — unless that would take it under the mini-map. */
  const ROW_W = 4 * 196 + 3 * 12;
  const rowLeft = $derived(Math.max(24, Math.min(s.x, (w || 1200) - 340 - ROW_W - 12)));

  const guide = $derived.by(() => {
    if (ov === 'temperature') return { note: 'per block · estimated', sub: `module sensor ${fmt(temp, 1)} °C, measured · the dies are spread out from it` };
    if (ov === 'activity' && heat) return { note: 'per block · modelled', sub: `mean page heat ${fmt(heat.mean * 100)} % · hottest: block ${heat.at} of die ${(heat.atChip & 7) + 1}` };
    if (ov === 'power' && heat) return { note: 'per block · estimated', sub: `≈ ${fmt(heatWatts(heat.mean), 2)} W per block on average · DIMMs have no power sensor` };
    return { note: '', sub: '' };
  });

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
  const hotDieUnder = $derived(m.chips[pos.chip]);
  const hotPct = $derived(Math.round((st?.chipHot[pos.chip] ?? 0) * 100));
  const dieNo = $derived((pos.chip & 7) + 1);

  /** What the readout says about the framed die — the mode's value, with its truth word. */
  const readout = $derived.by(() => {
    if (!hot) return 'R1 is the back rank, R0 the front · hover a die to frame it';
    if (tele && ov === 'temperature') return `die ${dieNo} · ≈ ${fmt(tele.dieTemp[pos.chip], 1)} °C · estimated`;
    if (tele && ov === 'activity') return `die ${dieNo} · ${fmt(chipHeat(tele, pos.chip).mean * 100)} % page heat · modelled`;
    if (tele && ov === 'power') return `die ${dieNo} · ≈ ${fmt(heatWatts(chipHeat(tele, pos.chip).mean), 2)} W per block · estimated`;
    return `die ${dieNo} · rank ${hotDieUnder.rank} · subchannel ${hotDieUnder.sub === 0 ? 'A' : 'B'} · ${hotPct}% live`;
  });

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
    // the die, so say so.
    patchHover(`click opens die ${(chip & 7) + 1} — pages below board zoom are modeled`);
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
  <div class="hero" style="left:{s.x}px; top:{s.y}px; width:{s.w}px; height:{s.h}px">
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
        <text y="1.75" text-anchor="middle">open die {dieNo} ›</text>
      </g>
    </svg>

    <div class="row top" style="left:{rowLeft - s.x}px">
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
        <span>2 ranks × 8 dies</span>
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
      <div class="guidebox">
        <!-- flat under the module; the caption already says where the number comes from, so no reason line -->
        <Guide component="memory" note={guide.note} sub={guide.sub} flat reason={false} compact={w < 1560} />
      </div>
      <div class="readout" class:on={hot}>
        {readout}
      </div>
    </div>
  </div>
</div>

<style>
  .lv {
    position: absolute;
    inset: 0;
  }
  .hero {
    position: absolute;
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
    bottom: calc(100% + 44px);
  }
  .row.bot {
    top: calc(100% + 44px);
    right: 0;
  }
  .row.top .io-tile {
    width: 196px;
    flex: none;
  }
  .accent {
    color: var(--accent);
    text-shadow: 0 0 18px var(--accent-glow);
  }

  .ids {
    min-width: 330px;
    flex: none;
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

  /* the reading guide sits between the module's identity and the readout */
  .guidebox {
    flex: 1 1 auto;
    min-width: 0;
    padding: 14px 4px 0 8px;
    align-self: stretch;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .readout {
    flex: none;
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

  @media (max-width: 1340px) {
    .readout {
      display: none;
    }
  }
</style>
