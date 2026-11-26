<script lang="ts">
  /**
   * The device view — what makes this Task Manager different: the hardware itself, drawn.
   *   Memory → the DIMM board with the real mock pages (hover a block for details)
   *   CPU    → the package plus a per-core table; click a core or a chiplet to select it
   *   GPU    → the graphics card, cooler lifted off (GpuDevice.svelte)
   *   disk / Ethernet → an honest placeholder: the mock has no model for them.
   *
   * Every scene that takes an overlay (memory, CPU, GPU) carries its reading guide — the shared
   * ScaleLegend, laid out as a column — so no colour is shown without its truth label. Block
   * values come from `cellValue` and ramp ranges from `rangeFor` (through `norm`): the one model.
   */
  import { app, getMachine, selectDimm, setHighlight, stateName, useName } from '../../mock/store.svelte';
  import { CELLS_PER_CHIP, STATE_NAMES, USE_FAMILY_NAMES, type CoreLive } from '../../mock/model';
  import { MODE_META, TRUTH, TRUTH_LABEL, TRUTH_NOTE, cellValue, type Overlay } from '../../mock/telemetry';
  import { norm, rampColor } from '../../scene/paint.svelte';
  import CpuDie from '../../scene/CpuDie.svelte';
  import PanZoom from '../../scene/PanZoom.svelte';
  import RamBoard from '../../scene/RamBoard.svelte';
  import ScaleLegend from '../../scene/ScaleLegend.svelte';
  import { CPU_DIE, RAM_BOARD } from '../../scene/geometry';
  import Glyph from './Glyph.svelte';
  import GpuDevice from './GpuDevice.svelte';
  import { RESOURCES, type ResId } from './resources';

  interface Bar {
    label: string;
    pct: number;
    text: string;
  }
  let { res, bars = [], busy = false, gpuTemp = [] }: { res: ResId; bars?: Bar[]; busy?: boolean; gpuTemp?: number[] } = $props();

  const m = getMachine();
  const MODELED = 'The mock provider models memory, the CPU and the GPU — not this device';
  const TEXT: Record<ResId, { title: string; note: string; hint: string }> = {
    memory: {
      title: `DIMM board · ${m.dimms.length} modules · ${m.chips.length} DRAM dies`,
      note: 'placement: modeled',
      hint: 'Which chip a page lives in is modeled — the OS does not expose the memory controller’s interleave map',
    },
    cpu: {
      title: 'Processor package · 2 CCD + I/O die',
      note: 'layout: modeled',
      hint: 'A generic stand-in package: the real die layout arrives with the layout database',
    },
    disk: { title: 'Disk 0 (C:)', note: 'illustrative — no disk model in the mockup', hint: MODELED },
    ethernet: { title: 'Ethernet adapter', note: 'illustrative — no network model in the mockup', hint: MODELED },
    gpu: {
      title: 'GPU 0 · graphics card, cooler lifted off',
      note: 'placement: modeled',
      hint: 'Which VRAM chip holds which process is modeled — no OS exposes VRAM placement. How load and heat spread across the die is modeled too.',
    },
  };
  const meta = $derived(RESOURCES.find((r) => r.id === res) ?? RESOURCES[0]);
  const text = $derived(TEXT[res] ?? TEXT.memory);
  const st = $derived(app.stats);

  /** The overlay on show. "Pages" is memory-only: the CPU and GPU scenes paint temperature then. */
  const pages = $derived(app.mode === 'pages');
  const ov = $derived.by<Overlay>(() => (app.mode === 'pages' ? 'temperature' : app.mode));
  const unit = $derived(MODE_META[ov].unit);

  /** One line about whatever dims the board. */
  const hlText = $derived.by(() => {
    const h = app.highlight;
    if (!h) return '';
    if (h.kind === 'owner') return m.owners[h.id]?.name.split('\\').pop() ?? 'one owner';
    if (h.kind === 'family') return USE_FAMILY_NAMES[h.family];
    if (h.kind === 'state') return `${STATE_NAMES[h.state]} pages`;
    return useName(h.use);
  });

  // ---- Memory: what each module's bar shows -------------------------------------------
  /** Its share of live pages — or, in an overlay mode, the quantity the board is painted with,
   *  averaged over the module's blocks (`cellValue`: the one definition the grid paints by). */
  const mods = $derived.by(() => {
    const t = app.tele;
    return m.dimms.map((d) => {
      const used = st?.dimmUsed[d.index] ?? 0;
      if (pages || !t) return { pct: used * 100, text: `${Math.round(used * 100)}%`, color: '', note: 'Live blocks per module' };
      let sum = 0;
      for (const ch of d.chips) for (let c = 0; c < CELLS_PER_CHIP; c++) sum += cellValue(ov, t, ch.index, c);
      const v = sum / (d.chips.length * CELLS_PER_CHIP);
      // `norm` reads the range the ramp spans right now (`rangeFor`) — memory temperature follows
      // the module sensors, so a fixed range here would disagree with the board
      const k = Math.max(0, Math.min(1, norm(ov, 'memory', v)));
      // watts sit near the bottom of a 0–6 W range: two decimals tell the modules apart
      const num = ov === 'power' ? v.toFixed(2) : v < 10 ? v.toFixed(1) : String(Math.round(v));
      return {
        pct: k * 100,
        text: `${num} ${unit}`,
        color: rampColor(ov, k),
        note: `${MODE_META[ov].label} per module · ${TRUTH_LABEL[TRUTH[ov].memory]}`,
      };
    });
  });

  // ---- CPU ------------------------------------------------------------------------------
  type Sel = { kind: 'core' | 'ccd'; i: number } | null;
  let sel = $state<Sel>(null);
  let coresEl = $state<HTMLDivElement>();

  const cores = $derived(app.cpu?.cores ?? []);
  const ccd = (i: number) => cores.filter((c) => c.ccd === i);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const hot = $derived(cores.reduce<CoreLive | null>((a, c) => (!a || c.temp > a.temp ? c : a), null));
  const busiest = $derived(cores.reduce<CoreLive | null>((a, c) => (!a || c.load > a.load ? c : a), null));
  const power = $derived(app.cpu?.power ?? 0);
  /** How to read the package in the overlay on show. */
  const dieNote = $derived(
    ov === 'activity' ? 'core halves = load per thread' : ov === 'power' ? 'core fill = estimated watts · bar = load' : 'core fill = temperature · bar = load',
  );
  const dieAria = $derived.by(() => {
    const truth = TRUTH_LABEL[TRUTH[ov].cpu];
    if (ov === 'activity') return `Processor package. Each core is split into its two threads, coloured by load (${truth})`;
    const what = ov === 'power' ? 'estimated watts' : 'temperature';
    return `Processor package. Each core is coloured by ${what} (${truth}); the bar under it is its load`;
  });

  /** The selected core, with what the table does not show. */
  const picked = $derived.by(() => {
    if (sel?.kind !== 'core') return null;
    const i = sel.i;
    const c = cores[i];
    if (!c) return null;
    return {
      c,
      t0: app.tele?.threadLoad[2 * i] ?? 0,
      t1: app.tele?.threadLoad[2 * i + 1] ?? 0,
      w: app.tele?.corePower[i] ?? 0,
    };
  });
  const ccdPower = (d: number) => ccd(d).reduce((s, c) => s + (app.tele?.corePower[c.index] ?? 0), 0);

  /** Select / deselect a core or a chiplet — from the package or from its table. */
  function pick(next: NonNullable<Sel>, row?: HTMLElement | null) {
    sel = sel?.kind === next.kind && sel.i === next.i ? null : next;
    if (row && sel) row.scrollIntoView({ block: 'nearest' });
  }
  function pickCore(c: number, row?: HTMLElement | null) {
    pick({ kind: 'core', i: c }, row ?? coresEl?.querySelector<HTMLElement>(`tr[data-core="${c}"]`) ?? null);
  }

  // ---- line art for the placeholder devices (shared 320 × 171 frame) ----
  const NAND = [0, 1, 2];
  const PINS = Array.from({ length: 8 }, (_, i) => i);
