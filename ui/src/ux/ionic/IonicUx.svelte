<script lang="ts">
  /**
   * UX B · Ionic — a spatial drill-down. One thing fills the stage at a time and the user
   * zooms through physical containment, along one of three chains rooted at the machine:
   *
   *   machine ├─ DIMM › die › block                      memory
   *           ├─ processor › CCD › core                  processor
   *           └─ graphics card › GPU die | VRAM          graphics
   *
   * Chrome stays thin on purpose: a breadcrumb, a search and one big number on top, next to
   * the switch that says what the colours mean; a dock of siblings below; a mini-map that
   * says where you are. Processes and files are not a page — they are an overlay summoned
   * from the search field or the dock's Apps button.
   */
  import { untrack } from 'svelte';
  import { fade } from 'svelte/transition';
  import { app, getMachine, selectProcess, selectFile, selectDimm, setHighlight } from '../../mock/store.svelte';
  import { fmtMiB } from '../../mock/model';
  import Icon from '../../scene/Icon.svelte';
  import ChipGrid from '../../scene/ChipGrid.svelte';
  import ModeSwitch from '../../scene/ModeSwitch.svelte';
  import {
    type Level,
    type Kind,
    type Target,
    type Whence,
    DEPTH,
    PART,
    keyOf,
    upOf,
    orderOf,
    dimmOf,
    parentName,
    crumbsOf,
    levelFromUrl,
    zoom,
    anchorOf,
  } from '../../levels/nav';
  import MachineLevel from '../../levels/MachineLevel.svelte';
  import StickLevel from '../../levels/StickLevel.svelte';
  import DieLevel from '../../levels/DieLevel.svelte';
  import BlockLevel from '../../levels/BlockLevel.svelte';
  import PackageLevel from '../../levels/PackageLevel.svelte';
  import CcdLevel from '../../levels/CcdLevel.svelte';
  import CoreLevel from '../../levels/CoreLevel.svelte';
  import CardLevel from '../../levels/CardLevel.svelte';
  import GpuDieLevel from '../../levels/GpuDieLevel.svelte';
  import VramLevel from '../../levels/VramLevel.svelte';
  import AppsPanel from './AppsPanel.svelte';
  import MiniMap from './MiniMap.svelte';
  import Vitals from './Vitals.svelte';
  import PartsDock from './PartsDock.svelte';
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
  /** Users who ask for less motion get level changes without the zoom. */
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ZOOM_MS = still ? 0 : 540;
  const HINT: Record<Kind, string> = {
    machine: 'click the socket, a module or the card to open it',
    stick: 'click a die to open it',
    die: 'click a block to open it',
    block: 'click a page group to highlight its owner',
    package: 'click a chiplet or a core to open it',
    ccd: 'click a core to open it',
    core: 'hover a thread to read it · Esc returns to the chiplet',
    card: 'click the die or a VRAM chip to open it',
    gdie: 'hover a unit · click an engine to pin it',
    vram: 'hover a process to see its share · click a chip to pin it',
    memory: 'click a module to open it',
    drives: 'click a drive to open it',
    drive: 'Esc goes up to the drives',
    apps: 'click a process to see what it holds',
  };

  let level = $state<Level>(levelFromUrl(m));
  /** Which way the level now on stage arrived — drives the zoom-through transition. */
  let whence = $state<Whence>('below');
  /** Stage point the last zoom turned around (px). */
  let zoomX = $state(-1);
  let zoomY = $state(-1);
  let appsOpen = $state(false);
  let sw = $state(0);
  let sh = $state(0);
  let q = $state('');
  let sopen = $state(false);
  let cursor = $state(0);
  let searchEl = $state<HTMLInputElement>();

  // where the user last was at each depth — re-entering a level returns there.
  // Seeded from the start level (read once); kept up to date by the effect below.
  const last = untrack(() => {
    const part: 'stick' | 'package' | 'card' =
      level.kind === 'package' || level.kind === 'ccd' || level.kind === 'core' ? 'package' : level.kind === 'card' || level.kind === 'gdie' || level.kind === 'vram' ? 'card' : 'stick';
    return {
      stick: dimmOf(level, m) ?? 0,
      chip: level.kind === 'die' || level.kind === 'block' ? level.chip : -1,
      cell: level.kind === 'block' ? level.cell : 0,
      ccd: level.kind === 'core' ? level.core >> 3 : level.kind === 'ccd' ? level.ccd : 0,
      core: level.kind === 'core' ? level.core : 2,
      part,
    };
  });

  const st = $derived(app.stats);
  const key = $derived(keyOf(level));
  const crumbs = $derived(crumbsOf(level, m));
  /** Which component of the machine this level is about — picks the reading guide and the modes that apply. */
  const component = $derived(PART[level.kind]);
  const atMachine = $derived(level.kind === 'machine');
  const parent = $derived(level.kind === 'machine' ? null : parentName(level, m));
  const dies = $derived.by(() => {
    const l = level;
    return l.kind === 'die' || l.kind === 'block' ? m.dimms[m.chips[l.chip].dimm].chips : [];
  });

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

  /** The owner whose pages are lit up right now — what the dock chip reports and clears. */
  const lit = $derived.by(() => {
    const h = app.highlight;
    if (h?.kind !== 'owner' || h.id === 0) return null; // 0 is "no owner"
    const o = m.owners[h.id];
    if (!o) return null;
    return { kind: o.kind, name: o.kind === 'file' ? (o.name.split('\\').pop() ?? o.name) : o.name };
  });

  // ---- search: processes and files, the two things that own pages --------------------

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
  function clearLit() {
    const o = lit;
    if (!o) return;
    if (o.kind === 'file') selectFile(null);
    else if (o.kind === 'process') selectProcess(null);
    else setHighlight(null);
  }

  // ---- moving along the chains -------------------------------------------------------

  function go(next: Level) {
    if (keyOf(next) === key) return; // already there: a shared scene and this UX may both report one click
    const deeper = DEPTH[next.kind] > DEPTH[level.kind];
    const shallower = DEPTH[next.kind] < DEPTH[level.kind];
    // zooming in, the new level comes up from below; zooming out, down from above;
    // a sibling swap slides toward the direction the sibling lies in
    whence = deeper ? 'below' : shallower ? 'above' : orderOf(next) >= orderOf(level) ? 'left' : 'right';
    // zoom around the thing being opened — or closed, on the way up — so it grows out of
    // its place in the level above instead of out of the stage centre
    const W = sw || 1200;
    const H = sh || 640;
    const a = deeper ? anchorOf(next, W, H) : shallower ? anchorOf(level, W, H) : null;
    zoomX = a?.x ?? W / 2;
    zoomY = a?.y ?? H / 2;
    appsOpen = false;
    sopen = false;
    level = next;
  }
  function goUp() {
    const u = upOf(level, m);
    if (u) go(u);
  }
  /** Where "zoom in" lands when nothing is under the pointer: the part of the machine opened last. */
  function lastPart(): Level {
    if (last.part === 'package') return { kind: 'package' };
    if (last.part === 'card') return { kind: 'card' };
    return { kind: 'stick', dimm: last.stick };
  }
  /** One level deeper — at the thing under the pointer when there is one. */
  function down(target?: Target): void {
    const l = level;
    if (l.kind === 'machine') {
      if (target?.dimm !== undefined) return go({ kind: 'stick', dimm: target.dimm });
      if (target?.gpu) return go(target.vram ? { kind: 'vram' } : { kind: 'card' });
      if (target?.cpu) return go({ kind: 'package' });
      return go(lastPart());
    }
    if (l.kind === 'stick') {
      const local = last.stick === l.dimm && last.chip >= 0 ? last.chip & 15 : 0;
      return go({ kind: 'die', chip: target?.chip ?? m.dimms[l.dimm].chips[local].index });
    }
    if (l.kind === 'die') return go({ kind: 'block', chip: l.chip, cell: target?.cell ?? last.cell });
    if (l.kind === 'package') return go({ kind: 'ccd', ccd: target?.ccd ?? last.ccd });
    if (l.kind === 'ccd') {
      const local = last.ccd === l.ccd && last.core >= 0 ? last.core : l.ccd * 8;
      return go({ kind: 'core', core: target?.core ?? local });
    }
    if (l.kind === 'card') return go(target?.vram ? { kind: 'vram' } : { kind: 'gdie' });
  }

  // remember where we are, and keep the store's module selection in step with it
  $effect(() => {
    const l = level;
    if (l.kind === 'stick') {
      last.stick = l.dimm;
      last.part = 'stick';
    }
    if (l.kind === 'die' || l.kind === 'block') {
      last.chip = l.chip;
      last.cell = l.kind === 'block' ? l.cell : last.cell;
      last.stick = m.chips[l.chip].dimm;
      last.part = 'stick';
    }
    if (l.kind === 'package') last.part = 'package';
    if (l.kind === 'ccd') last.ccd = l.ccd;
    if (l.kind === 'core') {
      last.core = l.core;
      last.ccd = l.core >> 3;
    }
    if (l.kind === 'card' || l.kind === 'gdie' || l.kind === 'vram') last.part = 'card';
    selectDimm(dimmOf(l, m));
  });

  // Esc / Backspace go up one level. Esc is captured before the global handler so that
  // going up does not also wipe the owner highlight, which is meant to follow the user.
  $effect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target === searchEl;
      if (e.key === 'Escape') {
        if (typing) {
          closeSearch();
          e.stopImmediatePropagation();
          return;
        }
        if (appsOpen) {
          appsOpen = false;
          e.stopImmediatePropagation();
          return;
        }
        if (level.kind !== 'machine') {
          e.stopImmediatePropagation();
          goUp();
        }
        return; // at the machine, Esc falls through: the app clears the highlight
      }
      if (!typing && e.key === 'Backspace' && level.kind !== 'machine') {
        e.preventDefault();
        goUp();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
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

<div class="ion lv-scope" data-level={level.kind} data-part={component} data-short={sh > 0 && sh < 620 ? '1' : '0'}>
  <header class="top">
    <nav class="crumbs" aria-label="Zoom path">
      <span class="mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      {#each crumbs as c, i (c.label + i)}
        {#if i > 0}<span class="sep"><Icon name="chevronRight" size={14} /></span>{/if}
        {@const target = c.level}
        {#if target}
          <button class="crumb" onclick={() => go(target)} title={c.hint}>{c.label}</button>
        {:else}
          <span class="crumb cur" title={c.hint}>{c.label}</span>
        {/if}
      {/each}
    </nav>

    <div class="tools">
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
      <ModeSwitch {component} />
      <Vitals {component} machine={atMachine} />
    </div>
  </header>

  <main
    class="stage"
    bind:clientWidth={sw}
    bind:clientHeight={sh}
    style={zoomX < 0 ? null : `--zoom-x:${zoomX}px; --zoom-y:${zoomY}px`}
  >
    {#key key}
      <div class="lv" in:zoom={{ whence, dur: ZOOM_MS }} out:zoom={{ whence, out: true, dur: ZOOM_MS }}>
        {#if level.kind === 'machine'}
          <MachineLevel w={sw} h={sh} {go} {down} />
        {:else if level.kind === 'stick'}
          <StickLevel dimm={level.dimm} w={sw} h={sh} {go} {down} />
        {:else if level.kind === 'die'}
          <DieLevel chip={level.chip} w={sw} h={sh} {go} {down} />
        {:else if level.kind === 'block'}
          <BlockLevel chip={level.chip} cell={level.cell} w={sw} h={sh} {go} />
        {:else if level.kind === 'package'}
          <PackageLevel w={sw} h={sh} {go} {down} />
        {:else if level.kind === 'ccd'}
          <CcdLevel ccd={level.ccd} w={sw} h={sh} {go} {down} />
        {:else if level.kind === 'core'}
          <CoreLevel core={level.core} w={sw} h={sh} {go} />
        {:else if level.kind === 'card'}
          <CardLevel w={sw} h={sh} {go} {down} />
        {:else if level.kind === 'gdie'}
          <GpuDieLevel w={sw} h={sh} {go} />
        {:else}
          <VramLevel w={sw} h={sh} {go} />
        {/if}
      </div>
    {/key}

    <!-- the mini-map fades in and out itself: its root carries the transition -->
    {#if level.kind !== 'machine'}
      <MiniMap {level} h={sh} />
    {/if}
  </main>

  {#if appsOpen}
    <AppsPanel onclose={() => (appsOpen = false)} />
  {/if}

  <footer class="dock">
    <div class="dleft">
      <button class="dbtn apps" class:on={appsOpen} onclick={() => (appsOpen = !appsOpen)} title="Processes and their pages">
        <Icon name="apps" size={16} /><span>Apps</span>
      </button>
      {#if lit}
        <button class="sel" class:file={lit.kind === 'file'} onclick={clearLit} title="Stop lighting up this owner's pages">
          <i class="sw" class:kernel={lit.kind === 'kernel'}></i><span class="n">{lit.name}</span><Icon name="x" size={13} />
        </button>
      {/if}
      <button class="dbtn" disabled={!parent} onclick={goUp} title="Up one level (Esc or Backspace)">
        <i class="up"><Icon name="chevronRight" size={15} /></i><span>{parent ?? 'Machine'}</span>
      </button>
    </div>

    <div class="dmid">
      {#if level.kind === 'machine' || level.kind === 'stick' || level.kind === 'package' || level.kind === 'card'}
        <PartsDock {level} {go} />
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
                  onclick={() => go({ kind: 'die', chip: c.index })}
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
          prev={mp.cell > 0 ? { label: 'Previous block', go: () => go({ kind: 'block', chip: mp.chip, cell: mp.cell - 1 }) } : null}
          next={mp.cell < 255 ? { label: 'Next block', go: () => go({ kind: 'block', chip: mp.chip, cell: mp.cell + 1 }) } : null}
        >
          {#snippet map()}
            <svg viewBox="0 0 38 38" width="84" height="84" class="map" aria-label="Block map of this die — click a block to jump to it">
              <rect x="0.5" y="0.5" width="37" height="37" rx="5" class="pkg" />
              <ChipGrid chip={mp.chip} x={2} y={2} w={34} h={34} oncellclick={(c) => go({ kind: 'block', chip: mp.chip, cell: c })} />
              <rect class="cur" x={mp.x} y={mp.y} width={mp.s} height={mp.s} rx="1" />
            </svg>
          {/snippet}
        </DockNav>
      {:else if level.kind === 'ccd'}
        <CcdDock ccd={level.ccd} {go} />
      {:else if level.kind === 'core'}
        <CoreDock core={level.core} {go} />
      {:else if level.kind === 'gdie' || level.kind === 'vram'}
        <CardDock kind={level.kind} {go} />
      {/if}
    </div>

    <div class="dright">
      <span class="mock">mock data</span>
      <span class="hint">{HINT[level.kind]}</span>
      <span class="keys"><kbd>Esc</kbd> up one level · <kbd>scroll</kbd> on the hero zooms</span>
    </div>
  </footer>
</div>

<style>
  /* ---- chrome of this UX: top bar, stage, dock, mini-map, vitals ----
     The shared visual language of the part views (the io- classes) lives in levels/levels.css.
     This root carries `lv-scope` as well, so the chrome can use those classes too. */
  .ion {
    position: relative;
    height: 100%;
    display: grid;
    grid-template-rows: 64px minmax(0, 1fr) 126px;
    overflow: hidden;
    color: var(--ink);
    background:
      radial-gradient(52% 48% at 12% 4%, color-mix(in srgb, var(--c-pagefile) 17%, transparent), transparent 100%),
      radial-gradient(46% 44% at 92% 98%, color-mix(in srgb, var(--c-private) 15%, transparent), transparent 100%),
      radial-gradient(44% 40% at 58% 104%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 100%),
      var(--bg);
  }

  .defs {
    position: absolute;
  }


  /* ---- top bar: breadcrumb | search · modes · the big number(s) ---- */
  .top {
    position: relative;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 calc(var(--chrome-safe) + 12px) 0 20px;
    min-width: 0;
  }

  .crumbs {
    flex: 0 1 auto;
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    overflow: hidden;
  }

  .mark {
    display: grid;
    grid-template-columns: repeat(2, 6px);
    gap: 2px;
    margin-right: 12px;
    flex: none;
  }

  .mark i {
    width: 6px;
    height: 6px;
    border-radius: 2px;
    background: var(--accent);
    opacity: 0.38;
  }

  .mark i:first-child {
    opacity: 1;
    box-shadow: 0 0 8px var(--accent-glow);
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

  .pop {
    position: absolute;
    z-index: 60;
    top: calc(100% + 10px);
    right: 0;
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
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .stage :global(.lv) {
    position: absolute;
    inset: 0;
    z-index: 1;
    transform-origin: var(--zoom-x, 50%) var(--zoom-y, 50%);
  }


  /* ---- dock ---- */
  .dock {
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

  .dbtn.apps {
    background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 34%, var(--panel2)), var(--panel2));
  }

  .dbtn.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
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
    max-width: 240px;
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
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sel :global(svg) {
    color: var(--ink3);
  }


  .dmid {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 0;
    height: 100%;
    overflow: hidden;
    /* what fits here depends on the buttons left of it and the notes right of it, not on the window */
    container-type: inline-size;
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


  @media (max-width: 1380px) {

    .keys,
    .hint {
      display: none; /* the dock's middle — the siblings — has priority */
    }
}

  @media (max-width: 1240px) {

    .crumb {
      padding: 0 8px;
      font-size: 12.5px;
    }

    .crumb.cur {
      padding: 0 10px;
    }

    .mark {
      display: none;
    }
}
</style>
