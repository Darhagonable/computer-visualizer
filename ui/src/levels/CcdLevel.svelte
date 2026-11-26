<script lang="ts">
  /**
   * Processor chain · level 2 — CCD. One compute chiplet as the hero: its 8 cores as large
   * cells in two CCX groups, each with its L3. A core's colour follows the mode — in
   * Activity one half per SMT thread; click a core to open it. The layout is a generic
   * stand-in, as is the shared CpuDie's.
   */
  import { untrack } from 'svelte';
  import { app, hoverCard, hoverOut } from '../mock/store.svelte';
  import { MODE_META, TRUTH, TRUTH_LABEL, type Overlay } from '../mock/telemetry';
  import Icon from '../scene/Icon.svelte';
  import { overlayColor, threadLoad, coreValue, overlayOf, truthRow, fmt, avgClock, ccdPower } from './live';
  import { ccdLayout, heroCols, levelWheel, svgPoint, HERO_COL, CCD, CCX, coreCell, l3Cell, CORE_CELL, type Level, type Target } from './nav';
  import Guide from './Guide.svelte';

  interface Props {
    ccd: number;
    w: number;
    h: number;
    go: (l: Level) => void;
    down: (t?: Target) => void;
  }
  let { ccd, w, h, go, down }: Props = $props();
  // the component is re-created for every location on the chain, so identity is read once
  const cc = untrack(() => ccd);

  const cpu = $derived(app.cpu);
  const tele = $derived(app.tele);
  const ov = $derived<Overlay>(overlayOf(app.mode, 'cpu') ?? 'temperature');
  const cores = $derived(cpu ? cpu.cores.filter((c) => c.ccd === cc) : []);
  const lay = $derived(ccdLayout(w, h));
  const cols = $derived(heroCols(lay, w, h));
  const LOCAL = [0, 1, 2, 3, 4, 5, 6, 7];

  const val = (i: number): number => {
    const c = cores[i];
    return c ? coreValue(ov, tele, c) : 0;
  };
  const unit = $derived(ov === 'temperature' ? '°' : ov === 'activity' ? '%' : 'W');
  const valText = (i: number) => {
    const v = val(i);
    return ov === 'power' ? v.toFixed(1) : String(Math.round(v));
  };
  const threadColor = (i: number, half: number) => overlayColor('activity', 'cpu', threadLoad(tele, cc * 8 + i, half));

  const meanLoad = $derived(cores.length ? cores.reduce((s, c) => s + c.load, 0) / cores.length : 0);
  const hottest = $derived(cores.reduce<(typeof cores)[number] | null>((a, c) => (!a || c.temp > a.temp ? c : a), null));
  const watts = $derived(ccdPower(tele, cores));
  const clock = $derived(avgClock(cores));
  const ccxLoad = (x: number) => {
    const cs = cores.filter((_, i) => ((i >> 2) & 1) === x);
    return cs.length ? cs.reduce((s, c) => s + c.load, 0) / cs.length : 0;
  };

  const guide = $derived.by(() => {
    if (ov === 'temperature') return { k: fmt(hottest?.temp ?? 0), u: '°C', sub: `hottest core on this chiplet: Core ${hottest ? hottest.index + 1 : 1}` };
    if (ov === 'activity') return { k: fmt(meanLoad), u: '%', sub: 'mean of the 8 cores · one half per thread' };
    return { k: `≈ ${fmt(watts, 1)}`, u: 'W', sub: 'the 8 cores together · a share of the package power' };
  });

  /** Everything a core is, each number with its own truth word. */
  function coreCard(i: number) {
    const c = cores[i];
    if (!c) return null;
    const t0 = threadLoad(tele, c.index, 0);
    const t1 = threadLoad(tele, c.index, 1);
    return {
      title: `Core ${c.index + 1}`,
      sub: `CCD ${cc} · CCX ${(i >> 2) & 1} · threads ${2 * c.index} / ${2 * c.index + 1}`,
      rows: [
        ...truthRow('temperature', 'cpu', c.temp),
        ...truthRow('activity', 'cpu', c.load, `${Math.round(t0)} % / ${Math.round(t1)} % per thread`),
        ...truthRow('power', 'cpu', tele?.corePower[c.index] ?? 0, 'the package is measured, the split is not', [0, 10]),
        { k: 'clock', v: `${c.freq.toFixed(2)} GHz`, mono: true },
      ],
      note: `what the colour shows: ${MODE_META[ov].label.toLowerCase()} · ${TRUTH_LABEL[TRUTH[ov].cpu]}`,
      hint: 'click to open this core',
    };
  }

  let root: HTMLDivElement;
  let svg: SVGSVGElement;
  $effect(() => {
    const onWheel = levelWheel((dir, e) => {
      if (dir < 0) return go({ kind: 'package' });
      const p = svgPoint(svg, e);
      for (const i of LOCAL) {
        const b = coreCell(cc * 8 + i);
        if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return down({ core: cc * 8 + i });
      }
      down();
    });
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  });
</script>

