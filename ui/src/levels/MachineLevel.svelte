<script lang="ts">
  /**
   * Level 0 · machine — the whole motherboard as the hero: processor socket, memory slots
   * and the graphics card in its PCIe slot, each the real scene primitive carrying its own
   * live data and hover cards. Click the socket to open the processor, the card to open the
   * graphics card, a module to open it, a drive to open it. KPI tiles flank the board, one group
   * per component, each with its reading guide. Empty slots are dashed outlines, never silicon.
   *
   * Four components, two columns. The processor, graphics and storage groups stand on the right,
   * which only fits a tall stage if each guide states its reason once: the full sentence from
   * telemetry.ts when tall, the one-line `sub` when compact. The load-history tile takes another
   * 180 px and is only mounted where the left column has them. Shorter stages than that scroll
   * their columns (the wheel gesture yields to a column that can scroll).
   */
  import { app, getMachine, hoverCard, selectProcess, selectFile } from '../mock/store.svelte';
  import { fmtMiB } from '../mock/model';
  import { VRAM_CHIPS, type DriveLive } from '../mock/telemetry';
  import Motherboard from '../scene/Motherboard.svelte';
  import AreaGraph from '../scene/AreaGraph.svelte';
  import Icon from '../scene/Icon.svelte';
  import { MOTHERBOARD } from '../scene/geometry';
  import { BOARD_COL, boardLayout, levelWheel, moboHit, svgPoint, patchHover, seatGpuCard, type Level, type Target } from './nav';
  import Guide from './Guide.svelte';
  import { chipsHeat, allChips, heatWatts, warmestDimm, hottestCore, overlayOf, labelled, fmt } from './live';

  interface Props {
    w: number;
    h: number;
    go: (l: Level) => void;
    down: (t?: Target) => void;
  }
  let { w, h, go, down }: Props = $props();

  /** Compact layout below 620 px of stage. */
  const isShort = $derived(h > 0 && h < 620);

  const m = getMachine();
  const EMPTY = m.slots.filter((s) => !s.dimm);
  const totalGiB = m.dimms.reduce((s, d) => s + d.capacityGiB, 0);
  const d0 = m.dimms[0];
  const kit = `${m.dimms.length} × ${d0.capacityGiB} GiB ${d0.type.split(' ')[0]}-${d0.speedMts}`;
  const slotLabel = (d: number) => m.slots[m.dimms[d].slot].label;

  const st = $derived(app.stats);
  const cpu = $derived(app.cpu);
  const tele = $derived(app.tele);
  const g = $derived(tele?.gpu ?? null);
  const mode = $derived(app.mode);
  const ovMem = $derived(overlayOf(mode, 'memory'));
  const ovCpu = $derived(overlayOf(mode, 'cpu'));
  const ovGpu = $derived(overlayOf(mode, 'gpu'));
  const ovSto = $derived(overlayOf(mode, 'storage'));

  /** The board as tall as the stage allows, between the two tile columns. */
  const board = $derived(boardLayout(w, h));

  // ---- memory ---------------------------------------------------------------------------
  const use = $derived(st ? (st.inUse / st.total) * 100 : 0);
  const fullest = $derived.by(() => (st ? m.dimms.reduce((a, d) => ((st.dimmUsed[d.index] ?? 0) > (st.dimmUsed[a.index] ?? 0) ? d : a), m.dimms[0]) : m.dimms[0]));
  const memHeat = $derived(tele ? chipsHeat(tele, allChips(m)) : null);
  const warm = $derived(tele ? warmestDimm(tele, m) : null);
  /** The module with the most going on in it (modelled page heat). */
  const busiest = $derived.by(() => {
    if (!tele) return m.dimms[0];
    return m.dimms.reduce((a, d) => (chipsHeat(tele, d.chips.map((c) => c.index)).mean > chipsHeat(tele, a.chips.map((c) => c.index)).mean ? d : a), m.dimms[0]);
  });
  const busiestHeat = $derived(tele && busiest ? chipsHeat(tele, busiest.chips.map((c) => c.index)) : null);

  /**
   * The load-history tile stands at the foot of the left column, and only where that column has
   * room for its 180 px. Measured: the column needs 694 px of stage in an overlay mode, and 810
   * in Pages, which carries two conditional tiles there. A little margin on each.
   */
  const showHistory = $derived(h >= (mode === 'pages' ? 830 : 710));

  /** The reading guide's figure and caption follow the mode. */
  const memGuide = $derived.by(() => {
    if (ovMem === 'temperature' && tele && warm) {
      return { note: 'per die · estimated', k: fmt(warm.temp, 1), u: '°C', accent: true, sub: `${slotLabel(warm.dimm)} · one sensor per module, spread to its dies` };
    }
    if (ovMem === 'activity' && memHeat) {
      return { note: 'per block · modelled', k: fmt(memHeat.mean * 100), u: '%', accent: true, sub: 'mean page heat · most in ' + slotLabel(m.chips[memHeat.atChip].dimm) };
    }
    if (ovMem === 'power' && memHeat) {
      return { note: 'per block · estimated', k: `≈ ${fmt(heatWatts(memHeat.mean), 2)}`, u: 'W', accent: true, sub: 'per 4 MiB block, on average · DIMMs have no power sensor' };
    }
    return { note: '', k: null, u: '', accent: false, sub: 'hue: what a live page is for · brightness: its state' };
  });

  /** Who holds the most memory: one process, one cached file. */
  const topProc = $derived.by(() => (st ? [...st.procs].sort((a, b) => b.blocks - a.blocks)[0] ?? null : null));
  const topFile = $derived.by(() => {
    if (!st) return null;
    return m.files.map((f) => ({ f, blocks: st.byOwner[String(f.id)]?.blocks ?? 0 })).sort((a, b) => b.blocks - a.blocks)[0] ?? null;
  });
  const lit = $derived(app.highlight?.kind === 'owner' ? app.highlight.id : null);
  const procName = (id: number) => m.processes.find((p) => p.id === id)?.name ?? '?';
  const base = (p: string) => p.split('\\').pop() ?? p;

  // ---- processor and graphics -----------------------------------------------------------
  const hot = $derived(hottestCore(cpu));
  const load = $derived(cpu?.avgLoad ?? 0);
  const cpuPower = $derived(cpu?.power ?? 0);
  const l3 = $derived(g?.engines['3d'] ?? 0);
  const vramPct = $derived(g ? (g.vramUsedMiB / g.vramTotalMiB) * 100 : 0);

  const cpuKpi = $derived.by(() => {
    const t = fmt(hot?.temp ?? 0);
    if (ovCpu === 'temperature') return { big: t, u: '°C', sub: `hottest core ${hot ? hot.index + 1 : 1} · load ${fmt(load)} % · ${fmt(cpuPower)} W package` };
    if (ovCpu === 'power') return { big: fmt(cpuPower), u: 'W', sub: `package · load ${fmt(load)} % · hottest core ${t} °C` };
    return { big: fmt(load), u: '%', sub: `load · hottest core ${hot ? hot.index + 1 : 1} at ${t} °C · ${fmt(cpuPower)} W` };
  });
  const gpuKpi = $derived.by(() => {
    const t = fmt(g?.temp ?? 0);
    const p = fmt(g?.power ?? 0);
    if (ovGpu === 'temperature') return { big: t, u: '°C', sub: `hotspot ${fmt(g?.hotspot ?? 0)} °C · 3D ${fmt(l3)} % · ${p} W` };
    if (ovGpu === 'power') return { big: p, u: 'W', sub: `of ${fmt(g?.powerLimit ?? 0)} W · 3D ${fmt(l3)} % · ${t} °C` };
    return { big: fmt(l3), u: '%', sub: `3D load · ${t} °C · ${p} W` };
  });
  /** The guides carry the scale and the truth word; the tiles above them already carry the figure. */
  const cpuGuide = $derived.by(() =>
    ovCpu === 'temperature'
      ? { note: 'per core', sub: 'one digital sensor per core' }
      : { note: 'per core', sub: ovCpu === 'power' ? 'each core: a share of the measured package power' : 'each core: half per thread' },
  );
  const gpuGuide = $derived.by(() =>
    ovGpu === 'temperature'
      ? { note: 'per unit', sub: 'die and hotspot are sensors — the spread is not' }
      : { note: 'per unit', sub: ovGpu === 'power' ? 'each unit: a share of the measured board power' : 'each unit: which are busy is a model' },
  );

  // ---- storage ------------------------------------------------------------------------------
  const drives = $derived(tele?.storage ?? []);
  const busiestDrive = $derived.by(() => drives.reduce<DriveLive | null>((a, d) => (!a || d.busyPct > a.busyPct ? d : a), null));
  const sensed = $derived(drives.find((d) => d.tempC !== null) ?? null);
  const short = (model: string) => model.replace(/^Mock /, '');
  const stoKpi = $derived.by(() => {
    const b = busiestDrive;
    if (!b) return { big: '—', u: '', sub: '' };
    if (ovSto === 'temperature') {
      return sensed ? { big: fmt(sensed.tempC ?? 0), u: '°C', sub: `${short(sensed.model)} · the only drive with a sensor` } : { big: '—', u: '', sub: 'no drive reports a temperature' };
    }
    if (ovSto === 'power') return { big: fmt(drives.reduce((s, d) => s + d.power, 0)), u: 'W', sub: 'all drives, estimated' };
    return { big: fmt(b.busyPct), u: '%', sub: `busiest: ${short(b.model)} · ${fmt(b.readBps / 1e6)} MB/s read` };
  });
  const stoGuide = $derived.by(() =>
    ovSto === 'temperature'
      ? { note: 'per drive', sub: 'an NVMe drive reports its temperature; most SATA drives do not' }
      : { note: 'per drive', sub: ovSto === 'power' ? 'estimated from activity' : 'busy time is measured; the split between partitions is modelled' },
  );

  // ---- the board is the doorway ---------------------------------------------------------
  let root: HTMLDivElement;
  let svg: SVGSVGElement;
  // once mounted: the card sits in its PCIe slot (see nav.seatGpuCard)
  $effect(() => seatGpuCard(svg));
  $effect(() => {
    const onWheel = levelWheel((dir, e) => {
      if (dir < 0) return;
      const p = svgPoint(svg, e);
      const hit = moboHit(p.x, p.y, m);
      if (hit?.kind === 'dimm') down({ dimm: hit.dimm });
      else if (hit?.kind === 'cpu') down({ cpu: true });
      else if (hit?.kind === 'gpu') down({ gpu: true });
      else if (hit?.kind === 'storage') down(hit.drive >= 0 ? { drive: hit.drive } : { storage: true });
      else down();
    });
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  });

  /** True while a click is travelling that started on a VRAM chip: the shared board reports only "the card". */
  let onVram = false;
  function captureClick(e: MouseEvent) {
    onVram = !!(e.target as Element).closest('.vram');
  }

  /**
   * The wrapper is the keyboard door — focus it, press Enter (a focused module handles its
   * own keys). It is also the catch-all for the parts of a door that have no handler of their
   * own in the shared board: a module's dies (their click goes to `onchip`, which the
   * Motherboard does not wire), the processor's I/O die and substrate, the card's cooler.
   */
  function onBoardClick(e: MouseEvent) {
    const t = e.target as Element;
    const stick = t.closest<HTMLElement>('[data-stick]');
    if (stick) {
      if (t.closest('[data-chip]')) down({ dimm: Number(stick.dataset.stick) });
      return; // the module's body already went through ondimm
    }
    if (t.closest('.socket')) return down({ cpu: true });
    if (t.closest('.gpu')) return down({ gpu: true, vram: onVram });
    if (t.closest('.bay')) return down({ storage: true }); // a drive's own click already went through onstorage
  }
  function onKey(e: KeyboardEvent) {
    if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    e.stopPropagation(); // Space is "pause" everywhere else
    down();
  }

  /** Hover cards for what the shared scenes leave without one; the grids' own card gets the right hint. */
  function onMove(e: PointerEvent) {
    const t = e.target as Element;
    const stick = t.closest<HTMLElement>('[data-stick]');
    if (stick) {
      const d = m.dimms[Number(stick.dataset.stick)];
      if (!d) return;
      if (t.closest('[data-chip]')) {
        // the grids' own hover card promises an owner highlight; here a click opens the module
        patchHover(`click to open ${slotLabel(d.index)} — its dies and blocks`);
      } else if (!app.hover) {
        hoverCard(
          {
            title: `${slotLabel(d.index)} · ${d.capacityGiB} GB ${d.type}`,
            sub: `${d.manufacturer} ${d.partNumber}`,
            rows: [
              { k: 'in use', v: `${Math.round((st?.dimmUsed[d.index] ?? 0) * 100)} %`, mono: true },
              ...labelled('temperature', tele ? `${fmt(tele.dimmTemp[d.index], 1)} °C module sensor` : '—', 'measured'),
            ],
            hint: 'click to open this module',
          },
          e,
        );
      }
      return;
    }
    // parts of a door with no handler of their own: the I/O die and substrate, the cooler, the ports
    if (app.hover) return;
    if (t.closest('.socket')) return hoverCard(cpuCard(), e);
    if (t.closest('.gpu')) return hoverCard(gpuCard(), e);
    if (t.closest('.bay')) return hoverCard(storageCard(), e);
  }
  function cpuCard() {
    return {
      title: 'Processor',
      sub: 'mock 16 cores / 32 threads · 2 CCDs + I/O die',
      rows: [
        { k: 'load', v: `${fmt(load)} %`, mono: true },
        ...labelled('temperature', `${fmt(hot?.temp ?? 0)} °C · hottest core ${hot ? hot.index + 1 : 1}`, 'measured'),
        ...labelled('power', `${fmt(cpuPower)} W package`, 'measured'),
      ],
      hint: 'click to open the processor',
    };
  }
  function gpuCard() {
    return {
      title: g?.name ?? 'Graphics card',
      sub: `PCIe 5.0 ×16 · ${VRAM_CHIPS} × 2 GB GDDR6X`,
      rows: [
        { k: '3D load', v: `${fmt(l3)} %`, mono: true },
        ...labelled('temperature', `${fmt(g?.temp ?? 0)} °C · hotspot ${fmt(g?.hotspot ?? 0)} °C`, 'measured'),
        ...labelled('power', `${fmt(g?.power ?? 0)} W of ${fmt(g?.powerLimit ?? 0)} W`, 'measured'),
      ],
      hint: 'click to open the graphics card',
    };
  }
  function storageCard() {
    const used = drives.reduce((s, d) => s + d.usedGiB, 0);
    const total = drives.reduce((s, d) => s + d.totalGiB, 0);
    return {
      title: 'Storage',
      sub: `${drives.length} drives · ${fmt(used)} of ${fmt(total)} GiB in use`,
      rows: [
        ...(busiestDrive ? [{ k: 'busiest', v: `${short(busiestDrive.model)} · ${fmt(busiestDrive.busyPct)} % busy`, mono: true }] : []),
        ...labelled('temperature', sensed ? `${fmt(sensed.tempC ?? 0)} °C · ${short(sensed.model)}, the only drive with a sensor` : 'no drive reports a temperature', 'measured'),
      ],
      hint: 'click a drive to open it',
    };
  }
