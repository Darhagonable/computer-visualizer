<script lang="ts">
  /**
   * Small multiples of every scene + the numbers that matter, one screen. Each drawing that is
   * painted by the overlay carries its own reading guide underneath — the overview shows four
   * components, and the same colour means something different (and is honest to a different
   * degree) on each of them. In "pages" mode the page legend sits in the stage header, where
   * Pages can be picked.
   *
   * Every tile is a door into its section, and inside a drawing a part is a door into its own
   * view: a VRAM chip opens VRAM, a core opens that core. The memory board is a small multiple
   * only (its blocks are half a pixel wide here) — its modules are doors on the Memory scene.
   */
  import { app, getMachine, selectProcess, selectFile } from '../../mock/store.svelte';
  import { fmtMiB } from '../../mock/model';
  import { TRUTH, type DriveLive, type Overlay } from '../../mock/telemetry';
  import RamBoard from '../../scene/RamBoard.svelte';
  import CpuDie from '../../scene/CpuDie.svelte';
  import GpuCard from '../../scene/GpuCard.svelte';
  import Drive from '../../scene/Drive.svelte';
  import ScaleLegend from '../../scene/ScaleLegend.svelte';
  import { RAM_BOARD, CPU_DIE, GPU_CARD } from '../../scene/geometry';
  import type { Level } from '../../levels/nav';
  import { overlayOf as overlayUnder } from '../../levels/live';
  import { DRIVE_CANVAS, driveValue, pct, readingText, shortModel } from '../../levels/drives.live';
  import { GPU_NOTE, GPU_POWER_NOTE, GPU_UNIT_POWER, overlayOf } from './selection.svelte';
  import { door } from './scenes';
  import TruthTag from './TruthTag.svelte';

  let { onnavigate }: { onnavigate: (l: Level, el?: Element) => void } = $props();

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
  const pctOf = (n: number | undefined) => (st && n !== undefined ? ((n / st.total) * 100).toFixed(0) : '0');
  const vramPct = $derived(gpu ? ((gpu.vramUsedMiB / gpu.vramTotalMiB) * 100).toFixed(0) : '0');
  /** the card's parts have their own range in Power mode — see selection.svelte.ts */
  const gpuPower = $derived(overlayOf('gpu') === 'power');

  // ---- storage: the three drives, each a door into itself --------------------------------
  /** Pages are memory data only: the drives stay on their temperature colours. */
  const ovSto = $derived<Overlay>(overlayUnder(app.mode, 'storage') ?? 'temperature');
  const drives = $derived.by(() => {
    void app.version; // the readings are mutated in place: this read is what keeps them live
    return (app.tele?.storage ?? []).map((d) => {
      const value = driveValue(ovSto, d);
      return { i: d.index, name: shortModel(d.model), canvas: DRIVE_CANVAS[d.kind], value, noData: value === null, reading: value === null ? '' : readingText(ovSto, value) };
    });
  });
  const storage = $derived.by(() => {
    void app.version;
    const list: DriveLive[] = app.tele?.storage ?? [];
    const used = list.reduce((s, d) => s + d.usedGiB, 0);
    const total = list.reduce((s, d) => s + d.totalGiB, 0);
    return { used, total, pct: pct(used, total), busiest: list.reduce<DriveLive | null>((a, d) => (!a || d.busyPct > a.busyPct ? d : a), null) };
  });

  /** Enter or Space on a focused panel opens its section. */
  const go = (l: Level) => (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault(); // Space is "pause" everywhere else in the app
    onnavigate(l, door(e));
  };
  /** A drive inside the Storage panel opens itself — and not, as well, the panel's own door. */
  const openDrive = (i: number, e: MouseEvent) => {
    e.stopPropagation();
    onnavigate({ kind: 'drive', drive: i }, door(e));
  };
</script>

