<script lang="ts">
  /** Small multiples of every scene + the numbers that matter, one screen, no navigation depth. */
  import { app, getMachine, selectProcess, selectFile } from '../../mock/store.svelte';
  import { fmtMiB } from '../../mock/model';
  import RamBoard from '../../scene/RamBoard.svelte';
  import CpuDie from '../../scene/CpuDie.svelte';
  import { RAM_BOARD, CPU_DIE } from '../../scene/geometry';

  let { onnavigate }: { onnavigate: (id: 'overview' | 'memory' | 'cpu' | 'apps') => void } = $props();

  const m = getMachine();
  const st = $derived(app.stats);
  const cpu = $derived(app.cpu);
  const top = $derived(st ? [...st.procs].sort((a, b) => b.blocks - a.blocks).slice(0, 6) : []);
  const topFiles = $derived(st ? [...m.files].map((f) => ({ f, s: st.byOwner[String(f.id)] })).filter((x) => x.s).sort((a, b) => (b.s?.blocks ?? 0) - (a.s?.blocks ?? 0)).slice(0, 4) : []);
  const alive = $derived(st ? st.procs.filter((p) => p.alive).length : 0);
  const totalGiB = m.dimms.reduce((s, d) => s + d.capacityGiB, 0);
  const name = (id: number) => m.processes.find((p) => p.id === id)?.name ?? '?';
  const base = (name2: string) => name2.split('\\').pop() ?? name2;
  const pct = (n: number | undefined) => (st && n !== undefined ? ((n / st.total) * 100).toFixed(0) : '0');
</script>

