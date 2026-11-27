<script lang="ts">
  /**
   * Processes — "what the applications hold?" (the Applications section). One sortable table;
   * the selected row drives the memory composition strip above it (the whole process set when
   * nothing is selected, so the layout never jumps). GPU memory comes from the mock GPU (matched
   * by process name).
   *
   * This is Task Manager's own view of the applications level. Nothing on it is coloured by the
   * mode — its bars are page hues, as the board's are in "Pages" — so it carries no reading guide.
   * A process's pages light up on the board, in "Pages" only: the strip's button opens the
   * Overview with them lit, switching the colouring to "Pages" when it has to.
   *
   * There is no per-process disk or network column: the mock counts a drive's I/O as a whole
   * and models no network, so those figures would be noise dressed as readings.
   */
  import { app, getMachine, selectProcess, setMode } from '../../mock/store.svelte';
  import { MIB_PER_BLOCK, fmtInt } from '../../mock/model';
  import Glyph from './Glyph.svelte';
  import { fmtBytes, gpuMiB } from './resources';

  type Key = 'name' | 'status' | 'cpu' | 'mem' | 'gpu';
  interface Row {
    id: number;
    pid: number;
    name: string;
    alive: boolean;
    threads: number;
    cpuPct: number;
    /** Working set = live private pages + share of mapped files. */
    mem: number;
    priv: number;
    shared: number;
    standby: number;
    /** Dedicated GPU memory (VRAM) of the process, in MiB; 0 = none. */
    gpu: number;
  }
  interface Sel {
    id: number | null;
    name: string;
    sub: string;
    priv: number;
    shared: number;
    standby: number;
    gpu: number;
    /** Blocks of the board it owns — what would light up there. */
    blocks: number;
  }

  let {
    /** Opens the Overview with the selected process's pages lit up. */
    onshowboard,
  }: {
    onshowboard: () => void;
  } = $props();
  const m = getMachine();
  let sort = $state<Key>('cpu');
  let desc = $state(true);
  let q = $state('');

  /** Numeric columns → the row field they sort on. */
  const NUM: Record<Exclude<Key, 'name' | 'status'>, keyof Row> = { cpu: 'cpuPct', mem: 'mem', gpu: 'gpu' };

  const COLS: { key: Key; label: string; num: boolean }[] = [
    { key: 'name', label: 'Name', num: false },
    { key: 'status', label: 'Status', num: false },
    { key: 'cpu', label: 'CPU', num: true },
    { key: 'mem', label: 'Memory', num: true },
    { key: 'gpu', label: 'GPU', num: true },
  ];

  const all = $derived.by((): Row[] => {
    const st = app.stats;
    if (!st) return [];
    const defs = new Map(m.processes.map((p) => [p.id, p]));
    return st.procs.map((p) => {
      const d = defs.get(p.id);
      const priv = (p.active + p.modified) * MIB_PER_BLOCK;
      const name = d?.name ?? '?';
      return {
        id: p.id,
        pid: d?.pid ?? 0,
        name,
        alive: p.alive,
        threads: d?.threads ?? 0,
        cpuPct: p.cpuPct,
        mem: priv + p.sharedMiB,
        priv,
        shared: p.sharedMiB,
        standby: p.standby * MIB_PER_BLOCK,
        // an exited process holds no GPU memory
        gpu: p.alive ? gpuMiB(name) : 0,
      };
    });
  });

  const rows = $derived.by(() => {
    const f = q.trim().toLowerCase();
    let r = all;
    if (f) r = r.filter((x) => x.name.toLowerCase().includes(f) || String(x.pid).includes(f));
    return [...r].sort((a, b) => {
      let c: number;
      if (sort === 'name') c = a.name.localeCompare(b.name) || a.pid - b.pid;
      else if (sort === 'status') c = Number(b.alive) - Number(a.alive) || a.name.localeCompare(b.name);
      else c = Number(a[NUM[sort]]) - Number(b[NUM[sort]]);
      return desc ? -c : c;
    });
  });

  const totals = $derived(
    rows.reduce(
      (t, r) => ({
        cpu: t.cpu + r.cpuPct,
        mem: t.mem + r.mem,
        gpu: t.gpu + r.gpu,
        alive: t.alive + (r.alive ? 1 : 0),
      }),
      { cpu: 0, mem: 0, gpu: 0, alive: 0 },
    ),
  );

  const sel = $derived.by((): Sel | null => {
    const st = app.stats;
    if (!st) return null;
    const id = app.selectedProcess;
    if (id === null) {
      let priv = 0;
      let shared = 0;
      let standby = 0;
      for (const p of st.procs) {
        priv += (p.active + p.modified) * MIB_PER_BLOCK;
        shared += p.sharedMiB;
        standby += p.standby * MIB_PER_BLOCK;
      }
      const gpu = all.reduce((s, r) => s + r.gpu, 0);
      return { id: null, name: 'All processes', sub: `${st.procs.length} processes · select a row to inspect one`, priv, shared, standby, gpu, blocks: 0 };
    }
    const p = st.procs.find((x) => x.id === id);
    const d = m.processes.find((x) => x.id === id);
    if (!p || !d) return null;
    return {
      id,
      name: d.name,
      sub: `PID ${d.pid} · ${d.threads} threads · ${p.alive ? 'Running' : 'Exited'}`,
      priv: (p.active + p.modified) * MIB_PER_BLOCK,
      shared: p.sharedMiB,
      standby: p.standby * MIB_PER_BLOCK,
      gpu: all.find((x) => x.id === id)?.gpu ?? 0,
      blocks: p.blocks,
    };
  });

  /** The strip's parts: the system-memory lists, plus GPU memory when there is any. */
  const segs = $derived.by(() => {
    if (!sel) return [];
    const parts = [
      { label: 'Private', mib: sel.priv, c: 'var(--c-private)', gpu: false },
      { label: 'Shared', mib: sel.shared, c: 'var(--c-file)', gpu: false },
      { label: 'Standby', mib: sel.standby, c: 'color-mix(in srgb, var(--c-private) 36%, var(--panel))', gpu: false },
    ];
    // dedicated GPU memory is another pool, with the GPU's own colour
    if (sel.gpu > 0) parts.push({ label: 'GPU', mib: sel.gpu, c: 'var(--c-pagefile)', gpu: true });
    const tot = Math.max(1, parts.reduce((s, p) => s + p.mib, 0));
    return parts.map((s) => ({ ...s, pct: (s.mib / tot) * 100 }));
  });

  const pages = $derived(app.mode === 'pages');

  /**
   * The door to the board. A process's pages light up only in "Pages" — under an overlay the
   * grids are painted by the overlay — so that is what this switches to when it has to, and the
   * button says so beforehand. A process that holds no block of the board has nothing to show
   * there: its door is shut.
   */
  const door = $derived.by(() => {
    if (!sel || sel.id === null) return null;
    if (!sel.blocks) return { shut: true, short: 'No pages on the board', title: 'This process holds no block of the board — nothing would light up' };
    return pages
      ? { shut: false, short: 'Show pages on board', title: `Open the Overview with this process’s ${fmtInt(sel.blocks)} blocks lit up` }
      : { shut: false, short: 'Show pages on board · switches to Pages', title: 'Open the Overview, with the colouring switched to Pages, where this process’s pages light up' };
  });

  /** The Overview, this process selected (its highlight is the store's one selection). */
  function showOnBoard() {
    if (!sel || sel.id === null) return;
    if (app.mode !== 'pages') setMode('pages');
    if (app.selectedProcess !== sel.id) selectProcess(sel.id);
    onshowboard();
  }

  function by(k: Key) {
    if (sort === k) desc = !desc;
    else {
      sort = k;
      desc = k !== 'name';
    }
  }
  function pick(id: number) {
    selectProcess(app.selectedProcess === id ? null : id);
  }
