<script lang="ts">
  /**
   * Level 0 · machine — every populated module, large, in a 2 × 2. Hover lifts a module,
   * click zooms into it. Empty slots are drawn as small dashed ghosts, never as silicon.
   */
  import { app, getMachine, selectProcess, selectFile } from '../../mock/store.svelte';
  import { fmtMiB } from '../../mock/model';
  import DimmStick from '../../scene/DimmStick.svelte';
  import Icon from '../../scene/Icon.svelte';
  import { STICK } from '../../scene/geometry';
  import {
    levelWheel,
    pulsesOf,
    cellPos,
    diePos,
    BOARD_CELL_SIZE,
    stateSegments,
    machineLayout,
    MACHINE_GAP,
    STICK_AR,
    type Level,
  } from './nav';

  interface Props {
    w: number;
    h: number;
    go: (l: Level) => void;
    down: (target?: { dimm?: number }) => void;
  }
  let { w, h, go, down }: Props = $props();

  const m = getMachine();
  const EMPTY = m.slots.filter((s) => !s.dimm);
  const totalGiB = m.dimms.reduce((s, d) => s + d.capacityGiB, 0);
  const d0 = m.dimms[0];
  const kit = `${m.dimms.length} × ${d0.capacityGiB} GiB ${d0.type.split(' ')[0]}-${d0.speedMts}`;

  const st = $derived(app.stats);
  const used = (d: number) => st?.dimmUsed[d] ?? 0;
  const pct = (d: number) => Math.round(used(d) * 100);
  const busiest = $derived.by(() => {
    if (!st) return m.dimms[0];
    return m.dimms.reduce((a, d) => (used(d.index) > used(a.index) ? d : a), m.dimms[0]);
  });
  const segs = $derived(st ? stateSegments(st.byState) : []);

  /** Modules as large as the stage allows; the floating tiles live in the bands left above and below. */
  const geom = $derived(machineLayout(w, h));

  /** Who holds the most memory: one process, one cached file. */
  const topProc = $derived.by(() => (st ? [...st.procs].sort((a, b) => b.blocks - a.blocks)[0] ?? null : null));
  const topFile = $derived.by(() => {
    if (!st) return null;
    return m.files.map((f) => ({ f, blocks: st.byOwner[String(f.id)]?.blocks ?? 0 })).sort((a, b) => b.blocks - a.blocks)[0] ?? null;
  });
  /** The owner whose pages are lit up (null when none). */
  const lit = $derived(app.highlight?.kind === 'owner' ? app.highlight.id : null);
  const procName = (id: number) => m.processes.find((p) => p.id === id)?.name ?? '?';
  const base = (p: string) => p.split('\\').pop() ?? p;

  /** Board blocks that changed this tick, per module — the board visibly breathes. */
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

  let root: HTMLDivElement;
  $effect(() => {
    const onWheel = levelWheel((dir, e) => {
      if (dir < 0) return;
      const card = (e.target as Element).closest<HTMLElement>('[data-dimm]');
      down({ dimm: card ? Number(card.dataset.dimm) : undefined });
    });
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  });
</script>