</script>

<section class="dev" aria-label="Device view" style:--rc={meta.color}>
  <header class="bar">
    <span class="cap">Device view</span>
    <b>{text.title}</b>
    <span class="grow"></span>
    {#if hlText}
      <span class="hl">
        Highlighting <b>{hlText}</b>
        <button onclick={() => setHighlight(null)} title="Clear highlight (Esc)" aria-label="Clear highlight"><Glyph name="x" size={11} /></button>
      </span>
    {/if}
    <span class="note" title={text.hint}>{text.note}</span>
  </header>

  {#if res === 'memory'}
    <!-- the real thing: every block is a mock page -->
    <div class="body mem" class:overlay={!pages}>
      <div class="board">
        <PanZoom width={RAM_BOARD.width} height={RAM_BOARD.height}>
          <RamBoard />
        </PanZoom>
      </div>
      <aside class="guide">
        <!-- the reading guide: the page legend, or the overlay's scale with its truth label and the reason for it -->
        <div class="legendbox" title={pages ? undefined : TRUTH_NOTE[ov].memory}><ScaleLegend component="memory" compact /></div>
        {#if !pages}
          <p class="why" title={TRUTH_NOTE[ov].memory}>{TRUTH_NOTE[ov].memory}</p>
        {/if}
        <div class="modbox">
          <h4>Modules <span class="hint">click to outline</span></h4>
          <ul class="mods">
            {#each m.dimms as d (d.index)}
              {@const v = mods[d.index]}
              <li>
                <button
                  class="mod"
                  class:on={app.selectedDimm === d.index}
                  onclick={() => selectDimm(app.selectedDimm === d.index ? null : d.index)}
                  title="{m.slots[d.slot].label} · {d.manufacturer} {d.type} · {d.capacityGiB} GB · {v.note}"
                  aria-pressed={app.selectedDimm === d.index}
                >
                  <span>{m.slots[d.slot].label}</span>
                  <span class="mbar"><i style="width: {v.pct}%" style:background={v.color || undefined}></i></span>
                  <b>{v.text}</b>
                </button>
              </li>
            {/each}
          </ul>
        </div>
      </aside>
    </div>
  {:else if res === 'cpu'}
    <div class="body cpu">
      <div class="die">
        <svg viewBox="0 0 {CPU_DIE.width} {CPU_DIE.height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label={dieAria}>
          <CpuDie
            selectedCore={sel?.kind === 'core' ? sel.i : null}
            selectedCcd={sel?.kind === 'ccd' ? sel.i : null}
            onccd={(d) => pick({ kind: 'ccd', i: d })}
            oncore={(c) => pickCore(c)}
          />
        </svg>
        <!-- the reading guide; on a package the shared legend shows the temperature scale in Pages mode too -->
        <div class="ramp" title={TRUTH_NOTE[ov].cpu}>
          <ScaleLegend component="cpu" note={dieNote} />
        </div>
      </div>
      <div class="cores" bind:this={coresEl}>
        <div class="tables">
          {#each [0, 1] as i (i)}
            {@const cs = ccd(i)}
            <table class:on={sel?.kind === 'ccd' && sel.i === i}>
              <caption>CCD{i}<span>8C / 16T</span></caption>
              <thead>
                <tr><th>Core</th><th>Load</th><th>Temp</th><th>Clock</th></tr>
              </thead>
              <tbody>
                {#each cs as c (c.index)}
                  <!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_click_events_have_key_events a11y_no_noninteractive_tabindex -->
                  <tr
                    class:hot={c.index === hot?.index}
                    class:sel={sel?.kind === 'core' && sel.i === c.index}
                    data-core={c.index}
                    tabindex="0"
                    aria-selected={sel?.kind === 'core' && sel.i === c.index}
                    title="Core {c.index + 1} · click to select"
                    onclick={(e) => pickCore(c.index, e.currentTarget as HTMLElement)}
                    onkeydown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        pickCore(c.index, e.currentTarget as HTMLElement);
                      }
                    }}
                  >
                    <td>{String(c.index + 1).padStart(2, '0')}</td>
                    <td><span class="load"><span class="sbar"><i style="width: {c.load}%"></i></span><span>{Math.round(c.load)}%</span></span></td>
                    <td class="temp">{Math.round(c.temp)} °C</td>
                    <td>{c.freq.toFixed(2)}</td>
                  </tr>
                {/each}
                <tr class="sum">
                  <td>Avg</td>
                  <td>{Math.round(avg(cs.map((c) => c.load)))}%</td>
                  <td>{Math.round(Math.max(0, ...cs.map((c) => c.temp)))} °C</td>
                  <td>{avg(cs.map((c) => c.freq)).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          {/each}
        </div>
        <!-- the footer follows the selection: a core's threads and estimated power, or the package summary -->
        <p class="cfoot">
          {#if picked}
            Core <b>{picked.c.index + 1}</b> · CCD <b>{picked.c.ccd}</b>
            <span class="sep"></span>
            Threads <b>{Math.round(picked.t0)}%</b> / <b>{Math.round(picked.t1)}%</b>
            <span class="sep"></span>
            <span class="grp">Power <b>≈ {picked.w.toFixed(1)} W</b><em>estimated</em></span>
            <button class="clear" onclick={() => (sel = null)} title="Deselect (click the core again to deselect)" aria-label="Deselect core {picked.c.index + 1}">
              <Glyph name="x" size={11} />
            </button>
          {:else if sel?.kind === 'ccd'}
            CCD <b>{sel.i}</b> · 8 cores
            <span class="sep"></span>
            Load <b>{Math.round(avg(ccd(sel.i).map((c) => c.load)))}%</b>
            <span class="sep"></span>
            <span class="grp">Power <b>≈ {ccdPower(sel.i).toFixed(0)} W</b><em>estimated</em></span>
            <button class="clear" onclick={() => (sel = null)} title="Deselect" aria-label="Deselect CCD {sel.i}">
              <Glyph name="x" size={11} />
            </button>
          {:else}
            Package <b>{Math.round(power)} W</b>
            <span class="sep"></span>
            Hottest <b>Core {(hot?.index ?? 0) + 1}</b> at <b>{hot ? hot.temp.toFixed(1) : '–'} °C</b>
            <span class="sep"></span>
            Busiest <b>Core {(busiest?.index ?? 0) + 1}</b>
          {/if}
        </p>
      </div>
    </div>
  {:else if res === 'gpu'}
    <GpuDevice tempSeries={gpuTemp} />
  {:else if res === 'disk'}
    <div class="body mockdev">
      <div class="art">
        <svg viewBox="0 0 320 171" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Illustration of a solid state drive">
          <rect x="21" y="19.5" width="256" height="132" rx="8" class="shell" />
          <rect x="33" y="31.5" width="232" height="34" rx="4" class="part" />
          <text x="43" y="46.5" class="t1">DISK 0 · C:</text>
          <text x="43" y="58.5" class="t2">solid state drive · fictional module</text>
          {#each NAND as i (i)}
            <rect x={33 + i * 58} y="75.5" width="50" height="30" rx="3" class="chip" />
            <rect x={33 + i * 58} y="111.5" width="50" height="30" rx="3" class="chip" />
            <text x={58 + i * 58} y="93.5" class="t3" text-anchor="middle">NAND</text>
            <text x={58 + i * 58} y="129.5" class="t3" text-anchor="middle">NAND</text>
          {/each}
          <rect x="209" y="75.5" width="56" height="66" rx="4" class="chip ctrl" />
          <text x="237" y="111.5" class="t3" text-anchor="middle">CTRL</text>
          <circle cx="263" cy="48.5" r="4" class="led" class:on={busy} />
          <path d="M277 75.5h22v40h-22zM277 123.5h22v16h-22z" class="conn" />
        </svg>
      </div>
      <div class="side">
        <h4>Activity <span class="tm-tag mock">mock sensor</span></h4>
        {#each bars as b (b.label)}
          <div class="brow"><span>{b.label}</span><span class="track"><i style="width: {b.pct}%"></i></span><b>{b.text}</b></div>
        {/each}
        <p class="note">The mock provider models memory, the CPU and the GPU — not disks. This drive, and every number beside it, is generated locally to show how a disk would sit in this layout.</p>
      </div>
    </div>
  {:else if res === 'ethernet'}
    <div class="body mockdev">
      <div class="art">
        <svg viewBox="0 0 320 171" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Illustration of an Ethernet port">
          <rect x="14" y="26" width="292" height="120" rx="6" class="shell" />
          <text x="30" y="60" class="t1">ETHERNET</text>
          <text x="30" y="74" class="t2">RJ45 port</text>
          <path d="M110 58h22V42h56v16h22v74H110z" class="part" />
          <path d="M120 68h80v56H120z" class="cavity" />
          {#each PINS as i (i)}
            <rect x={128.4 + i * 8.6} y="76" width="2.8" height="40" rx="1.2" class="pin" />
          {/each}
          <circle cx="236" cy="72" r="4.5" class="led on" />
          <text x="246" y="76" class="t2">link</text>
          <circle cx="236" cy="96" r="4.5" class="led" class:on={busy} />
          <text x="246" y="100" class="t2">activity</text>
        </svg>
      </div>
      <div class="side">
        <h4>Activity <span class="tm-tag mock">mock sensor</span></h4>
        {#each bars as b (b.label)}
          <div class="brow"><span>{b.label}</span><span class="track"><i style="width: {b.pct}%"></i></span><b>{b.text}</b></div>
        {/each}
        <p class="note">The mock provider models memory, the CPU and the GPU — not networks. This adapter, and every number beside it, is generated locally to show how a network device would sit in this layout.</p>
      </div>
    </div>
  {/if}
</section>

<style>
  /* One inset card per resource; its contents lay themselves out from its own width and height. */
  .dev {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel2);
    container-type: size;
  }
  .bar {
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    height: 38px;
    padding: 0 12px 0 14px;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
    overflow: hidden;
  }
  .bar .cap {
    color: var(--ink3);
    font-size: 11px;
  }
  .bar b {
    font-size: 12.5px;
    font-weight: 600;
  }
  .grow {
    flex: 1;
  }
  .note {
    color: var(--ink3);
    font-size: 11.5px;
  }
  .hl {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    height: 24px;
    padding: 0 4px 0 9px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--accent) 13%, transparent);
    color: var(--accent);
    font-size: 11.5px;
  }
  .hl b {
    margin: 0 2px 0 3px;
    font-size: 11.5px;
  }
  .hl button {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: inherit;
  }
  .hl button:hover {
    background: color-mix(in srgb, var(--accent) 24%, transparent);
  }
  .body {
    flex: 1;
    min-height: 0;
  }
  h4 {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin: 0 0 4px;
    font-size: 11px;
    font-weight: 600;
    color: var(--ink3);
  }
  h4 .hint {
    font-weight: 400;
  }

  /* ---- Memory: board + a reading guide ---- */
  .mem {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 196px;
  }
  .board {
    min-width: 0;
    min-height: 0;
    background: radial-gradient(circle, var(--line2) 1px, transparent 1.3px) 0 0 / 24px 24px;
  }
  .guide {
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
    padding: 8px 12px 10px 10px;
    border-left: 1px solid var(--line);
  }
  .modbox {
    margin-top: 12px;
  }
  .mods {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 1px;
  }
  .mod {
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr) 48px;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 24px;
    padding: 0 6px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--ink2);
    font-size: 11.5px;
    text-align: left;
    white-space: nowrap;
    transition: background 80ms ease, box-shadow 80ms ease;
  }
  .mods .mod:hover {
    background: var(--panel);
  }
  .mods .mod.on {
    background: var(--panel);
    color: var(--ink);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .mod b {
    text-align: right;
    color: var(--ink);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .mbar {
    display: block;
    height: 5px;
    border-radius: 3px;
    overflow: hidden;
    background: var(--line);
  }
  .mbar i {
    display: block;
    height: 100%;
    background: var(--rc);
  }
  /* Why the overlay on show is only estimated / modelled (the shared one-line reason). On short
     cards it gives way to the module list; it stays on the scale's tooltip. */
  .why {
    margin: 8px 0 0;
    font-size: 11px;
    line-height: 1.45;
    color: var(--ink3);
  }
  @container (max-height: 399px) {
    .why {
      display: none;
    }
  }

  /* Beside the board — i.e. unless the card is narrow *and* tall — the guide reads as a column. */
  @container (min-width: 721px) or (max-height: 429px) {
    .legendbox :global(.legend) {
      flex-direction: column;
      align-items: stretch;
      gap: 2px;
    }
    .legendbox :global(.lg-row) {
      flex-direction: column;
      flex-wrap: nowrap;
      align-items: stretch;
      gap: 1px;
    }
    .legendbox :global(.lg-h) {
      margin: 5px 0 2px;
      color: var(--ink3);
      font: 600 11px var(--font-ui);
      letter-spacing: 0;
      text-transform: none;
    }
    .legendbox :global(.lg-h:first-child) {
      margin-top: 0;
    }
    .legendbox :global(.pill) {
      width: 100%;
      height: 18px;
      padding: 0 8px 0 6px;
      font-size: 10.5px;
      white-space: nowrap;
    }
    .legendbox :global(.pill b) {
      margin-left: auto;
      font-size: 10.5px;
    }
    /* An overlay's scale needs no more than its own three short lines. */
    .legendbox :global(.scale) {
      min-width: 0;
      max-width: none;
    }
    .legendbox :global(.scale .meta) {
      flex-wrap: nowrap;
    }
  }
  /* The page legend as a column is ~230 px and the module list ~120 more: a card under 420 px
     cannot hold both, so the list gives way. (An overlay's scale is three short lines.) */
  @container (max-height: 419px) {
    .mem:not(.overlay) .modbox {
      display: none;
    }
  }
  @container (max-height: 399px) {
    .mem.overlay .modbox {
      margin-top: 10px;
    }
  }
  /* An overlay's scale is three lines: the module list stays — compact — even on a short card. */
  @container (max-height: 279px) {
    .mem.overlay .modbox {
      margin-top: 5px;
    }
    .mem.overlay .mod {
      height: 16px;
    }
    .mem.overlay h4 {
      margin-bottom: 0;
      line-height: 1.3;
    }
  }
  /* Very short card: the legend drops its two headings and packs tighter. */
  @container (max-height: 269px) {
    .legendbox :global(.lg-h) {
      display: none;
    }
    .legendbox :global(.lg-row + .lg-row) {
      margin-top: 6px;
    }
    .legendbox :global(.pill) {
      height: 17px;
    }
  }
  /* Tiny card (600 px-tall window): states and families side by side in a wider guide. An
     overlay needs no wide guide — its scale is three lines — so the board keeps the room. */
  @container (max-height: 199px) {
    .mem:not(.overlay) {
      grid-template-columns: minmax(0, 1fr) minmax(300px, 46%);
    }
    .mem.overlay .guide {
      padding: 6px 8px 4px;
    }
    .legendbox :global(.legend) {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2px 12px;
    }
    /* The columns are too narrow for name + share; the share is on the tooltips. */
    .legendbox :global(.pill b) {
      display: none;
    }
    .legendbox :global(.pill) {
      height: 16px;
    }
    .guide {
      padding-top: 4px;
      padding-bottom: 4px;
    }
  }
  /* An overlay's guide needs 46 px for the scale and ~90 more for the module list. A card this short
     (the pane is expanded on a 600 px-tall window: ~150 px) holds the scale, nothing else; the default
     collapsed layout at the same window size (~193 px) keeps both. */
  @container (max-height: 184px) {
    .mem.overlay .modbox {
      display: none;
    }
  }
  /* Narrow and short (but not tiny — that gets the wide two-column guide above): slimmer side guide,
     and a page legend packed tightly enough to fit the card's full height. */
  @container (max-width: 720px) and (min-height: 200px) and (max-height: 429px) {
    .mem {
      grid-template-columns: minmax(0, 1fr) 168px;
    }
    .guide {
      padding: 8px 8px 6px;
    }
    .legendbox :global(.legend) {
      gap: 1px;
    }
    .legendbox :global(.pill) {
      height: 17px;
    }
    .legendbox :global(.lg-h) {
      margin-top: 3px;
    }
    .mod {
      grid-template-columns: 60px minmax(0, 1fr) 46px;
    }
  }
  /* Narrow and tall enough: the guide drops under the board and flows sideways. */
  @container (max-width: 720px) and (min-height: 430px) {
    .mem {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(0, 1fr) auto;
    }
    .guide {
      grid-row: 2;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 2px 20px;
      align-items: start;
      overflow: visible;
      padding: 8px 12px 8px 10px;
      border-left: 0;
      border-top: 1px solid var(--line);
    }
    .modbox {
      margin-top: 0;
    }
    .mods {
      grid-template-columns: 1fr 1fr;
      column-gap: 10px;
    }
    h4 .hint {
      display: none;
    }
  }

  /* ---- CPU: package + reading guide, and the per-core tables ---- */
  .cpu {
    display: grid;
    grid-template-columns: minmax(280px, 1fr) minmax(0, 1fr);
  }
  .die {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    padding: 10px 6px 6px 12px;
  }
  .die svg {
    flex: 1;
    min-height: 0;
    width: 100%;
  }
  .ramp {
    flex: none;
    min-width: 0;
    padding: 6px 8px 0 2px;
  }
  .ramp :global(.scale) {
    min-width: 0;
    max-width: none;
  }
  .ramp :global(.scale .meta) {
    flex-wrap: nowrap;
  }
  .cores {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    padding: 10px 14px 10px 12px;
    border-left: 1px solid var(--line);
  }
  /* The tables get their own box, the footer sits outside it: a footer that wraps to a second line
     takes height from this box (which scrolls if it must) instead of overprinting the last rows. */
  .tables {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px 18px;
    overflow-y: auto;
    scrollbar-width: thin;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    border-radius: 6px;
    font-size: 12px;
  }
  /* A selected chiplet: its table is framed and tinted. (An outline, not an inset shadow —
     collapsed tables do not take one.) */
  table.on {
    outline: 1px solid color-mix(in srgb, var(--accent) 70%, transparent);
    outline-offset: 3px;
  }
  table.on td {
    background: color-mix(in srgb, var(--accent) 5%, transparent);
  }
  table.on tr.hot td {
    background: color-mix(in srgb, var(--warn) 10%, transparent);
  }
  table.on tr.sel td {
    background: color-mix(in srgb, var(--accent) 13%, transparent);
  }
  caption {
    padding: 2px 8px 8px;
    color: var(--ink);
    font-size: 12.5px;
    font-weight: 600;
    text-align: left;
    white-space: nowrap;
    transition: color 100ms ease;
  }
  table.on caption {
    color: var(--accent);
  }
  caption span {
    margin-left: 8px;
    color: var(--ink3);
    font-weight: 400;
    font-size: 11px;
  }
  th {
    padding: 4px 8px;
    border-bottom: 1px solid var(--line2);
    color: var(--ink3);
    font-size: 11px;
    font-weight: 500;
    text-align: right;
    white-space: nowrap;
  }
  td {
    height: 25px;
    padding: 0 8px;
    border-bottom: 1px solid var(--line);
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
  }
  th:first-child,
  td:first-child {
    padding-left: 6px;
    text-align: left;
  }
  td:first-child {
    color: var(--ink3);
    font-family: var(--font-mono);
    font-size: 10.5px;
  }
  .load {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .sbar {
    width: 40px;
    height: 5px;
    border-radius: 3px;
    overflow: hidden;
    background: var(--line);
  }
  .sbar i {
    display: block;
    height: 100%;
    background: var(--rc);
  }
  tbody tr {
    outline: none;
    transition: background 80ms ease;
  }
  tbody tr:hover td {
    background: color-mix(in srgb, var(--ink) 5%, transparent);
  }
  tr.hot td {
    background: color-mix(in srgb, var(--warn) 10%, transparent);
  }
  tr.hot .temp {
    color: var(--warn);
    font-weight: 600;
  }
  /* A selected core: the accent, over the "hottest" tint. */
  tr.sel td,
  tr.sel:hover td {
    background: color-mix(in srgb, var(--accent) 13%, transparent);
  }
  tr.sel td:first-child {
    box-shadow: inset 3px 0 0 var(--accent);
  }
  tr.sel .temp {
    color: var(--ink);
  }
  tr:focus-visible td {
    background: color-mix(in srgb, var(--accent) 9%, transparent);
  }
  tr.sum td {
    border-bottom: 0;
    color: var(--ink2);
    font-weight: 600;
  }
  .cfoot {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    margin-top: 5px;
    align-items: center;
    gap: 2px 8px;
    min-width: 0;
    color: var(--ink3);
    font-size: 11.5px;
    white-space: nowrap;
  }
  .cfoot b {
    color: var(--ink2);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  /* "estimated" never wraps away from the watts it qualifies */
  .grp {
    display: inline-flex;
    align-items: center;
    white-space: nowrap;
  }
  /* A selected core's power is a split of the measured package figure: the word gets the same
     badge the reading guides use, so "estimated" always looks the same. */
  .cfoot em {
    margin-left: 4px;
    padding: 0 5px;
    border: 1px solid var(--warn);
    border-radius: 7px;
    color: var(--warn);
    font: 600 9px var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    line-height: 14px;
  }
  .cfoot .clear {
    display: grid;
    place-items: center;
    flex: none;
    width: 18px;
    height: 18px;
    margin-left: auto;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--ink3);
  }
  .cfoot .clear:hover {
    background: color-mix(in srgb, var(--ink) 8%, transparent);
    color: var(--ink);
  }
  .sep {
    width: 1px;
    height: 12px;
    background: var(--line2);
  }
  /* Short card: every core still gets a row; the averages and the footer give way. */
  @container (max-height: 310px) {
    td {
      height: 21px;
    }
    th {
      padding-block: 2px;
    }
    .cores {
      padding-top: 4px;
      padding-bottom: 4px;
    }
    caption {
      padding-top: 0;
      padding-bottom: 5px;
    }
    .sum,
    .cfoot {
      display: none;
    }
    .die {
      padding-top: 6px;
    }
    .ramp {
      padding-top: 2px;
    }
  }
  /* A pane narrower than this cannot hold both tables side by side *with* the load bars — the
     Clock column of the second one ended up cut off at 1280 × 720. The percentages stay. */
  @container (max-width: 960px) {
    .sbar {
      display: none;
    }
    .cores {
      column-gap: 12px;
    }
    th,
    td {
      padding-left: 6px;
      padding-right: 6px;
    }
  }
  @container (max-width: 720px) {
    .cpu {
      grid-template-columns: minmax(200px, 0.7fr) minmax(0, 1.3fr);
      gap: 0;
    }
    /* Compact rows whatever the card's height: a footer that wraps to two lines (a selected core)
       must not push the averages out of the tables' box. */
    td {
      height: 21px;
    }
    .cores {
      padding-top: 8px;
      padding-bottom: 8px;
    }
  }

  /* ---- disk / Ethernet: illustrative line art, honestly labelled ---- */
  .mockdev {
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) minmax(260px, 1fr);
    gap: 28px;
    padding: 16px 22px 16px 16px;
    overflow-y: auto;
  }
  /* A white stage for the drawing — the drawing itself is centred inside it. */
  .art {
    display: grid;
    place-items: center;
    min-width: 0;
    min-height: 0;
    border: 1px dashed var(--line2);
    border-radius: 8px;
    background: var(--panel);
  }
  .art svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  .side {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 14px;
    min-width: 0;
    padding-block: 8px;
  }
  .side h4 {
    justify-content: flex-start;
  }
  .brow {
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr) 92px;
    align-items: center;
    gap: 12px;
    color: var(--ink2);
    font-size: 12.5px;
    white-space: nowrap;
  }
  .track {
    display: block;
    height: 10px;
    border-radius: 5px;
    overflow: hidden;
    background: var(--line);
  }
  .track i {
    display: block;
    height: 100%;
    border-radius: 5px;
    background: var(--rc);
    transition: width 400ms ease;
  }
  .brow b {
    text-align: right;
    color: var(--ink);
    font-size: 15px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .side .note {
    font-size: 11.5px;
    line-height: 1.5;
    white-space: normal;
  }
  .shell {
    fill: color-mix(in srgb, var(--rc) 5%, var(--panel));
    stroke: var(--line2);
    stroke-width: 1.5;
  }
  .part {
    fill: var(--panel2);
    stroke: var(--line2);
    stroke-width: 1;
  }
  .chip {
    fill: var(--dimm-chip);
    stroke: var(--dimm-chip-line);
    stroke-width: 1;
  }
  .ctrl {
    fill: color-mix(in srgb, var(--rc) 24%, var(--dimm-chip));
  }
  .conn {
    fill: var(--panel2);
    stroke: var(--line2);
    stroke-width: 1.2;
  }
  .cavity {
    fill: var(--dimm-chip);
    stroke: var(--dimm-chip-line);
    stroke-width: 1;
  }
  .led {
    fill: var(--c-free);
    stroke: var(--line2);
    stroke-width: 1;
  }
  .led.on {
    fill: var(--rc);
    stroke: color-mix(in srgb, var(--rc) 70%, var(--ink));
  }
  .pin {
    fill: var(--dimm-gold);
  }
  .t1 {
    fill: var(--ink2);
    font: 600 10px var(--font-mono);
    letter-spacing: 0.12em;
  }
  .t2 {
    fill: var(--ink3);
    font: 400 9.5px var(--font-ui);
  }
  .t3 {
    fill: var(--ink3);
    font: 500 7.5px var(--font-mono);
    letter-spacing: 0.14em;
  }
  @container (max-width: 680px) {
    .mockdev {
      grid-template-columns: minmax(0, 1.1fr) minmax(196px, 1fr);
      gap: 16px;
      padding: 12px 14px 12px 12px;
    }
    .brow {
      grid-template-columns: 62px minmax(0, 1fr) 80px;
      gap: 8px;
      font-size: 12px;
    }
    .brow b {
      font-size: 13px;
    }
  }
  /* Short card: the toolbar already says "illustrative", so the long note gives way. */
  @container (max-height: 330px) {
    .side {
      gap: 8px;
    }
    .side .note {
      display: none;
    }
  }
  @container (max-width: 500px) {
    .mockdev {
      grid-template-columns: 1fr;
    }
  }
</style>