</script>

<div class="proc">
  <header class="head">
    <div class="titles">
      <h1>Processes</h1>
      <p>{all.length} processes · {totals.alive} running</p>
    </div>
    <label class="search">
      <Glyph name="search" size={15} />
      <input type="text" placeholder="Search by name or PID" bind:value={q} spellcheck="false" aria-label="Search processes by name or PID" />
      {#if q}
        <button type="button" class="clear" onclick={() => (q = '')} title="Clear search" aria-label="Clear search"><Glyph name="x" size={11} /></button>
      {/if}
    </label>
  </header>

  {#if sel}
    <section class="strip" aria-label="Memory composition">
      <span class="avatar" class:on={sel.id !== null}>
        {#if sel.id !== null}{sel.name[0].toUpperCase()}{:else}<Glyph name="layers" size={16} />{/if}
      </span>
      <div class="who">
        <b>{sel.name}</b>
        <span>{sel.sub}</span>
      </div>
      <div class="comp">
        <span class="comp-h">Memory composition</span>
        <div class="cbar">
          {#each segs as s, i (s.label)}<i style="width: {s.pct}%; background: {s.c}" class:tail={i === segs.length - 1}></i>{/each}
        </div>
        <ul class="clegend">
          {#each segs as s (s.label)}
            <li title={s.gpu ? 'Dedicated GPU memory (VRAM) of this selection — which chip holds it is modelled' : undefined}>
              <i style="background: {s.c}"></i><span>{s.label}</span><b>{fmtBytes(s.mib)}</b>
            </li>
          {/each}
          <li class="total"><span>Working set</span><b>{fmtBytes(sel.priv + sel.shared)}</b></li>
        </ul>
      </div>
      {#if sel.id !== null && door}
        <button class="primary" class:shut={door.shut} disabled={door.shut} onclick={showOnBoard} title={door.title}>
          {door.short} {#if !door.shut}<Glyph name="chevronRight" size={12} />{/if}
        </button>
      {/if}
    </section>
  {/if}

  <div class="tablewrap">
    <table>
      <colgroup>
        <col />
        <col class="c-status" />
        <col class="c-cpu" />
        <col class="c-mem" />
        <col class="c-gpu" />
      </colgroup>
      <thead>
        <tr>
          {#each COLS as c (c.key)}
            <th class:num={c.num} class:sorted={sort === c.key} aria-sort={sort === c.key ? (desc ? 'descending' : 'ascending') : undefined}>
              <button onclick={() => by(c.key)} title="Sort by {c.label}{c.key === 'gpu' ? ' — dedicated GPU memory of each process' : c.key === 'mem' ? ' — working set: live private pages and its share of mapped files' : ''}">
                {c.label}
                {#if sort === c.key}<Glyph name={desc ? 'chevronDown' : 'chevronUp'} size={12} />{/if}
              </button>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each rows as r (r.id)}
          <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events a11y_no_noninteractive_tabindex -->
          <tr
            class:on={app.selectedProcess === r.id}
            class:dead={!r.alive}
            onclick={() => pick(r.id)}
            tabindex="0"
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                // a focused row is a control: Space selects it, and is not "pause" as well
                e.preventDefault();
                e.stopPropagation();
                pick(r.id);
              }
            }}
          >
            <td class="name">
              <span class="namecell"><span class="app">{r.name[0].toUpperCase()}</span><span class="pname">{r.name}</span></span>
            </td>
            <td class="status" class:ok={r.alive}>{r.alive ? 'Running' : 'Exited'}</td>
            <td class="num" class:low={r.cpuPct < 0.05}>{r.cpuPct.toFixed(1)}%</td>
            <td class="num">{fmtBytes(r.mem)}</td>
            <!-- dedicated GPU memory of the process; "—" when it has none -->
            <td class="num" class:muted={!r.gpu} title={r.gpu ? `${r.name} — ${fmtBytes(r.gpu)} dedicated GPU memory` : 'No dedicated GPU memory'}>{r.gpu ? fmtBytes(r.gpu) : '—'}</td>
          </tr>
        {/each}
      </tbody>
      <tfoot>
        <tr>
          <td>Total <span class="muted">({fmtInt(rows.length)})</span></td>
          <td></td>
          <td class="num">{totals.cpu.toFixed(1)}%</td>
          <td class="num">{fmtBytes(totals.mem)}</td>
          <td class="num">{totals.gpu ? fmtBytes(totals.gpu) : '—'}</td>
        </tr>
      </tfoot>
    </table>
    {#if !rows.length}
      <div class="nores">No process matches “{q}”.</div>
    {/if}
  </div>
</div>

<style>
  .proc {
    /* fills the box the part view gives it: the table scrolls inside the card, its footer stays put */
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    container-type: inline-size;
  }

  /* ---- header ---- */
  .head {
    flex: none;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 20px 14px;
  }
  h1 {
    font-size: 20px;
    font-weight: 600;
    line-height: 1.2;
  }
  .titles p {
    margin-top: 2px;
    color: var(--ink3);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 280px;
    height: 32px;
    padding: 0 6px 0 10px;
    border: 1px solid var(--line2);
    border-bottom-color: color-mix(in srgb, var(--ink) 55%, transparent);
    border-radius: 6px;
    background: var(--panel);
    color: var(--ink3);
    transition: border-color 100ms ease, box-shadow 100ms ease;
  }
  .search:hover {
    border-color: var(--ink3);
    border-bottom-color: color-mix(in srgb, var(--ink) 55%, transparent);
  }
  .search:focus-within {
    border-color: var(--accent);
    border-bottom-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .search input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--ink);
    font-size: 12.5px;
  }
  .search input::placeholder {
    color: var(--ink3);
  }
  .clear {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--ink2);
  }
  .clear:hover {
    background: color-mix(in srgb, var(--ink) 8%, transparent);
    color: var(--ink);
  }

  /* ---- composition strip ---- */
  .strip {
    flex: none;
    display: grid;
    grid-template-columns: auto minmax(180px, 240px) minmax(0, 1fr) auto;
    align-items: center;
    gap: 16px;
    padding: 10px 20px;
    background: var(--panel2);
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
  }
  .avatar {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    background: var(--panel);
    box-shadow: inset 0 0 0 1px var(--line2);
    color: var(--ink2);
    font-size: 14px;
    font-weight: 600;
  }
  .avatar.on {
    background: var(--accent);
    box-shadow: none;
    color: var(--panel);
  }
  .who {
    min-width: 0;
  }
  .who b {
    display: block;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .who span {
    display: block;
    margin-top: 1px;
    color: var(--ink3);
    font-size: 11.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .comp {
    display: grid;
    gap: 5px;
    min-width: 0;
  }
  .comp-h {
    color: var(--ink3);
    font-size: 11px;
  }
  .cbar {
    display: flex;
    height: 8px;
    border-radius: 4px;
    overflow: hidden;
    background: var(--line);
  }
  .cbar i {
    display: block;
    height: 100%;
    transition: width 300ms ease;
  }
  .cbar i.tail {
    border-radius: 0 4px 4px 0;
  }
  .clegend {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 20px;
    list-style: none;
    margin: 0;
    padding: 0;
    font-size: 12px;
    white-space: nowrap;
  }
  .clegend li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--ink2);
  }
  .clegend i {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 12%, transparent);
  }
  .clegend b {
    color: var(--ink);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .clegend .total {
    margin-left: auto;
    padding-left: 16px;
    border-left: 1px solid var(--line2);
  }
  .clegend .total b {
    margin-left: 4px;
  }
  .primary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 12px;
    border: 1px solid var(--accent);
    border-radius: 6px;
    background: var(--accent);
    color: var(--panel);
    font-size: 12.5px;
    font-weight: 600;
    white-space: nowrap;
    transition: background 100ms ease;
  }
  .primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 86%, var(--ink));
    border-color: color-mix(in srgb, var(--accent) 86%, var(--ink));
  }
  .primary:disabled {
    border-color: var(--line2);
    background: var(--panel);
    color: var(--ink3);
    font-weight: 400;
  }

  /* ---- table ---- */
  .tablewrap {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
  table {
    width: 100%;
    table-layout: fixed;
    border-collapse: separate;
    border-spacing: 0;
    font-size: 12.5px;
  }
  .c-status { width: 120px; }
  .c-cpu { width: 110px; }
  .c-mem { width: 130px; }
  .c-gpu { width: 110px; }
  thead th {
    position: sticky;
    top: 0;
    z-index: 2;
    padding: 0;
    border-bottom: 1px solid var(--line2);
    background: var(--panel);
    white-space: nowrap;
    text-align: left;
  }
  thead th.num {
    text-align: right;
  }
  thead button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    height: 34px;
    padding: 0 12px;
    border: 0;
    background: transparent;
    color: var(--ink2);
    font-size: 12px;
    font-weight: 400;
    text-align: inherit;
    transition: background 80ms ease;
  }
  thead th.num button {
    justify-content: flex-end;
  }
  thead button:hover {
    background: var(--panel2);
    color: var(--ink);
  }
  thead th.sorted button {
    color: var(--ink);
    font-weight: 600;
  }
  thead th.sorted :global(svg) {
    color: var(--accent);
  }

  tbody td {
    height: 30px;
    padding: 0 12px;
    border-bottom: 1px solid var(--line);
    color: var(--ink2);
    white-space: nowrap;
  }
  tbody td.num {
    text-align: right;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  tbody td.low {
    color: var(--ink3);
  }
  tbody td.muted {
    color: var(--ink2);
  }
  tbody tr {
    cursor: default;
    outline: none;
    transition: background 80ms ease;
  }
  tbody tr:hover {
    background: color-mix(in srgb, var(--ink) 4%, transparent);
  }
  tbody tr.on td {
    background: color-mix(in srgb, var(--accent) 11%, transparent);
  }
  tbody tr.on:hover td {
    background: color-mix(in srgb, var(--accent) 15%, transparent);
  }
  tbody tr.on td:first-child {
    box-shadow: inset 3px 0 0 var(--accent);
  }
  tbody tr:focus-visible td {
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }
  tbody tr:focus-visible td:first-child {
    box-shadow: inset 3px 0 0 var(--accent);
  }
  tbody tr.dead td {
    color: var(--ink3);
  }
  tbody tr.dead .app {
    opacity: 0.5;
  }
  .name {
    overflow: hidden;
  }
  .namecell {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    color: var(--ink);
    font-weight: 500;
  }
  .app {
    display: grid;
    place-items: center;
    flex: none;
    width: 20px;
    height: 20px;
    border-radius: 4px;
    background: var(--panel2);
    box-shadow: inset 0 0 0 1px var(--line2);
    color: var(--ink2);
    font-size: 9.5px;
    font-weight: 700;
  }
  tr.on .app {
    background: var(--accent);
    box-shadow: none;
    color: var(--panel);
  }
  .pname {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .status.ok {
    color: var(--ink2);
  }
  tr:not(.dead) .status.ok {
    color: var(--ink2);
  }
  .status:not(.ok) {
    color: var(--bad);
  }

  tfoot td {
    position: sticky;
    bottom: 0;
    z-index: 2;
    height: 34px;
    padding: 0 12px;
    border-top: 1px solid var(--line2);
    background: var(--panel);
    color: var(--ink);
    font-size: 12.5px;
    font-weight: 600;
    white-space: nowrap;
  }
  tfoot td.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .muted {
    color: var(--ink3);
    font-weight: 400;
  }
  .nores {
    padding: 32px;
    color: var(--ink3);
    text-align: center;
  }

  @media (max-width: 1250px) {
    .c-status { width: 92px; }
    .c-cpu { width: 92px; }
    .c-mem { width: 104px; }
    .c-gpu { width: 96px; }
  }
  /* The strip sheds weight as the card narrows: first the total, then the name block. */
  @container (max-width: 1139px) {
    .clegend .total {
      display: none;
    }
  }
  @container (max-width: 980px) {
    .strip {
      grid-template-columns: auto minmax(150px, 210px) minmax(0, 1fr) auto;
      gap: 12px;
    }
    /* Four parts no longer sit on one line here: a tidy 2 × 2 instead of a ragged wrap. Its caption
       gives way, so the strip keeps its height. */
    .comp-h {
      display: none;
    }
    .clegend {
      display: grid;
      grid-template-columns: repeat(2, max-content);
      justify-content: space-between;
      gap: 2px 14px;
    }
  }
  @container (max-width: 760px) {
    .strip {
      grid-template-columns: auto minmax(0, 1fr) auto;
    }
    .who {
      display: none;
    }
    .clegend {
      gap: 12px;
    }
    .search {
      width: 220px;
    }
  }
</style>
