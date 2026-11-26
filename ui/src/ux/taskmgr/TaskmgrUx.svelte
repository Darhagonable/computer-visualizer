<script lang="ts">
  /**
   * UX C · Task Manager — navigate by the *question* first (Processes / Performance), then by
   * resource. Chrome follows Win11: a nav pane the hamburger expands or collapses, one content
   * card per page, and a status bar. The top-right of the title bar stays clear for the floating
   * dev controls (`--chrome-safe` × 42 px).
   */
  import { fade } from 'svelte/transition';
  import { app, getMachine } from '../../mock/store.svelte';
  import Glyph from './Glyph.svelte';
  import ProcessesPage from './ProcessesPage.svelte';
  import PerformancePage from './PerformancePage.svelte';
  import { HINTS, fmtHz, isResId, type Page, type ResId } from './resources';

  type NavId = Page | 'history' | 'startup' | 'users' | 'details' | 'services';
  interface NavItem {
    id: NavId;
    label: string;
    icon: string;
    /** Why the item is disabled. */
    off?: string;
  }
  const NAV: NavItem[] = [
    { id: 'processes', label: 'Processes', icon: 'processes' },
    { id: 'performance', label: 'Performance', icon: 'performance' },
    { id: 'history', label: 'App history', icon: 'history', off: 'not in this mockup' },
    { id: 'startup', label: 'Startup', icon: 'startup', off: 'not in this mockup' },
    { id: 'users', label: 'Users', icon: 'users', off: 'not in this mockup' },
    { id: 'details', label: 'Details', icon: 'details', off: 'not in this mockup' },
    { id: 'services', label: 'Services', icon: 'services', off: 'not in this mockup' },
  ];

  // Own URL hooks, read once when this paradigm mounts:
  //   ?page=processes|performance  &res=cpu|memory|disk|ethernet|gpu  &nav=collapsed
  const q = new URLSearchParams(location.search);
  const qPage = q.get('page');
  const qRes = q.get('res');
  let page = $state<Page>(qPage === 'performance' || isResId(qRes) ? 'performance' : 'processes');
  let res = $state<ResId>(isResId(qRes) ? qRes : 'memory');
  // A narrow window starts with the pane collapsed so the content keeps its room.
  const qNav = q.get('nav');
  let navOpen = $state(qNav === 'collapsed' ? false : qNav === 'expanded' ? true : innerWidth > 1024);

  // Keep the address bar in step, so a view can be reloaded or passed on.
  $effect(() => {
    const url = new URL(location.href);
    url.searchParams.set('page', page);
    if (page === 'performance') url.searchParams.set('res', res);
    else url.searchParams.delete('res');
    url.searchParams.delete('nav');
    history.replaceState(null, '', url);
  });

  const hz = $derived(fmtHz(app.tickMs));
  // Re-read after "reset machine", which may pick a new seed.
  const seed = $derived.by(() => {
    app.version;
    return getMachine().seed;
  });
  const hint = $derived(page === 'processes' ? HINTS.processes : HINTS[res]);
  const running = $derived(app.running);
</script>

<div class="ux" class:closed={!navOpen}>
  <nav class="nav" aria-label="Task Manager sections">
    <button
      class="burger"
      onclick={() => (navOpen = !navOpen)}
      title={navOpen ? 'Collapse navigation pane' : 'Expand navigation pane'}
      aria-label={navOpen ? 'Collapse navigation pane' : 'Expand navigation pane'}
      aria-expanded={navOpen}
    >
      <Glyph name="menu" size={18} />
    </button>
    {#each NAV as n (n.id)}
      <button
        class="item"
        class:active={n.id === page}
        disabled={!!n.off}
        onclick={() => (n.id === 'processes' || n.id === 'performance') && (page = n.id)}
        title={n.off ? `${n.label} — ${n.off}` : n.label}
        aria-current={n.id === page ? 'page' : undefined}
      >
        <i class="pill"></i>
        <Glyph name={n.icon} size={18} />
        <span class="label">{n.label}</span>
      </button>
    {/each}
  </nav>

  <main class="main">
    <div class="titlebar">
      <b>Task Manager</b>
      <span class="tm-tag warn">mock data</span>
    </div>

    <section class="card">
      {#key page}
        <div class="page" in:fade={{ duration: 140 }}>
          {#if page === 'processes'}
            <ProcessesPage
              onshowboard={() => {
                res = 'memory';
                page = 'performance';
              }}
            />
          {:else}
            <PerformancePage {res} onselect={(r) => (res = r)} />
          {/if}
        </div>
      {/key}
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

<!-- Pieces every page of this paradigm shares. Scoped under the root, so they cannot leak. -->
<style>
  .ux {
    --nav-w: 208px;
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
  .ux.closed {
    --nav-w: 48px;
  }

  /* ---- navigation pane ---- */
  .nav {
    grid-area: nav;
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
    margin-bottom: 6px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--ink);
    transition: background 100ms ease;
  }
  .burger:hover {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
  }
  .item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    flex: none;
    height: 38px;
    padding: 0 10px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--ink);
    font-size: 13px;
    text-align: left;
    white-space: nowrap;
    transition: background 100ms ease;
  }
  .item:hover:not(:disabled) {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
  }
  .item:active:not(:disabled) {
    background: color-mix(in srgb, var(--ink) 10%, transparent);
  }
  .item.active {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }
  .item:disabled {
    color: var(--ink3);
    opacity: 0.72;
  }
  .pill {
    position: absolute;
    left: 0;
    top: 11px;
    width: 3px;
    height: 16px;
    border-radius: 2px;
    background: transparent;
  }
  .item.active .pill {
    background: var(--accent);
  }
  .label {
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: opacity 120ms ease, max-width 160ms ease;
  }
  .closed .nav {
    padding-left: 4px;
  }
  .closed .item {
    width: 40px;
    padding: 0;
    justify-content: center;
    gap: 0;
  }
  .closed .label {
    max-width: 0;
    opacity: 0;
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
  .card {
    flex: 1;
    min-height: 0;
    display: flex;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel);
    box-shadow:
      0 1px 2px color-mix(in srgb, var(--ink) 7%, transparent),
      0 2px 6px color-mix(in srgb, var(--ink) 4%, transparent);
  }
  .page {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
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
  /* A placeholder, not a measurement — dashed outline. */
  .ux :global(.tm-tag.mock) {
    border-style: dashed;
    color: var(--ink2);
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
  .ux :global(.tm-tile.mock) {
    outline: 1px dashed color-mix(in srgb, var(--rc) 55%, transparent);
    outline-offset: -3px;
  }
</style>
