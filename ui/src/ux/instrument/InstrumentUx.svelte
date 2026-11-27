<script lang="ts">
  /**
   * UX A · Instrument — a cockpit. Fixed zones:
   *   side menu (the six sections; a logo above, pause at the foot)
   *   stage (a header with the title, the badges and the mode row, then the view)
   *   inspector (follows the hover and the pins, beside this UX's own views)
   *   telemetry strip.
   *
   * The stage hosts the shared part views. A section lands on one of Instrument's own scenes
   * where it has one — Overview, Memory, Processor, Graphics, Applications (`own` below) — and
   * a part clicked there opens the shared view of that part: a module, a die, a block, a
   * chiplet, a core, the GPU die, VRAM. Storage is the shared drives view from the start: the
   * cockpit has no scene of its own for it. Esc / Backspace climb back out one level at a time.
   *
   * The stage header's second row is the mode row: what the colours mean. On an own view it is
   * the one reading guide on stage; on a shared part view it is only the switch, because every
   * part view carries its own guides.
   */
  import { untrack } from 'svelte';
  import { app, getMachine, selectDimm, toggleRunning, setHighlight } from '../../mock/store.svelte';
  import { fmtMiB } from '../../mock/model';
  import type { DriveLive, Overlay } from '../../mock/telemetry';
  import Icon from '../../scene/Icon.svelte';
  import { LevelNav } from '../../levels/nav.svelte';
  import PartView from '../../levels/PartView.svelte';
  import { PART, crumbsOf, keyOf, sectionOf, type Kind, type Level } from '../../levels/nav';
  import { SECTIONS, sectionLevel } from '../../shell/sections';
  import SideMenu from '../../shell/SideMenu.svelte';
  import ModeRow from '../../shell/ModeRow.svelte';
  import Inspector from './Inspector.svelte';
  import OverviewScene from './OverviewScene.svelte';
  import MemoryScene from './MemoryScene.svelte';
  import CpuScene from './CpuScene.svelte';
  import GpuScene from './GpuScene.svelte';
  import AppsScene from './AppsScene.svelte';
  import PinChip from './PinChip.svelte';
  import { SCENE_SUB, startLevel } from './scenes';
  import { GPU_NOTE, GPU_POWER_NOTE, GPU_UNIT_POWER, partFromKey, pin, sample, unpin } from './selection.svelte';

  // ---- where the page opens -----------------------------------------------------------------

  const m = getMachine();
  const query = new URLSearchParams(location.search);
  // once, at the top level of the script: creating it writes to the store,
  // which is not allowed inside a $derived or a template
  const nav = untrack(() => new LevelNav(startLevel(m)));
  // `?pick=core:5 | ccd:0 | gpu | card | vram:3` — open with a part pinned (screenshots, tours)
  const preset = partFromKey(query.get('pick') ?? '');
  if (preset) pin(preset);
  // `?demo=dimm` selects a module for the inspector; the navigation's start-up (at the root:
  // no module) would clear it again
  if (query.get('demo') === 'dimm') selectDimm(0);

  // ---- what is on stage ---------------------------------------------------------------------

  /** The levels Instrument shows its own way: its scenes, where the sections land. */
  const OWN: Partial<Record<Kind, true>> = { machine: true, memory: true, package: true, card: true, apps: true };
  const kind = $derived(nav.level.kind);
  const mine = $derived(OWN[kind] === true);

  const section = $derived(sectionOf(nav.level));
  const sectionName = $derived(SECTIONS.find((s) => s.id === section)?.label ?? '');
  /** The trail to a shared part view: Machine › DIMM_A1 › Die 3. The root is this UX's Overview. */
  const crumbs = $derived(mine ? [] : crumbsOf(nav.level, m));
  const title = $derived(mine ? sectionName : (crumbs.at(-1)?.label ?? ''));
  const sub = $derived(mine ? (SCENE_SUB[section] ?? '') : `${crumbs.at(-1)?.hint ?? ''} · Esc goes up one level`);
  /** On a very short viewport only this much of a part view's line fits beside the switch; the rest is the title's tooltip. */
  const ESC_HINT = 'Esc goes up one level';

  let vw = $state(0);
  let vh = $state(0);
  /** Short viewports: the overview drops its page legend rather than its lists. */
  const short = $derived(vh > 0 && vh < 800);
  /**
   * Very short viewports: the header gives up its subtitle line (it stays in the title's
   * tooltip) and its margins — every pixel goes to the view.
   */
  const brief = $derived(vh > 0 && vh < 700);
  // ---- the room the window has (measured: the menu's forms are 556 / 448 px for six rows) --------
  /** Below this width there is no room for an inspector. */
  const NARROW = 1180;
  const INSPECTOR = 340;
  /** The scene's margins either side (a shared part view keeps its own). */
  const MARGIN = 48;
  /** The logo above the menu, the pause row at its foot, and the strip below everything. */
  const LOGO = 44;
  const FOOT = 48 + 10;
  const STRIP = 36;
  /** stack  88 × 556 — closest to the rail the cockpit had, with names; list 256 × 310, in a 280 px column; rail 64 × 448 */
  const STACK_W = 88;
  const LIST_W = 280;
  const RAIL_W = 64;
  const hasInspector = $derived(vw > NARROW);
  /**
   * The side menu's form, from the room the rail has (UX-GUIDE.md, "Choosing a form is about the
   * stage, not the menu"):
   *   list   only where the stage keeps a full 960 px beside it, with the inspector;
   *   rail   where the stack's 556 px of rows do not fit between the logo and the pause button,
   *          and where there is no inspector and the stage needs every px of width;
   *   stack  everywhere else.
   */
  const menu = $derived(vw >= LIST_W + INSPECTOR + MARGIN + 960 ? 'list' : vh < LOGO + 556 + 2 + FOOT + STRIP || !hasInspector ? 'rail' : 'stack');
  const menuW = $derived(menu === 'list' ? LIST_W : menu === 'stack' ? STACK_W : RAIL_W);

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
  const component = $derived(PART[kind]);
  const note = $derived(component === 'gpu' ? (overlay === 'power' ? GPU_POWER_NOTE : GPU_NOTE) : component === 'memory' ? MEM_NOTE[overlay] : 'per core');
  const domain = $derived(component === 'gpu' && overlay === 'power' ? GPU_UNIT_POWER : undefined);
  /**
   * What the mode row states. Instrument's own scenes are the one guide on stage (the overview
   * shows several components, each with its own caption, so only the page legend belongs in the
   * row; its processes paint nothing, so the row is the switch alone). A shared part view
   * carries its own guides: there the row is the switch alone too.
   */
  const scale = $derived<'always' | 'pages' | 'never'>(kind === 'machine' ? (short ? 'never' : 'pages') : mine && kind !== 'apps' ? 'always' : 'never');
  // the page highlight only shows on the Memory board, and only in "pages" mode
  const hl = $derived(kind === 'memory' && app.mode === 'pages' ? app.highlight : null);
  const hlLabel = $derived.by(() => {
    if (!hl) return '';
    if (hl.kind === 'owner') return 'one owner';
    if (hl.kind === 'state') return 'one page state';
    return 'one use class';
  });
  /** A pinned chiplet's card colours its cores: the stage already says what the colours mean on the Overview (its processor panel) and on the Processor scene. */
  const guided = $derived(kind === 'machine' || kind === 'package');

  // a pin belongs to the section it was made in: leaving the section clears it
  let pinnedIn = sectionOf(nav.level);
  $effect(() => {
    const s = sectionOf(nav.level);
    if (s !== pinnedIn) {
      pinnedIn = s;
      unpin();
    }
  });

  // one sample per tick for the sparkline of the pinned part
  $effect(() => {
    void app.version;
    sample();
  });

  // ---- keys: Esc / Backspace go up one level, before anything else reads them ---------------

  /** The key was typed into a text field: it is the field's, not the navigation's. */
  const typing = (t: EventTarget | null) =>
    t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  $effect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (nav.handleKey(e, typing(e.target))) e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  // ---- the zoom turns around the part that was clicked ----------------------------------------

  /** The part view's box: the zoom's origin is measured from it. */
  let view = $state<HTMLDivElement>();
  /** What a pointer press started on, and when — the door a click went through. */
  let pressed: { el: Element; at: number } | null = null;
  /**
   * Where each part was opened from: its stage point in the own view it was opened from, and
   * that view. Left in order, until the user is back on an own view.
   */
  const origins = new Map<string, { x: number; y: number; parent: string }>();

  /**
   * Open a part from one of this UX's own views. The shared navigation centres the zoom on
   * where the part sits in *its* layout of the parent (the board, the package view); an own
   * scene draws that part somewhere else, so the origin is set to what was actually clicked.
   */
  function open(l: Level, el?: Element) {
    const from = nav.level;
    const box = view?.getBoundingClientRect();
    const hit = el ?? (pressed && box && performance.now() - pressed.at < 800 ? pressed.el : null);
    // only a part on the stage has a place there: a door in the inspector has none
    const onStage = !!hit && !!view && view.contains(hit);
    const r = onStage ? hit.getBoundingClientRect() : null;
    nav.go(l);
    // `nav.level` is a state proxy of the level it holds: compare the two by key
    if (!r || !box || keyOf(nav.level) !== keyOf(l)) return;
    const at = { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top, parent: keyOf(from) };
    nav.zoomX = at.x;
    nav.zoomY = at.y;
    origins.set(keyOf(l), at);
  }
  let cameFrom: string | null = null;
  // Back on an own view — straight from the part, or up through the shared levels between —
  // the zoom returns to where that part was opened from.
  $effect.pre(() => {
    const k = nav.key;
    const from = cameFrom;
    cameFrom = k;
    if (from === null || from === k || origins.size === 0) return;
    if (OWN[nav.level.kind] !== true) return;
    let last: { x: number; y: number } | undefined;
    for (const o of origins.values()) if (o.parent === k) last = o;
    origins.clear();
    if (last) {
      nav.zoomX = last.x;
      nav.zoomY = last.y;
    }
  });

  // ---- telemetry strip ------------------------------------------------------------------------

  // stacked usage bar: active / modified / standby / free+zeroed
  const st = $derived(app.stats);
  const cpu = $derived(app.cpu);
  const gpu = $derived(app.tele?.gpu ?? null);
  const hz = $derived((1000 / app.tickMs).toFixed(1000 % app.tickMs ? 1 : 0));
  /** The busiest drive's busy time — the strip's one storage figure. A reading, measured. */
  const storage = $derived.by(() => {
    void app.version; // the readings are mutated in place: depend on the tick explicitly
    const list: DriveLive[] = app.tele?.storage ?? [];
    return list.reduce<DriveLive | null>((a, d) => (!a || d.busyPct > a.busyPct ? d : a), null);
  });
  const pct = (n: number | undefined) => (st && n !== undefined ? ((n / st.total) * 100).toFixed(0) : '0');
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

