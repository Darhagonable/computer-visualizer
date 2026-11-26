<script lang="ts">
  /**
   * Processor chain · level 3 — core. One core as the hero: its two SMT halves, each
   * showing the load of one thread. The fill follows the mode — per thread in Activity, the
   * core's one sensor in Temperature, its estimated watts in Power. The store keeps no
   * per-core history, so the sparklines feed a short ring buffer that starts when this
   * level opens and says so.
   */
  import { untrack } from 'svelte';
  import { app, hoverCard, hoverOut } from '../mock/store.svelte';
  import { MODE_META, TRUTH, TRUTH_LABEL, type Overlay } from '../mock/telemetry';
  import type { CoreLive } from '../mock/model';
  import Sparkline from '../scene/Sparkline.svelte';
  import Icon from '../scene/Icon.svelte';
  import { coreLayout, heroCols, levelWheel, HERO_COL, CORE, HALF, type Level } from './nav';
  import Guide from './Guide.svelte';
  import { overlayColor, threadLoad, coreValue, overlayOf, truthRow, fmt } from './live';

  interface Props {
    core: number;
    w: number;
    h: number;
    go: (l: Level) => void;
  }
  let { core, w, h, go }: Props = $props();
  // the component is re-created for every location on the chain, so identity is read once
  const idx = untrack(() => core);
  const ccd = idx >> 3;
  const ccx = (idx >> 2) & 1;
  const T = [2 * idx, 2 * idx + 1];
  const CACHES = ['L1I · 32 KB', 'L1D · 48 KB', 'L2 · 1 MB'];

  const cpu = $derived(app.cpu);
  const tele = $derived(app.tele);
  const ov = $derived<Overlay>(overlayOf(app.mode, 'cpu') ?? 'temperature');
  const c = $derived<CoreLive | null>(cpu?.cores[idx] ?? null);
  const lay = $derived(coreLayout(w, h));
  const cols = $derived(heroCols(lay, w, h));

  const value = $derived(c ? coreValue(ov, tele, c) : 0);
  const tLoad = (half: number) => threadLoad(tele, idx, half);
  const fillOf = (half: number) => (ov === 'activity' ? overlayColor('activity', 'cpu', tLoad(half)) : overlayColor(ov, 'cpu', value));
  const watts = $derived(tele?.corePower[idx] ?? 0);

  // ---- a short local history: the store keeps none per core --------------------------------
  const CAP = 120; // a minute at 2 Hz
  let loads = $state<number[]>([]);
  let temps = $state<number[]>([]);
  let wattsHist = $state<number[]>([]);
  $effect(() => {
    void app.version;
    const live = c;
    if (!live) return;
    // untrack: the buffers are only ever written here
    untrack(() => {
      loads.push(live.load);
      temps.push(live.temp);
      wattsHist.push(tele?.corePower[idx] ?? 0);
      if (loads.length > CAP) {
        loads.shift();
        temps.shift();
        wattsHist.shift();
      }
    });
  });
  const samples = $derived(loads.length);
  /** The temperature strip follows the data, so a 2 °C wobble is visible. */
  const tRange = $derived.by(() => {
    if (temps.length < 2) return [30, 100] as [number, number];
    let lo = Infinity;
    let hi = -Infinity;
    for (const t of temps) {
      if (t < lo) lo = t;
      if (t > hi) hi = t;
    }
    return [Math.floor(lo - 1), Math.ceil(hi + 1)] as [number, number];
  });

  const guide = $derived.by(() => {
    if (ov === 'temperature') return { k: fmt(value, 1), u: '°C', sub: 'one sensor for the whole core — both halves' };
    if (ov === 'activity') return { k: fmt(c?.load ?? 0), u: '%', sub: 'each half: the load of one SMT thread' };
    return { k: `≈ ${fmt(value, 2)}`, u: 'W', sub: 'one estimate for the whole core — both halves' };
  });
  const cap = $derived(
    ov === 'activity'
      ? 'each half is one SMT thread’s load, measured'
      : ov === 'temperature'
        ? `both halves: the core’s one sensor · ${fmt(value, 1)} °C, measured`
        : 'both halves: the core’s estimated watts · the package alone is measured',
  );

  /** Everything a thread is, each number with its own truth word. */
  function halfCard(half: number) {
    if (!c) return null;
    return {
      title: `Thread ${T[half]}`,
      sub: `Core ${idx + 1} · SMT sibling of thread ${T[1 - half]}`,
      rows: [
        ...truthRow('activity', 'cpu', tLoad(half), 'scheduler time of this thread'),
        ...truthRow('temperature', 'cpu', c.temp, 'one sensor for the whole core'),
        ...truthRow('power', 'cpu', watts, 'one estimate for the whole core', [0, 10]),
      ],
      note: `what the colour shows: ${MODE_META[ov].label.toLowerCase()} · ${TRUTH_LABEL[TRUTH[ov].cpu]}`,
    };
  }
  const notInstrumented = (title: string, sub: string) => ({ title, sub, rows: [], note: 'Not instrumented in this mock.' });

  let root: HTMLDivElement;
  $effect(() => {
    const onWheel = levelWheel((dir) => {
      if (dir < 0) go({ kind: 'ccd', ccd });
    });
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  });
</script>