</script>

<div class="lv lv-scope" bind:this={root} data-short={isShort ? '1' : '0'}>
  <div class="col l" style="width:{BOARD_COL}px">
    <div class="grp">
      <button class="io-tile part" onclick={() => go({ kind: 'stick', dimm: fullest.index })} title="Open {slotLabel(fullest.index)}, the fullest module">
        <em><Icon name="memory" size={13} />Memory in use</em>
        <b>{Math.round(use)}<i>%</i></b>
        <span>{st ? `${fmtMiB(st.inUse)} of ${totalGiB} GiB · ${kit}` : ''}</span>
      </button>
      <Guide component="memory" note={memGuide.note} k={memGuide.k} u={memGuide.u} accent={memGuide.accent} sub={memGuide.sub} compact />
    </div>

    <div class="io-tile">
      <em>Slots</em>
      <b>{m.dimms.length}<i>/ {m.slots.length}</i></b>
      <div class="ghosts">
        {#each EMPTY as s (s.index)}<span class="ghost" title="{s.channel} · no module installed">{s.label}</span>{/each}
      </div>
      <span>populated · {EMPTY.length} empty, drawn empty · mock board</span>
    </div>

    {#if mode === 'pages'}
      {#if topProc}
        <button class="io-tile part" class:on={lit === topProc.id} onclick={() => selectProcess(lit === topProc.id ? null : topProc.id)} title="Show this process's pages">
          <em>Largest process</em>
          <b class="io-name">{procName(topProc.id)}</b>
          <span>{fmtMiB(topProc.blocks)} · click to show its pages</span>
        </button>
      {/if}
      {#if topFile && topFile.blocks}
        <button class="io-tile part file" class:on={lit === topFile.f.id} onclick={() => selectFile(lit === topFile.f.id ? null : topFile.f.id)} title={topFile.f.path}>
          <em>Largest cached file</em>
          <b class="io-name">{base(topFile.f.path)}</b>
          <span>{fmtMiB(topFile.blocks)} · click to show its pages</span>
        </button>
      {/if}
    {:else if ovMem === 'temperature' && warm}
      <button class="io-tile part" onclick={() => go({ kind: 'stick', dimm: warm.dimm })} title="Open {slotLabel(warm.dimm)}">
        <em>Warmest module</em>
        <b>{fmt(warm.temp, 1)}<i>°C</i></b>
        <span>{slotLabel(warm.dimm)} · its sensor, measured · click to open</span>
      </button>
    {:else if busiestHeat}
      <button class="io-tile part" onclick={() => go({ kind: 'stick', dimm: busiest.index })} title="Open {slotLabel(busiest.index)}">
        <em>Most active module</em>
        <b>{fmt(busiestHeat.mean * 100)}<i>%</i></b>
        <span>{slotLabel(busiest.index)} · mean page heat, modelled · click to open</span>
      </button>
    {/if}

    {#if showHistory}
      <div class="io-tile extra">
        <em>Load · last 2 minutes</em>
        <div class="graph"><AreaGraph values={app.hist.cpu} max={100} color="var(--accent)" unit="%" label="processor" decimals={0} /></div>
        <div class="graph"><AreaGraph values={app.hist.gpu} max={100} color="var(--c-file)" unit="%" label="graphics 3D" decimals={0} /></div>
      </div>
    {/if}
  </div>

  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="mobo"
    style="width:{board.w}px; height:{board.h}px"
    tabindex="0"
    role="application"
    aria-label="Motherboard: click the socket to open the processor, the graphics card to open it, a memory module or a drive to open it"
    onkeydown={onKey}
    onpointermove={onMove}
    onclickcapture={captureClick}
    onclick={onBoardClick}
  >
    <!-- the handlers live on the wrapper: a module's click starts on a 1-px cell and bubbles up to it -->
    <svg bind:this={svg} viewBox="0 0 {MOTHERBOARD.width} {MOTHERBOARD.height}" class="board-svg">
      <Motherboard
        oncpu={() => down({ cpu: true })}
        ongpu={() => down({ gpu: true, vram: onVram })}
        ondimm={(d) => down({ dimm: d })}
        onstorage={(i) => down({ drive: i })}
      />
    </svg>
  </div>

  <div class="col r" style="width:{BOARD_COL}px">
    <div class="grp">
      <button class="io-tile part" onclick={() => go({ kind: 'package' })} title="Open the processor">
        <em><Icon name="cpu" size={13} />Processor</em>
        <b>{cpuKpi.big}<i>{cpuKpi.u}</i></b>
        <span>{cpuKpi.sub}</span>
      </button>
      <Guide component="cpu" note={cpuGuide.note} sub={isShort ? cpuGuide.sub : ''} compact />
    </div>
    <div class="grp">
      <button class="io-tile part" onclick={() => go({ kind: 'card' })} title="Open the graphics card">
        <em><Icon name="overview" size={13} />Graphics card</em>
        <b>{gpuKpi.big}<i>{gpuKpi.u}</i></b>
        <span>{gpuKpi.sub}</span>
      </button>
      <Guide component="gpu" note={gpuGuide.note} sub={isShort ? gpuGuide.sub : ''} compact />
    </div>
    <div class="grp">
      <button class="io-tile part" onclick={() => go({ kind: 'drives' })} title="Open the drives">
        <em><Icon name="storage" size={13} />Storage</em>
        <b>{stoKpi.big}<i>{stoKpi.u}</i></b>
        <span>{stoKpi.sub}</span>
      </button>
      <Guide component="storage" note={stoGuide.note} sub={isShort ? stoGuide.sub : ''} compact />
    </div>
  </div>
</div>

<style>
  .lv {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 24px;
  }
  .col {
    flex: none;
    align-self: stretch;
    min-width: 0;
    padding: 16px 0;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    /* a stage too short for a column scrolls it instead of losing its tail under the chrome */
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
  }
  .grp {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  /* the board: one big doorway */
  .mobo {
    position: relative;
    z-index: 0;
    flex: none;
    border-radius: 18px;
    outline: none;
  }
  .mobo::before {
    content: '';
    position: absolute;
    z-index: -1;
    inset: 6%;
    border-radius: 44px;
    background: radial-gradient(closest-side, color-mix(in srgb, var(--accent) 30%, transparent), transparent);
    filter: blur(56px);
  }
  .mobo:focus-visible {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 55%, transparent);
  }
  .board-svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  /* live pages bloom, as on every level */
  .board-svg :global(g.chip-grid) {
    filter: url(#io-glow-sm);
    cursor: pointer;
  }
  .board-svg :global(.socket) {
    cursor: pointer;
  }
  .board-svg :global(.socket:hover .socket-frame) {
    stroke: var(--accent);
    filter: drop-shadow(0 0 6px var(--accent-glow));
  }
  .board-svg :global(g.stick:hover .s-pcb) {
    stroke: var(--accent);
    filter: drop-shadow(0 0 5px var(--accent-glow));
  }
  .board-svg :global(.pcb:hover) {
    stroke: var(--accent);
    filter: drop-shadow(0 0 6px var(--accent-glow));
  }

  .ghosts {
    display: flex;
    gap: 8px;
    margin: 6px 0 2px;
  }
  .ghost {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 30px;
    padding: 0 12px;
    border-radius: 8px;
    border: 1.5px dashed var(--line2);
    color: var(--ink3);
    font: 500 10.5px var(--font-mono);
  }

  .graph {
    height: 58px;
    margin-top: 8px;
  }
</style>