<div class="lv lv-scope" bind:this={root} data-short={h > 0 && h < 620 ? '1' : '0'}>
  <div class="col l" style="left:{cols.leftX}px; width:{HERO_COL}px">
    <div class="io-tile">
      <em><Icon name="cpu" size={13} />Compute chiplet</em>
      <b class="io-name">CCD {cc}</b>
      <span>8 cores / 16 threads · 32 MB L3 per CCX</span>
    </div>
    <div class="io-tile">
      <em>Load</em>
      <b class="accent">{fmt(meanLoad)}<i>%</i></b>
      <span>mean of this chiplet's 8 cores</span>
    </div>
    <div class="io-tile">
      <em>Hottest core</em>
      <b>{fmt(hottest?.temp ?? 0)}<i>°C</i></b>
      <span>Core {hottest ? hottest.index + 1 : 1} · CCX {hottest ? ((hottest.index & 7) >> 2) & 1 : 0}</span>
    </div>
    <div class="io-tile">
      <em>Estimated power</em>
      <b>≈ {fmt(watts, 1)}<i>W</i></b>
      <span>the 8 cores together · the package alone is measured</span>
    </div>
    <div class="io-tile">
      <em>Clock</em>
      <b>{clock.toFixed(2)}<i>GHz</i></b>
      <span>average over the 8 cores</span>
    </div>
  </div>

  <div class="hero io-package" style="left:{lay.x}px; top:{lay.y}px; width:{lay.w}px; height:{lay.h}px">
    <svg
      bind:this={svg}
      viewBox="0 0 {CCD.w} {CCD.h}"
      class="pkg-svg"
      role="application"
      aria-label="Compute chiplet CCD {cc}, eight cores in two CCX groups — hover a core to read it, click to open it"
    >
      <rect x="4" y="4" width={CCD.w - 8} height={CCD.h - 8} rx="40" class="pkg" />
      <circle cx="24" cy="24" r="4.5" class="pin" />
      <text x="56" y="29" class="etch">CCD {cc} · COMPUTE CHIPLET · 8 CORES / 16 THREADS</text>
      <text x={CCD.w - 56} y="29" text-anchor="end" class="etch">MOCK LAYOUT · NOT TO SCALE</text>
      <rect x="30" y="40" width={CCD.w - 60} height={CCD.h - 70} rx="26" class="rim" />

      {#each [0, 1] as x (x)}
        {@const p = CCX(x)}
        {@const l3 = l3Cell(x)}
        <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="20" class="panel" />
        <text x={p.x + 20} y={p.y + 30} class="pt">CCX {x}</text>
        <text x={p.x + p.w - 20} y={p.y + 30} text-anchor="end" class="pt2">{fmt(ccxLoad(x))} % mean load</text>
        <g
          onpointerenter={(e) => hoverCard({ title: `L3 cache · CCX ${x}`, sub: '32 MB, shared by the four cores above', rows: [], note: 'Not instrumented in this mock.' }, e)}
          onpointerleave={hoverOut}
        >
          <rect x={l3.x} y={l3.y} width={l3.w} height={l3.h} rx="10" class="block" />
          <text x={l3.x + l3.w / 2} y={l3.y + 21} text-anchor="middle" class="bt">L3 · 32 MB</text>
        </g>
      {/each}

      {#each LOCAL as i (i)}
        {@const cell = coreCell(cc * 8 + i)}
        {@const g = cc * 8 + i}
        {@const c = cores[i]}
        <!-- svelte-ignore a11y_click_events_have_key_events (the cores list on the right is the keyboard way in) -->
        <g
          class="cell"
          class:hot={ov === 'temperature' && c && hottest !== null && c.index === hottest.index}
          transform="translate({cell.x},{cell.y})"
          onpointerenter={(e) => hoverCard(coreCard(i), e)}
          onpointerleave={hoverOut}
          onclick={() => go({ kind: 'core', core: g })}
        >
          <rect width={CORE_CELL} height={CORE_CELL} rx="18" class="body" />
          {#if c}
            {#if ov === 'activity'}
              <rect x="2" y="2" width={(CORE_CELL - 6) / 2} height={CORE_CELL - 4} rx="16" fill={threadColor(i, 0)} />
              <rect x={(CORE_CELL + 2) / 2} y="2" width={(CORE_CELL - 6) / 2} height={CORE_CELL - 4} rx="16" fill={threadColor(i, 1)} />
              <line x1={CORE_CELL / 2} y1="6" x2={CORE_CELL / 2} y2={CORE_CELL - 6} class="smt" />
            {:else}
              <rect x="2" y="2" width={CORE_CELL - 4} height={CORE_CELL - 4} rx="16" fill={overlayColor(ov, 'cpu', val(i))} />
            {/if}
            <text x="16" y="24" class="lbl">CORE {g + 1}</text>
            <text x={CORE_CELL - 16} y="24" text-anchor="end" class="lbl2">T{2 * g} · T{2 * g + 1}</text>
            <rect x={CORE_CELL / 2 - 44} y={CORE_CELL / 2 - 21} width="88" height="42" rx="14" class="tab" />
            <text x={CORE_CELL / 2} y={CORE_CELL / 2 + 10} class="val">{valText(i)}<tspan class="u">{unit}</tspan></text>
            {#if ov === 'activity'}
              <text x="16" y={CORE_CELL - 18} class="lbl2">T{2 * g} {Math.round(threadLoad(tele, g, 0))}%</text>
              <text x={CORE_CELL - 16} y={CORE_CELL - 18} text-anchor="end" class="lbl2">T{2 * g + 1} {Math.round(threadLoad(tele, g, 1))}%</text>
            {:else}
              <rect x="16" y={CORE_CELL - 22} width={CORE_CELL - 32} height="6" rx="3" class="track" />
              <rect x="16" y={CORE_CELL - 22} width={Math.max(6, ((CORE_CELL - 32) * c.load) / 100)} height="6" rx="3" class="load" />
            {/if}
          {/if}
        </g>
      {/each}
    </svg>
    <span class="cap">click a core to open it · the L3 is not instrumented in this mock</span>
  </div>

  <div class="col r" style="left:{cols.rightX}px; top:{cols.rightTop}px; width:{cols.rightW}px">
    <Guide component="cpu" note="per core" k={guide.k} u={guide.u} accent sub={guide.sub} compact />
    <div class="io-tile">
      <em>Cores of CCD {cc}</em>
      <div class="io-list">
        {#each cores as c, i (c.index)}
          <button class="io-row" onclick={() => go({ kind: 'core', core: c.index })} title="Open Core {c.index + 1}">
            <span class="n">Core {c.index + 1}</span>
            <span class="track"><i style="transform: scaleX({(c.load / 100).toFixed(3)})"></i></span>
            <b>{fmt(c.load)} %</b>
          </button>
        {/each}
      </div>
      <span class="io-foot extra">load per core · click a core to open it</span>
    </div>
  </div>
</div>

<style>
  .lv {
    position: absolute;
    inset: 0;
  }
  .col {
    position: absolute;
    bottom: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .col.l {
    top: 16px;
    justify-content: center;
  }
  .col.r {
    justify-content: flex-start;
  }
  .col > :global(.guide) {
    padding: 0 2px;
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

  .hero {
    position: absolute;
  }
  .pkg-svg {
    display: block;
    overflow: visible;
  }
  .panel {
    fill: var(--cpu-die);
    stroke: var(--cpu-line);
    stroke-width: 1.4;
  }
  .pt {
    font: 600 13px var(--font-mono);
    fill: var(--ink2);
    letter-spacing: 0.08em;
    pointer-events: none;
  }
  .pt2 {
    font: 400 12px var(--font-ui);
    fill: var(--ink3);
    pointer-events: none;
  }
  .block {
    fill: var(--panel2);
    stroke: var(--line2);
    stroke-width: 1;
  }
  .bt {
    font: 600 11px var(--font-mono);
    fill: var(--ink3);
    letter-spacing: 0.08em;
    pointer-events: none;
  }

  .cell {
    cursor: pointer;
    outline: none;
  }
  .body {
    fill: none;
    stroke: var(--cpu-line);
    stroke-width: 1.6;
    transition: stroke 100ms ease;
  }
  .cell:hover .body {
    stroke: var(--accent);
    stroke-width: 2.6;
    filter: drop-shadow(0 0 7px var(--accent-glow));
  }
  .cell.hot .body {
    stroke: var(--ink);
  }
  .smt {
    stroke: rgba(0, 0, 0, 0.4);
    stroke-width: 1.5;
    pointer-events: none;
  }
  .lbl {
    font: 600 11px var(--font-mono);
    fill: #fff;
    paint-order: stroke;
    stroke: rgba(0, 0, 0, 0.55);
    stroke-width: 3px;
    letter-spacing: 0.06em;
    pointer-events: none;
  }
  .lbl2 {
    font: 500 10.5px var(--font-mono);
    fill: #fff;
    paint-order: stroke;
    stroke: rgba(0, 0, 0, 0.55);
    stroke-width: 3px;
    pointer-events: none;
  }
  .tab {
    fill: rgba(4, 6, 18, 0.66);
    pointer-events: none;
  }
  .val {
    font: 300 27px var(--font-ui);
    fill: var(--ink);
    text-anchor: middle;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }
  .val .u {
    font-size: 15px;
    font-weight: 500;
    fill: var(--ink2);
  }
  .track {
    fill: rgba(255, 255, 255, 0.18);
    pointer-events: none;
  }
  .load {
    fill: var(--ink);
    opacity: 0.9;
    pointer-events: none;
  }
  .cap {
    position: absolute;
    left: 0;
    right: 0;
    top: calc(100% + 16px);
    text-align: center;
    font-size: 11.5px;
    color: var(--ink3);
    white-space: nowrap;
    pointer-events: none;
  }
</style>
