<script lang="ts">
  /** Sortable process table — a collection, grouped by the question "which app?". */
  import { app, getMachine, selectProcess } from '../../mock/store.svelte';
  import { fmtMiB, fmtInt } from '../../mock/model';
  import Icon from '../../scene/Icon.svelte';

  type Key = 'name' | 'pid' | 'cpuPct' | 'blocks' | 'wsMiB' | 'sharedMiB';
  let sort = $state<Key>('blocks');
  let desc = $state(true);
  let q = $state('');
  const m = getMachine();

  const rows = $derived.by(() => {
    const st = app.stats;
    if (!st) return [];
    const f = q.trim().toLowerCase();
    const defs = new Map(m.processes.map((p) => [p.id, p]));
    let r = st.procs.map((p) => ({ ...p, name: defs.get(p.id)?.name ?? '?', pid: defs.get(p.id)?.pid ?? 0 }));
    if (f) r = r.filter((x) => x.name.toLowerCase().includes(f) || String(x.pid).includes(f));
    r.sort((a, b) => {
      const va = a[sort];
      const vb = b[sort];
      const c = typeof va === 'string' && typeof vb === 'string' ? va.localeCompare(vb) : Number(va) - Number(vb);
      return desc ? -c : c;
    });
    return r;
  });
  const maxBlocks = $derived(rows.length ? Math.max(...rows.map((r) => r.blocks)) : 1);
  const maxWs = $derived(rows.length ? Math.max(...rows.map((r) => r.wsMiB)) : 1);
  const alive = $derived(rows.filter((r) => r.alive));
  const sum = (k: 'blocks' | 'wsMiB' | 'sharedMiB' | 'cpuPct') => alive.reduce((s, r) => s + r[k], 0);

  function by(k: Key) {
    if (sort === k) desc = !desc;
    else {
      sort = k;
      desc = k !== 'name';
    }
  }
  const arrow = (k: Key) => (sort === k ? (desc ? '▾' : '▴') : '');
  const mib = (v: number) => (v >= 1024 ? `${(v / 1024).toFixed(2)} GiB` : `${v.toFixed(0)} MiB`);
</script>

<div class="apps">
  <div class="toolbar">
    <label class="search">
      <Icon name="search" size={14} />
      <input placeholder="Filter by name or PID" bind:value={q} spellcheck="false" />
    </label>
    <span class="count">{rows.length} processes · {alive.length} running</span>
    <span class="hint">click a row to highlight its pages on the Memory board</span>
  </div>
  <div class="tablewrap">
    <table>
      <thead>
        <tr>
          <th><button onclick={() => by('name')}>Name {arrow('name')}</button></th>
          <th><button onclick={() => by('pid')}>PID {arrow('pid')}</button></th>
          <th><button onclick={() => by('cpuPct')}>CPU {arrow('cpuPct')}</button></th>
          <th class="wide"><button onclick={() => by('blocks')}>Memory (private) {arrow('blocks')}</button></th>
          <th><button onclick={() => by('wsMiB')}>Working set {arrow('wsMiB')}</button></th>
          <th><button onclick={() => by('sharedMiB')}>Shared {arrow('sharedMiB')}</button></th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as r (r.id)}
          <tr
            class:on={app.selectedProcess === r.id}
            class:dead={!r.alive}
            onclick={() => selectProcess(r.id)}
            tabindex="0"
            onkeydown={(e) => e.key === 'Enter' && selectProcess(r.id)}
          >
            <td class="name">{r.name}</td>
            <td class="num">{r.pid}</td>
            <td class="barcell"><i style="width:{Math.min(100, r.cpuPct)}%"></i><span class="num">{r.cpuPct.toFixed(1)}%</span></td>
            <td class="barcell wide"><i style="width:{(r.blocks / maxBlocks) * 100}%"></i><span class="num">{mib(r.blocks * 4)}</span></td>
            <td class="num">{mib(r.wsMiB)}</td>
            <td class="num">{mib(r.sharedMiB)}</td>
            <td class:ok={r.alive}>{r.alive ? 'Running' : 'Exited'}</td>
          </tr>
        {/each}
      </tbody>
      <tfoot>
        <tr>
          <td>Total (running)</td>
          <td></td>
          <td class="num">{sum('cpuPct').toFixed(1)}%</td>
          <td class="num">{mib(sum('blocks') * 4)}</td>
          <td class="num">{mib(sum('wsMiB'))}</td>
          <td class="num">{mib(sum('sharedMiB'))}</td>
          <td>{fmtInt(alive.length)}</td>
        </tr>
      </tfoot>
    </table>
  </div>
</div>

<style>
  .apps {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 28px;
    padding: 0 10px;
    border-radius: 7px;
    border: 1px solid var(--line2);
    background: var(--panel);
    color: var(--ink3);
  }
  .search input {
    border: 0;
    outline: none;
    background: transparent;
    color: var(--ink);
    width: 200px;
    font-size: 12px;
  }
  .search input::placeholder {
    color: var(--ink3);
  }
  .count {
    font: 500 11px var(--font-mono);
    color: var(--ink2);
  }
  .hint {
    margin-left: auto;
    color: var(--ink3);
    font-size: 11.5px;
  }
  .tablewrap {
    flex: 1;
    min-height: 0;
    overflow: auto;
    border-radius: var(--radius);
    border: 1px solid var(--line);
    background: var(--panel);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
  }
  thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--panel);
    text-align: right;
    padding: 0;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
  }
  thead button {
    width: 100%;
    padding: 9px 12px;
    border: 0;
    background: transparent;
    text-align: right;
    font: 600 9.5px var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--ink3);
  }
  thead button:hover {
    color: var(--ink);
  }
  tbody tr {
    cursor: pointer;
    transition: background 80ms ease;
  }
  tbody tr:hover {
    background: var(--panel2);
  }
  tbody tr.on {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    box-shadow: inset 2px 0 0 var(--accent);
  }
  tbody tr.dead {
    opacity: 0.5;
  }
  td {
    padding: 6px 12px;
    text-align: right;
    border-bottom: 1px solid var(--line);
    color: var(--ink2);
    white-space: nowrap;
  }
  td:first-child {
    text-align: left;
  }
  .name {
    color: var(--ink);
    font-weight: 500;
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .barcell {
    position: relative;
    min-width: 110px;
  }
  .barcell.wide {
    min-width: 170px;
  }
  .barcell i {
    position: absolute;
    left: 12px;
    right: 12px;
    top: 50%;
    height: 6px;
    transform: translateY(-50%);
    border-radius: 3px;
    background: color-mix(in srgb, var(--c-private) 22%, transparent);
  }
  .barcell span {
    position: relative;
  }
  td.ok {
    color: var(--good);
  }
  tfoot td {
    position: sticky;
    bottom: 0;
    background: var(--panel);
    border-top: 1px solid var(--line2);
    border-bottom: 0;
    color: var(--ink);
    font-weight: 600;
  }
</style>
