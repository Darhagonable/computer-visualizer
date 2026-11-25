<script lang="ts">
  /**
   * UX A · Instrument — a cockpit. Four fixed zones:
   *   rail (navigate by resource) · stage (the scene) · inspector (follows the selection) · telemetry strip
   * Nothing to drill into: one click per scene, zoom/pan inside the stage.
   */
  import { app, toggleRunning } from '../../mock/store.svelte';
  import { fmtMiB } from '../../mock/model';
  import Icon from '../../scene/Icon.svelte';
  import Inspector from './Inspector.svelte';
  import OverviewScene from './OverviewScene.svelte';
  import MemoryScene from './MemoryScene.svelte';
  import CpuScene from './CpuScene.svelte';
  import AppsScene from './AppsScene.svelte';

  type SceneId = 'overview' | 'memory' | 'cpu' | 'apps';
  const initialScene = (): SceneId => {
    const s = new URLSearchParams(location.search).get('scene');
    return s === 'overview' || s === 'cpu' || s === 'apps' ? s : 'memory';
  };
  let scene = $state<SceneId>(initialScene());

  const NAV: { id: SceneId; label: string; icon: string; sub: string }[] = [
    { id: 'overview', label: 'Overview', icon: 'overview', sub: 'The whole machine at a glance' },
    { id: 'memory', label: 'Memory', icon: 'memory', sub: 'Physical pages across every DIMM and chip' },
    { id: 'cpu', label: 'Processor', icon: 'cpu', sub: 'Package, chiplets, per-core telemetry' },
    { id: 'apps', label: 'Apps', icon: 'apps', sub: 'Which process owns which pages' },
  ];
  const current = $derived(NAV.find((n) => n.id === scene) ?? NAV[1]);
  const st = $derived(app.stats);
  const cpu = $derived(app.cpu);
  const hz = $derived((1000 / app.tickMs).toFixed(1000 % app.tickMs ? 1 : 0));
  const pct = (n: number | undefined) => (st && n !== undefined ? ((n / st.total) * 100).toFixed(0) : '0');
  const go = (id: SceneId) => (scene = id);

  // stacked usage bar: active / modified / standby / free+zeroed
  const segs = $derived(
    st
      ? [
          { w: st.byState[4], c: 'var(--c-private)' },
          { w: st.byState[3], c: 'var(--c-modified)' },
          { w: st.byState[2], c: 'color-mix(in srgb, var(--c-private) 34%, transparent)' },
          { w: st.byState[1] + st.byState[0], c: 'var(--c-free)' },
        ]
      : [],
  );
</script>