<div class="lv lv-scope" bind:this={root} data-short={h > 0 && h < 620 ? '1' : '0'}>
  <div class="col l" style="left:{cols.leftX}px; width:{HERO_COL}px">
    <div class="io-tile">
      <em><Icon name="cpu" size={13} />Core</em>
      <b class="io-name">Core {idx + 1}</b>
      <span>CCD {ccd} · CCX {ccx} · threads {T[0]} / {T[1]}</span>
    </div>
    <div class="io-tile" class:accent={ov === 'temperature'}>
      <em>Temperature</em>
      <b>{c ? c.temp.toFixed(1) : '—'}<i>°C</i></b>
      <span>digital thermal sensor · measured</span>
    </div>
    <div class="io-tile">
      <em>Clock</em>
      <b>{c ? c.freq.toFixed(2) : '—'}<i>GHz</i></b>
      <span>right now</span>
    </div>
    <div class="io-tile" class:accent={ov === 'power'}>
      <em>Estimated power</em>
      <b>≈ {fmt(watts, 2)}<i>W</i></b>
      <span>from load and clock · the package alone is measured</span>
    </div>
  </div>

  <div class="hero io-package" style="left:{lay.x}px; top:{lay.y}px; width:{lay.w}px; height:{lay.h}px">
    <svg viewBox="0 0 {CORE.w} {CORE.h}" class="core-svg" role="application" aria-label="Core {idx + 1}: its two SMT threads — hover a half to read it">
      <rect x="4" y="4" width={CORE.w - 8} height={CORE.h - 8} rx="44" class="pkg" />
      <circle cx="30" cy="30" r="5" class="pin" />
      <text x="64" y="35" class="etch">CORE {idx + 1} · CCD {ccd} · CCX {ccx} · 2 THREADS (SMT)</text>
      <text x={CORE.w - 64} y="35" text-anchor="end" class="etch">MOCK CORE · NOT TO SCALE</text>
      <rect x="44" y="44" width={CORE.w - 88} height={CORE.h - 88} rx="28" class="rim" />

      <g onpointerenter={(e) => hoverCard(notInstrumented('Front-end', 'fetch · decode · rename'), e)} onpointerleave={hoverOut}>
        <rect x="76" y="66" width="408" height="40" rx="12" class="block" />
        <text x="280" y="91" text-anchor="middle" class="bt">front-end · fetch · decode · rename</text>
      </g>

      {#each HALF as hf, half (half)}
        <g
          class="half"
          transform="translate({hf.x},{hf.y})"
          onpointerenter={(e) => hoverCard(halfCard(half), e)}
          onpointerleave={hoverOut}
        >
          <rect width={hf.w} height={hf.h} rx="24" class="hbody" />
          <rect x="2" y="2" width={hf.w - 4} height={hf.h - 4} rx="22" fill={fillOf(half)} />
          <text x="22" y="38" class="lbl">THREAD {T[half]}</text>
          <rect x={hf.w / 2 - 56} y="88" width="112" height="92" rx="24" class="tab" />
          <text x={hf.w / 2} y="152" class="big">{Math.round(tLoad(half))}</text>
          <text x="22" y={hf.h - 52} class="lbl2">load right now</text>
          <rect x="22" y={hf.h - 40} width={hf.w - 44} height="8" rx="4" class="track" />
          <rect x="22" y={hf.h - 40} width={Math.max(8, ((hf.w - 44) * tLoad(half)) / 100)} height="8" rx="4" class="load" />
        </g>
      {/each}

      {#each CACHES as name, i (name)}
        <g onpointerenter={(e) => hoverCard(notInstrumented(`${name.split(' · ')[0]} cache`, name), e)} onpointerleave={hoverOut}>
          <rect x={76 + i * 140} y="430" width="128" height="64" rx="14" class="block" />
          <text x={140 + i * 140} y="466" text-anchor="middle" class="bt">{name}</text>
        </g>
      {/each}
    </svg>
    <span class="cap">{cap}</span>
  </div>

  <div class="col r" style="left:{cols.rightX}px; top:{cols.rightTop}px; width:{cols.rightW}px">
    <Guide component="cpu" note="per core" k={guide.k} u={guide.u} accent sub={guide.sub} compact />
    <div class="io-tile" class:accent={ov === 'activity'}>
      <em>Load per thread</em>
      <div class="io-list">
        {#each T as t, half (t)}
          <div class="io-row static">
            <span class="n">Thread {t}</span>
            <span class="track"><i style="transform: scaleX({(tLoad(half) / 100).toFixed(3)})"></i></span>
            <b>{fmt(tLoad(half))} %</b>
          </div>
        {/each}
      </div>
      <span class="io-foot">scheduler time per thread · measured</span>
    </div>
    <div class="io-tile">
      <em>Since you opened this core</em>
      <div class="io-spark">
        <span>load</span><Sparkline values={loads} max={100} color="var(--accent)" width={112} height={26} /><b>{fmt(c?.load ?? 0)} %</b>
      </div>
      <div class="io-spark">
        <span>temperature</span><Sparkline values={temps} min={tRange[0]} max={tRange[1]} color="var(--c-kernel)" width={112} height={26} /><b>{fmt(c?.temp ?? 0, 1)} °C</b>
      </div>
      <div class="io-spark">
        <span>power</span><Sparkline values={wattsHist} min={0} max={Math.max(6, ...wattsHist)} color="var(--c-pagefile)" width={112} height={26} /><b>≈ {fmt(watts, 2)} W</b>
      </div>
      <span class="io-foot extra">{samples ? `${(samples / 2).toFixed(0)} s recorded here` : 'recording…'} · the store keeps no per-core history</span>
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
  /* a sparkline row: label · line · value */
  .io-spark {
    display: grid;
    grid-template-columns: 76px minmax(0, 1fr) 62px;
    align-items: center;
    gap: 10px;
    height: 30px;
    font-size: 11.5px;
    color: var(--ink3);
  }
  .io-spark :global(svg) {
    display: block;
    justify-self: stretch;
  }
  .io-spark b {
    font: 500 11.5px var(--font-mono);
    color: var(--ink);
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .hero {
    position: absolute;
  }
  .core-svg {
    display: block;
    overflow: visible;
  }
  .block {
    fill: var(--panel2);
    stroke: var(--line2);
    stroke-width: 1;
  }
  .bt {
    font: 600 11.5px var(--font-mono);
    fill: var(--ink3);
    letter-spacing: 0.08em;
    pointer-events: none;
  }
  .half {
    outline: none;
  }
  .hbody {
    fill: none;
    stroke: var(--cpu-line);
    stroke-width: 1.6;
    transition: stroke 100ms ease;
    pointer-events: none;
  }
  .half:hover .hbody {
    stroke: var(--accent);
    stroke-width: 2.4;
    filter: drop-shadow(0 0 8px var(--accent-glow));
  }
  .lbl {
    font: 600 13px var(--font-mono);
    fill: #fff;
    paint-order: stroke;
    stroke: rgba(0, 0, 0, 0.55);
    stroke-width: 3.5px;
    letter-spacing: 0.08em;
    pointer-events: none;
  }
  .lbl2 {
    font: 500 11.5px var(--font-ui);
    fill: #fff;
    paint-order: stroke;
    stroke: rgba(0, 0, 0, 0.55);
    stroke-width: 3.5px;
    pointer-events: none;
  }
  .tab {
    fill: rgba(4, 6, 18, 0.66);
    pointer-events: none;
  }
  .big {
    font: 300 62px var(--font-ui);
    fill: var(--ink);
    text-anchor: middle;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }
  .track {
    fill: rgba(255, 255, 255, 0.2);
    pointer-events: none;
  }
  .load {
    fill: var(--ink);
    opacity: 0.92;
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
