<script lang="ts">
  /**
   * Small multiples of every scene + the numbers that matter, one screen, no navigation
   * depth. Every tile opens its scene. Each drawing that is painted by the overlay carries its
   * own reading guide underneath — the overview shows three components, and the same colour
   * means something different (and is honest to a different degree) on each of them.
   */
  import { app, getMachine, selectProcess, selectFile } from '../../mock/store.svelte';
  import { fmtMiB } from '../../mock/model';
  import RamBoard from '../../scene/RamBoard.svelte';
  import CpuDie from '../../scene/CpuDie.svelte';
  import GpuCard from '../../scene/GpuCard.svelte';
  import { RAM_BOARD, CPU_DIE, GPU_CARD } from '../../scene/geometry';
  import SceneScale from './SceneScale.svelte';
  import { GPU_NOTE, GPU_POWER_NOTE, GPU_UNIT_POWER, overlayOf } from './selection.svelte';
  import type { SceneId } from './scenes';

  let { onnavigate }: { onnavigate: (id: SceneId) => void } = $props();

  const m = getMachine();
  const st = $derived(app.stats);
  const cpu = $derived(app.cpu);
  const gpu = $derived(app.tele?.gpu ?? null);
  /** In "pages" mode the page legend sits in the stage header, where Pages can be picked. */
  const pages = $derived(app.mode === 'pages');

  const top = $derived(st ? [...st.procs].sort((a, b) => b.blocks - a.blocks).slice(0, 6) : []);
  const topFiles = $derived(
    st
      ? m.files.map((f) => ({ f, s: st.byOwner[String(f.id)] })).filter((x) => x.s).sort((a, b) => (b.s?.blocks ?? 0) - (a.s?.blocks ?? 0)).slice(0, 6)
      : [],
  );
  const alive = $derived(st ? st.procs.filter((p) => p.alive).length : 0);
  const totalGiB = m.dimms.reduce((s, d) => s + d.capacityGiB, 0);
  const name = (id: number) => m.processes.find((p) => p.id === id)?.name ?? '?';
  const base = (name2: string) => name2.split('\\').pop() ?? name2;
  const pct = (n: number | undefined) => (st && n !== undefined ? ((n / st.total) * 100).toFixed(0) : '0');
  const vramPct = $derived(gpu ? ((gpu.vramUsedMiB / gpu.vramTotalMiB) * 100).toFixed(0) : '0');
  /** the card's parts have their own range in Power mode — see selection.svelte.ts */
  const gpuPower = $derived(overlayOf('gpu') === 'power');
  const go = (id: SceneId) => (e: KeyboardEvent) => e.key === 'Enter' && onnavigate(id);
</script>

