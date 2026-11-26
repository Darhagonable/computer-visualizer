<script lang="ts">
  /**
   * UX A · Instrument — a cockpit. Four fixed zones:
   *   rail (navigate by resource) · stage (the scene) · inspector (follows the selection) · telemetry strip
   * Nothing to drill into: one click per scene, zoom/pan inside the stage.
   *
   * The stage header has two rows: the scene and its badges, then what the colours mean —
   * the global mode switch and the reading guide of whatever the scene paints.
   */
  import { app, toggleRunning, setHighlight } from '../../mock/store.svelte';
  import { fmtMiB } from '../../mock/model';
  import Icon from '../../scene/Icon.svelte';
  import Inspector from './Inspector.svelte';
  import OverviewScene from './OverviewScene.svelte';
  import MemoryScene from './MemoryScene.svelte';
  import CpuScene from './CpuScene.svelte';
  import GpuScene from './GpuScene.svelte';
  import AppsScene from './AppsScene.svelte';
  import StageToolbar from './StageToolbar.svelte';
  import PinChip from './PinChip.svelte';
  import GpuGlyph from './GpuGlyph.svelte';
  import type { Overlay } from '../../mock/telemetry';
  import { SCENES, sceneFromUrl, type SceneId } from './scenes';
  import { GPU_NOTE, GPU_POWER_NOTE, GPU_UNIT_POWER, partFromKey, pin, sample, unpin } from './selection.svelte';

  let scene = $state<SceneId>(sceneFromUrl());
  // `?pick=core:5 | ccd:0 | gpu | card | vram:3` — open with a part pinned (screenshots, tours)
  const preset = partFromKey(new URLSearchParams(location.search).get('pick') ?? '');
  if (preset) pin(preset);

  let vh = $state(0);
  /** Short viewports: the overview drops its page legend rather than its lists. */
  const short = $derived(vh > 0 && vh < 800);

  const current = $derived(SCENES.find((n) => n.id === scene) ?? SCENES[1]);
  const st = $derived(app.stats);
  const cpu = $derived(app.cpu);
  const gpu = $derived(app.tele?.gpu ?? null);
  const hz = $derived((1000 / app.tickMs).toFixed(1000 % app.tickMs ? 1 : 0));
  const pct = (n: number | undefined) => (st && n !== undefined ? ((n / st.total) * 100).toFixed(0) : '0');

  function go(id: SceneId) {
    if (id !== scene) unpin(); // a pinned core or chip belongs to the scene it was clicked on
    scene = id;
  }

  /**
   * The note beside the memory scale says where the per-cell numbers come from — which differs
   * per overlay, so the note has to follow the mode. It must never contradict the truth label
   * next to it: activity is modelled (no OS exposes per-page access) and DIMMs have no power
   * sensor at all.
   */
  const MEM_NOTE: Record<Overlay, string> = {
    temperature: 'per block · estimated from the module sensor + activity',
    activity: 'per block · modelled from page churn',
    power: 'per block · estimated from activity',
  };
  const overlay = $derived<Overlay>(app.mode === 'pages' ? 'temperature' : app.mode);
  const memNote = $derived(MEM_NOTE[overlay]);
  const gpuNote = $derived(overlay === 'power' ? GPU_POWER_NOTE : GPU_NOTE);
  const gpuDomain = $derived(overlay === 'power' ? GPU_UNIT_POWER : undefined);
  // the page highlight only shows on the Memory board, and only in "pages" mode
  const hl = $derived(scene === 'memory' && app.mode === 'pages' ? app.highlight : null);
  const hlLabel = $derived.by(() => {
    if (!hl) return '';
    if (hl.kind === 'owner') return 'one owner';
    if (hl.kind === 'state') return 'one page state';
    return 'one use class';
  });

  // one sample per tick for the sparkline of the pinned part
  $effect(() => {
    void app.version;
    sample();
  });

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

<svelte:window bind:innerHeight={vh} />

