<script lang="ts">
  /**
   * Applications · processes and what they hold. Not a physical part: a sortable list of the
   * mock's processes — name, pid, working set, the blocks each owns, CPU and threads — and, for
   * the selected one, a column of tiles: what it is, how its memory is made up, its CPU time
   * and threads, and the door to the board, where its pages are lit up.
   *
   * Nothing on this level is coloured by an overlay, so it carries no reading guide; its bars
   * are page hues, as on the board in "Pages". The selection is the store's one selection
   * (`selectProcess`): the same process is selected on every level, and its pages light up on
   * every module and on the board — which they can only do in "Pages", so the door to the
   * board does, and says, what it takes to get there.
   *
   * The list is rebuilt every tick from `app.stats`, a fresh object each time.
   */
  import { untrack } from 'svelte';
  import { app, getMachine, hoverCard, hoverOut, selectProcess, setMode } from '../mock/store.svelte';
  import { fmtInt, fmtMiB } from '../mock/model';
  import { MODE_META } from '../mock/telemetry';
  import Icon from '../scene/Icon.svelte';
  import Sparkline from '../scene/Sparkline.svelte';
  import { appsLayout, colTop, levelWheel, type Level, type Target } from './nav';
  import { mib, procRows, sortRows, type ProcRow, type SortKey } from './apps.live';

  interface Props {
    w: number;
    h: number;
    go: (l: Level) => void;
    down: (target?: Target) => void;
  }
  let { w, h, go, down }: Props = $props();

  const m = getMachine();

  // ---- the list ----------------------------------------------------------------------------
  /** By working set, the largest first, until the user picks another column. */
  let sort = $state<SortKey>('wsMiB');
  let desc = $state(true);
  const rows = $derived.by(() => sortRows(procRows(app.stats, m.processes), sort, desc));
  const maxWs = $derived(rows.reduce((a, r) => Math.max(a, r.wsMiB), 1));

  function by(k: SortKey) {
    if (sort === k) desc = !desc;
    else {
      sort = k;
      desc = k !== 'name';
    }
  }
  const arrow = (k: SortKey) => (sort === k ? (desc ? '▾' : '▴') : '');

  const cpuText = (r: ProcRow) => (r.alive ? `${r.cpuPct.toFixed(1)} %` : '—');

  // ---- the selected process ----------------------------------------------------------------
  const selId = $derived(app.selectedProcess);
  const sel = $derived(selId === null ? null : (rows.find((r) => r.id === selId) ?? null));
  /** Its pages are lit up everywhere: the store's highlight is on it (true in "Pages" only, where the grids can show it). */
  const litUp = $derived(sel !== null && app.highlight?.kind === 'owner' && app.highlight.id === sel.id);
  const pages = $derived(app.mode === 'pages');

  /** What its memory is made of: three figures, each its own — they are not parts of one whole. */
  const comp = $derived.by(() => {
    if (!sel) return [];
    const parts = [
      { k: 'private', mib: sel.privateMiB, c: 'var(--c-private)', why: 'its own live pages — active and modified' },
      { k: 'shared', mib: sel.sharedMiB, c: 'var(--c-file)', why: 'its share of the mapped files that are active' },
      { k: 'standby', mib: sel.standbyMiB, c: 'color-mix(in srgb, var(--c-private) 34%, var(--panel))', why: 'its pages in the standby list — reclaimable at any time' },
    ];
    const max = Math.max(1, ...parts.map((p) => p.mib));
    return parts.map((p) => ({ ...p, share: p.mib / max }));
  });

  /** Blocks it has owned, twice a second, since it was selected — the store's ring for the selected process. */
  const footprint = $derived(app.procHist);
  /** From zero to a tenth above the most it has owned, so a flat line does not hug the border. */
  const histMax = $derived(footprint.reduce((a, v) => Math.max(a, v), 1) * 1.1);

  /**
   * What the door to the board says it does. A process's pages light up only in "Pages" — under
   * an overlay the grids are painted by the overlay — and a process that holds no block of the
   * board has nothing to show there, so its door is shut.
   */
  const door = $derived.by(() => {
    if (!sel) return null;
    if (!sel.blocks) {
      return { shut: true, short: 'it holds no block of the board', long: 'it holds no block of the board — nothing would light up', title: 'This process holds no block of the board' };
    }
    return pages
      ? { shut: false, short: `${fmtInt(sel.blocks)} blocks light up on every module`, long: `${fmtInt(sel.blocks)} blocks of its own light up on every module`, title: 'Open the board with this process’s pages lit up' }
      : { shut: false, short: 'switches the colouring to Pages', long: 'the colouring switches to Pages, where its blocks light up on every module', title: 'Open the board, with the colouring switched to Pages, where this process’s pages light up' };
  });

  // ---- everyone ----------------------------------------------------------------------------
  const totals = $derived.by(() => {
    let alive = 0;
    let biggest: ProcRow | null = null;
    for (const r of rows) {
      if (r.alive) alive++;
      if (!biggest || r.blocks > biggest.blocks) biggest = r;
    }
    return { n: rows.length, alive, exited: rows.length - alive, biggest };
  });

  // ---- actions -----------------------------------------------------------------------------
  /** A click selects — and a click on the selected row selects nothing again. */
  function pick(r: ProcRow) {
    selectProcess(app.selectedProcess === r.id ? null : r.id);
  }

  /**
   * The door to the board. A process's pages light up only in "Pages" — under an overlay the
   * grids are painted by the overlay — so that is what this switches to when it has to, and
   * the tile says so beforehand.
   */
  function showOnBoard(r: ProcRow) {
    if (app.mode !== 'pages') setMode('pages');
    if (!(app.highlight?.kind === 'owner' && app.highlight.id === r.id)) selectProcess(r.id);
    go({ kind: 'machine' });
  }

  /** Everything a row shows and what a click does — the figures a row has no room for included. */
  function rowCard(r: ProcRow) {
    return {
      title: `${r.name} · pid ${r.pid}`,
      sub: r.alive ? `running · ${r.threads} threads` : 'exited',
      rows: [
        { k: 'working set', v: mib(r.wsMiB), mono: true },
        { k: 'blocks owned', v: r.blocks ? `${fmtInt(r.blocks)} · ${fmtMiB(r.blocks)}` : 'none', mono: true },
        { k: 'private', v: mib(r.privateMiB), mono: true },
        { k: 'shared', v: mib(r.sharedMiB), mono: true },
        { k: 'standby', v: mib(r.standbyMiB), mono: true },
        { k: 'cpu', v: cpuText(r), mono: true },
      ],
      hint: pages
        ? 'click to select it — its pages light up on every module and on the board'
        : `click to select it — its pages light up in “Pages”; the modules are coloured by ${MODE_META[app.mode].label.toLowerCase()} now`,
    };
  }

  // ---- layout ------------------------------------------------------------------------------
  const lay = $derived(appsLayout(w, h));
  /** The selected process's column waits under the mini-map, as every level's right-hand column does. */
  const top = $derived(colTop(h));
  /**
   * How much the selected process's column shows is a question of height — the tiles were
   * measured at 1440 × 900 — against `h − 204` px of column (it starts under the mini-map):
   *
   *   full      identity · memory · CPU + threads · the door       476 px   from 690 px of stage
   *   lean      the CPU joins the identity line, no pair            394 px   from 620 px
   *   footprint an extra tile, 112 px, only with room for it        588 px   from 800 px
   *
   * A short stage (< 620 px) is lean too, and its door is a pill: 307 px in all.
   */
  const lean = $derived(h < 690);
  const roomy = $derived(h >= 800);

  let root: HTMLDivElement;
  let list: HTMLDivElement;
  $effect(() => {
    const onWheel = levelWheel((dir) => {
      if (dir < 0) return go({ kind: 'machine' }); // the board is the hub
      down(); // the end of a chain: there is nothing below the applications
    });
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  });

  /** The selected row stays in view when the selection is made elsewhere (the board, the search). */
  $effect(() => {
    const id = selId;
    untrack(() => {
      const el = id === null ? null : list?.querySelector('.io-row.on');
      if (!el || !list) return;
      const box = list.getBoundingClientRect();
      const row = el.getBoundingClientRect();
      const head = list.querySelector('.thead')?.getBoundingClientRect().height ?? 0;
      if (row.top < box.top + head + 2) list.scrollTop += row.top - box.top - head - 2;
      else if (row.bottom > box.bottom - 2) list.scrollTop += row.bottom - box.bottom + 2;
    });
  });
