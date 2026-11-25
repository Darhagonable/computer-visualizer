<script lang="ts">
  /**
   * UX B · Ionic — a spatial drill-down. One thing fills the stage at a time and the user
   * zooms through physical containment: machine → stick → die → block → pages.
   *
   * Chrome stays thin on purpose: a breadcrumb, a search and one big number on top; a dock
   * of siblings below; a mini-map that says where you are. Processes and files are not a
   * page — they are an overlay summoned from the search field or the dock's Apps button.
   */
  import { untrack } from 'svelte';
  import { fade } from 'svelte/transition';
  import { app, getMachine, selectProcess, selectFile, selectDimm, setHighlight } from '../../mock/store.svelte';
  import { fmtMiB } from '../../mock/model';
  import Icon from '../../scene/Icon.svelte';
  import RamBoard from '../../scene/RamBoard.svelte';
  import DimmStick from '../../scene/DimmStick.svelte';
  import ChipGrid from '../../scene/ChipGrid.svelte';
  import { RAM_BOARD, STICK } from '../../scene/geometry';
  import {
    type Level,
    type Whence,
    DEPTH,
    keyOf,
    upOf,
    orderOf,
    dimmOf,
    parentName,
    crumbsOf,
    levelFromUrl,
    zoom,
    anchorOf,
    stickBox,
    dieBox,
    cellBox,
  } from './nav';
  import MachineLevel from './MachineLevel.svelte';
  import StickLevel from './StickLevel.svelte';
  import DieLevel from './DieLevel.svelte';
  import BlockLevel from './BlockLevel.svelte';
  import AppsPanel from './AppsPanel.svelte';

  interface Hit {
    kind: 'process' | 'file';
    id: number;
    name: string;
    sub: string;
    blocks: number;
  }

  const m = getMachine();
  const RING = 2 * Math.PI * 17;
  /** Bloom filters by cell size (σ in SVG user units): board cells → 64-page cells → 4-page cells. */
  const GLOWS: [string, number][] = [
    ['io-glow-xs', 0.7],
    ['io-glow-sm', 1.25],
    ['io-glow-md', 2.6],
    ['io-glow-lg', 7.5],
  ];
  const totalGiB = m.dimms.reduce((s, d) => s + d.capacityGiB, 0);
  const LADDER: { kind: Level['kind']; label: string; sub: string }[] = [
    { kind: 'machine', label: 'Machine', sub: `${m.dimms.length} modules` },
    { kind: 'stick', label: 'Stick', sub: '16 dies' },
    { kind: 'die', label: 'Die', sub: '256 blocks' },
    { kind: 'block', label: 'Block', sub: '1,024 pages' },
  ];
  /** Users who ask for less motion get level changes without the zoom. */
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ZOOM_MS = still ? 0 : 540;
  const HINT: Record<Level['kind'], string> = {
    machine: 'click a module to open it',
    stick: 'click a die to open it',
    die: 'click a block to open it',
    block: 'click a page group to highlight its owner',
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
  let focused = $state(false);
  let cursor = $state(0);
  let searchEl: HTMLInputElement;

  // where the user last was at each depth — re-entering a level returns there.
  // Seeded from the start level (read once); kept up to date by the effect below.
  const last = untrack(() => ({
    stick: dimmOf(level, m) ?? 0,
    chip: level.kind === 'die' || level.kind === 'block' ? level.chip : -1,
    cell: level.kind === 'block' ? level.cell : 0,
  }));

  const st = $derived(app.stats);
  const key = $derived(keyOf(level));
  const crumbs = $derived(crumbsOf(level, m));
  const use = $derived(st ? (st.inUse / st.total) * 100 : 0);
  const curDimm = $derived(dimmOf(level, m));
  const curSlot = $derived(curDimm !== null ? m.slots[m.dimms[curDimm].slot] : null);
  const curChip = $derived(level.kind === 'die' || level.kind === 'block' ? m.chips[level.chip] : null);
  const parent = $derived(level.kind === 'machine' ? null : parentName(level, m));
  const dies = $derived.by(() => {
    const l = level;
    return l.kind === 'die' || l.kind === 'block' ? m.dimms[m.chips[l.chip].dimm].chips : [];
  });

  /** The current stick / die / block, projected onto the compact board for the mini-map. */
  const here = $derived.by(() => {
    const l = level;
    if (!curSlot || curDimm === null) return null;
    const stick = stickBox(curSlot.index);
    const die = curChip ? dieBox(curSlot.index, curChip.index) : null;
    const cell = l.kind === 'block' && curChip ? cellBox(curSlot.index, curChip.index, l.cell) : null;
    return { stick, die, cell };
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
  const open = $derived(focused && q.trim().length > 0);
  const at = $derived(Math.min(cursor, Math.max(0, hits.length - 1)));

  function pick(h: Hit) {
    if (h.kind === 'process') selectProcess(h.id);
    else selectFile(h.id);
    q = '';
    searchEl?.blur();
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
  function clearLit() {
    const o = lit;
    if (!o) return;
    if (o.kind === 'file') selectFile(null);
    else if (o.kind === 'process') selectProcess(null);
    else setHighlight(null);
  }

  // ---- moving along the chain ---------------------------------------------------------

  function go(next: Level) {
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
    level = next;
  }
  function goUp() {
    const u = upOf(level, m);
    if (u) go(u);
  }
  /** One level deeper — at the thing under the pointer when there is one. */
  function down(target?: { dimm?: number; chip?: number; cell?: number }): void {
    const l = level;
    if (l.kind === 'machine') return go({ kind: 'stick', dimm: target?.dimm ?? last.stick });
    if (l.kind === 'stick') {
      const local = last.stick === l.dimm && last.chip >= 0 ? last.chip & 15 : 0;
      return go({ kind: 'die', chip: target?.chip ?? m.dimms[l.dimm].chips[local].index });
    }
    if (l.kind === 'die') return go({ kind: 'block', chip: l.chip, cell: target?.cell ?? last.cell });
  }
  /** Jump straight to a depth of the ladder (returns to where you last were there). */
  function jump(kind: Level['kind']) {
    const stick = last.stick;
    if (kind === 'machine') return go({ kind: 'machine' });
    if (kind === 'stick') return go({ kind: 'stick', dimm: stick });
    const chip = last.stick === stick && last.chip >= 0 ? last.chip : m.dimms[stick].chips[0].index;
    if (kind === 'die') return go({ kind: 'die', chip });
    go({ kind: 'block', chip, cell: last.chip === chip ? last.cell : 0 });
  }

  // remember where we are, and keep the store's module selection in step with it
  $effect(() => {
    const l = level;
    if (l.kind === 'stick') last.stick = l.dimm;
    if (l.kind === 'die' || l.kind === 'block') {
      last.chip = l.chip;
      last.cell = l.kind === 'block' ? l.cell : last.cell;
      last.stick = m.chips[l.chip].dimm;
    }
    selectDimm(dimmOf(l, m));
  });

  // Esc / Backspace go up one level. Esc is captured before the global handler so that
  // going up does not also wipe the owner highlight, which is meant to follow the user.
  $effect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target === searchEl;
      if (e.key === 'Escape') {
        if (typing) {
          q = '';
          searchEl?.blur();
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

<div class="ion" data-level={level.kind}>
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

    <div class="search">
      <div class="field" class:on={open}>
        <Icon name="search" size={15} />
        <input
          bind:this={searchEl}
          bind:value={q}
          placeholder="Search a process or file…"
          spellcheck="false"
          aria-label="Search processes and files"
          onfocus={() => (focused = true)}
          onblur={() => (focused = false)}
          oninput={() => (cursor = 0)}
          onkeydown={onSearchKey}
        />
        {#if q}
          <button class="clr" onclick={() => (q = '')} title="Clear" aria-label="Clear search"><Icon name="x" size={13} /></button>
        {/if}
      </div>
      {#if open}
        <div class="results" role="listbox" transition:fade={{ duration: 120 }}>
          {#if hits.length === 0}
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
      {/if}
    </div>

    <div class="inuse" class:paused={!app.running} title="Active + modified pages across every module">
      <svg viewBox="0 0 40 40" class="ring" aria-hidden="true">
        <circle cx="20" cy="20" r="17" class="tr" />
        <circle cx="20" cy="20" r="17" class="ar" style="stroke-dasharray:{RING.toFixed(2)}; stroke-dashoffset:{(RING * (1 - use / 100)).toFixed(2)}" />
      </svg>
      <div class="txt">
        <b>{Math.round(use)}<i>%</i></b>
        <span><em>in use</em> · {st ? `${fmtMiB(st.inUse)} of ${totalGiB} GiB` : ''}</span>
      </div>
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
        {:else}
          <BlockLevel chip={level.chip} cell={level.cell} w={sw} h={sh} {go} />
        {/if}
      </div>
    {/key}

    {#if here}
      <aside class="mini" transition:fade={{ duration: 220 }}>
        <header><b>You are here</b><span>{crumbs.at(-1)?.label}</span></header>
        <svg viewBox="0 0 {RAM_BOARD.width} {RAM_BOARD.compactHeight}">
          <RamBoard compact interactive={false} />
          <path
            class="veil"
            fill-rule="evenodd"
            d="M0 0H{RAM_BOARD.width}V{RAM_BOARD.compactHeight}H0Z M{here.stick.x} {here.stick.y}h{here.stick.w}v{here.stick.h}h-{here.stick.w}Z"
          />
          <rect class="here" x={here.stick.x} y={here.stick.y} width={here.stick.w} height={here.stick.h} rx="12" />
          {#if here.die}
            <rect class="here die" x={here.die.x - 5} y={here.die.y - 5} width={here.die.w + 10} height={here.die.h + 10} rx="9" />
          {/if}
          {#if here.cell}
            <rect class="here cell" x={here.cell.x - 13} y={here.cell.y - 13} width={here.cell.w + 26} height={here.cell.h + 26} rx="7" />
          {/if}
        </svg>
      </aside>
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
      {#if level.kind === 'machine'}
        <div class="ladder">
          {#each LADDER as r, i (r.kind)}
            {#if i > 0}<span class="link"></span>{/if}
            <button class="rung" class:cur={i === 0} onclick={() => jump(r.kind)} title="Zoom to the {r.label.toLowerCase()} level">
              <i class="dot"></i>
              <span><b>{r.label}</b><em>{r.sub}</em></span>
            </button>
          {/each}
        </div>
      {:else if level.kind === 'stick'}
        {#each m.dimms as d (d.index)}
          {@const label = m.slots[d.slot].label}
          <button class="thumb" class:cur={level.dimm === d.index} onclick={() => go({ kind: 'stick', dimm: d.index })} title="Open {label}">
            <svg viewBox="0 0 {STICK.width} {STICK.height}" width="150" height="43"><DimmStick dimm={d} interactive={false} labels={false} /></svg>
            <span><b>{label}</b><i>{Math.round((st?.dimmUsed[d.index] ?? 0) * 100)}% in use</i></span>
          </button>
        {/each}
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
                <button class="dthumb" class:cur={level.chip === c.index} onclick={() => go({ kind: 'die', chip: c.index })} title="Open die {(c.index & 7) + 1} on rank {c.rank}" aria-label="Open die {(c.index & 7) + 1} on rank {c.rank}">
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
        <div class="bmap">
          <svg viewBox="0 0 38 38" width="84" height="84" class="map" aria-label="Block map of this die — click a block to jump to it">
            <rect x="0.5" y="0.5" width="37" height="37" rx="5" class="pkg" />
            <ChipGrid chip={mp.chip} x={2} y={2} w={34} h={34} oncellclick={(c) => go({ kind: 'block', chip: mp.chip, cell: c })} />
            <rect class="cur" x={mp.x} y={mp.y} width={mp.s} height={mp.s} rx="1" />
          </svg>
          <div class="nav">
            <span class="lbl"><em>sibling blocks of die {(mp.chip & 7) + 1}</em><b>Block {mp.cell}</b><i>row {mp.row} · col {mp.col}</i></span>
            <div class="steps">
              <button class="step prev" disabled={mp.cell === 0} onclick={() => go({ kind: 'block', chip: mp.chip, cell: mp.cell - 1 })} title="Previous block" aria-label="Previous block"><Icon name="chevronRight" size={15} /></button>
              <button class="step" disabled={mp.cell === 255} onclick={() => go({ kind: 'block', chip: mp.chip, cell: mp.cell + 1 })} title="Next block" aria-label="Next block"><Icon name="chevronRight" size={15} /></button>
            </div>
          </div>
        </div>
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
  /* ---- shared visual language of this UX: anything inside .ion may use the io- classes ---- */
  .ion {
    --glass-hi: color-mix(in srgb, var(--ink) 9%, transparent);
    --r-tile: 16px;
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
  @media (prefers-reduced-motion: reduce) {
    .ion :global(*),
    .ion :global(*::before),
    .ion :global(*::after) {
      transition-duration: 0.01ms !important;
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
    }
  }

  /* glass stat tile */
  .ion :global(.io-tile) {
    min-width: 172px;
    padding: 11px 16px 12px;
    border-radius: var(--r-tile);
    background: var(--panel);
    border: 1px solid var(--line);
    box-shadow: inset 0 1px 0 var(--glass-hi), var(--shadow);
    backdrop-filter: blur(18px) saturate(1.25);
    -webkit-backdrop-filter: blur(18px) saturate(1.25);
  }
  .ion :global(.io-tile em) {
    display: block;
    font: 600 9.5px var(--font-mono);
    font-style: normal;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink3);
  }
  /* the big numeral of a tile: a direct child <b> (nested b's belong to lists and legends) */
  .ion :global(.io-tile > b:not(.plain):not(.io-name)) {
    display: block;
    margin-top: 2px;
    font: 300 28px/1.15 var(--font-ui);
    letter-spacing: -0.02em;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .ion :global(.io-tile > b:not(.plain):not(.io-name) i) {
    font-style: normal;
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0;
    color: var(--ink3);
    margin-left: 4px;
  }
  .ion :global(.io-tile b.io-name) {
    display: block;
    margin-top: 4px;
    font: 600 21px/1.25 var(--font-ui);
    letter-spacing: -0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* identifiers rather than numerals: part numbers, page frames… */
  .ion :global(.io-tile b.plain) {
    display: block;
    font: 500 12.5px/1.5 var(--font-mono);
    color: var(--ink2);
    white-space: nowrap;
  }
  .ion :global(.io-tile span) {
    display: block;
    margin-top: 2px;
    font-size: 11px;
    color: var(--ink3);
    white-space: nowrap;
  }
  .ion :global(.io-tile.accent b) {
    color: var(--accent);
  }

  /* the square DRAM package of the die and block levels (viewBox 600 × 600) */
  .ion :global(.io-package) {
    position: relative;
    z-index: 0;
  }
  /* ambient light under the package — a static blur, nothing animates here */
  .ion :global(.io-package::before) {
    content: '';
    position: absolute;
    z-index: -1;
    inset: 10%;
    border-radius: 44px;
    background: radial-gradient(closest-side, color-mix(in srgb, var(--accent) 34%, transparent), transparent);
    filter: blur(46px);
  }
  .ion :global(.io-package svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
  .ion :global(.io-package .pkg) {
    fill: var(--dimm-chip);
    stroke: var(--dimm-chip-line);
    stroke-width: 1.6;
  }
  .ion :global(.io-package .rim) {
    fill: none;
    stroke: var(--dimm-chip-line);
    stroke-width: 0.7;
    opacity: 0.75;
  }
  .ion :global(.io-package .pin) {
    fill: var(--dimm-gold);
  }
  .ion :global(.io-package .etch) {
    fill: var(--ink3);
    font: 600 7px var(--font-mono);
    letter-spacing: 0.14em;
    pointer-events: none;
  }
  .ion :global(.io-package .io-badge) {
    position: absolute;
    left: 50%;
    bottom: -38px;
    transform: translateX(-50%);
    white-space: nowrap;
  }

  /* the square DRAM package of the die and block levels (viewBox 600 × 600) */
  .ion :global(.io-package) {
    position: relative;
    z-index: 0;
  }
  /* ambient light under the package — a static blur, nothing animates here */
  .ion :global(.io-package::before) {
    content: '';
    position: absolute;
    z-index: -1;
    inset: 10%;
    border-radius: 44px;
    background: radial-gradient(closest-side, color-mix(in srgb, var(--accent) 34%, transparent), transparent);
    filter: blur(46px);
  }
  .ion :global(.io-package svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
  .ion :global(.io-package .pkg) {
    fill: var(--dimm-chip);
    stroke: var(--dimm-chip-line);
    stroke-width: 1.6;
  }
  .ion :global(.io-package .rim) {
    fill: none;
    stroke: var(--dimm-chip-line);
    stroke-width: 0.7;
    opacity: 0.75;
  }
  .ion :global(.io-package .pin) {
    fill: var(--dimm-gold);
  }
  .ion :global(.io-package .etch) {
    fill: var(--ink3);
    font: 600 7px var(--font-mono);
    letter-spacing: 0.14em;
    pointer-events: none;
  }
  .ion :global(.io-package .io-badge) {
    position: absolute;
    left: 50%;
    bottom: -38px;
    transform: translateX(-50%);
    white-space: nowrap;
  }

  /* the square DRAM package of the die and block levels (viewBox 600 × 600) */
  .ion :global(.io-package) {
    position: relative;
    z-index: 0;
  }
  /* ambient light under the package — a static blur, nothing animates here */
  .ion :global(.io-package::before) {
    content: '';
    position: absolute;
    z-index: -1;
    inset: 10%;
    border-radius: 44px;
    background: radial-gradient(closest-side, color-mix(in srgb, var(--accent) 34%, transparent), transparent);
    filter: blur(46px);
  }
  .ion :global(.io-package svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
  .ion :global(.io-package .pkg) {
    fill: var(--dimm-chip);
    stroke: var(--dimm-chip-line);
    stroke-width: 1.6;
  }
  .ion :global(.io-package .rim) {
    fill: none;
    stroke: var(--dimm-chip-line);
    stroke-width: 0.7;
    opacity: 0.75;
  }
  .ion :global(.io-package .pin) {
    fill: var(--dimm-gold);
  }
  .ion :global(.io-package .etch) {
    fill: var(--ink3);
    font: 600 7px var(--font-mono);
    letter-spacing: 0.14em;
    pointer-events: none;
  }
  .ion :global(.io-package .io-badge) {
    position: absolute;
    left: 50%;
    bottom: -38px;
    transform: translateX(-50%);
    white-space: nowrap;
  }

  /* stacked state bar + legend */
  .ion :global(.io-bar) {
    display: flex;
    height: 8px;
    margin: 9px 0 8px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--ink) 8%, transparent);
    overflow: hidden;
  }
  .ion :global(.io-bar i) {
    display: block;
    height: 100%;
    flex: 0 0 auto;
  }
  .ion :global(.io-legend) {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3px 12px;
  }
  .ion :global(.io-legend.cols) {
    grid-template-columns: repeat(3, minmax(0, max-content));
    justify-content: space-between;
  }
  .ion :global(.io-legend span) {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--ink2);
    white-space: nowrap;
  }
  .ion :global(.io-legend i) {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    flex: none;
  }
  .ion :global(.io-legend b) {
    margin-left: auto;
    font: 500 10.5px var(--font-mono);
    color: var(--ink3);
  }

  /* list rows with a memory bar */
  .ion :global(.io-list) {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 6px;
  }
  .ion :global(.io-row) {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(44px, 0.7fr) 46px;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 26px;
    padding: 0 7px 0 8px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--ink2);
    text-align: left;
    font: 500 12px var(--font-ui);
    transition: background 120ms ease, color 120ms ease;
  }
  .ion :global(button.io-row:hover) {
    background: var(--panel2);
    color: var(--ink);
  }
  .ion :global(.io-row.on) {
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    color: var(--ink);
    box-shadow: inset 2px 0 0 var(--accent);
  }
  .ion :global(.io-row .n) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ion :global(.io-row .track) {
    height: 5px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--ink) 9%, transparent);
    overflow: hidden;
  }
  .ion :global(.io-row .track i) {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: var(--c-private);
    transform-origin: 0 50%;
    transition: transform 420ms ease;
  }
  .ion :global(.io-row b) {
    font: 500 11px var(--font-mono);
    color: var(--ink);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .ion :global(.io-badge) {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 24px;
    padding: 0 11px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--warn) 55%, transparent);
    background: var(--tip-bg);
    color: var(--warn);
    font: 600 10px var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    backdrop-filter: blur(12px);
    white-space: nowrap;
  }
  .ion :global(.io-badge::before) {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--warn);
    box-shadow: 0 0 6px var(--warn);
  }

  /* ---- top bar: breadcrumb | search | the one big number ---- */
  .top {
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
    padding: 0 12px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--ink3);
    font: 500 13.5px var(--font-ui);
    white-space: nowrap;
    transition: color 120ms ease, background 120ms ease;
  }
  button.crumb:hover {
    color: var(--ink);
    background: var(--panel);
  }
  .crumb.cur {
    padding: 0 14px;
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

  .search {
    position: relative;
    flex: 1 1 240px;
    min-width: 200px;
    max-width: 320px;
    margin: 0 auto;
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
    backdrop-filter: blur(16px);
    transition: border-color 140ms ease, box-shadow 140ms ease;
  }
  .field:focus-within,
  .field.on {
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
    position: absolute;
    z-index: 50;
    top: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    width: 440px;
    padding: 6px;
    border-radius: var(--radius);
    background: var(--tip-bg);
    border: 1px solid var(--line2);
    box-shadow: var(--shadow);
    backdrop-filter: blur(22px) saturate(1.3);
    -webkit-backdrop-filter: blur(22px) saturate(1.3);
  }
  .none {
    padding: 12px 14px;
    color: var(--ink3);
    font-size: 12.5px;
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

  .inuse {
    flex: none;
    display: flex;
    align-items: center;
    gap: 11px;
    height: 50px;
    padding: 0 18px 0 7px;
    border-radius: 999px;
    background: var(--panel);
    border: 1px solid var(--line);
    box-shadow: inset 0 1px 0 var(--glass-hi);
    backdrop-filter: blur(16px);
    white-space: nowrap;
  }
  .ring {
    width: 38px;
    height: 38px;
    flex: none;
    transform: rotate(-90deg);
  }
  .ring circle {
    fill: none;
    stroke-width: 3.4;
  }
  .ring .tr {
    stroke: var(--line2);
  }
  .ring .ar {
    stroke: var(--accent);
    stroke-linecap: round;
    filter: drop-shadow(0 0 4px var(--accent-glow));
    transition: stroke-dashoffset 620ms cubic-bezier(0.2, 0.75, 0.25, 1);
  }
  .inuse b {
    display: block;
    font: 300 24px/1.05 var(--font-ui);
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .inuse b i {
    font-style: normal;
    font-size: 13px;
    color: var(--ink3);
    margin-left: 1px;
  }
  .inuse span {
    display: block;
    margin-top: -1px;
    font-size: 10.5px;
    line-height: 1.3;
    color: var(--ink3);
  }
  .inuse span em {
    display: inline;
    margin-right: 2px;
    font: 600 9.5px var(--font-mono);
    font-style: normal;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ink3);
  }
  .inuse.paused b {
    color: var(--ink3);
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

  .mini {
    position: absolute;
    z-index: 5;
    top: 12px;
    right: 12px;
    width: 250px;
    padding: 10px 12px 12px;
    border-radius: var(--r-tile);
    background: var(--panel);
    border: 1px solid var(--line);
    box-shadow: inset 0 1px 0 var(--glass-hi), var(--shadow);
    backdrop-filter: blur(18px) saturate(1.25);
    -webkit-backdrop-filter: blur(18px) saturate(1.25);
  }
  .mini header {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 7px;
  }
  .mini header b {
    font: 650 12px var(--font-ui);
  }
  .mini header span {
    margin-left: auto;
    font: 500 10.5px var(--font-mono);
    color: var(--accent);
  }
  .mini svg {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 10px;
    background: color-mix(in srgb, var(--bg) 55%, transparent);
  }
  .mini :global(g.empty text) {
    display: none; /* unreadable at this size — the dashed outline says "empty" */
  }
  .veil {
    fill: var(--bg);
    opacity: 0.5;
    pointer-events: none;
  }
  .mini .here {
    fill: none;
    stroke: var(--accent);
    stroke-width: 5;
    filter: drop-shadow(0 0 4px var(--accent-glow));
    pointer-events: none;
  }
  .mini .here.die {
    stroke-width: 7;
  }
  .mini .here.cell {
    stroke: var(--ink);
    stroke-width: 5;
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
  }
  .thumb {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 9px 11px 5px;
    border-radius: 16px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--ink3);
    transition: background 160ms ease, border-color 160ms ease, transform 200ms cubic-bezier(0.2, 0.75, 0.25, 1);
  }
  .thumb:hover {
    background: var(--panel2);
    transform: translateY(-3px);
  }
  .thumb.cur {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 13%, var(--panel2));
    box-shadow: 0 0 20px color-mix(in srgb, var(--accent) 32%, transparent);
  }
  .thumb svg {
    display: block;
  }
  .thumb span {
    display: flex;
    gap: 6px;
    align-items: baseline;
    font: 500 10.5px var(--font-mono);
    white-space: nowrap;
  }
  .thumb span b {
    color: var(--ink2);
    font-weight: 600;
  }
  .thumb span i {
    font-style: normal;
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

  .ladder {
    display: flex;
    align-items: center;
    gap: 0;
  }
  .rung {
    display: flex;
    align-items: center;
    gap: 9px;
    height: 46px;
    padding: 0 14px 0 11px;
    border: 1px solid transparent;
    border-radius: 999px;
    background: transparent;
    color: var(--ink3);
    text-align: left;
    transition: background 160ms ease, color 160ms ease, border-color 160ms ease;
  }
  .rung:hover {
    background: var(--panel2);
    color: var(--ink2);
  }
  .rung .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1.5px solid var(--line2);
    flex: none;
  }
  .rung b {
    display: block;
    font: 650 13px var(--font-ui);
    color: var(--ink2);
    line-height: 1.2;
  }
  .rung em {
    display: block;
    font: 500 10px var(--font-mono);
    font-style: normal;
    color: var(--ink3);
    letter-spacing: 0.04em;
  }
  .rung.cur {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 13%, var(--panel2));
  }
  .rung.cur .dot {
    background: var(--accent);
    border-color: var(--accent);
    box-shadow: 0 0 8px var(--accent-glow);
  }
  .rung.cur b {
    color: var(--ink);
  }
  .link {
    width: 22px;
    height: 1.5px;
    background: var(--line2);
    flex: none;
  }

  .bmap {
    display: flex;
    align-items: center;
    gap: 18px;
    height: 100%;
    padding: 10px 0;
  }
  .map {
    display: block;
    width: 84px;
    height: 84px;
    border-radius: 12px;
  }
  .map .cur {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.1;
    filter: drop-shadow(0 0 2px var(--accent-glow));
    pointer-events: none;
  }
  .nav {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .lbl em {
    display: block;
    font: 600 9.5px var(--font-mono);
    font-style: normal;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: var(--ink3);
  }
  .lbl b {
    font: 300 24px/1.1 var(--font-ui);
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .lbl i {
    margin-left: 8px;
    font: 500 11px var(--font-mono);
    font-style: normal;
    color: var(--ink3);
  }
  .steps {
    display: flex;
    gap: 6px;
  }
  .step {
    display: grid;
    place-items: center;
    width: 30px;
    height: 26px;
    border-radius: 999px;
    border: 1px solid var(--line2);
    background: var(--panel2);
    color: var(--ink2);
    transition: border-color 140ms ease, transform 160ms ease;
  }
  .step.prev :global(svg) {
    transform: rotate(180deg);
  }
  .step:hover {
    border-color: var(--accent);
    color: var(--ink);
  }
  .step:active {
    transform: scale(0.94);
  }
  .step:disabled {
    opacity: 0.35;
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

  @media (max-width: 1240px) {
    .inuse span {
      display: none;
    }
    .keys {
      display: none;
    }
    .crumb {
      padding: 0 9px;
      font-size: 13px;
    }
    .crumb.cur {
      padding: 0 11px;
    }
    .mark {
      display: none;
    }
  }

</style>
