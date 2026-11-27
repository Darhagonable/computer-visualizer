<script lang="ts">
  /**
   * UX C · Task Manager — navigate by section first (the side menu every UX shares: Overview ·
   * Processor · Memory · Storage · Graphics · Applications), then drill into a part. Chrome
   * follows Win11: a nav pane the hamburger expands or collapses, a title bar, one content card
   * with the mode row above the view on stage, and a status bar. The top-right of the title bar
   * stays clear for the floating dev controls (`--chrome-safe` × 42 px).
   *
   * The card hosts the part views. Task Manager's own pages are its `own` views — Processes, and
   * a device page each for the processor, the memory, the drives and the GPU — and everything
   * below them is the shared part views: a part clicked in a device drawing opens the shared view
   * of that part, Esc / Backspace climb back out one level at a time, and the Overview is the
   * shared board (where a process's pages light up).
   */
  import { untrack } from 'svelte';
  import { app, getMachine, hoverOut, setMode } from '../../mock/store.svelte';
  import { pagesFallbackNote, TRUTH_NOTE } from '../../mock/telemetry';
  import { LevelNav } from '../../levels/nav.svelte';
  import PartView from '../../levels/PartView.svelte';
  import { PART, crumbsOf, sectionOf, type Kind, type Section } from '../../levels/nav';
  import { UNIT_POWER } from '../../levels/live';
  import { sectionLevel } from '../../shell/sections';
  import ModeRow from '../../shell/ModeRow.svelte';
  import SideMenu from '../../shell/SideMenu.svelte';
  import Glyph from './Glyph.svelte';
  import ProcessesPage from './ProcessesPage.svelte';
  import PerformancePage from './PerformancePage.svelte';
  import { HINTS, fmtHz, startLevel, viewUrl } from './resources';

  const m = getMachine();

  // once, at the top level of the script: creating it writes to the store,
  // which is not allowed inside a $derived or a template. Where it starts is the address
  // bar's: the hooks every UX shares (`?level=`), then this UX's own older ones (`?page=` / `?res=`).
  const nav = untrack(() => new LevelNav(startLevel(m)));

  // Esc / Backspace go up one level, in the capture phase, before the app's own Esc (which
  // clears the highlight at the root, where there is nowhere to go up to). In a text field
  // the keys are the field's own.
  $effect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof HTMLElement ? e.target : null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (nav.handleKey(e, typing)) e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  // A view that goes away under a still pointer (the wheel opened the level below it) cannot
  // report that the pointer left: its card would stay over the view that replaced it.
  $effect(() => {
    void nav.key;
    hoverOut();
  });

  // Keep the address bar in step, so a view can be reloaded or passed on.
  $effect(() => {
    const url = viewUrl(nav.level, location.href);
    if (url !== location.href) history.replaceState(null, '', url);
  });

  // The pane, read once when this paradigm mounts: `?nav=collapsed|expanded`. A narrow window
  // starts with the pane collapsed so the content keeps its room.
  const qNav = new URLSearchParams(location.search).get('nav');
  let navOpen = $state(qNav === 'collapsed' ? false : qNav === 'expanded' ? true : innerWidth > 1024);

  /** The levels Task Manager shows its own page for. */
  const OWN: readonly Kind[] = ['apps', 'package', 'memory', 'card', 'drives'];
  const kind = $derived(nav.level.kind);
  /** The component on stage: whose reading guide the mode row is. */
  const component = $derived(PART[kind]);
  const isOwn = $derived(OWN.includes(kind));
  const section = $derived(sectionOf(nav.level));
  const crumbs = $derived(crumbsOf(nav.level, m));
  const atRoot = $derived(kind === 'machine');

  /**
   * What the mode row states. On Task Manager's own pages it is the one reading guide on stage;
   * on a shared part view (the Overview's board included) the view carries its own guide, so
   * the row is only the switch. The Processes page is an own page that has nothing coloured by
   * the mode — as the shared applications view, it carries no guide.
   */
  const scale = $derived(isOwn && kind !== 'apps' ? 'always' : 'never');

  let cardH = $state(0);
  /**
   * A short card — a 720 px-tall window and below (the card is 640 px high at 720p): the legend,
   * or the scale a pages-less part is on, stands beside the switch instead of on a row of its own,
   * so the mode row stays one strip and the page keeps its room.
   */
  const short = $derived(cardH > 0 && cardH < 660);
  /** A very short card (a 600 px-tall window): the switch without its labels, no qualifier, no reason. */
  const compact = $derived(cardH > 0 && cardH < 600);

  /** The qualifier after the truth badge, and the range the page paints against where it is not the component's own. */
  const guide = $derived.by((): { note: string; domain?: [number, number] } => {
    const mode = app.mode;
    if (kind === 'package') {
      if (mode === 'activity') return { note: 'core halves = load per thread' };
      if (mode === 'power') return { note: 'core fill = estimated watts · bar = load' };
      return { note: 'core fill = temperature · bar = load' };
    }
    if (kind === 'memory') return { note: mode === 'pages' ? '' : mode === 'temperature' ? 'per die' : 'per block' };
    if (kind === 'card') return mode === 'power' ? { note: 'per unit', domain: UNIT_POWER } : { note: 'per unit' };
    if (kind === 'drives') return { note: 'per drive' };
    return { note: '' };
  });

  /**
   * The reason behind the word, at the right of the row: telemetry.ts's one line. Where a part
   * without pages is on the temperature scale because the mode is "Pages", it is that sentence
   * (ScaleLegend would print it under the scale; here it is said once, beside it).
   */
  const why = $derived.by(() => {
    if (compact || !isOwn || kind === 'apps') return '';
    const c = component;
    if (app.mode === 'pages') return c === 'memory' ? 'Real page data: what each page is for and whether it is live.' : pagesFallbackNote(c);
    return TRUTH_NOTE[app.mode][c];
  });

  function pick(s: Section) {
    nav.go(sectionLevel(s));
  }

  /**
   * The Overview with a process selected — where its pages light up. They do so only in "Pages":
   * under an overlay the grids are painted by the overlay, so that is what this switches to first.
   */
  function showOnBoard() {
    if (app.mode !== 'pages') setMode('pages');
    nav.go({ kind: 'machine' });
  }

  const hz = $derived(fmtHz(app.tickMs));
  // Re-read after "reset machine", which may pick a new seed.
  const seed = $derived.by(() => {
    app.version;
    return getMachine().seed;
  });
  const hint = $derived(HINTS[kind]);
  const running = $derived(app.running);