<div class="lv" bind:this={root} class:narrow={geom.stickW < 620}>
  <div class="row top" style="width:{geom.gridW}px; margin-left:{-geom.gridW / 2}px">
    <div class="io-tile">
      <em>Installed memory</em>
      <b>{totalGiB}<i>GiB</i></b>
      <span>{kit}</span>
    </div>
    <div class="io-tile">
      <em>Slots</em>
      <b>{m.dimms.length}<i>/ {m.slots.length}</i></b>
      <span>populated · {EMPTY.length} empty</span>
    </div>
    <div class="io-tile wide">
      <em>Memory by state</em>
      <div class="io-bar">
        {#each segs as s (s.l)}<i style="flex-basis:{st ? (s.n / st.total) * 100 : 0}%; background: {s.c}"></i>{/each}
      </div>
      <div class="io-legend cols">
        {#each segs as s (s.l)}<span><i style="background: {s.c}"></i>{s.l}<b>{s.pct}%</b></span>{/each}
      </div>
    </div>
    {#if topProc}
      <button class="io-tile owner" class:on={lit === topProc.id} onclick={() => selectProcess(lit === topProc.id ? null : topProc.id)} title="Show this process's pages">
        <em>Largest process</em>
        <b class="io-name">{procName(topProc.id)}</b>
        <span>{fmtMiB(topProc.blocks)} · click to show its pages</span>
      </button>
    {/if}
    {#if topFile && topFile.blocks && w >= 1360}
      <button class="io-tile owner file" class:on={lit === topFile.f.id} onclick={() => selectFile(lit === topFile.f.id ? null : topFile.f.id)} title={topFile.f.path}>
        <em>Largest cached file</em>
        <b class="io-name">{base(topFile.f.path)}</b>
        <span>{fmtMiB(topFile.blocks)} · click to show its pages</span>
      </button>
    {/if}
  </div>

  <div class="grid" style="grid-template-rows: repeat(2, {geom.cellH}px); gap: {MACHINE_GAP}px">
    {#each m.dimms as d, di (d.index)}
      {@const slot = m.slots[d.slot]}
      <button
        class="mod"
        data-dimm={d.index}
        style="width:{geom.stickW}px"
        onclick={() => go({ kind: 'stick', dimm: d.index })}
        aria-label={`Open ${slot.label}, ${d.capacityGiB} GB module`}
      >
        <span class="head">
          <span class="pill">{slot.label}</span>
          <span class="meter"><b>{pct(d.index)}%</b> in use<span class="track"><i style="transform: scaleX({used(d.index).toFixed(3)})"></i></span></span>
          <span class="who">{d.manufacturer} {d.type.replace('DDR5 ', '')} · {d.capacityGiB} GB</span>
        </span>
        <span class="art" style="height:{geom.stickW * STICK_AR}px">
          <svg viewBox="0 0 {STICK.width} {STICK.height}">
            <DimmStick dimm={d} interactive={false} />
            <g class="pulses">
              {#each pulses[di] as p (p.key)}
                <rect x={p.x - 0.6} y={p.y - 0.6} width={BOARD_CELL_SIZE + 1.2} height={BOARD_CELL_SIZE + 1.2} rx="0.8" class="pulse" />
              {/each}
            </g>
          </svg>
        </span>
      </button>
    {/each}
  </div>

  <div class="row bot" style="width:{geom.gridW}px; margin-left:{-geom.gridW / 2}px">
    <div class="io-tile">
      <em>Empty slots</em>
      <div class="ghosts">
        {#each EMPTY as s (s.index)}<span class="ghost" title="{s.channel} · no module installed">{s.label}</span>{/each}
      </div>
      <span>no module installed · {EMPTY.map((s) => s.channel).join(' · ')}</span>
    </div>
    <div class="io-tile right">
      <em>Busiest module</em>
      <button class="busy" onclick={() => go({ kind: 'stick', dimm: busiest.index })} title="Open this module">
        <b class="io-name">{m.slots[busiest.slot].label}</b>
        <span class="arrow"><Icon name="chevronRight" size={16} /></span>
      </button>
      <span>{pct(busiest.index)}% in use · the most of any module</span>
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
  .row {
    position: absolute;
    left: 50%;
    display: flex;
    align-items: stretch;
    gap: 12px;
  }
  .row.top {
    top: 12px;
  }
  .row.bot {
    bottom: 12px;
  }
  .row > .wide {
    width: 372px;
    flex: none;
  }
  .row > .owner {
    position: relative;
    width: 214px;
    flex: none;
    text-align: left;
    color: var(--ink);
    transition: border-color 160ms ease, transform 200ms cubic-bezier(0.2, 0.75, 0.25, 1);
  }
  .row > .owner:hover {
    border-color: var(--accent);
    transform: translateY(-2px);
  }
  .row > .owner::after {
    content: '';
    position: absolute;
    left: 16px;
    top: 13px;
    width: 7px;
    height: 7px;
    border-radius: 2px;
    background: var(--c-private);
  }
  .row > .owner.file::after {
    background: var(--c-file);
  }
  .row > .owner em {
    padding-left: 13px;
  }
  .row > .owner.on {
    border-color: var(--accent);
    box-shadow: inset 0 1px 0 var(--glass-hi), 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent), var(--shadow);
  }
  .row > .right {
    margin-left: auto;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, max-content);
  }

  .mod {
    position: relative;
    z-index: 0;
    display: flex;
    flex-direction: column;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--ink);
    text-align: left;
    transition: transform 280ms cubic-bezier(0.2, 0.75, 0.25, 1);
  }
  /* light that switches on under the module — a static blur, only its opacity animates */
  .mod::before {
    content: '';
    position: absolute;
    z-index: -1;
    left: -3%;
    right: -3%;
    top: 34px;
    bottom: -24px;
    border-radius: 40px;
    background: radial-gradient(50% 60% at 50% 62%, color-mix(in srgb, var(--accent) 80%, transparent), transparent 78%);
    filter: blur(30px);
    opacity: 0;
    transition: opacity 280ms ease;
  }
  .mod:hover,
  .mod:focus-visible {
    transform: translateY(-5px);
  }
  .mod:hover::before,
  .mod:focus-visible::before {
    opacity: 0.75;
  }
  .mod:focus-visible {
    outline: none;
  }
  .mod:focus-visible .pill {
    border-color: var(--accent);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 46px;
    padding: 0 6px 10px 4px;
    white-space: nowrap;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 27px;
    padding: 0 12px 0 10px;
    border-radius: 999px;
    background: var(--panel2);
    border: 1px solid var(--line2);
    box-shadow: inset 0 1px 0 var(--glass-hi);
    font: 650 12.5px var(--font-mono);
    letter-spacing: 0.04em;
    backdrop-filter: blur(12px);
    transition: border-color 200ms ease;
  }
  .pill::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 6px var(--accent-glow);
  }
  .meter {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    color: var(--ink3);
  }
  .meter b {
    font: 600 13.5px var(--font-ui);
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .track {
    width: 76px;
    height: 5px;
    margin-left: 4px;
    border-radius: 3px;
    background: var(--panel2);
    box-shadow: inset 0 0 0 1px var(--line);
    overflow: hidden;
  }
  .track i {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: linear-gradient(90deg, var(--c-private), var(--accent));
    transform-origin: 0 50%;
    transition: transform 480ms ease;
  }
  .who {
    margin-left: auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 11.5px;
    color: var(--ink3);
  }
  /* narrow modules: the maker line would crowd the neighbour */
  .lv.narrow .who {
    display: none;
  }

  .art {
    display: block;
    border-radius: 14px;
  }
  .art svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  /* live pages bloom (luminance-keyed glow: only bright cells emit light) */
  .mod :global(g.chip-grid) {
    filter: url(#io-glow-xs);
  }

  .pulse {
    fill: none;
    stroke: var(--ink);
    stroke-width: 0.5;
    opacity: 0;
    transform-box: fill-box;
    transform-origin: center;
    animation: io-machine-pulse 560ms ease-out forwards;
    pointer-events: none;
  }
  @keyframes io-machine-pulse {
    0% {
      opacity: 0.9;
      transform: scale(1);
    }
    100% {
      opacity: 0;
      transform: scale(2.4);
    }
  }

  .ghosts {
    display: flex;
    gap: 8px;
    margin: 5px 0 4px;
  }
  .ghost {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 30px;
    padding: 0 12px;
    border-radius: 8px;
    border: 1.5px dashed var(--line2);
    color: var(--ink3);
    font: 500 10.5px var(--font-mono);
  }
  .busy {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    margin-top: 4px;
    padding: 3px 6px 3px 0;
    border: 0;
    background: transparent;
    color: var(--ink);
    text-align: left;
    transition: color 140ms ease;
  }
  .busy:hover {
    color: var(--accent);
  }
  .busy .arrow {
    display: grid;
    color: var(--ink3);
    transition: transform 180ms cubic-bezier(0.2, 0.75, 0.25, 1), color 140ms ease;
  }
  .busy:hover .arrow {
    color: var(--accent);
    transform: translateX(4px);
  }

  @media (max-width: 1180px) {
    .row > .wide {
      display: none;
    }
  }
</style>