<div class="ux">
  <nav class="rail" aria-label="Sections">
    <div class="logo" title="Computer Visualizer"><i></i><i></i><i></i><i></i></div>
    {#each SCENES as n (n.id)}
      <button class="nav" class:active={scene === n.id} onclick={() => go(n.id)} title={n.sub} aria-current={scene === n.id ? 'page' : undefined}>
        {#if n.icon === 'gpu'}
          <GpuGlyph size={20} />
        {:else}
          <Icon name={n.icon} size={20} />
        {/if}
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
      <div class="titlerow">
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
      </div>

      {#if current.component}
        {@const component = current.component}
        <StageToolbar
          {component}
          scale={scene === 'overview' ? (short ? 'never' : 'pages') : 'always'}
          note={component === 'gpu' ? gpuNote : component === 'memory' ? memNote : 'per core'}
          domain={component === 'gpu' ? gpuDomain : undefined}
        >
          {#if scene === 'overview' && app.mode === 'pages'}
            <span class="hint">no pages on the processor or the GPU — both are coloured by temperature</span>
          {/if}
          {#if hl}
            <span class="hl">highlighting · {hlLabel}</span>
            <button class="clear" onclick={() => setHighlight(null)} title="Clear highlight (Esc)">clear ✕</button>
          {/if}
          {#if scene === 'cpu' || scene === 'gpu'}
            <PinChip />
          {/if}
        </StageToolbar>
      {/if}
    </header>
    <section class="scene">
      {#if scene === 'overview'}
        <OverviewScene onnavigate={go} />
      {:else if scene === 'memory'}
        <MemoryScene />
      {:else if scene === 'cpu'}
        <CpuScene />
      {:else if scene === 'gpu'}
        <GpuScene />
      {:else}
        <AppsScene onnavigate={go} />
      {/if}
    </section>
  </main>

  <aside class="inspector">
    <Inspector onnavigate={go} />
  </aside>

  <footer class="tele">
    <div class="left">
      <span class="segbar">{#each segs as s, i (i)}<i style="width:{st ? (s.w / st.total) * 100 : 0}%; background: {s.c}"></i>{/each}</span>
      <span class="t"><em>mem in use</em><b>{pct(st?.inUse)}%</b></span>
      <span class="t l3"><em>active</em><b>{pct(st?.byState[4])}%</b></span>
      <span class="t l2"><em>standby</em><b>{pct(st?.byState[2])}%</b></span>
      <span class="t l1"><em>modified</em><b>{pct(st?.byState[3])}%</b></span>
      <span class="t l1"><em>free</em><b>{pct(st ? st.byState[1] + st.byState[0] : undefined)}%</b></span>
      <span class="div"></span>
      <span class="t"><em>cpu</em><b>{cpu ? cpu.avgLoad.toFixed(0) : 0}%</b></span>
      <span class="t l2"><em>hottest core</em><b>{cpu ? cpu.maxTemp.toFixed(0) : '–'}°C</b></span>
      <span class="t l3"><em>package</em><b>{cpu ? cpu.power.toFixed(0) : '–'} W</b></span>
      <span class="div l3"></span>
      <span class="t"><em>gpu</em><b>{gpu ? gpu.engines['3d'].toFixed(0) : 0}%</b></span>
      <span class="t l3"><em>gpu temp</em><b>{gpu ? gpu.temp.toFixed(0) : '–'}°C</b></span>
      <span class="t l2"><em>gpu power</em><b>{gpu ? gpu.power.toFixed(0) : '–'} W</b></span>
    </div>
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
    padding: 18px 24px 12px;
  }
  /* the floating controls own the top-right corner: the title row stops short of it,
     the row below it is already clear of them */
  .titlerow {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    padding-right: calc(var(--chrome-safe) - 12px);
  }
  h1 {
    font: 300 24px / 1.1 var(--font-ui);
    letter-spacing: -0.01em;
  }
  .titles {
    min-width: 0;
  }
  .titles p {
    margin-top: 3px;
    color: var(--ink3);
    font-size: 12px;
    /* two lines at most, so a narrow stage cannot stack the header up */
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
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
  .hl {
    font: 500 11px var(--font-mono);
    color: var(--accent);
  }
  .hint {
    color: var(--ink3);
    font-size: 11.5px;
  }
  .clear {
    height: 24px;
    padding: 0 10px;
    border-radius: 6px;
    border: 1px solid var(--line2);
    background: var(--panel);
    color: var(--ink2);
    font-size: 11.5px;
  }
  .clear:hover {
    color: var(--ink);
    border-color: var(--ink3);
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
    justify-content: space-between;
    gap: 16px;
    padding: 0 16px 0 24px;
    border-top: 1px solid var(--line);
    background: var(--bg2);
    font: 400 11px var(--font-mono);
    white-space: nowrap;
    overflow: hidden;
  }
  /* readings flow from the left; the tick block is pinned to the right and never pushed out */
  .left {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 16px;
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
    flex: none;
  }
  .t.right {
    flex: none;
  }
  .t.right {
    flex: none;
  }
  .t.right b {
    margin-right: 8px;
  }
  @media (max-width: 1429px) {
    .l1 {
      display: none;
    }
  }
  @media (max-width: 1279px) {
    .l2 {
      display: none;
    }
  }
  @media (max-width: 979px) {
    .l3 {
      display: none;
    }
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
</style>