<div class="lv ov">
  <div class="kpis">
    <button class="kpi" onclick={(e) => onnavigate({ kind: 'memory' }, door(e))}>
      <em>memory in use</em>
      <b>{pctOf(st?.inUse)}<i>%</i></b>
      <small>{st ? fmtMiB(st.inUse) : ''} of {totalGiB} GiB</small>
    </button>
    <button class="kpi" onclick={(e) => onnavigate({ kind: 'memory' }, door(e))}>
      <em>cached</em>
      <b>{pctOf(st?.byState[2])}<i>%</i></b>
      <small>{st ? fmtMiB(st.byState[2]) : ''} standby</small>
    </button>
    <button class="kpi" onclick={(e) => onnavigate({ kind: 'package' }, door(e))}>
      <em>processor</em>
      <b>{cpu ? cpu.avgLoad.toFixed(0) : '0'}<i>%</i></b>
      <small>{cpu ? cpu.maxTemp.toFixed(0) : '–'} °C · {cpu ? cpu.power.toFixed(0) : '–'} W</small>
    </button>
    <button class="kpi" onclick={(e) => onnavigate({ kind: 'card' }, door(e))}>
      <em>graphics</em>
      <b>{gpu ? gpu.engines['3d'].toFixed(0) : '0'}<i>%</i></b>
      <small>{gpu ? gpu.temp.toFixed(0) : '–'} °C · {gpu ? gpu.power.toFixed(0) : '–'} W</small>
    </button>
    <button class="kpi" onclick={(e) => onnavigate({ kind: 'drives' }, door(e))} title="The busiest drive's busy time, measured">
      <em>storage</em>
      <b>{storage.busiest ? storage.busiest.busyPct.toFixed(0) : '–'}<i>%</i></b>
      <small>{storage.busiest ? shortModel(storage.busiest.model) : 'no drives'} · {storage.pct.toFixed(0)} % in use</small>
    </button>
    <button class="kpi" onclick={(e) => onnavigate({ kind: 'apps' }, door(e))}>
      <em>applications</em>
      <b>{alive}</b>
      <small>{m.files.length} files cached</small>
    </button>
  </div>

  <div class="row small">
    <div class="panel" onclick={(e) => onnavigate({ kind: 'memory' }, door(e))} role="button" tabindex="0" onkeydown={go({ kind: 'memory' })} aria-label="Memory — open the Memory scene">
      <header><b>Memory</b><span>{m.dimms.length} × 16 GB DDR5</span><i>open ›</i></header>
      <div class="art">
        <svg viewBox="0 0 {RAM_BOARD.width} {RAM_BOARD.compactHeight}" preserveAspectRatio="xMidYMid meet">
          <RamBoard compact interactive={false} />
        </svg>
      </div>
      {#if !pages}
        <div class="cap"><ScaleLegend component="memory" compact /></div>
      {/if}
    </div>

    <div class="panel" onclick={(e) => onnavigate({ kind: 'package' }, door(e))} role="button" tabindex="0" onkeydown={go({ kind: 'package' })} aria-label="Processor — open the Processor scene">
      <header><b>Processor</b><span>2 CCD + I/O die</span><i>open ›</i></header>
      <div class="art">
        <svg viewBox="0 0 {CPU_DIE.width} {CPU_DIE.height}" preserveAspectRatio="xMidYMid meet">
          <CpuDie oncore={(i) => onnavigate({ kind: 'core', core: i })} onccd={(d) => onnavigate({ kind: 'ccd', ccd: d })} />
        </svg>
      </div>
      <div class="cap"><ScaleLegend component="cpu" compact /></div>
    </div>

    <div class="panel" onclick={(e) => onnavigate({ kind: 'card' }, door(e))} role="button" tabindex="0" onkeydown={go({ kind: 'card' })} aria-label="Graphics — open the Graphics scene">
      <header><b>Graphics</b><span>{vramPct} % VRAM</span><i>open ›</i></header>
      <div class="art">
        <svg viewBox="0 0 {GPU_CARD.width} {GPU_CARD.height}" preserveAspectRatio="xMidYMid meet">
          <GpuCard ondie={() => onnavigate({ kind: 'gdie' })} onvram={() => onnavigate({ kind: 'vram' })} oncard={() => onnavigate({ kind: 'card' })} />
        </svg>
      </div>
      <div class="cap"><ScaleLegend component="gpu" compact note={gpuPower ? GPU_POWER_NOTE : GPU_NOTE} domain={gpuPower ? GPU_UNIT_POWER : undefined} /></div>
    </div>

    <div class="panel storage" onclick={(e) => onnavigate({ kind: 'drives' }, door(e))} role="button" tabindex="0" onkeydown={go({ kind: 'drives' })} aria-label="Storage — open the drives">
      <header><b>Storage</b><span>{drives.length} drives</span><i>open ›</i></header>
      <div class="art bay">
        {#each drives as d (d.i)}
          <!-- each drive with its reading under it; the three keep their proportions at one height -->
          <div class="unit" style="flex: {d.canvas.w / d.canvas.h}">
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <svg viewBox="0 0 {d.canvas.w} {d.canvas.h}" class="door" onclick={(e) => openDrive(d.i, e)}>
              <Drive drive={d.i} labels={false} ondrive={() => onnavigate({ kind: 'drive', drive: d.i })} />
            </svg>
            <span class="dcap" title="{d.name} · {d.noData ? 'no temperature sensor' : TRUTH[ovSto].storage}">
              {#if d.noData}
                <b class="none">—</b><em>no sensor</em>
              {:else}
                <b>{d.reading}</b><TruthTag truth={TRUTH[ovSto].storage} />
              {/if}
            </span>
          </div>
        {/each}
      </div>
      <div class="cap"><ScaleLegend component="storage" compact /></div>
    </div>
  </div>

  <div class="row grow">
    <section class="panel grow">
      <header><b>Top owners</b><span>pages by process</span><button class="linkbtn" onclick={(e) => { e.stopPropagation(); onnavigate({ kind: 'apps' }, door(e)); }}>all apps ›</button></header>
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
    display: flex;
    flex-direction: column;
    gap: 12px;
    /* fits, or scrolls as one. Never a part squeezed out of sight: the lists keep three rows
       (.row.grow), and a stage too short for that scrolls rather than taking them away */
    overflow-y: auto;
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
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
  .kpi:focus-visible,
  .panel[role='button']:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
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
  /* the four small multiples keep their own proportions, at one shared height */
  .row.small {
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1.08fr) minmax(0, 1.38fr);
  }
  .row.grow {
    flex: 1;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    /* three rows of a list, at least: the header, the border, the list's padding, the rows and
       the 2 px between them. They take whatever the stage leaves over, down to this */
    min-height: calc(31px + 2px + 7px + 3 * 25px + 2 * 2px);
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
     processor die would set the height for all four), then grow if the panel has room */
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
  /* storage: as tall as the other small multiples, with the three drives (each over its reading)
     centred in what is left */
  .storage .art {
    flex: 1 1 0;
    height: auto;
    min-height: 0;
  }
  .bay {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 10px 2px;
  }
  .unit {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    min-width: 0;
  }
  .unit .door {
    display: block;
    width: 100%;
    height: auto; /* the drawing's own proportions */
    cursor: pointer;
    transition: transform 140ms ease;
  }
  .unit .door:hover {
    transform: translateY(-2px);
  }
  .unit:focus-within .door {
    outline: none;
  }
  .dcap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    max-width: 100%;
    font: 600 11px var(--font-ui);
    color: var(--ink);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .dcap b {
    font-weight: 600;
  }
  .dcap b.none,
  .dcap em {
    color: var(--ink3);
  }
  .dcap em {
    font: 400 10px var(--font-ui);
    font-style: normal;
  }
  /* the word under a drive the width of a thumb: the same tag, set tighter */
  .dcap :global(.truth) {
    padding: 0 4px;
    letter-spacing: 0.06em;
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
  /* narrow: the small multiples in one scrolling column */
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
