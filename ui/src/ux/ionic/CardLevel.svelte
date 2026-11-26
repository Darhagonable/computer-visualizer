<script lang="ts">
  /**
   * Graphics chain · level 1 — card. The graphics card fills the lower stage, cooler lifted
   * off the board (the shared GpuCard, with its own hover cards): click the die to open the
   * GPU die, a VRAM chip to open VRAM. A row of KPI tiles and a two-minute history sit above
   * it; identity, VRAM and engines on the left; the reading guide on the right.
   */
  import { app } from '../../mock/store.svelte';
  import GpuCard from '../../scene/GpuCard.svelte';
  import AreaGraph from '../../scene/AreaGraph.svelte';
  import Icon from '../../scene/Icon.svelte';
  import { GPU_CARD } from '../../scene/geometry';
  import { cardLayout, levelWheel, svgPoint, gpuHit, colTop, CARD, type Level, type Target } from './nav';
  import Guide from './Guide.svelte';
  import { overlayOf, fmt, mib, truthOf } from './live';
  import type { Overlay } from '../../mock/telemetry';

  interface Props {
    w: number;
    h: number;
    go: (l: Level) => void;
    down: (t?: Target) => void;
  }
  let { w, h, go, down }: Props = $props();

  const g = $derived(app.tele?.gpu ?? null);
  const ov = $derived<Overlay>(overlayOf(app.mode, 'gpu') ?? 'temperature');
  const lay = $derived(cardLayout(w, h));
  const top = $derived(colTop(h));
  /** The identity column hugs the card; the KPI row and the history band start at the card's left edge and stop short of the mini-map. */
  const colX = $derived(Math.max(24, Math.round(lay.x - 24 - CARD.colW)));
  const bandX = $derived(colX + CARD.colW + 24);
  const bandW = $derived(Math.max(0, (w || 1200) - 340 - bandX));

  const ENGINES = [
    { id: '3d', name: '3D' },
    { id: 'copy', name: 'Copy' },
    { id: 'decode', name: 'Decode' },
    { id: 'encode', name: 'Encode' },
  ] as const;

  const truth = $derived(truthOf(ov, 'gpu'));
  const l3 = $derived(g?.engines['3d'] ?? 0);
  const power = $derived(g?.power ?? 0);
  const limit = $derived(g?.powerLimit ?? 0);
  const temp = $derived(g?.temp ?? 0);
  const vramPct = $derived(g ? (g.vramUsedMiB / g.vramTotalMiB) * 100 : 0);

  const guide = $derived.by(() => {
    if (ov === 'temperature') return { k: fmt(temp), u: '°C', sub: `GPU ${fmt(temp)} °C · hotspot ${fmt(g?.hotspot ?? 0)} °C · both are sensors` };
    if (ov === 'activity') return { k: fmt(l3), u: '%', sub: '3D engine · the other engines are on the left' };
    return { k: fmt(power), u: 'W', sub: `whole board · of a ${fmt(limit)} W limit` };
  });

  let root: HTMLDivElement;
  let svg: SVGSVGElement;
  $effect(() => {
    const onWheel = levelWheel((dir, e) => {
      if (dir < 0) return go({ kind: 'machine' });
      const p = svgPoint(svg, e);
      const hit = gpuHit(p.x, p.y);
      if (hit?.kind === 'vram') down({ vram: true });
      else down();
    });
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  });
</script>