</script>

<div class="ux" class:closed={!navOpen}>
  <div class="nav">
    <button
      class="burger"
      onclick={() => (navOpen = !navOpen)}
      title={navOpen ? 'Collapse navigation pane' : 'Expand navigation pane'}
      aria-label={navOpen ? 'Collapse navigation pane' : 'Expand navigation pane'}
      aria-expanded={navOpen}
    >
      <Glyph name="menu" size={18} />
    </button>
    <!-- the six sections, every UX's navigation: the list while the pane is open, the rail once the hamburger has collapsed it -->
    <SideMenu {section} onselect={pick} variant={navOpen ? 'list' : 'rail'} label="Sections" />
  </div>

  <main class="main">
    <div class="titlebar">
      <b>Task Manager</b>
      <span class="tm-tag warn">mock data</span>
      <!-- where the view on stage is in the machine; every ancestor is a way back -->
      <nav class="crumbs" aria-label="Where this view is in the machine">
        <button class="back" disabled={atRoot} onclick={() => nav.up()} title={atRoot ? 'The Overview is the top' : 'Up one level (Esc or Backspace)'} aria-label="Up one level">
          <Glyph name="arrowLeft" size={14} />
        </button>
        {#each crumbs as c, i (c.label + i)}
          {#if i > 0}<span class="sep" aria-hidden="true"><Glyph name="chevronRight" size={11} /></span>{/if}
          {@const target = c.level}
          {#if target}
            <button class="crumb" onclick={() => nav.go(target)} title={c.hint}>{c.label}</button>
          {:else}
            <span class="crumb cur" aria-current="page" title={c.hint}>{c.label}</span>
          {/if}
        {/each}
      </nav>
    </div>

    <section class="card" bind:clientHeight={cardH}>
      <!-- what the colours mean right now: the switch, and on Task Manager's own pages the reading guide of what is on stage -->
      <div class="moderow" class:short>
        <ModeRow {component} {scale} note={guide.note} domain={guide.domain} {compact}>
          {#if why}<span class="reason" title={why}>{why}</span>{/if}
        </ModeRow>
      </div>

      <!-- the view on stage: Task Manager's own page for five of the levels, the shared part view for the rest -->
      <div class="page">
        <PartView {nav} own={{ apps, package: processor, memory, card: graphics, drives: storage }} motion={false} />
      </div>
    </section>
  </main>

  <footer class="status">
    <span class="left" title="Everything on screen comes from the mock provider — nothing is measured">
      <i class="dot" class:paused={!running}></i>
      Mock data · {hz} Hz · seed {seed}
    </span>
    <span class="hint">{hint}</span>
  </footer>
</div>

{#snippet apps()}
  <!-- Applications: the Processes page -->
  <ProcessesPage onshowboard={showOnBoard} />
{/snippet}

{#snippet processor()}
  <!-- Processor: the CPU device page -->
  <PerformancePage res="cpu" onnavigate={nav.go} />
{/snippet}

{#snippet memory()}
  <!-- Memory: the device page with the DIMM board -->
  <PerformancePage res="memory" onnavigate={nav.go} />
{/snippet}

{#snippet graphics()}
  <!-- Graphics: the GPU device page -->
  <PerformancePage res="gpu" onnavigate={nav.go} />
{/snippet}

{#snippet storage()}
  <!-- Storage: the disk page, drawn from the storage model -->
  <PerformancePage res="disk" onnavigate={nav.go} />
{/snippet}

<!-- Pieces every page of this paradigm shares. Scoped under the root, so they cannot leak. -->
<style>
  .ux {
    --nav-w: 256px;
    height: 100%;
    display: grid;
    grid-template-columns: var(--nav-w) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) 28px;
    grid-template-areas:
      'nav main'
      'status status';
    background: var(--bg);
    color: var(--ink);
    transition: grid-template-columns 160ms ease;
  }
  /* Collapsed, the pane is exactly the rail's 64 px: a 1024-px window then leaves the part views
     the widest stage this chrome can give (they are laid out for a stage about 960 px wide). */
  .ux.closed {
    --nav-w: 64px;
  }
  .ux.closed .nav {
    padding-left: 0;
  }
  /* the hamburger sits over the centre of the rail it collapsed to */
  .ux.closed .burger {
    align-self: center;
  }

  /* ---- navigation pane ---- */
  .nav {
    grid-area: nav;
    /* the side menu takes the pane's width: the list when it is open, the rail (64 px) when it is collapsed */
    --sm-list-width: 100%;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-height: 0;
    padding: 4px 0 8px 4px;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
  }
  .burger {
    flex: none;
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    margin-bottom: 4px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--ink);
    transition: background 100ms ease;
  }
  .burger:hover {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
  }
  .burger:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  /* ---- content ---- */
  .main {
    grid-area: main;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    padding: 0 8px 8px;
  }
  /* A narrow window: a slimmer margin, so the card — and the part views in it — keep 8 px more. */
  @media (max-width: 1100px) {
    .main {
      padding: 0 4px 4px;
    }
  }
  .titlebar {
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    height: 44px;
    padding: 0 calc(var(--chrome-safe) + 12px) 0 12px;
    white-space: nowrap;
    overflow: hidden;
  }
  .titlebar b {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ink2);
  }
  /* the trail through the machine: Machine › Processor › CCD 1 */
  .crumbs {
    display: flex;
    align-items: center;
    gap: 1px;
    min-width: 0;
    margin-left: 8px;
    padding-left: 12px;
    border-left: 1px solid var(--line2);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
  }
  .back {
    flex: none;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    margin-right: 4px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--ink2);
  }
  .back:hover:not(:disabled) {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
    color: var(--ink);
  }
  .back:disabled {
    color: var(--line2);
  }
  .back:focus-visible,
  .crumb:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .crumb {
    flex: none;
    max-width: 180px;
    padding: 2px 5px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--ink2);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: background 80ms ease, color 80ms ease;
  }
  .crumb:hover {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
    color: var(--ink);
  }
  .crumb.cur {
    padding-left: 5px;
    color: var(--ink);
    font-weight: 600;
  }
  .sep {
    flex: none;
    display: flex;
    color: var(--ink3);
  }
  .card {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel);
    box-shadow:
      0 1px 2px color-mix(in srgb, var(--ink) 7%, transparent),
      0 2px 6px color-mix(in srgb, var(--ink) 4%, transparent);
  }
  /* the mode row: one toolbar-height strip above whatever is on stage */
  .moderow {
    flex: none;
    padding: 5px 16px 5px 20px;
    border-bottom: 1px solid var(--line);
    container: moderow / inline-size;
  }
  /* the reason behind the truth word takes the rest of the row and never wraps it; with no
     reason (a short card) its place is not kept — the legend beside the switch needs the width */
  .moderow :global(.mr > .right) {
    flex: 1 1 0;
    container-type: inline-size;
  }
  .moderow :global(.mr > .right:empty) {
    display: none;
  }
  /* the pages-less fallback's reason is said beside the scale, not once more under it */
  .moderow :global(.scale > .why) {
    display: none;
  }
  .reason {
    flex: 1 1 0;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    color: var(--ink3);
  }
  /* with no room for a sentence (the page legend beside the switch takes the width), none is
     started: a clipped word is worse than none — the truth badge above the scale still says it */
  @container (max-width: 260px) {
    .reason {
      visibility: hidden;
    }
  }
  /* the page legend as two tidy rows: each heading beside its own pills */
  .moderow :global(.legend) {
    flex: 1 1 0;
    min-width: 0;
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    align-items: center;
    gap: 6px 12px;
  }
  .moderow :global(.legend > .lg-row) {
    min-width: 0;
  }
  /* In "Pages" the mode row gives its scale a row of its own — right for the page legend, which is two
     rows of pills. A part without pages is on the temperature scale instead: a single line, which belongs
     beside the switch. On a short card it stands there; so it does where the row is wide enough for the
     switch, the scale and the reason sentence — 36 + 361 + 16 + 460 + 16 + 260 px. Between those it
     takes its own row, because that is the only way the sentence fits. */
  .ux .moderow.short :global(.mr.pages > .scale) {
    order: 0;
    flex: 0 1 auto;
    padding-right: 0;
  }
  @container moderow (min-width: 1149px) {
    .ux .moderow :global(.mr.pages > .scale) {
      order: 0;
      flex: 0 1 auto;
      padding-right: 0;
    }
  }
  /* … and the page legend's pills give up their shares to fit there (they stay on their tooltips;
     the composition strip on the memory page has the four that matter). */
  .ux .moderow.short :global(.legend .pill b) {
    display: none;
  }
  .page {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  /* a view arrives the way Task Manager's pages always did: a quick fade, not a zoom */
  .page :global(.pv > .slot) {
    animation: page-in 140ms ease both;
  }
  @keyframes page-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .page :global(.pv > .slot) {
      animation: none;
    }
  }

  /* ---- status bar ---- */
  .status {
    grid-area: status;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 12px 0 14px;
    border-top: 1px solid var(--line);
    background: var(--panel);
    font-size: 11.5px;
    color: var(--ink2);
    white-space: nowrap;
    overflow: hidden;
  }
  .left {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    flex: none;
    font-variant-numeric: tabular-nums;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--good);
  }
  .dot.paused {
    background: var(--ink3);
  }
  .hint {
    margin-left: auto;
    color: var(--ink3);
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ---- shared pieces (used by the sibling components of this paradigm) ---- */
  .ux :global(.tm-tag) {
    display: inline-flex;
    align-items: center;
    height: 18px;
    padding: 0 7px;
    border: 1px solid var(--line2);
    border-radius: 9px;
    color: var(--ink3);
    font-size: 10.5px;
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
  }
  .ux :global(.tm-tag.warn) {
    color: var(--warn);
    border-color: color-mix(in srgb, var(--warn) 50%, transparent);
    font-family: var(--font-mono);
    font-size: 9.5px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  /* Resource tile: the glyph takes the resource colour from --rc. */
  .ux :global(.tm-tile) {
    display: grid;
    place-items: center;
    flex: none;
    color: var(--rc);
    background: color-mix(in srgb, var(--rc) 13%, transparent);
    border-radius: 6px;
  }
</style>
