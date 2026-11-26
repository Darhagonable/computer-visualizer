<script lang="ts">
  /**
   * Level 2 · die — one DRAM die as a big rounded package. Each of the die's 256 board
   * blocks opens into a 4 × 4 clump, so the die shows a 64 × 64 grid of 64-page cells.
   * Below board zoom nothing is measured: the grid follows each parent block's state and
   * the level wears a "modeled" badge. In an overlay mode every cell takes its parent
   * block's value (paint.boardOverlay's formulas) and the tooltip says so, with the truth word.
   */
  import { untrack } from 'svelte';
  import { app, getMachine, toggleHighlightOwner, type PageDetails } from '../mock/store.svelte';
  import { deriveGrid } from '../mock/derive';
  import { hash32 } from '../mock/rng';
  import { CELLS_PER_CHIP, PAGE_SIZE, fmtInt, useFamilyIndex } from '../mock/model';
  import ChipGrid from '../scene/ChipGrid.svelte';
  import { levelWheel, pulsesOf, svgPoint, stateSegments, boxLayout, heroCols, BOX, DIE_GRID, type Level } from './nav';
  import Guide from './Guide.svelte';
  import { blockValue, blockRows, chipHeat, heatWatts, overlayOf, fmt } from './live';

  interface Props {
    chip: number;
    w: number;
    h: number;
    go: (l: Level) => void;
    down: (target?: { cell?: number }) => void;
  }
  let { chip: chipProp, w, h, go, down }: Props = $props();

  const m = getMachine();
  // the component is re-created for every location on the chain, so identity is read once
  const chipIndex = untrack(() => chipProp);
  const ch = m.chips[chipIndex];
  const dimm = m.dimms[ch.dimm];
  const slot = m.slots[dimm.slot];
  const dieNo = (chipIndex & 7) + 1;
  const hex = (n: number, width: number) => '0x' + n.toString(16).toUpperCase().padStart(width, '0');
  const FAM_VAR = ['--c-private', '--c-file', '--c-pagefile', '--c-kernel'];

  // package geometry (viewBox BOX.size square)
  const N = DIE_GRID.n;
  const SIZE = BOX.size;
  const PAD = BOX.pad;
  const INNER = SIZE - 2 * PAD;
  const GAP = DIE_GRID.gap;
  const CELL = (INNER - (N - 1) * GAP) / N;
  const PITCH = CELL + GAP;
  const CLUMP = 4 * PITCH - GAP;
  const lattice = Array.from({ length: 15 }, (_, i) => {
    const o = PAD + (i + 1) * 4 * PITCH - GAP / 2;
    return `M${o} ${PAD}V${PAD + INNER}M${PAD} ${o}H${PAD + INNER}`;
  }).join('');

  // ---- the 64 × 64 grid: every board block expanded into a 4 × 4 clump ----------------
  const grid = $derived.by(() => {
    void app.version; // cells mutate in place — the version read is what schedules the rebuild
    const cells = new Uint8Array(N * N);
    const owners = new Uint16Array(N * N);
    for (let p = 0; p < CELLS_PER_CHIP; p++) {
      const g = deriveGrid(chipIndex, ch.cells[p], ch.owners[p], 16);
      for (let k = 0; k < 16; k++) {
        cells[((p >> 4) * 4 + (k >> 2)) * N + (p & 15) * 4 + (k & 3)] = g.cells[k];
        owners[((p >> 4) * 4 + (k >> 2)) * N + (p & 15) * 4 + (k & 3)] = g.owners[k];
      }
    }
    return { cells, owners };
  });

  /** The board block a fine cell of the 64 × 64 grid belongs to. */
  const blockOf = (i: number) => ((i >> 6) >> 2) * 16 + ((i & 63) >> 2);

  // ---- the overlay of a fine cell: its parent block's value (nothing finer is modelled) ------
  /** Null in "Pages": the grid then shows page colours. */
  const overlayFn = $derived.by(() => {
    const o = overlayOf(app.mode, 'memory');
    const t = app.tele;
    if (!o || !t) return null;
    return {
      ov: o,
      tele: t,
      at: (i: number) => blockValue(o, t, chipIndex, blockOf(i), i),
    };
  });
  const cellOverlay = $derived(overlayFn ? (i: number) => overlayFn!.at(i) : undefined);

  function details(i: number): PageDetails {
    const p = blockOf(i);
    const k = ((i >> 6) & 3) * 4 + (i & 3); // …and which of its 16 children it is
    const v = grid.cells[i];
    const pfn = (chipIndex * CELLS_PER_CHIP + p) * 1024 + k * 64;
    const base: PageDetails = {
      where: `${slot.label} · R${ch.rank}·U${dieNo} · block ${p}`,
      state: v & 15,
      use: v >> 4,
      owner: m.owners[grid.owners[i]],
      pfn: hex(pfn, 8),
      addr: hex(pfn * PAGE_SIZE, 16),
      size: '64 pages · 256 KiB',
      priority: hash32(pfn) & 7,
      note: `modeled · zoom below board level · click opens block ${p}`,
    };
    if (overlayFn) base.metrics = blockRows(overlayFn.ov, overlayFn.tele, chipIndex, p, overlayFn.at(i));
    return base;
  }

  // ---- numbers for this die ---------------------------------------------------------
  const stats = $derived.by(() => {
    void app.version;
    const c = [0, 0, 0, 0, 0, 0];
    const own = new Map<number, { blocks: number; use: number }>();
    for (let p = 0; p < CELLS_PER_CHIP; p++) {
      const v = ch.cells[p];
      c[v & 15]++;
      const o = ch.owners[p];
      if (!o) continue;
      const a = own.get(o) ?? { blocks: 0, use: 0 };
      a.blocks++;
      if (v >> 4 !== 15) a.use = v >> 4; // what this owner's pages here are for
      own.set(o, a);
    }
    const top = [...own]
      .map(([id, a]) => ({
        id,
        blocks: a.blocks,
        use: a.use,
        o: m.owners[id],
        name: m.owners[id].kind === 'file' ? (m.owners[id].name.split('\\').pop() ?? m.owners[id].name) : m.owners[id].name,
      }))
      .sort((a, b) => b.blocks - a.blocks)
      .slice(0, 4);
    return { c, top, live: c[4] + c[3], segs: stateSegments(c), max: top[0]?.blocks ?? 1 };
  });
  const livePct = $derived(Math.round((stats.live / CELLS_PER_CHIP) * 100));

  /** The reading guide's figure: this die's own value under the mode. */
  const guide = $derived.by(() => {
    const f = overlayFn;
    if (!f) return { note: '', k: null, u: '', sub: '' };
    if (f.ov === 'temperature') {
      return { note: 'per die · estimated', k: `≈ ${fmt(f.tele.dieTemp[chipIndex], 1)}`, u: '°C', sub: `die estimate · module sensor ${fmt(f.tele.dimmTemp[dimm.index], 1)} °C, warmer where pages work` };
    }
    const hs = chipHeat(f.tele, chipIndex);
    return f.ov === 'activity'
      ? { note: 'per block · modelled', k: fmt(hs.mean * 100), u: '%', sub: `mean page heat of this die · hottest: block ${hs.at} at ${fmt(hs.max * 100)} %` }
      : { note: 'per block · estimated', k: `≈ ${fmt(heatWatts(hs.mean), 2)}`, u: 'W', sub: 'per block of this die, on average · DIMMs have no power sensor' };
  });

  const side = $derived(boxLayout(w, h).side);
  /** The square package sits centred; its columns hug it. */
  const cols = $derived.by(() => {
    const side = boxLayout(w, h).side;
    const W = w || 1200;
    return heroCols({ x: (W - side) / 2, w: side }, w, h, 236, 262);
  });
  const k = $derived(side / SIZE);

  const pulses = $derived.by(() =>
    pulsesOf(
      app.version,
      (chip) => chip === chipIndex,
      (_chip, cell) => ({ x: PAD + (cell & 15) * 4 * PITCH, y: PAD + (cell >> 4) * 4 * PITCH }),
      24,
    ),
  );

  // ---- the block under the pointer ---------------------------------------------------
  let svg: SVGSVGElement;
  let pos = $state({ cell: 0, x: PAD, y: PAD });
  let hot = $state(false);
  const blockAt = (x: number, y: number): number | null => {
    const c = Math.floor((x - PAD) / PITCH);
    const r = Math.floor((y - PAD) / PITCH);
    return c >= 0 && c < N && r >= 0 && r < N ? (r >> 2) * 16 + (c >> 2) : null;
  };
  function onMove(e: PointerEvent) {
    const p = svgPoint(svg, e);
    const cell = blockAt(p.x, p.y);
    if (cell === null) {
      hot = false;
      return;
    }
    if (!hot || cell !== pos.cell) pos = { cell, x: PAD + (cell & 15) * 4 * PITCH, y: PAD + (cell >> 4) * 4 * PITCH };
    hot = true;
  }
  const tagX = $derived(Math.max(76, Math.min(side - 76, (pos.x + CLUMP / 2) * k)));

  let root: HTMLDivElement;
  $effect(() => {
    const onWheel = levelWheel((dir, e) => {
      if (dir < 0) return go({ kind: 'stick', dimm: dimm.index });
      const p = svgPoint(svg, e);
      down({ cell: blockAt(p.x, p.y) ?? undefined });
    });
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  });
</script>