<div class="lv" bind:this={root}>
  <div class="col l" style="left:{colX}px; width:{CARD.colW}px">
    <div class="io-tile">
      <em><Icon name="overview" size={13} />Graphics card</em>
      <b class="io-name">{g?.name ?? 'Graphics card'}</b>
      <span>PCIe 5.0 ×16 · 12 × 2 GB GDDR6X</span>
    </div>
    <button class="io-tile part" onclick={() => go({ kind: 'vram' })} title="Open VRAM">
      <em>VRAM in use</em>
      <b>{fmt(vramPct)}<i>%</i></b>
      <span>{mib(g?.vramUsedMiB ?? 0)} of {mib(g?.vramTotalMiB ?? 0)}</span>
    </button>
    <div class="io-tile">
      <em>Engines</em>
      <div class="io-list">
        {#each ENGINES as e (e.id)}
          <div class="io-row static">
            <span class="n">{e.name}</span>
            <span class="track"><i style="transform: scaleX({((g?.engines[e.id] ?? 0) / 100).toFixed(3)})"></i></span>
            <b>{fmt(g?.engines[e.id] ?? 0)} %</b>
          </div>
        {/each}
      </div>
      <span class="io-foot">utilisation per engine · measured</span>
    </div>
    <div class="io-tile">
      <em>Fans</em>
      <div class="io-list">
        {#each [1, 2] as n (n)}
          <div class="io-row static">
            <span class="n">Fan {n}</span>
            <span class="track"><i style="transform: scaleX({((g?.fanPct ?? 0) / 100).toFixed(3)})"></i></span>
            <b>{fmt(g?.fanRpm ?? 0)} rpm</b>
          </div>
        {/each}
      </div>
      <span class="io-foot">{fmt(g?.fanPct ?? 0)} % · {fmt(g?.memClockMhz ?? 0)} MHz memory</span>
    </div>
  </div>

  <div class="kpi" style="left:{bandX}px; width:{bandW}px">
    <div class="io-tile" class:accent={ov === 'activity'}>
      <em>3D load</em>
      <b>{fmt(l3)}<i>%</i></b>
      <span>copy {fmt(g?.engines.copy ?? 0)} % · video {fmt(g?.engines.decode ?? 0)} % / {fmt(g?.engines.encode ?? 0)} %</span>
    </div>
    <div class="io-tile" class:accent={ov === 'temperature'}>
      <em>Temperature</em>
      <b>{fmt(temp)}<i>°C</i></b>
      <span>hotspot {fmt(g?.hotspot ?? 0)} °C · VRAM {fmt(g?.vramTemp ?? 0)} °C</span>
    </div>
    <div class="io-tile" class:accent={ov === 'power'}>
      <em>Power</em>
      <b>{fmt(power)}<i>W</i></b>
      <span>of {fmt(limit)} W · board, measured</span>
    </div>
    <div class="io-tile">
      <em>Clock</em>
      <b>{fmt(g?.clockMhz ?? 0)}<i>MHz</i></b>
      <span>core · {fmt(g?.memClockMhz ?? 0)} MHz memory</span>
    </div>
  </div>

  <div class="hist" style="left:{bandX}px; width:{bandW}px">
    {#if ov === 'temperature'}
      <AreaGraph values={app.hist.gpuTemp} min={30} max={100} color="var(--c-kernel)" unit="°C" label="gpu temperature · last 2 minutes" />
    {:else}
      <AreaGraph values={app.hist.gpu} max={100} color="var(--c-file)" unit="%" label="3D load · last 2 minutes" />
    {/if}
  </div>

  <div class="hero" style="left:{lay.x}px; top:{lay.y}px; width:{lay.w}px; height:{lay.h}px">
    <svg
      bind:this={svg}
      viewBox="0 0 {GPU_CARD.width} {GPU_CARD.height}"
      class="card-svg"
      role="application"
      aria-label="Graphics card with its cooler lifted off — click the die to open the GPU die, a VRAM chip to open VRAM"
    >
      <GpuCard ondie={() => down()} onvram={() => down({ vram: true })} />
    </svg>
  </div>

  <div class="col r" style="top:{top}px; width:{CARD.colW}px">
    <Guide component="gpu" note="per unit" k={guide.k} u={guide.u} accent sub={guide.sub} compact />
    <div class="io-tile">
      <em>On this card</em>
      <span>colour: the {ov} overlay ({truth})</span>
      <span>VRAM bars: each chip’s share in use</span>
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
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .col.l {
    top: 16px;
    bottom: 16px;
    justify-content: center;
  }
  .col.r {
    right: 24px;
    bottom: 16px;
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

  .kpi {
    position: absolute;
    top: 16px;
    display: flex;
    gap: 12px;
  }
  .kpi .io-tile {
    flex: 1 1 0;
    min-width: 0;
  }
  .kpi .io-tile > span {
    white-space: normal;
    line-height: 1.35;
  }
  .hist {
    position: absolute;
    top: 124px;
    height: 92px;
  }

  .hero {
    position: absolute;
    filter: drop-shadow(0 24px 50px rgba(0, 0, 0, 0.35));
  }
  .card-svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  /* the doors light up in this UX's accent */
  .card-svg :global(.die:hover .substrate) {
    stroke: var(--accent);
    filter: drop-shadow(0 0 6px var(--accent-glow));
  }
  .card-svg :global(.vram:hover .part) {
    stroke: var(--accent);
  }

  @media (max-width: 1340px) {
    .hist {
      display: none;
    }
  }
</style>
