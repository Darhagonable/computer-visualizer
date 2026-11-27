<script lang="ts">
  /**
   * UX B · Ionic — a spatial drill-down. One thing fills the stage at a time and the user
   * zooms through physical containment along the chains rooted at the machine (levels/nav.ts):
   *
   *   machine ├─ memory › module › die › block                  memory
   *           ├─ processor › chiplet (CCD) › core               processor
   *           ├─ graphics card › GPU die | VRAM                 graphics
   *           ├─ drives › drive                                  storage
   *           └─ apps                                            applications
   *
   * Chrome stays thin on purpose. On the left, the side menu every UX shares — the six
   * sections, wide as a list and narrow as a rail. Across the top, the breadcrumb, the search
   * and the mode row: the switch alone, because every part view carries its own reading guides
   * on stage. Below the stage, the dock: the way up, the selected owner, the siblings of the
   * part on stage (the machine's headline numbers at the machine), and the "mock data" label.
   * Top-right of the stage, the mini-map says where you are.
   *
   * Every part view is the shared one (levels/): this UX owns one LevelNav and hands it to
   * <PartView>, and shows no level its own way.
   */
  import { untrack } from 'svelte';
  import { fade } from 'svelte/transition';
  import { app, getMachine, selectProcess, selectFile } from '../../mock/store.svelte';
  import { fmtMiB } from '../../mock/model';
  import Icon from '../../scene/Icon.svelte';
  import ChipGrid from '../../scene/ChipGrid.svelte';
  import { PART, crumbsOf, levelFromUrl, parentName, sectionOf, type Kind, type Level } from '../../levels/nav';
  import { LevelNav } from '../../levels/nav.svelte';
  import PartView from '../../levels/PartView.svelte';
  import { sectionLevel } from '../../shell/sections';
  import SideMenu from '../../shell/SideMenu.svelte';
  import ModeRow from '../../shell/ModeRow.svelte';
  import MiniMap from './MiniMap.svelte';
  import Vitals from './Vitals.svelte';
  import ModulesDock from './ModulesDock.svelte';
  import DrivesDock from './DrivesDock.svelte';
  import CcdDock from './CcdDock.svelte';
  import CoreDock from './CoreDock.svelte';
  import CardDock from './CardDock.svelte';
  import DockNav from './DockNav.svelte';

  interface Hit {
    kind: 'process' | 'file';
    id: number;
    name: string;
    sub: string;
    blocks: number;
  }

  const m = getMachine();
  /** Bloom filters by cell size (σ in SVG user units): board cells → 64-page cells → 4-page cells. */
  const GLOWS: [string, number][] = [
    ['io-glow-xs', 0.7],
    ['io-glow-sm', 1.25],
    ['io-glow-md', 2.6],
    ['io-glow-lg', 7.5],
  ];
  /** What a click does on each level — the dock's hint. */
  const HINT: Record<Kind, string> = {
    machine: 'click the socket, a module, the card or a drive',
    memory: 'click a module to open it',
    stick: 'click a die to open it',
    die: 'click a block to open it',
    block: 'click a page group to highlight its owner',
    package: 'click a chiplet or a core to open it',
    ccd: 'click a core to open it',
    core: 'hover a thread to read it · Esc returns to the chiplet',
    card: 'click the die or a VRAM chip to open it',
    gdie: 'hover a unit · click an engine to pin it',
    vram: 'hover a process to see its share · click a chip to pin it',
    drives: 'click a drive to open it',
    drive: 'click a partition, on the drive or in the list',
    apps: 'click a process to see what it holds',
  };

  // ---- where the user is: the one navigation of this UX --------------------------------------
  /** Once, at the top level of the script — creating it writes to the store. It starts where the URL says. */
  const nav = untrack(() => new LevelNav(levelFromUrl(m)));

  // ---- the side menu's form follows the window, measured --------------------------------------
  /**
   * The part views are laid out for a stage about 960 px wide. A list takes its 274 px beside
   * the stage, so it is a list only where what is left is still that wide (a 1280-px window
   * leaves about 980); below that the rail's 64 leave a 1024-px window its 960.
   */
  const LIST_FROM = 1280;
  const mq = typeof matchMedia === 'function' ? matchMedia(`(min-width: ${LIST_FROM}px)`) : null;
  let listMenu = $state(mq?.matches ?? false);
  $effect(() => {
    if (!mq) return;
    const changed = (e: MediaQueryListEvent) => (listMenu = e.matches);
    mq.addEventListener('change', changed);
    return () => mq.removeEventListener('change', changed);
  });

  const level = $derived(nav.level);
  const crumbs = $derived(crumbsOf(level, m));
  /** Which component of the machine the level on stage is about — the mode row's. */
  const component = $derived(PART[level.kind]);
  /** The side-menu section of the level on stage. */
  const section = $derived(sectionOf(level));
  const atMachine = $derived(level.kind === 'machine');
  const parent = $derived(atMachine ? null : parentName(level, m));

  // ---- the top bar, by measurement ------------------------------------------------------------
  /** Space between the breadcrumb and the tools at the right end of the top bar. */
  const BAR_GAP = 16;
  /**
   * The breadcrumb gets what the mode row and the search leave it. The deepest path (Machine ›
   * Processor › CCD 1 › Core 16) measures 338 px, 307 set tight and 228 without its root; so,
   * as the room shrinks, the crumbs are set tighter (`tight`), and the root — the machine, one
   * click away on the menu and every way up — is the first to go (`brief`). What still does not
   * fit is clipped at its oldest end, never at the level on stage.
   */
  const ROOM_TIGHT = 350;
  const ROOM_BRIEF = 310;
  let topEl = $state<HTMLElement>();
  let toolsEl = $state<HTMLElement>();
  let room = $state(0);
  $effect(() => {
    const bar = topEl;
    const tools = toolsEl;
    if (!bar || !tools || typeof ResizeObserver === 'undefined') return;
    let barW = 0;
    let toolsW = 0;
    const measure = () => (room = barW - toolsW - BAR_GAP);
    const io = new ResizeObserver((entries) => {
      for (const e of entries) {
        if (e.target === bar) barW = e.contentRect.width;
        else toolsW = e.contentRect.width;
      }
      measure();
    });
    io.observe(bar);
    io.observe(tools);
    return () => io.disconnect();
  });
  const fit = $derived(room > 0 && room < ROOM_BRIEF ? 'brief' : room > 0 && room < ROOM_TIGHT ? 'tight' : 'full');

  /** The die's 16 × 16 block map in the dock (block level) — siblings one click away. */
  const map = $derived.by(() => {
    const l = level;
    if (l.kind !== 'block') return null;
    const cw = (34 - 15 * 0.22) / 16;
    const pitch = cw + 0.22;
    return {
      chip: l.chip,
      cell: l.cell,
      row: l.cell >> 4,
      col: l.cell & 15,
      x: 2 + (l.cell & 15) * pitch - 0.6,
      y: 2 + (l.cell >> 4) * pitch - 0.6,
      s: cw + 1.2,
    };
  });

  /** The dies of the module on stage, as they sit on the stick (die level). */
  const dies = $derived.by(() => {
    const l = level;
    return l.kind === 'die' ? m.dimms[m.chips[l.chip].dimm].chips : [];
  });

  /** The owner whose pages are lit up right now — what the dock chip reports and clears. */
  const lit = $derived.by(() => {
    const h = app.highlight;
    if (h?.kind !== 'owner' || h.id === 0) return null; // 0 is "no owner"
    const o = m.owners[h.id];
    if (!o) return null;
    return { kind: o.kind, name: o.kind === 'file' ? (o.name.split('\\').pop() ?? o.name) : o.name };
  });
  function clearLit() {
    const o = lit;
    if (!o) return;
    if (o.kind === 'file') selectFile(null);
    else if (o.kind === 'process') selectProcess(null);
    else app.highlight = null;
  }

  // ---- search: processes and files, the two things that own pages ----------------------------

  let q = $state('');
  let sopen = $state(false);
  let cursor = $state(0);
  let searchEl = $state<HTMLInputElement>();

  const hits = $derived.by(() => {
    const f = q.trim().toLowerCase();
    if (!f) return [] as Hit[];
    const s = app.stats;
    const blocks = (id: number) => s?.byOwner[String(id)]?.blocks ?? 0;
    const ps = m.processes
      .filter((p) => p.name.toLowerCase().includes(f))
      .map((p): Hit => ({ kind: 'process', id: p.id, name: p.name, sub: `process · pid ${p.pid}`, blocks: blocks(p.id) }))
      .sort((a, b) => b.blocks - a.blocks)
      .slice(0, 6);
    const fs = m.files
      .filter((x) => x.path.toLowerCase().includes(f))
      .map((x): Hit => {
        const parts = x.path.split('\\');
        return {
          kind: 'file',
          id: x.id,
          name: parts.pop() ?? x.path,
          sub: `file · ${parts.slice(0, 3).join('\\')}\\…`,
          blocks: blocks(x.id),
        };
      })
      .sort((a, b) => b.blocks - a.blocks)
      .slice(0, 4);
    return [...ps, ...fs];
  });
  const at = $derived(Math.min(cursor, Math.max(0, hits.length - 1)));

  function closeSearch() {
    sopen = false;
    q = '';
  }
  function pick(h: Hit) {
    if (h.kind === 'process') selectProcess(h.id);
    else selectFile(h.id);
    closeSearch();
  }
  function onSearchKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      cursor = Math.max(0, Math.min(hits.length - 1, cursor + (e.key === 'ArrowDown' ? 1 : -1)));
    } else if (e.key === 'Enter') {
      const h = hits[at];
      if (h) pick(h);
    }
  }
  /** Focus left the popover altogether → it goes away. */
  function onPopFocusOut(e: FocusEvent) {
    const next = e.relatedTarget as Node | null;
    if (!next || !(e.currentTarget as HTMLElement).contains(next)) closeSearch();
  }
  $effect(() => {
    if (sopen) searchEl?.focus();
  });
  // the popover picks an owner for the level on stage: a change of level puts it away
  $effect(() => {
    nav.key;
    if (untrack(() => sopen)) closeSearch();
  });

  // ---- keys, the address bar ------------------------------------------------------------------
  /** The focus is in a text field (the search): its keys are the field's. */
  const typing = (e: KeyboardEvent): boolean => {
    const t = e.target;
    return t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  };

  // Esc / Backspace go up one level, captured before the app's own Esc, so that going up does
  // not also wipe the owner highlight, which is meant to follow the user. The search popover
  // takes Esc first; at the root the key is not consumed and goes on to whatever else listens.
  $effect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sopen) {
        closeSearch();
        e.stopImmediatePropagation();
        return;
      }
      if (nav.handleKey(e, typing(e))) e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  /** The address bar's parameters that say where the user is — the ones `levelFromUrl` reads. */
  const WHERE = ['level', 'part', 'dimm', 'chip', 'cell', 'ccd', 'core', 'drive'];
  /** The same level, as the address bar spells it. */
  function whereOf(l: Level): Record<string, string> {
    switch (l.kind) {
      case 'machine':
        return {};
      case 'stick':
        return { level: 'stick', dimm: String(l.dimm) };
      case 'die':
        return { level: 'die', chip: String(l.chip) };
      case 'block':
        return { level: 'block', chip: String(l.chip), cell: String(l.cell) };
      case 'ccd':
        return { level: 'ccd', ccd: String(l.ccd) };
      case 'core':
        return { level: 'core', core: String(l.core) };
      case 'drive':
        return { level: 'drive', drive: String(l.drive) };
      default:
        return { level: l.kind };
    }
  }
  // Keep the address bar in step, so a view can be reloaded or passed on. Everything else in
  // the query (the mode, the mock's seed and pre-roll…) is not this UX's and stays.
  $effect(() => {
    const where = whereOf(nav.level);
    const url = new URL(location.href);
    for (const k of WHERE) url.searchParams.delete(k);
    for (const [k, v] of Object.entries(where)) url.searchParams.set(k, v);
    history.replaceState(null, '', url);
  });