<div class="ov">
  <div class="kpis">
    <button class="kpi" onclick={() => onnavigate('memory')}>
      <em>memory in use</em>
      <b>{pct(st?.inUse)}<i>%</i></b>
      <small>{st ? fmtMiB(st.inUse) : ''} of {totalGiB} GiB</small>
    </button>
    <button class="kpi" onclick={() => onnavigate('memory')}>
      <em>cached</em>
      <b>{pct(st?.byState[2])}<i>%</i></b>
      <small>{st ? fmtMiB(st.byState[2]) : ''} standby</small>
    </button>
    <button class="kpi" onclick={() => onnavigate('cpu')}>
      <em>processor</em>
      <b>{cpu ? cpu.avgLoad.toFixed(0) : '0'}<i>%</i></b>
      <small>{cpu ? cpu.maxTemp.toFixed(0) : '–'} °C · {cpu ? cpu.power.toFixed(0) : '–'} W</small>
    </button>
    <button class="kpi" onclick={() => onnavigate('gpu')}>
      <em>gpu</em>
      <b>{gpu ? gpu.engines['3d'].toFixed(0) : '0'}<i>%</i></b>
      <small>{gpu ? gpu.temp.toFixed(0) : '–'} °C · {gpu ? gpu.power.toFixed(0) : '–'} W</small>
    </button>
    <button class="kpi" onclick={() => onnavigate('apps')}>
      <em>applications</em>
      <b>{alive}</b>
      <small>{m.files.length} files cached</small>
    </button>
  </div>

  <div class="row small">
    <div class="panel" onclick={() => onnavigate('memory')} role="button" tabindex="0" onkeydown={go('memory')} aria-label="Memory — open the Memory scene">
      <header><b>Memory</b><span>{m.dimms.length} × 16 GB DDR5</span><i>open ›</i></header>
      <div class="art">
        <svg viewBox="0 0 {RAM_BOARD.width} {RAM_BOARD.compactHeight}" preserveAspectRatio="xMidYMid meet">
          <RamBoard compact interactive={false} />
        </svg>
      </div>
      {#if !pages}
        <div class="cap"><SceneScale component="memory" compact /></div>
      {/if}
    </div>

    <div class="panel" onclick={() => onnavigate('cpu')} role="button" tabindex="0" onkeydown={go('cpu')} aria-label="Processor — open the Processor scene">
      <header><b>Processor</b><span>2 CCD + I/O die</span><i>open ›</i></header>
      <div class="art">
        <svg viewBox="0 0 {CPU_DIE.width} {CPU_DIE.height}" preserveAspectRatio="xMidYMid meet">
          <CpuDie />
        </svg>
      </div>
      <div class="cap"><SceneScale component="cpu" compact /></div>
    </div>

    <div class="panel" onclick={() => onnavigate('gpu')} role="button" tabindex="0" onkeydown={go('gpu')} aria-label="GPU — open the GPU scene">
      <header><b>GPU</b><span>{vramPct} % VRAM</span><i>open ›</i></header>
      <div class="art">
        <svg viewBox="0 0 {GPU_CARD.width} {GPU_CARD.height}" preserveAspectRatio="xMidYMid meet">
          <GpuCard ondie={() => onnavigate('gpu')} onvram={() => onnavigate('gpu')} oncard={() => onnavigate('gpu')} />
        </svg>
      </div>
      <div class="cap"><SceneScale component="gpu" compact note={gpuPower ? GPU_POWER_NOTE : GPU_NOTE} domain={gpuPower ? GPU_UNIT_POWER : undefined} /></div>
    </div>
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
    gap: 12px;
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 10px;
  }
  .kpi {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    min-width: 0;
    padding: 8px 14px 8px;
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
    max-width: 100%;
    font: 600 9.5px var(--font-mono);
    font-style: normal;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: var(--ink3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .kpi b {
    font: 300 28px / 1.15 var(--font-ui);
    letter-spacing: -0.02em;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .kpi b i {
    font-style: normal;
    font-size: 15px;
    color: var(--ink3);
    margin-left: 2px;
  }
  .kpi small {
    max-width: 100%;
    color: var(--ink3);
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row {
    display: grid;
    gap: 12px;
    min-height: 0;
    flex: none;
  }
  /* the three small multiples keep their own proportions, at one shared height */
  .row.small {
    grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1.15fr);
  }
  .row.grow {
    flex: 1;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
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
  .panel[role='button']:hover,
  .panel[role='button']:focus-visible {
    border-color: var(--line2);
    outline: none;
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex: none;
    padding: 7px 14px 5px;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
  }
  header b {
    font-size: 12.5px;
    font-weight: 650;
  }
  header span {
    color: var(--ink3);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  header i {
    margin-left: auto;
    color: var(--ink3);
    font: 500 11px var(--font-ui);
    font-style: normal;
  }
  header .linkbtn {
    margin-left: auto;
    padding: 0 2px;
    border: 0;
    background: transparent;
    cursor: pointer;
    font: 500 11px var(--font-ui);
    color: var(--ink3);
  }
  header .linkbtn:hover {
    color: var(--ink);
  }
  /* basis from the declared height (`flex: 1` alone would size it from the drawing — the tall
     processor die would set the height for all three), then grow if the panel has room */
  .art {
    flex: 1 0 auto;
    min-height: 0;
    height: clamp(130px, 20vh, 210px);
    padding: 6px 12px 4px;
  }
  .art svg {
    width: 100%;
    height: 100%;
    display: block;
    overflow: visible;
  }
  .cap {
    flex: none;
    padding: 0 14px 8px;
  }
  .list {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 3px 8px 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .own {
    display: grid;
    flex: 1 1 0;
    min-height: 25px;
    max-height: 50px;
    grid-template-columns: minmax(90px, 150px) minmax(40px, 1fr) 64px 48px;
    align-items: center;
    gap: 10px;
    padding: 4px 8px;
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
  @media (max-width: 1000px) {
    .kpis {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
  @media (max-width: 860px) {
    .ov {
      overflow: auto;
    }
    .row.small,
    .row.grow {
      flex: none;
      grid-template-columns: 1fr;
    }
    .art {
      flex: none;
      height: auto;
      min-height: 170px;
    }
  }
</style>