</script>

<div class="lv lv-scope" bind:this={root} data-short={h > 0 && h < 620 ? '1' : '0'}>
  <!-- the processes -->
  <div class="io-tile table" style="left:{lay.x}px; top:{lay.y}px; width:{lay.w}px; height:{lay.h}px">
    <em>
      <Icon name="apps" size={13} />Processes
      <i class="count">{totals.n} listed · {totals.alive} running</i>
      <span class="io-badge badge" title="Names, pids and every number on this level come from the mock">mock data</span>
    </em>
    <div class="list" bind:this={list}>
      <div class="thead">
        <button class="th c-name" class:on={sort === 'name'} onclick={() => by('name')} title="Sort by name">Name <i>{arrow('name')}</i></button>
        <button class="th c-pid" class:on={sort === 'pid'} onclick={() => by('pid')} title="Sort by pid">PID <i>{arrow('pid')}</i></button>
        <button class="th c-ws" class:on={sort === 'wsMiB'} onclick={() => by('wsMiB')} title="Sort by working set">Working set <i>{arrow('wsMiB')}</i></button>
        <button class="th c-blocks" class:on={sort === 'blocks'} onclick={() => by('blocks')} title="Sort by the blocks it owns — what lights up on the board">Blocks <i>{arrow('blocks')}</i></button>
        <button class="th c-cpu" class:on={sort === 'cpuPct'} onclick={() => by('cpuPct')} title="Sort by CPU">CPU <i>{arrow('cpuPct')}</i></button>
        <button class="th c-thr" class:on={sort === 'threads'} onclick={() => by('threads')} title="Sort by threads">Threads <i>{arrow('threads')}</i></button>
      </div>
      <div class="io-list">
        {#each rows as r (r.id)}
          <button
            class="io-row"
            class:on={r.id === selId}
            class:dead={!r.alive}
            aria-pressed={r.id === selId}
            onclick={() => pick(r)}
            onpointerenter={(e) => hoverCard(rowCard(r), e)}
            onpointerleave={hoverOut}
          >
            <span class="n">{r.name}</span>
            <span class="num c-pid">{r.pid}</span>
            <span class="track"><i style="transform: scaleX({(r.wsMiB / maxWs).toFixed(3)})"></i></span>
            <b>{mib(r.wsMiB)}</b>
            <span class="num c-blocks">{r.blocks ? fmtInt(r.blocks) : '—'}</span>
            <span class="num">{r.alive ? `${r.cpuPct.toFixed(1)} %` : 'exited'}</span>
            <span class="num c-thr">{r.threads}</span>
          </button>
        {/each}
      </div>
    </div>
    <span class="io-foot">
      {pages
        ? 'click a row to select it — its pages light up on every module and on the board'
        : `the modules are coloured by ${MODE_META[app.mode].label.toLowerCase()} now: a selected process’s pages light up in “Pages”`}
    </span>
  </div>

  <!-- the selected process -->
  <div class="col" class:lean style="left:{lay.rightX}px; top:{top}px; width:{lay.rightW}px">
    <!-- `door` is set exactly when `sel` is; the type checker cannot know -->
    {#if sel && door}
      <div class="io-tile">
        <em><Icon name="apps" size={13} />Process · {sel.alive ? 'running' : 'exited'}</em>
        <b class="io-name" title={sel.name}>{sel.name}</b>
        <span class="extra">pid {sel.pid} · {sel.threads} threads</span>
        <span class="brief">pid {sel.pid} · {sel.threads} threads · {sel.alive ? `${cpuText(sel)} CPU` : 'exited'}</span>
      </div>

      <div class="io-tile">
        <em>Memory</em>
        <b>{mib(sel.wsMiB)}<i>working set</i></b>
        <div class="io-list comp">
          {#each comp as p (p.k)}
            <div class="io-row static" title={p.why}>
              <span class="n">{p.k}</span>
              <span class="track"><i style="transform: scaleX({p.share.toFixed(3)}); background: {p.c}"></i></span>
              <b>{mib(p.mib)}</b>
            </div>
          {/each}
        </div>
        <span class="io-foot">{sel.blocks ? `${fmtInt(sel.blocks)} blocks of 4 MiB owned · ${fmtMiB(sel.blocks)} of the board` : 'it owns no block of the board'}</span>
      </div>

      <div class="pair">
        <div class="io-tile">
          <em>CPU</em>
          <b>{sel.alive ? sel.cpuPct.toFixed(1) : '—'}{#if sel.alive}<i>%</i>{/if}</b>
          <span>right now</span>
        </div>
        <div class="io-tile">
          <em>Threads</em>
          <b>{sel.threads}</b>
          <span>of this process</span>
        </div>
      </div>

      {#if roomy}
        <div class="io-tile">
          <em>Footprint · since selected</em>
          <div class="spark">
            <Sparkline values={footprint} min={0} max={histMax} color="var(--c-private)" width={198} height={34} />
            <b>{fmtMiB(sel.blocks)}</b>
          </div>
          <span class="io-foot">{footprint.length > 1 ? `${footprint.length} samples` : 'recording…'} · the blocks it owns, twice a second</span>
        </div>
      {/if}

      {@const d = door}
      <button class="io-tile part go" class:on={litUp && !d.shut} class:shut={d.shut} disabled={d.shut} onclick={() => showOnBoard(sel)} title={d.title}>
        <em class="extra" aria-hidden="true">On the board</em>
        <b class="io-name">
          {d.shut ? 'No pages to show on the board' : 'Show its pages on the board'}
          {#if !d.shut && !pages}<span class="topages" aria-hidden="true"> → Pages</span>{/if}
        </b>
        <span class="extra" aria-hidden="true">{d.short}</span>
        <!-- what the button does, for whoever does not see the sub-line (a short stage drops it) -->
        <span class="vh">— {d.long}</span>
      </button>
    {:else}
      <div class="io-tile">
        <em><Icon name="apps" size={13} />Applications</em>
        <b>{totals.n}<i>processes</i></b>
        <span>{totals.alive} running · {totals.exited} exited</span>
        {#if totals.biggest}
          <span>the largest holds {fmtMiB(totals.biggest.blocks)}: {totals.biggest.name}</span>
        {/if}
        <span class="lead">click a row to see what one process holds</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .lv {
    position: absolute;
    inset: 0;
  }

  /* ---- the list of processes ---- */
  .table {
    position: absolute;
    display: flex;
    flex-direction: column;
    min-width: 0;
    /* the list scrolls inside the tile, under its heading and over its foot */
    padding: 11px 10px 10px 16px;
    container-type: inline-size;
  }
  .count {
    margin-left: auto;
    font-style: normal;
    font-weight: 500;
    letter-spacing: 0.08em;
    color: var(--ink3);
    white-space: nowrap;
  }
  .badge {
    flex: none;
  }
  .table > .io-foot {
    margin-top: 8px;
    line-height: 1.4;
    white-space: normal;
  }
  .list {
    flex: 1 1 auto;
    min-height: 0;
    margin-top: 8px;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-gutter: stable;
  }
  .list :global(.io-list) {
    margin-top: 2px;
  }
  /* the column headings stay put while the list scrolls; rows pass under a near-opaque band */
  .thead {
    position: sticky;
    top: 0;
    z-index: 1;
    display: grid;
    align-items: center;
    height: 26px;
    padding: 0 7px 0 8px;
    background: color-mix(in srgb, var(--bg) 90%, transparent);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }
  .thead,
  .table .io-row {
    grid-template-columns: minmax(0, 1fr) 46px minmax(56px, 0.7fr) 70px 56px 60px 64px;
    gap: 10px;
  }
  .th {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    font: 600 9.5px var(--font-mono);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink3);
    white-space: nowrap;
  }
  button.th {
    cursor: pointer;
  }
  button.th:hover,
  .th.on {
    color: var(--accent);
  }
  .th.c-name {
    justify-content: flex-start;
  }
  /* the bar belongs to the working set: its heading spans both */
  .th.c-ws {
    grid-column: 3 / 5;
  }
  .th i {
    font-style: normal;
  }

  .table .io-row {
    cursor: pointer;
  }
  .table .io-row:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .table .io-row.dead {
    opacity: 0.5;
  }
  .num {
    min-width: 0;
    font: 500 11px var(--font-mono);
    color: var(--ink2);
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* ---- the selected process ---- */
  .col {
    position: absolute;
    bottom: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    /* a stage too short for the column scrolls it instead of losing its tiles under the chrome */
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
  }
  .comp {
    margin-top: 8px;
  }
  .col .io-row {
    grid-template-columns: 58px minmax(44px, 1fr) 76px;
  }
  .col .io-foot {
    margin-top: 8px;
    line-height: 1.4;
    white-space: normal;
  }
  /* CPU and threads, two abreast */
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .pair .io-tile {
    min-width: 0;
  }
  .spark {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 8px;
  }
  .spark b {
    flex: 1 1 auto;
    min-width: 0;
    font: 500 12px var(--font-mono);
    color: var(--ink);
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  /* a sentence, not a name */
  .go b.io-name {
    font-size: 17px;
  }
  /* read out, never seen */
  .vh {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  /* a process without a block of the board has nothing to show there: its door is shut */
  .go:disabled {
    cursor: default;
    opacity: 0.6;
  }
  .go.shut::after {
    background: var(--line2);
    box-shadow: none;
  }
  /* a column without room for everything (see `lean`): the CPU joins the identity line, the rest steps aside */
  .brief {
    display: none;
  }
  .col.lean .brief {
    display: block;
  }
  .col.lean .extra {
    display: none;
  }
  .col.lean .pair {
    display: none;
  }
  /* a short stage makes the door a pill, without the sub-line: then the overlay it leaves is said in the pill itself */
  .topages {
    display: none;
  }
  .lv[data-short='1'] .topages {
    display: inline;
  }
  .lv[data-short='1'] .go {
    flex: none;
    min-height: 38px;
    padding: 0 34px 0 16px;
    border-radius: 999px;
  }
  .lv[data-short='1'] .go b.io-name {
    font-size: 13px;
    line-height: 38px;
  }
  .lv[data-short='1'] .go::after {
    top: 50%;
    transform: translateY(-50%);
  }
  .lv[data-short='1'] .go:hover {
    transform: none;
  }
  .lv[data-short='1'] .go:hover::after {
    transform: translateY(-50%) translateX(3px);
  }

  /* ---- narrower tables: the least-read columns go first ---- */
  @container (max-width: 560px) {
    .c-pid,
    .c-thr {
      display: none;
    }
    .thead,
    .table .io-row {
      grid-template-columns: minmax(0, 1fr) minmax(48px, 0.6fr) 70px 56px 60px;
      gap: 8px;
    }
    .th.c-ws {
      grid-column: 2 / 4;
    }
    .count {
      display: none;
    }
  }
  @container (max-width: 460px) {
    .c-blocks {
      display: none;
    }
    .thead,
    .table .io-row {
      grid-template-columns: minmax(0, 1fr) minmax(40px, 0.5fr) 70px 54px;
    }
    .th.c-ws {
      grid-column: 2 / 4;
    }
  }
</style>