<div class="ux">
  <nav class="rail" aria-label="Sections">
    <div class="logo" title="Computer Visualizer"><i></i><i></i><i></i><i></i></div>
    {#each NAV as n (n.id)}
      <button class="nav" class:active={scene === n.id} onclick={() => go(n.id)} title={n.sub}>
        <Icon name={n.icon} size={20} />
        <span>{n.label}</span>
      </button>
    {/each}
    <div class="grow"></div>
    <button class="nav halt" class:on={!app.running} onclick={toggleRunning} title="Pause / resume (Space)">
      <Icon name={app.running ? 'pause' : 'play'} size={18} />
      <span>{app.running ? 'pause' : 'run'}</span>
    </button>
  </nav>

  <main class="stage">
    <header class="head">
      <div class="titles">
        <h1>{current.label}</h1>
        <p>{current.sub}</p>
      </div>
      <div class="badges">
        <span class="badge mock">mock data</span>
        <span class="badge" title="Which chip a page lives in is modeled — the OS does not expose the memory controller's interleave map.">
          placement: modeled
        </span>
        <span class="badge live" class:paused={!app.running}>{app.running ? 'live' : 'paused'} · {hz} Hz</span>
      </div>
    </header>
    <section class="scene">
      {#if scene === 'overview'}
        <OverviewScene onnavigate={go} />
      {:else if scene === 'memory'}
        <MemoryScene />
      {:else if scene === 'cpu'}
        <CpuScene />
      {:else}
        <AppsScene />
      {/if}
    </section>
  </main>

  <aside class="inspector">
    <Inspector />
  </aside>

  <footer class="tele">
    <span class="segbar">{#each segs as s, i (i)}<i style="width:{st ? (s.w / st.total) * 100 : 0}%; background: {s.c}"></i>{/each}</span>
    <span class="t"><em>mem in use</em><b>{pct(st?.inUse)}%</b></span>
    <span class="t"><em>active</em><b>{pct(st?.byState[4])}%</b></span>
    <span class="t"><em>standby</em><b>{pct(st?.byState[2])}%</b></span>
    <span class="t"><em>modified</em><b>{pct(st?.byState[3])}%</b></span>
    <span class="t"><em>free</em><b>{pct(st ? st.byState[1] + st.byState[0] : undefined)}%</b></span>
    <span class="div"></span>
    <span class="t"><em>cpu</em><b>{cpu ? cpu.avgLoad.toFixed(0) : 0}%</b></span>
    <span class="t"><em>hottest core</em><b>{cpu ? cpu.maxTemp.toFixed(0) : '–'}°C</b></span>
    <span class="t"><em>package</em><b>{cpu ? cpu.power.toFixed(0) : '–'} W</b></span>
    <span class="grow"></span>
    <span class="t right"><em>tick</em><b class="num">{app.tick}</b><em>{st ? fmtMiB(st.total) : ''} mapped</em></span>
  </footer>
</div>

<style>
  .ux {
    height: 100%;
    display: grid;
    grid-template-columns: 84px minmax(0, 1fr) 340px;
    grid-template-rows: minmax(0, 1fr) 36px;
    grid-template-areas:
      'rail stage insp'
      'tele tele tele';
    background: var(--bg);
    color: var(--ink);
  }
  .rail {
    grid-area: rail;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 8px 10px;
    border-right: 1px solid var(--line);
    background: var(--bg2);
  }
  .logo {
    display: grid;
    grid-template-columns: repeat(2, 7px);
    gap: 2px;
    justify-content: center;
    margin-bottom: 12px;
  }
  .logo i {
    width: 7px;
    height: 7px;
    border-radius: 2px;
    background: var(--accent);
    opacity: 0.35;
  }
  .logo i:first-child {
    opacity: 1;
  }
  .nav {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 10px 4px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--ink3);
    font: 500 10.5px var(--font-ui);
    transition: color 120ms ease, background 120ms ease;
  }
  .nav:hover {
    color: var(--ink2);
    background: var(--panel);
  }
  .nav.active {
    color: var(--ink);
    background: var(--panel2);
  }
  .nav.active::before {
    content: '';
    position: absolute;
    left: -8px;
    top: 10px;
    bottom: 10px;
    width: 2px;
    border-radius: 2px;
    background: var(--accent);
  }
  .nav.halt.on {
    color: var(--warn);
  }
  .grow {
    flex: 1;
  }
  .stage {
    grid-area: stage;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  .head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 24px 12px 24px;
    padding-right: calc(var(--chrome-safe) + 12px);
  }
  h1 {
    font: 300 24px / 1.1 var(--font-ui);
    letter-spacing: -0.01em;
  }
  .titles p {
    margin-top: 3px;
    color: var(--ink3);
    font-size: 12px;
  }
  .badges {
    display: flex;
    gap: 6px;
    align-items: center;
    padding-bottom: 3px;
  }
  .badge {
    padding: 2px 8px;
    border-radius: 9px;
    border: 1px solid var(--line2);
    color: var(--ink3);
    font: 500 10px var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    white-space: nowrap;
  }
  .badge.mock {
    color: var(--warn);
    border-color: color-mix(in srgb, var(--warn) 55%, transparent);
  }
  .badge.live {
    color: var(--good);
  }
  .badge.live.paused {
    color: var(--ink3);
  }
  .scene {
    flex: 1;
    min-height: 0;
    padding: 0 24px 16px;
    display: flex;
    flex-direction: column;
  }
  .inspector {
    grid-area: insp;
    min-height: 0;
    border-left: 1px solid var(--line);
    background: var(--bg2);
  }
  .tele {
    grid-area: tele;
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 0 16px 0 24px;
    border-top: 1px solid var(--line);
    background: var(--bg2);
    font: 400 11px var(--font-mono);
    white-space: nowrap;
    overflow: hidden;
  }
  .segbar {
    display: flex;
    width: 150px;
    height: 6px;
    border-radius: 3px;
    overflow: hidden;
    background: var(--c-free);
    flex: none;
  }
  .segbar i {
    display: block;
    height: 100%;
  }
  .t em {
    font-style: normal;
    color: var(--ink3);
    margin-right: 5px;
  }
  .t b {
    font-weight: 600;
    color: var(--ink);
  }
  .div {
    width: 1px;
    height: 14px;
    background: var(--line2);
  }
  .t.right em:last-child {
    margin-left: 6px;
  }
  @media (max-width: 1180px) {
    .ux {
      grid-template-columns: 72px minmax(0, 1fr);
      grid-template-areas:
        'rail stage'
        'tele tele';
    }
    .inspector {
      display: none;
    }
  }
  @media (max-width: 900px) {
    .t:nth-of-type(n + 6) {
      display: none;
    }
  }
</style>