<div class="ov">
  <div class="kpis">
    <button class="kpi" onclick={() => onnavigate('memory')}>
      <em>memory in use</em>
      <b>{pct(st?.inUse)}<i>%</i></b>
      <small>{st ? fmtMiB(st.inUse) : ''} of {totalGiB} GiB</small>
    </button>
    <button class="kpi" onclick={() => onnavigate('memory')}>
      <em>cached · standby</em>
      <b>{pct(st?.byState[2])}<i>%</i></b>
      <small>{st ? fmtMiB(st.byState[2]) : ''} reclaimable file cache</small>
    </button>
    <button class="kpi" onclick={() => onnavigate('cpu')}>
      <em>processor</em>
      <b>{cpu ? cpu.avgLoad.toFixed(0) : '0'}<i>%</i></b>
      <small>{cpu ? cpu.maxTemp.toFixed(0) : '–'} °C hottest core · {cpu ? cpu.power.toFixed(0) : '–'} W</small>
    </button>
    <button class="kpi" onclick={() => onnavigate('apps')}>
      <em>applications</em>
      <b>{alive}</b>
      <small>{m.files.length} files cached in memory</small>
    </button>
  </div>

  <div class="row">
    <section class="panel wide" onclick={() => onnavigate('memory')} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && onnavigate('memory')}>
      <header><b>Memory</b><span>{m.dimms.length} × 16 GB DDR5 · {m.slots.filter((s) => !s.dimm).length} slots empty</span><i>open ›</i></header>
      <div class="art">
        <svg viewBox="0 0 {RAM_BOARD.width} {RAM_BOARD.compactHeight}" preserveAspectRatio="xMidYMid meet">
          <RamBoard compact interactive={false} />
        </svg>
      </div>
    </section>
    <section class="panel" onclick={() => onnavigate('cpu')} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && onnavigate('cpu')}>
      <header><b>Processor</b><span>2 CCD + I/O die</span><i>open ›</i></header>
      <div class="art">
        <svg viewBox="0 0 {CPU_DIE.width} {CPU_DIE.height}" preserveAspectRatio="xMidYMid meet">
          <CpuDie />
        </svg>
      </div>
    </section>
  </div>

  <div class="row grow">
    <section class="panel grow">
      <header><b>Top owners</b><span>pages by process</span><button class="linkbtn" onclick={(e) => { e.stopPropagation(); onnavigate('apps'); }}>all apps ›</button></header>
      <div class="list">
        {#each top as p (p.id)}
          <button class="own" onclick={() => selectProcess(p.id)} class:dead={!p.alive}>
            <span class="n">{name(p.id)}</span>
            <span class="bar"><i style="width:{st ? (p.blocks / (top[0]?.blocks || 1)) * 100 : 0}%"></i></span>
            <span class="v num">{fmtMiB(p.blocks)}</span>
            <span class="c num">{p.cpuPct.toFixed(1)}%</span>
          </button>
        {/each}
      </div>
    </section>
    <section class="panel grow">
      <header><b>Largest cached files</b><span>standby + active</span></header>
      <div class="list">
        {#each topFiles as { f, s } (f.id)}
          <button class="own" onclick={() => selectFile(f.id)}>
            <span class="n" title={f.path}>{base(f.path)}</span>
            <span class="bar file"><i style="width:{st ? ((s?.blocks ?? 0) / (topFiles[0]?.s?.blocks || 1)) * 100 : 0}%"></i></span>
            <span class="v num">{fmtMiB(s?.blocks ?? 0)}</span>
          </button>
        {/each}
      </div>
    </section>
  </div>
</div>

<style>
  .ov {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }
  .kpi {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 12px 16px 10px;
    border-radius: var(--radius);
    border: 1px solid var(--line);
    background: var(--panel);
    text-align: left;
    transition: border-color 120ms ease;
  }
  .kpi:hover {
    border-color: var(--line2);
  }
  .kpi em {
    font: 600 9.5px var(--font-mono);
    font-style: normal;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: var(--ink3);
  }
  .kpi b {
    font: 300 30px / 1.15 var(--font-ui);
    letter-spacing: -0.02em;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .kpi b i {
    font-style: normal;
    font-size: 16px;
    color: var(--ink3);
    margin-left: 2px;
  }
  .kpi small {
    color: var(--ink3);
    font-size: 11px;
  }
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1.85fr) minmax(0, 1fr);
    gap: 12px;
    min-height: 0;
  }
  .panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    border-radius: var(--radius);
    border: 1px solid var(--line);
    background: var(--panel);
    overflow: hidden;
  }
  .panel[role='button'] {
    cursor: pointer;
    transition: border-color 120ms ease;
  }
  .panel[role='button']:hover {
    border-color: var(--line2);
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 9px 14px 6px;
    border-bottom: 1px solid var(--line);
  }
  header b {
    font-size: 12.5px;
    font-weight: 650;
  }
  header span {
    color: var(--ink3);
    font-size: 11px;
  }
  header .linkbtn {
    margin-left: auto;
    padding: 0 2px;
    border: 0;
    background: transparent;
    cursor: pointer;
    font: 500 11px var(--font-ui);
    color: var(--ink3);
    cursor: pointer;
  }
  header .linkbtn:hover {
    color: var(--ink);
  }
  .art {
    flex: 1;
    min-height: 0;
    padding: 8px 12px 10px;
  }
  .art svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  .list {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .own {
    display: grid;
    grid-template-columns: minmax(90px, 150px) minmax(40px, 1fr) 64px 48px;
    align-items: center;
    gap: 10px;
    padding: 5px 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    text-align: left;
    font-size: 12px;
  }
  .own:hover {
    background: var(--panel2);
  }
  .own.dead {
    opacity: 0.45;
  }
  .n {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--ink2);
  }
  .bar {
    height: 6px;
    border-radius: 3px;
    background: var(--panel2);
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    background: var(--c-private);
    border-radius: 3px;
  }
  .bar.file i {
    background: var(--c-file);
  }
  .v {
    text-align: right;
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: 11.5px;
  }
  .c {
    text-align: right;
    color: var(--ink3);
    font-family: var(--font-mono);
    font-size: 11px;
  }
  @media (max-width: 1180px) {
    .row {
      grid-template-columns: 1fr;
    }
  }
</style>
