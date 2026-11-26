<script lang="ts">
  /**
   * Processor chain · level 1 — package. The delidded processor fills the stage: two compute
   * chiplets and the I/O die, every core coloured by the mode. It is the shared CpuDie, so
   * hovering a chiplet or a core explains it; clicking a chiplet opens it, so does clicking
   * a core. The tiles either side carry the package's numbers and the reading guide.
   */
  import { app } from '../mock/store.svelte';
  import CpuDie from '../scene/CpuDie.svelte';
  import AreaGraph from '../scene/AreaGraph.svelte';
  import Icon from '../scene/Icon.svelte';
  import { CPU_DIE } from '../scene/geometry';
  import { packageLayout, heroCols, levelWheel, svgPoint, cpuHit, HERO_COL, type Level, type Target } from './nav';
  import Guide from './Guide.svelte';
  import { hottestCore, ccdCores, avgClock, overlayOf, fmt } from './live';
  import type { CoreLive } from '../mock/model';

  interface Props {
    w: number;
    h: number;
    go: (l: Level) => void;
    down: (t?: Target) => void;
  }
  let { w, h, go, down }: Props = $props();

  const cpu = $derived(app.cpu);
  const tele = $derived(app.tele);
  const ov = $derived(overlayOf(app.mode, 'cpu'));
  const lay = $derived(packageLayout(w, h));
  const cols = $derived(heroCols(lay, w, h));

  const cores = $derived(cpu?.cores ?? []);
  const load = $derived(cpu?.avgLoad ?? 0);
  const power = $derived(cpu?.power ?? 0);
  const hot = $derived(hottestCore(cpu));
  const clock = $derived(avgClock(cores));
  const coreWatts = $derived(cores.reduce((s, c) => s + (tele?.corePower[c.index] ?? 0), 0));

  /** Per chiplet: its mean load and its hottest core. */
  const chips = $derived.by(() =>
    [0, 1].map((c) => {
      const cs = ccdCores(cpu, c);
      const hottest = cs.reduce<CoreLive | null>((a, x) => (!a || x.temp > a.temp ? x : a), null);
      return { ccd: c, load: cs.length ? cs.reduce((s, x) => s + x.load, 0) / cs.length : 0, temp: hottest?.temp ?? 0, hotCore: hottest?.index ?? 0 };
    }),
  );

  const guide = $derived.by(() => {
    if (ov === 'temperature') return { k: fmt(hot?.temp ?? 0), u: '°C', sub: `hottest core: Core ${hot ? hot.index + 1 : 1}, on CCD ${hot ? hot.ccd : 0}` };
    if (ov === 'activity') return { k: fmt(load), u: '%', sub: 'mean over 16 cores · one half per thread' };
    return { k: `≈ ${fmt(coreWatts, 1)}`, u: 'W', sub: `the cores add up to ≈ ${fmt(coreWatts, 1)} W of ${fmt(power)} W measured` };
  });

  let root: HTMLDivElement;
  let svg: SVGSVGElement;
  $effect(() => {
    const onWheel = levelWheel((dir, e) => {
      if (dir < 0) return go({ kind: 'machine' });
      const p = svgPoint(svg, e);
      const hit = cpuHit(p.x, p.y);
      if (hit?.kind === 'core') down({ core: hit.i });
      else if (hit?.kind === 'ccd') down({ ccd: hit.i });
      else down();
    });
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  });
</script>

<div class="lv lv-scope" bind:this={root} data-short={h > 0 && h < 620 ? '1' : '0'}>
  <div class="col l" style="left:{cols.leftX}px; width:{HERO_COL}px">
    <div class="io-tile">
      <em><Icon name="cpu" size={13} />Processor</em>
      <b class="io-name">Mock 16-core</b>
      <span>2 compute chiplets + I/O die · generic layout</span>
    </div>
    <div class="io-tile">
      <em>Load</em>
      <b class="accent">{fmt(load)}<i>%</i></b>
      <span>16 cores / 32 threads</span>
    </div>
    <div class="io-tile">
      <em>Hottest core</em>
      <b>{fmt(hot?.temp ?? 0)}<i>°C</i></b>
      <span>Core {hot ? hot.index + 1 : 1} · CCD {hot ? hot.ccd : 0}</span>
    </div>
    <div class="io-tile">
      <em>Package power</em>
      <b>{fmt(power)}<i>W</i></b>
      <span>measured · the cores add up to ≈ {fmt(coreWatts, 1)} W</span>
    </div>
    <div class="io-tile">
      <em>Clock</em>
      <b>{clock.toFixed(2)}<i>GHz</i></b>
      <span>average over 16 cores</span>
    </div>
  </div>

  <div class="hero" style="left:{lay.x}px; top:{lay.y}px; width:{lay.w}px; height:{lay.h}px">
    <svg
      bind:this={svg}
      viewBox="0 0 {CPU_DIE.width} {CPU_DIE.height}"
      class="die-svg"
      role="application"
      aria-label="Processor package, delidded — hover a chiplet or a core to read it, click to open it"
    >
      <CpuDie onccd={(c) => go({ kind: 'ccd', ccd: c })} oncore={(i) => go({ kind: 'core', core: i })} />
    </svg>
  </div>

  <div class="col r" style="left:{cols.rightX}px; top:{cols.rightTop}px; width:{cols.rightW}px">
    <Guide component="cpu" note="per core" k={guide.k} u={guide.u} accent sub={guide.sub} compact />
    <div class="io-tile">
      <em>Chiplets</em>
      <div class="io-list">
        {#each chips as c (c.ccd)}
          <button class="io-row" onclick={() => go({ kind: 'ccd', ccd: c.ccd })} title="Open CCD {c.ccd}">
            <span class="n">CCD {c.ccd}</span>
            <span class="track"><i style="transform: scaleX({(c.load / 100).toFixed(3)})"></i></span>
            <b>{fmt(c.load)} %</b>
          </button>
        {/each}
        <div class="io-row static dim" title="The I/O die (memory controller, PCIe, USB) is not instrumented in this mock">
          <span class="n">I/O die</span>
          <span class="track"></span>
          <b>—</b>
        </div>
      </div>
      <span class="io-foot">mean load per chiplet · click a chiplet to open it</span>
    </div>
    <div class="io-tile extra">
      <em>Last 2 minutes</em>
      <div class="graph"><AreaGraph values={app.hist.cpu} max={100} color="var(--accent)" unit="%" label="load" /></div>
      <div class="graph"><AreaGraph values={app.hist.temp} min={30} max={100} color="var(--c-kernel)" unit="°C" label="hottest core" /></div>
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
  .static {
    cursor: default;
  }
  .static :global(.track) {
    background: repeating-linear-gradient(90deg, var(--line2) 0 3px, transparent 3px 7px);
  }
  .graph {
    height: 58px;
    margin-top: 8px;
  }

  .hero {
    position: absolute;
    filter: drop-shadow(0 24px 50px rgba(0, 0, 0, 0.35));
  }
  .die-svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  /* the doors light up in this UX's accent */
  .die-svg :global(.core:hover .core-body) {
    stroke: var(--accent);
    filter: drop-shadow(0 0 5px var(--accent-glow));
  }
  .die-svg :global(.ccd:hover .ccd-body) {
    stroke: var(--accent);
  }

  @media (max-width: 1180px) {
    .col.l {
      width: 230px;
    }
  }
</style>