<svelte:window bind:innerWidth={vw} bind:innerHeight={vh} />

  <!-- data-level / data-menu say where the navigation is, for whatever drives the page (a test, a tour) -->
  <div class="ux" class:noinsp={!hasInspector} class:menu-list={menu === 'list'} data-level={nav.key} data-menu={menu} style="--menu-w: {menuW}px; --insp-w: {mine ? INSPECTOR : 0}px">
  <div class="rail">
    <div class="logo" title="Computer Visualizer">
      <span class="mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      {#if menu === 'list'}<span class="name">Computer Visualizer</span>{/if}
    </div>
    <div class="menu">
      <SideMenu section={section} onselect={(s) => nav.go(sectionLevel(s))} variant={menu}>
        <button class="halt" class:on={!app.running} onclick={toggleRunning} title="Pause / resume (Space)">
          <Icon name={app.running ? 'pause' : 'play'} size={18} />
          {#if menu !== 'rail'}<span>{app.running ? 'pause' : 'run'}</span>{/if}
        </button>
      </SideMenu>
    </div>
  </div>

  <main class="stage">
    <header class="head" class:brief>
      <div class="titlerow">
        {#if mine}
          <h1 title={sub}>{title}</h1>
        {:else}
          <!-- where a shared part view sits in the machine: every ancestor but the part itself is a way back up -->
          <h1 class="crumbs" title={sub}>
            {#each crumbs as c, i (i)}
              {#if i > 0}<span class="sep" aria-hidden="true">›</span>{/if}
              {#if c.level}
                {@const up = c.level}
                <button class="crumb" onclick={() => nav.go(up)} title="Go to {i === 0 ? 'Overview' : c.label}">{i === 0 ? 'Overview' : c.label}</button>
              {:else}
                <span class="crumb here" aria-current="page">{c.label}</span>
              {/if}
            {/each}
          </h1>
        {/if}
        {#if mine}
          {@render badges()}
        {/if}
      </div>
      {#if !brief}
        <p class="sub">{sub}</p>
      {/if}

      <ModeRow {component} {scale} {note} {domain}>
        {#if !mine}
          <!-- a part view's title is a trail, as wide as the stage is narrow: its badges stand beside the switch instead -->
          {@render badges()}
          {#if brief}
            <span class="crumbhint" title={sub}>{ESC_HINT}</span>
          {/if}
        {/if}
        {#if kind === 'machine' && app.mode === 'pages'}
          <span class="hint">no pages on the processor, the graphics card or the drives — they are coloured by temperature</span>
        {/if}
        {#if hl}
          <span class="hl">highlighting · {hlLabel}</span>
          <button class="clear" onclick={() => setHighlight(null)} title="Clear highlight{kind === 'machine' ? ' (Esc)' : ''}">clear ✕</button>
        {/if}
        {#if kind === 'package' || kind === 'card'}
          <PinChip />
        {/if}
      </ModeRow>
    </header>
    <section class="scene" class:shared={!mine}>
      <div
        class="view"
        bind:this={view}
        onpointerdowncapture={(e) => (pressed = { el: e.target as Element, at: performance.now() })}
      >
        <PartView {nav} own={{ machine: overview, memory, package: processor, card: graphics, apps }} />
      </div>
    </section>
  </main>

  {#if hasInspector}
    <aside class="inspector" class:closed={!mine} inert={!mine}>
      <Inspector onnavigate={open} {guided} />
    </aside>
  {/if}

  <footer class="tele">
    <div class="left">
      <span class="segbar">{#each segs as s, i (i)}<i style="width:{st ? (s.w / st.total) * 100 : 0}%; background: {s.c}"></i>{/each}</span>
      <span class="t"><em>mem in use</em><b>{pct(st?.inUse)}%</b></span>
      <span class="t l3"><em>active</em><b>{pct(st?.byState[4])}%</b></span>
      <span class="t l2"><em>standby</em><b>{pct(st?.byState[2])}%</b></span>
      <span class="t l1"><em>modified</em><b>{pct(st?.byState[3])}%</b></span>
      <span class="t l0"><em>free</em><b>{pct(st ? st.byState[1] + st.byState[0] : undefined)}%</b></span>
      <span class="div"></span>
      <span class="t"><em>cpu</em><b>{cpu ? cpu.avgLoad.toFixed(0) : 0}%</b></span>
      <span class="t l2"><em>hottest core</em><b>{cpu ? cpu.maxTemp.toFixed(0) : '–'}°C</b></span>
      <span class="t l3"><em>package</em><b>{cpu ? cpu.power.toFixed(0) : '–'} W</b></span>
      <span class="div l3"></span>
      <span class="t"><em>gpu</em><b>{gpu ? gpu.engines['3d'].toFixed(0) : 0}%</b></span>
      <span class="t l3"><em>gpu temp</em><b>{gpu ? gpu.temp.toFixed(0) : '–'}°C</b></span>
      <span class="t l2"><em>gpu power</em><b>{gpu ? gpu.power.toFixed(0) : '–'} W</b></span>
      <span class="div l2"></span>
      <span class="t l1" title="The busiest drive's share of time it had a request outstanding · measured"><em>storage</em><b>{storage ? storage.busyPct.toFixed(0) : '–'}%</b></span>
    </div>
    <span class="t right"><em>tick</em><b class="num">{app.tick}</b><em>{st ? fmtMiB(st.total) : ''} mapped</em></span>
  </footer>
</div>

{#snippet badges()}
  <div class="badges">
    <span class="badge mock">mock data</span>
    <span class="badge" title="Which chip a page lives in is modeled — the OS does not expose the memory controller's interleave map.">
      placement: modeled
    </span>
    <span class="badge live" class:paused={!app.running}>{app.running ? 'live' : 'paused'} · {hz} Hz</span>
  </div>
{/snippet}

{#snippet overview()}
  <OverviewScene onnavigate={open} />
{/snippet}

{#snippet memory()}
  <MemoryScene onnavigate={open} />
{/snippet}

{#snippet processor()}
  <CpuScene onnavigate={open} />
{/snippet}

{#snippet graphics()}
  <GpuScene onnavigate={open} />
{/snippet}

{#snippet apps()}
  <AppsScene onnavigate={open} />
{/snippet}

<style>
  .ux {
    height: 100%;
    display: grid;
    grid-template-columns: var(--menu-w) minmax(0, 1fr) var(--insp-w, 0px);
    grid-template-rows: minmax(0, 1fr) 36px;
    grid-template-areas:
      'rail stage insp'
      'tele tele tele';
    /* the inspector gives its room to a shared part view, and takes it back: in one movement with the zoom */
    transition: grid-template-columns 300ms ease;
    background: var(--bg);
    color: var(--ink);
  }
  .ux.noinsp {
    grid-template-columns: var(--menu-w) minmax(0, 1fr);
    grid-template-areas:
      'rail stage'
      'tele tele';
  }
  @media (prefers-reduced-motion: reduce) {
    .ux {
      transition: none;
    }
  }
  .rail {
    grid-area: rail;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-right: 1px solid var(--line);
    background: var(--bg2);
  }
  .logo {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    gap: 9px;
    padding: 15px 8px 13px;
  }
  /* the mark: four squares in a 2 × 2, the leading one lit */
  .mark {
    display: grid;
    grid-template-columns: repeat(2, 7px);
    gap: 2px;
  }
  .logo i {
    display: block;
    width: 7px;
    height: 7px;
    border-radius: 2px;
    background: var(--accent);
    opacity: 0.35;
  }
  .logo i:first-child {
    opacity: 1;
  }
  .logo .name {
    color: var(--ink2);
    font: 600 12px var(--font-ui);
    white-space: nowrap;
  }
  .menu {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 0 var(--menu-pad, 0px) 10px;
  }
  .ux.menu-list .menu {
    --menu-pad: 12px;
  }
  /* the menu fills the rail, so what stands at its foot stays at the foot */
  .menu :global(.sm) {
    flex: 1 1 auto;
  }
  .halt {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-height: 40px;
    padding: 8px 4px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--ink3);
    font: 600 10.5px var(--font-ui);
    transition: color 120ms ease, background 120ms ease;
  }
  .halt:hover {
    color: var(--ink2);
    background: var(--sm-hover);
  }
  .halt:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .halt.on {
    color: var(--warn);
  }
  .ux.menu-list .halt {
    justify-content: flex-start;
    gap: 10px;
    padding: 8px 10px 8px 14px;
    font: 500 12.5px var(--font-ui);
  }
  .stage {
    grid-area: stage;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  .head {
    flex: none;
    padding: 18px 24px 12px;
  }
  .head.brief {
    padding: 12px 24px 10px;
  }
  /* the mode row: a breath below the title block (the shared row brings no margin of its own) */
  .head :global(.mr) {
    margin-top: 8px;
  }
  .head.brief :global(.mr) {
    margin-top: 6px;
  }
  /* the floating controls own the top-right corner: the title row stops short of it,
     the rows below it are already clear of them */
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
    min-width: 0;
  }
  .sub {
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
  /* where a shared part view sits in the machine: the trail, on one line */
  .crumbs {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 7px;
  }
  .crumb {
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink3);
    font: inherit;
    white-space: nowrap;
    transition: color 120ms ease;
  }
  button.crumb:hover {
    color: var(--accent);
  }
  button.crumb:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 4px;
  }
  .crumb.here {
    color: var(--ink);
  }
  .sep {
    color: var(--ink3);
  }
  /* a very short viewport: the part's own line stands at the end of the mode row */
  .crumbhint {
    margin-left: auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--ink3);
    font-size: 11.5px;
  }
  .badges {
    display: flex;
    flex: none;
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
  /* the view fills what is left of the stage: a grid, so its one child gets the whole area */
  .scene {
    flex: 1;
    min-height: 0;
    min-width: 0;
    display: grid;
    grid-template: minmax(0, 1fr) / minmax(0, 1fr);
    padding: 0 24px 16px;
  }
  /* a shared part view keeps its own margins — its tiles line up with the title above —
     and takes the cockpit's corner radius (levels.css sets its own default) */
  .scene.shared {
    padding: 0;
  }
  .scene.shared :global(.lv-scope) {
    --r-tile: var(--radius);
  }
  .view {
    position: relative;
    min-width: 0;
    min-height: 0;
  }
  /* a hairline drawn inside, so a closed inspector is exactly as wide as its (empty) column */
  .inspector {
    grid-area: insp;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    box-shadow: inset 1px 0 0 var(--line);
    background: var(--bg2);
    transition: box-shadow 300ms ease;
  }
  .inspector.closed {
    box-shadow: inset 1px 0 0 transparent;
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
  .t.right b {
    margin-right: 8px;
  }
  /* readings drop off from the right-hand groups as the window narrows: free, then modified
     and storage, then standby and gpu power, then the rest of the details */
  @media (max-width: 1599px) {
    .l0 {
      display: none;
    }
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
</style>