</script>

<!-- luminance-keyed bloom: only bright (live) cells emit light, by cell size -->
<svg class="defs" width="0" height="0" aria-hidden="true" focusable="false">
  <defs>
    {#each GLOWS as [id, sigma] (id)}
      <filter {id} x="-14%" y="-14%" width="128%" height="128%" color-interpolation-filters="sRGB">
        <feGaussianBlur in="SourceGraphic" stdDeviation={sigma} result="blur" />
        <feComponentTransfer in="blur" result="glow">
          <feFuncR type="linear" slope="3.4" intercept="-0.66" />
          <feFuncG type="linear" slope="3.4" intercept="-0.66" />
          <feFuncB type="linear" slope="3.4" intercept="-0.66" />
        </feComponentTransfer>
        <feMerge>
          <feMergeNode in="glow" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    {/each}
  </defs>
</svg>

<div
  class="ion lv-scope"
  data-menu={listMenu ? 'list' : 'rail'}
  data-level={level.kind}
  data-part={component}
  data-short={nav.h > 0 && nav.h < 620 ? '1' : '0'}
>
  <!-- the six sections: the way between the chains -->
  <aside class="menu">
    <div class="pane">
      <SideMenu {section} onselect={(s) => nav.go(sectionLevel(s))} variant={listMenu ? 'list' : 'rail'} label="Sections" />
    </div>
  </aside>

  <header class="top" bind:this={topEl} data-fit={fit}>
    <nav class="crumbs" aria-label="Zoom path">
      {#each crumbs as c, i (c.label + i)}
        {#if i > 0}<span class="sep" class:lead={i === 1}><Icon name="chevronRight" size={14} /></span>{/if}
        {@const target = c.level}
        {#if target}
          <button class="crumb" class:root={i === 0} onclick={() => nav.go(target)} title={c.hint}>{c.label}</button>
        {:else}
          <span class="crumb cur" class:root={i === 0} title={c.hint}>{c.label}</span>
        {/if}
      {/each}
    </nav>

    <div class="tools" bind:this={toolsEl}>
      <div class="search">
        <button
          class="sbtn"
          class:on={sopen}
          onclick={() => (sopen ? closeSearch() : (sopen = true))}
          title="Search a process or file"
          aria-label="Search a process or file"
          aria-expanded={sopen}
        >
          <Icon name="search" size={16} />
        </button>
        {#if sopen}
          <button class="scrim" tabindex="-1" aria-label="Close the search" onclick={closeSearch}></button>
          <div class="pop" transition:fade={{ duration: 120 }} onfocusout={onPopFocusOut} role="search">
            <div class="field">
              <Icon name="search" size={15} />
              <input
                bind:this={searchEl}
                bind:value={q}
                placeholder="Search a process or file…"
                spellcheck="false"
                aria-label="Search processes and files"
                oninput={() => (cursor = 0)}
                onkeydown={onSearchKey}
              />
              {#if q}
                <button class="clr" onclick={() => (q = '')} title="Clear" aria-label="Clear search"><Icon name="x" size={13} /></button>
              {/if}
            </div>
            <div class="results" role="listbox">
              {#if q.trim() === ''}
                <div class="none">Type part of a process or file name — picking one lights up its pages.</div>
              {:else if hits.length === 0}
                <div class="none">No process or file matches “{q}”.</div>
              {:else}
                {#each hits as h, i (h.kind + h.id)}
                  <button
                    class="hit"
                    class:on={i === at}
                    role="option"
                    aria-selected={i === at}
                    onmousedown={(e) => e.preventDefault()}
                    onclick={() => pick(h)}
                    onpointerenter={() => (cursor = i)}
                  >
                    <i class="sw" class:file={h.kind === 'file'}></i>
                    <span class="n">{h.name}</span>
                    <span class="s">{h.sub}</span>
                    <b>{h.blocks ? fmtMiB(h.blocks) : '—'}</b>
                  </button>
                {/each}
              {/if}
            </div>
          </div>
        {/if}
      </div>
      <!-- the switch alone: every part view carries its own reading guides, on stage -->
      <ModeRow {component} scale="never" />
    </div>
  </header>

  <main class="stage">
    <PartView {nav} />

    <!-- the mini-map fades in and out itself: its root carries the transition -->
    {#if !atMachine}
      <MiniMap {level} h={nav.h} />
    {/if}
  </main>

  <footer class="dock">
    <div class="dleft">
      <button class="dbtn" disabled={!parent} onclick={nav.up} title="Up one level (Esc or Backspace)">
        <i class="up"><Icon name="chevronRight" size={15} /></i><span>{parent ?? 'Machine'}</span>
      </button>
      {#if lit}
        <button class="sel" class:file={lit.kind === 'file'} onclick={clearLit} title="Stop lighting up this owner's pages">
          <i class="sw" class:kernel={lit.kind === 'kernel'}></i><span class="n">{lit.name}</span><Icon name="x" size={13} />
        </button>
      {/if}
    </div>

    <!-- the middle: the siblings of the part on stage — at the machine, its headline numbers -->
    <div class="dmid">
      {#if atMachine}
        <Vitals />
      {:else if level.kind === 'memory' || level.kind === 'stick'}
        <ModulesDock {level} go={nav.go} />
      {:else if level.kind === 'die'}
        <div class="dies" aria-label="Dies of this module">
          <div class="drow head">
            <span class="rl"></span>
            {#each [1, 2, 3, 4, 5, 6, 7, 8] as n (n)}<span class="dn">{n}</span>{/each}
          </div>
          {#each [8, 0] as base (base)}
            <div class="drow">
              <span class="rl">R{base ? 1 : 0}</span>
              {#each dies.slice(base, base + 8) as c (c.index)}
                <button
                  class="dthumb"
                  class:cur={level.chip === c.index}
                  onclick={() => nav.go({ kind: 'die', chip: c.index })}
                  title="Open die {(c.index & 7) + 1} on rank {c.rank}"
                  aria-label="Open die {(c.index & 7) + 1} on rank {c.rank}"
                >
                  <svg viewBox="0 0 36 32" width="40" height="36" aria-hidden="true">
                    <rect x="0.5" y="0.5" width="35" height="31" rx="5" class="pkg" />
                    <ChipGrid chip={c.index} x={2} y={2} w={32} h={28} interactive={false} />
                  </svg>
                </button>
              {/each}
            </div>
          {/each}
        </div>
      {:else if map}
        {@const mp = map}
        <DockNav
          em="sibling blocks of die {(mp.chip & 7) + 1}"
          big="Block {mp.cell}"
          sub="row {mp.row} · col {mp.col}"
          prev={mp.cell > 0 ? { label: 'Previous block', go: () => nav.go({ kind: 'block', chip: mp.chip, cell: mp.cell - 1 }) } : null}
          next={mp.cell < 255 ? { label: 'Next block', go: () => nav.go({ kind: 'block', chip: mp.chip, cell: mp.cell + 1 }) } : null}
        >
          {#snippet map()}
            <svg viewBox="0 0 38 38" width="84" height="84" class="map" aria-label="Block map of this die — click a block to jump to it">
              <rect x="0.5" y="0.5" width="37" height="37" rx="5" class="pkg" />
              <ChipGrid chip={mp.chip} x={2} y={2} w={34} h={34} oncellclick={(c) => nav.go({ kind: 'block', chip: mp.chip, cell: c })} />
              <rect class="cur" x={mp.x} y={mp.y} width={mp.s} height={mp.s} rx="1" />
            </svg>
          {/snippet}
        </DockNav>
      {:else if level.kind === 'ccd'}
        <CcdDock ccd={level.ccd} go={nav.go} />
      {:else if level.kind === 'core'}
        <CoreDock core={level.core} go={nav.go} />
      {:else if level.kind === 'gdie' || level.kind === 'vram'}
        <CardDock kind={level.kind} go={nav.go} />
      {:else if level.kind === 'drives' || level.kind === 'drive'}
        <DrivesDock {level} go={nav.go} />
      {/if}
    </div>

    <div class="dright">
      <span class="hint">{HINT[level.kind]}</span>
      <span class="keys"><kbd>Esc</kbd> up one level · <kbd>scroll</kbd> on the hero zooms</span>
      <span class="mock">mock data</span>
    </div>
  </footer>
</div>

<style>
  /* ---- chrome of this UX: menu, top bar, stage, dock, mini-map ----
      The shared visual language of the part views (the io- classes) lives in levels/levels.css.
      This root carries `lv-scope` as well, so the chrome can use those classes too. */
  .ion {
    --menu-col: 64px;
    position: relative;
    height: 100%;
    display: grid;
    grid-template-columns: var(--menu-col) minmax(0, 1fr);
    grid-template-rows: 64px minmax(0, 1fr) 126px;
    overflow: hidden;
    color: var(--ink);
    background:
      radial-gradient(52% 48% at 12% 4%, color-mix(in srgb, var(--c-pagefile) 17%, transparent), transparent 100%),
      radial-gradient(46% 44% at 92% 98%, color-mix(in srgb, var(--c-private) 15%, transparent), transparent 100%),
      radial-gradient(44% 40% at 58% 104%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 100%),
      var(--bg);
  }

  /* The menu's column is the menu's own width and nothing more — the part views are laid out
     for what that leaves (960 px of stage in a 1024-px window) — save for the list, which
     takes 10 px more so that the board's tile column does not butt against it. */
  .ion[data-menu='list'] {
    --menu-col: 275px;
  }

  .defs {
    position: absolute;
  }

  /* ---- the side menu: a glass pane docked in the top-left corner ---- */
  .menu {
    grid-column: 1;
    grid-row: 1 / -1;
    position: relative;
    z-index: 8;
  }

  /* The pane is flush with the window's left edge, so the menu keeps the width it declares.
     The list has its padding on the other three sides; the rail (a collapsed pane, and the
     stage wants every one of its 64 px) has none, and draws its edge inside its own box. */
  .pane {
    position: absolute;
    top: 12px;
    left: 0;
    padding: 8px 8px 8px 0;
    border: 1px solid var(--line);
    border-left: 0;
    border-radius: 0 var(--radius) var(--radius) 0;
    background: var(--panel);
    box-shadow: inset 0 1px 0 var(--glass-hi), var(--shadow);
    backdrop-filter: blur(22px) saturate(1.3);
    -webkit-backdrop-filter: blur(22px) saturate(1.3);
  }

  .ion[data-menu='rail'] .pane {
    padding: 8px 0;
    border: 0;
    border-radius: 0;
    box-shadow: inset -1px 0 0 var(--line), inset 0 1px 0 var(--glass-hi);
  }

  /* ---- top bar: breadcrumb | search · the mode row ---- */
  .top {
    grid-column: 2;
    position: relative;
    display: flex;
    align-items: center;
    gap: 16px;
    /* 24 px of margin, all of which belong to the breadcrumb (see .crumbs): its content
       starts where the dock's and the part views' margin does */
    padding: 0 calc(var(--chrome-safe) + 12px) 0 24px;
    min-width: 0;
  }

  .crumbs {
    flex: 0 1 auto;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 2px;
    min-width: 0;
    overflow: hidden;
    /* A path that does not fit loses its oldest end: what overflows goes to the left, into the
       margin it shares with the bar, and fades out there — from the menu's pane onward. */
    margin-left: -24px;
    padding-left: 24px;
    mask-image: linear-gradient(90deg, transparent, var(--ink) 24px);
  }

  .crumb {
    flex: none;
    height: 30px;
    padding: 0 11px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--ink3);
    font: 500 13px var(--font-ui);
    white-space: nowrap;
    transition: color 120ms ease, background 120ms ease;
  }

  button.crumb:hover {
    color: var(--ink);
    background: var(--panel);
  }

  .crumb.cur {
    padding: 0 13px;
    background: var(--panel2);
    border: 1px solid var(--accent);
    color: var(--ink);
    font-weight: 650;
    box-shadow: 0 0 16px color-mix(in srgb, var(--accent) 32%, transparent), inset 0 1px 0 var(--glass-hi);
  }

  .sep {
    display: grid;
    flex: none;
    margin: 0 -3px;
    color: var(--ink3);
  }

  /* a bar that cannot hold the whole path at full size: the crumbs tighter … */
  .top[data-fit='tight'] .crumb,
  .top[data-fit='brief'] .crumb {
    padding: 0 8px;
    font-size: 12.5px;
  }

  .top[data-fit='tight'] .crumb.cur,
  .top[data-fit='brief'] .crumb.cur {
    padding: 0 10px;
  }

  /* … and then without its root — unless the root is where you are: the machine is on the
     menu, and every way up ends there */
  .top[data-fit='brief'] .crumb.root:not(.cur),
  .top[data-fit='brief'] .sep.lead {
    display: none;
  }

  .top[data-fit='brief'] .crumb {
    padding: 0 6px;
    font-size: 12px;
  }

  .top[data-fit='brief'] .crumb.cur {
    padding: 0 8px;
  }

  .tools {
    position: relative;
    flex: none;
    display: flex;
    align-items: center;
    gap: 14px;
    margin-left: auto;
  }

  .search {
    position: relative;
  }

  .sbtn {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    border: 1px solid var(--line);
    background: var(--panel);
    color: var(--ink3);
    box-shadow: inset 0 1px 0 var(--glass-hi);
    backdrop-filter: blur(16px);
    transition: color 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
  }

  .sbtn:hover,
  .sbtn.on {
    color: var(--ink);
    border-color: var(--accent);
  }

  .sbtn.on {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
  }

  /* a click anywhere else closes the search (a button, so that it is a real control) */
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 55;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: default;
  }

  /* It opens to the right of its button: the button stands at the left of the mode row, and
     on a narrow window there is not 420 px to its left. */
  .pop {
    position: absolute;
    z-index: 60;
    top: calc(100% + 10px);
    left: 0;
    width: 420px;
    padding: 6px;
    border-radius: var(--radius);
    background: var(--tip-bg);
    border: 1px solid var(--line2);
    box-shadow: var(--shadow);
    backdrop-filter: blur(22px) saturate(1.3);
    -webkit-backdrop-filter: blur(22px) saturate(1.3);
  }

  .field {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 38px;
    padding: 0 8px 0 13px;
    border-radius: 999px;
    background: var(--panel);
    border: 1px solid var(--line);
    color: var(--ink3);
    box-shadow: inset 0 1px 0 var(--glass-hi);
  }

  .field:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--ink2);
  }

  .field input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--ink);
    font: 400 12.5px var(--font-ui);
  }

  .field input::placeholder {
    color: var(--ink3);
  }

  .clr {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border: 0;
    border-radius: 50%;
    background: var(--panel2);
    color: var(--ink3);
  }

  .clr:hover {
    color: var(--ink);
  }

  .results {
    margin-top: 6px;
  }

  .none {
    padding: 10px 10px 8px;
    color: var(--ink3);
    font-size: 12px;
    line-height: 1.45;
  }

  .hit {
    display: grid;
    grid-template-columns: 10px minmax(0, auto) minmax(0, 1fr) 70px;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 36px;
    padding: 0 10px 0 12px;
    border: 0;
    border-radius: 11px;
    background: transparent;
    color: var(--ink);
    text-align: left;
    font-size: 12.5px;
  }

  .hit.on {
    background: color-mix(in srgb, var(--accent) 20%, transparent);
  }

  .hit .sw {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    background: var(--c-private);
  }

  .hit .sw.file {
    background: var(--c-file);
  }

  .hit .n {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hit .s {
    color: var(--ink3);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hit b {
    font: 500 11.5px var(--font-mono);
    color: var(--ink2);
    text-align: right;
  }

  /* ---- stage ---- */
  .stage {
    grid-column: 2;
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  /* ---- dock ---- */
  .dock {
    grid-column: 2;
    position: relative;
    z-index: 6;
    margin: 0 16px 14px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 18px;
    padding: 0 14px;
    border-radius: var(--radius);
    background: var(--panel);
    border: 1px solid var(--line);
    box-shadow: inset 0 1px 0 var(--glass-hi), var(--shadow);
    backdrop-filter: blur(22px) saturate(1.3);
    -webkit-backdrop-filter: blur(22px) saturate(1.3);
    /* what fits here depends on the window and on the menu beside it, not on the viewport alone */
    container: dock / inline-size;
  }

  .dleft,
  .dright {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .dbtn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 40px;
    padding: 0 17px 0 13px;
    border-radius: 999px;
    border: 1px solid var(--line2);
    background: var(--panel2);
    color: var(--ink);
    font: 600 13px var(--font-ui);
    white-space: nowrap;
    transition: border-color 140ms ease, transform 160ms ease, box-shadow 160ms ease;
  }

  .dbtn:hover {
    border-color: var(--accent);
  }

  .dbtn:active {
    transform: scale(0.97);
  }

  .dbtn:disabled {
    opacity: 0.4;
  }

  .dbtn .up {
    display: grid;
    color: var(--accent);
  }

  /* the icon set's chevron points right: -90° is "up", 180° is "left" */
  .dbtn .up :global(svg) {
    transform: rotate(-90deg);
  }

  .sel {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 40px;
    max-width: 200px;
    padding: 0 7px 0 14px;
    border-radius: 999px;
    border: 1px solid var(--accent);
    background: color-mix(in srgb, var(--accent) 16%, var(--panel2));
    color: var(--ink);
    font: 600 12.5px var(--font-ui);
    transition: transform 160ms ease;
  }

  .sel:active {
    transform: scale(0.97);
  }

  .sel .sw {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--c-private);
    box-shadow: 0 0 6px var(--accent-glow);
    flex: none;
  }

  .sel.file .sw {
    background: var(--c-file);
  }

  .sel .sw.kernel {
    background: var(--c-kernel);
  }

  .sel .n {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sel :global(svg) {
    color: var(--ink3);
    flex: none;
  }

  .dmid {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 0;
    height: 100%;
    overflow: hidden;
  }

  .map {
    display: block;
    border-radius: 12px;
  }

  .map .cur {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.1;
    filter: drop-shadow(0 0 2px var(--accent-glow));
    pointer-events: none;
  }

  /* dies of the module, laid out as on the stick: rank 1 above rank 0 */
  .dies {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 4px 0;
  }

  .drow {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .drow.head {
    height: 14px;
  }

  .rl,
  .dn {
    width: 44px;
    text-align: center;
    font: 600 9.5px var(--font-mono);
    letter-spacing: 0.08em;
    color: var(--ink3);
  }

  .rl {
    width: 24px;
  }

  .dthumb {
    display: grid;
    place-items: center;
    width: 44px;
    height: 40px;
    padding: 0;
    border-radius: 10px;
    border: 1px solid transparent;
    background: transparent;
    transition: background 160ms ease, border-color 160ms ease, transform 200ms cubic-bezier(0.2, 0.75, 0.25, 1);
  }

  .dthumb:hover {
    background: var(--panel2);
    transform: translateY(-2px);
  }

  .dthumb.cur {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 14%, var(--panel2));
    box-shadow: 0 0 16px color-mix(in srgb, var(--accent) 36%, transparent);
  }

  .dthumb svg {
    display: block;
    border-radius: 5px;
  }

  .pkg {
    fill: var(--dimm-chip);
    stroke: var(--dimm-chip-line);
    stroke-width: 0.7;
  }

  .dright {
    flex-direction: column;
    align-items: flex-end;
    justify-content: center;
    gap: 2px;
  }

  /* The notes step aside when the dock is too narrow to hold them beside everything else — the
     middle, the siblings, has priority — and whenever a selected owner's chip takes its room. */
  @container dock (max-width: 1099px) {
    .dleft:has(.sel) ~ .dright .hint,
    .dleft:has(.sel) ~ .dright .keys {
      display: none;
    }
  }

  @container dock (max-width: 899px) {
    .hint,
    .keys {
      display: none;
    }
  }

  .mock {
    padding: 1px 8px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--warn) 55%, transparent);
    color: var(--warn);
    font: 600 9.5px var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.14em;
    line-height: 1.5;
  }

  .hint {
    font: 500 12px var(--font-ui);
    color: var(--ink2);
    white-space: nowrap;
  }

  .keys {
    font-size: 10.5px;
    color: var(--ink3);
    white-space: nowrap;
  }

  .keys kbd {
    padding: 0 5px;
    border-radius: 5px;
    border: 1px solid var(--line2);
    font: 600 9.5px var(--font-mono);
    color: var(--ink2);
  }
</style>