<div class="lv lv-scope" bind:this={root} data-short={h > 0 && h < 620 ? '1' : '0'}>
  <div class="col l" style="left:{cols.leftX}px; width:236px">
    <div class="io-tile">
      <em>Die</em>
      <b>{dieNo}<i>of 16</i></b>
      <span>{slot.label} · rank {ch.rank} · sub {ch.sub === 0 ? 'A' : 'B'}</span>
    </div>
    <div class="io-tile">
      <em>Live</em>
      <b class="accent">{livePct}<i>%</i></b>
      <span>{stats.live} of 256 blocks active or modified</span>
    </div>
    <div class="io-tile">
      <em>Holds</em>
      <b>1<i>GiB</i></b>
      <span>256 blocks × 4 MiB · {fmtInt(262144)} pages</span>
    </div>
    <div class="io-tile">
      <em>Blocks by state</em>
      <div class="io-bar">
        {#each stats.segs as s (s.l)}<i style="flex-basis:{(s.n / 256) * 100}%; background: {s.c}"></i>{/each}
      </div>
      <div class="io-legend">
        {#each stats.segs as s (s.l)}<span><i style="background: {s.c}"></i>{s.l}<b>{s.n}</b></span>{/each}
      </div>
    </div>
  </div>

  <div class="die io-package" style="width:{side}px; height:{side}px">
    <svg
      bind:this={svg}
      viewBox="0 0 {SIZE} {SIZE}"
      class="die-svg"
      role="application"
      aria-label="DRAM die, 64 by 64 grid of 64-page cells — hover a block to frame it, click to open it"
      onpointermove={onMove}
      onpointerleave={() => (hot = false)}
    >
      <rect x="4" y="4" width={SIZE - 8} height={SIZE - 8} rx="42" class="pkg" />
      <rect x="24" y="24" width={SIZE - 48} height={SIZE - 48} rx="26" class="rim" />
      <circle cx="13.5" cy="13.5" r="3.2" class="pin" />
      <text x="30" y="18.5" class="etch">DIE {dieNo} · RANK {ch.rank} · SUB {ch.sub === 0 ? 'A' : 'B'}</text>
      <text x={SIZE - 30} y="18.5" text-anchor="end" class="etch">PIN 1 · 256 BLOCKS · 16 × 16</text>
      <ChipGrid
        chip={chipIndex}
        x={PAD}
        y={PAD}
        w={INNER}
        h={INNER}
        cols={N}
        rows={N}
        gap={GAP}
        rx={0.3}
        cells={grid.cells}
        owners={grid.owners}
        overlay={cellOverlay}
        {details}
        oncellclick={(i) => go({ kind: 'block', chip: chipIndex, cell: (i >> 8) * 16 + ((i >> 2) & 15) })}
      />
      <path d={lattice} class="lattice" />
      <g class="pulses">
        {#each pulses as p (p.key)}
          <rect x={p.x} y={p.y} width={CLUMP} height={CLUMP} rx="3" class="pulse" />
        {/each}
      </g>
      <rect class="frame" width={CLUMP + 3} height={CLUMP + 3} rx="4.5" style="transform: translate({pos.x - 1.5}px, {pos.y - 1.5}px); opacity: {hot ? 1 : 0}" />
    </svg>
    <div class="tag" style="transform: translate({tagX}px, {pos.y * k}px) translate(-50%, calc(-100% - 9px)); opacity: {hot ? 1 : 0}">
      block {pos.cell} · open ›
    </div>
    <span class="io-badge modeled" title="Nothing below board zoom is measured: each block expands into a deterministic pattern that follows the block's state.">
      modeled · zoom below board level
    </span>
  </div>

  <div class="col r" style="left:{cols.rightX}px; top:{cols.rightTop}px; width:{cols.rightW}px">
    <Guide
      component="memory"
      note={guide.note}
      k={guide.k}
      u={guide.u}
      accent
      sub={guide.sub}
      compact
    />
    <div class="io-tile">
      <em>Largest occupants</em>
      <div class="io-list">
        {#each stats.top as t (t.id)}
          <button class="io-row" class:on={app.highlight?.kind === 'owner' && app.highlight.id === t.id} onclick={() => toggleHighlightOwner(t.id)} title={t.o.name}>
            <span class="n">{t.name}</span>
            <span class="track"><i style="transform: scaleX({(t.blocks / stats.max).toFixed(3)}); background: var({FAM_VAR[useFamilyIndex(t.use)]})"></i></span>
            <b>{t.blocks}</b>
          </button>
        {/each}
      </div>
      <span class="io-foot">{stats.top.length ? 'blocks of 4 MiB · click to light up an owner' : 'no owned blocks'}</span>
    </div>
    <div class="how">
      <span><i class="c"></i>one cell is 64 pages — 256 KiB</span>
      <span><i class="g"></i>a 4 × 4 group is one block — 4 MiB</span>
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
  .col {
    position: absolute;
    top: 16px;
    bottom: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 236px;
  }
  .col.l {
    justify-content: center;
  }
  .col.r {
    justify-content: flex-start;
  }

  /* package chrome (frame, rim, pin, etching, badge) is shared with the block level via .io-package */
  .die-svg :global(g.chip-grid) {
    filter: url(#io-glow-md);
  }
  .lattice {
    fill: none;
    stroke: color-mix(in srgb, var(--ink) 13%, transparent);
    stroke-width: 0.55;
    pointer-events: none;
  }
  .frame {
    fill: color-mix(in srgb, var(--accent) 9%, transparent);
    stroke: var(--accent);
    stroke-width: 1.3;
    pointer-events: none;
    filter: drop-shadow(0 0 5px var(--accent-glow));
    transition: transform 170ms cubic-bezier(0.2, 0.75, 0.25, 1), opacity 140ms ease;
  }
  .tag {
    position: absolute;
    z-index: 2;
    left: 0;
    top: 0;
    padding: 3px 11px;
    border-radius: 999px;
    background: var(--tip-bg);
    border: 1px solid var(--accent);
    box-shadow: var(--shadow);
    color: var(--ink);
    font: 600 11.5px var(--font-ui);
    white-space: nowrap;
    pointer-events: none;
    transform-origin: 0 0;
    transition: transform 170ms cubic-bezier(0.2, 0.75, 0.25, 1), opacity 140ms ease;
  }

  .pulse {
    fill: none;
    stroke: var(--ink);
    stroke-width: 0.8;
    opacity: 0;
    transform-box: fill-box;
    transform-origin: center;
    animation: io-die-pulse 560ms ease-out forwards;
    pointer-events: none;
  }
  @keyframes io-die-pulse {
    0% {
      opacity: 0.85;
      transform: scale(1);
    }
    100% {
      opacity: 0;
      transform: scale(1.3);
    }
  }

  .accent {
    color: var(--accent);
    text-shadow: 0 0 18px var(--accent-glow);
  }
  .io-foot {
    display: block;
    margin-top: 6px;
    font-size: 10.5px;
    color: var(--ink3);
  }
  .how {
    display: grid;
    gap: 4px;
    padding: 0 2px;
    color: var(--ink3);
    font-size: 11px;
    white-space: nowrap;
  }
  .how span {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .how i {
    flex: none;
    width: 9px;
    height: 9px;
    border-radius: 2px;
  }
  .how .c {
    background: var(--c-private);
    box-shadow: 0 0 6px var(--c-private);
  }
  .how .g {
    width: 13px;
    height: 13px;
    border: 1px solid color-mix(in srgb, var(--ink) 45%, transparent);
    border-radius: 3px;
  }
</style>
