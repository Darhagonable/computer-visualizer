<script lang="ts">
  /**
   * Inspector cards for the pinned part (selection.svelte.ts): a core, a chiplet, the GPU, a
   * VRAM chip. Same vocabulary as the hover cards the primitives build — and the same honesty
   * labels: every reading says whether it is measured, estimated or modelled.
   *
   * Ramp colours appear in exactly one place here (the chiplet's mini grid), and its guide is
   * the stage's: where the Processor scene's header — or the Overview's processor panel —
   * already states the processor's reading guide (`guided`), the card adds none of its own;
   * elsewhere it carries a scale. Everything else is plain bars and numbers.
   *
   * The doors in these cards open part views, exactly as a click on the scene does.
   */
  import { app } from '../../mock/store.svelte';
  import { DOMAIN, MODE_META, TRUTH_NOTE, VRAM_CHIPS, VRAM_CHIP_MIB, type Overlay } from '../../mock/telemetry';
  import { norm, rampColor } from '../../scene/paint.svelte';
  import ScaleLegend from '../../scene/ScaleLegend.svelte';
  import Sparkline from '../../scene/Sparkline.svelte';
  import type { Level } from '../../levels/nav';
  import TruthTag from './TruthTag.svelte';
  import { sel, pin, unpin, overlayOf, truthOf, coreValue, ringOf, vramContents, vramOverhead } from './selection.svelte';

  let {
    onopen,
    guided = true,
  }: {
    /** Open a part's view. */
    onopen: (l: Level) => void;
    /** True when the stage already states the processor's reading guide. */
    guided?: boolean;
  } = $props();

  const part = $derived(sel.part);
  const cores = $derived(app.cpu?.cores ?? []);
  const tele = $derived(app.tele);
  const g = $derived(tele?.gpu ?? null);
  const num = (v: number) => Math.round(v).toLocaleString('en-US');
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

  const core = $derived(part?.kind === 'core' ? (cores[part.index] ?? null) : null);
  const ccdCores = $derived(part?.kind === 'ccd' ? cores.filter((c) => c.ccd === part.index) : []);
  const chip = $derived(part?.kind === 'vram' ? part.chip : -1);

  // ---- processor: the overlay the die paints by, and the pinned core's history -------------
  const ovCpu = $derived<Overlay>(overlayOf('cpu'));
  const domCpu = $derived(DOMAIN[ovCpu].cpu);
  const unitCpu = $derived(MODE_META[ovCpu].unit);
  const coreHist = $derived(core ? ringOf('core') : []);
  const textOf = (v: number) => (ovCpu === 'power' ? v.toFixed(1) : ovCpu === 'activity' ? `${Math.round(v)}%` : `${Math.round(v)}°`);
  const colourOf = (v: number) => rampColor(ovCpu, Math.max(0, Math.min(1, norm(ovCpu, 'cpu', v))));

  const ccd = $derived.by(() => {
    const cs = ccdCores;
    if (!cs.length) return null;
    return {
      load: avg(cs.map((c) => c.load)),
      hot: cs.reduce((a, c) => (c.temp > a.temp ? c : a), cs[0]),
      freq: avg(cs.map((c) => c.freq)),
      power: cs.reduce((s, c) => s + (tele?.corePower[c.index] ?? 0), 0),
    };
  });
  /** the chiplet's cores laid out as on the die: two CCX, each a 2 × 2 block */
  const ccx = $derived([0, 1].map((x) => ccdCores.filter((c) => ((c.index >> 2) & 1) === x)));

  // ---- GPU -----------------------------------------------------------------------------------
  const ovGpu = $derived<Overlay>(overlayOf('gpu'));
  /** the 60 s rings: the temperature sensor in Temperature mode, the 3D engine's load otherwise */
  const gpuHist = $derived(ovGpu === 'temperature' ? [...app.hist.gpuTemp] : [...app.hist.gpu]);
  const gpuDom = $derived(ovGpu === 'temperature' ? DOMAIN.temperature.gpu : [0, 100]);
  const gpuHistLabel = $derived(ovGpu === 'temperature' ? 'temperature' : '3D load');
  const gpuHistUnit = $derived(ovGpu === 'temperature' ? '°C' : '%');
  const ENGINES = [
    { k: '3d', label: '3D' },
    { k: 'copy', label: 'Copy' },
    { k: 'decode', label: 'Video decode' },
    { k: 'encode', label: 'Video encode' },
  ] as const;
  const chips = Array.from({ length: VRAM_CHIPS }, (_, c) => c);

  // ---- one VRAM chip: same per-chip numbers the card's hover card shows ----------------------
  const contents = $derived(chip >= 0 ? vramContents(chip) : []);
  const maxContent = $derived(contents.length ? Math.max(...contents.map((c) => c.mib)) : 1);
  const chipUsed = $derived(g && chip >= 0 ? g.chipUsage[chip] * VRAM_CHIP_MIB : 0);
  /** the card spreads the VRAM sensor by a fixed ±2 °C per chip (scene/GpuCard.svelte) */
  const chipTemp = $derived(g && chip >= 0 ? g.vramTemp + (((chip * 37) % 5) - 2) : 0);
  /** and splits a share of the board's power by usage (scene/GpuCard.svelte) */
  const chipPower = $derived(g && chip >= 0 ? ((14 + g.engines['3d'] * 0.06) * (0.5 + g.chipUsage[chip])) / VRAM_CHIPS : 0);
  const overheadEach = $derived(vramOverhead() / VRAM_CHIPS);
</script>

{#if core}
  <!-- a core -->
  <div class="big">Core {core.index + 1}</div>
  <div class="sub">CCD {core.ccd} · CCX {(core.index >> 2) & 1} · 2 threads</div>
  <div class="tiles">
    <div>
      <em>temperature</em>
      <b>{core.temp.toFixed(1)} °C</b>
      <span><TruthTag truth="measured" /></span>
    </div>
    <div>
      <em>load</em>
      <b>{Math.round(core.load)} %</b>
      <span><TruthTag truth="measured" /></span>
    </div>
    <div>
      <em>clock</em>
      <b>{core.freq.toFixed(2)} GHz</b>
    </div>
    <div>
      <em>power</em>
      <b>≈ {(tele?.corePower[core.index] ?? 0).toFixed(2)} W</b>
      <span><TruthTag truth="estimated" /></span>
    </div>
  </div>

  <h4>load per thread · measured</h4>
  {#each [0, 1] as t (t)}
    {@const v = tele?.threadLoad[2 * core.index + t] ?? 0}
    <div class="srow">
      <i class="dot"></i>
      <span>thread {t}</span>
      <div class="bar"><i style="width: {Math.max(0, Math.min(100, v))}%"></i></div>
      <b class="num">{v.toFixed(0)} %</b>
    </div>
  {/each}

  <h4>{MODE_META[ovCpu].label} · last {coreHist.length} ticks</h4>
  <div class="spark">
    <Sparkline values={coreHist} min={domCpu[0]} max={domCpu[1]} width={276} height={40} />
    <em>
      {domCpu[0]} – {domCpu[1]} {unitCpu} · the quantity the die is coloured by · <TruthTag truth={truthOf('cpu')} />
    </em>
  </div>
  <p class="note">{TRUTH_NOTE[ovCpu].cpu}</p>

  <div class="acts">
    <button onclick={() => onopen({ kind: 'core', core: core.index })}>open this core's view</button>
    <button onclick={() => onopen({ kind: 'ccd', ccd: core.ccd })}>open chiplet CCD {core.ccd}</button>
    <button onclick={unpin}>deselect</button>
  </div>
{:else if part?.kind === 'ccd' && ccd}
  <!-- a chiplet -->
  <div class="big">CCD {part.index}</div>
  <div class="sub">compute chiplet · 8 cores / 16 threads · 32 MB L3 per CCX</div>
  <div class="tiles">
    <div>
      <em>load</em>
      <b>{ccd.load.toFixed(0)} %</b>
      <span>8-core average · <TruthTag truth="measured" /></span>
    </div>
    <div>
      <em>hottest core</em>
      <b>Core {ccd.hot.index + 1}</b>
      <span>{ccd.hot.temp.toFixed(1)} °C · <TruthTag truth="measured" /></span>
    </div>
    <div>
      <em>clock</em>
      <b>{ccd.freq.toFixed(2)} GHz</b>
      <span>average</span>
    </div>
    <div>
      <em>power</em>
      <b>≈ {ccd.power.toFixed(1)} W</b>
      <span><TruthTag truth="estimated" /></span>
    </div>
  </div>

  <h4>cores · {MODE_META[ovCpu].label}</h4>
  <div class="ccxs">
    {#each ccx as cs, x (x)}
      <div class="ccx">
        <em>CCX {x}</em>
        <div class="mini">
          {#each cs as c (c.index)}
            {@const v = coreValue(c.index, ovCpu)}
            <button class="cell" style="background: {colourOf(v)}" onclick={() => onopen({ kind: 'core', core: c.index })} title="Core {c.index + 1} · {textOf(v)} — open this core">
              {textOf(v)}
            </button>
          {/each}
        </div>
      </div>
    {/each}
  </div>
  {#if !guided}
    <div class="legend"><ScaleLegend component="cpu" compact /></div>
  {/if}
  <p class="note">{TRUTH_NOTE[ovCpu].cpu}</p>
  <div class="acts">
    <button onclick={() => onopen({ kind: 'ccd', ccd: part.index })}>open this chiplet's view</button>
    <button onclick={unpin}>deselect</button>
  </div>
{:else if part?.kind === 'gpu' && g}
  <!-- the graphics card -->
  <div class="big break">{g.name}</div>
  <div class="sub">graphics card · PCIe 5.0 ×16 · {VRAM_CHIPS} × 2 GB GDDR6X</div>
  <div class="tiles">
    <div>
      <em>temperature</em>
      <b>{g.temp.toFixed(1)} °C</b>
      <span>hotspot {g.hotspot.toFixed(0)} °C · <TruthTag truth="measured" /></span>
    </div>
    <div>
      <em>VRAM temp</em>
      <b>{g.vramTemp.toFixed(0)} °C</b>
      <span><TruthTag truth="measured" /></span>
    </div>
    <div>
      <em>board power</em>
      <b>{g.power.toFixed(0)} W</b>
      <span>of {g.powerLimit} W · <TruthTag truth="measured" /></span>
    </div>
    <div>
      <em>clock</em>
      <b>{num(g.clockMhz)} MHz</b>
      <span>memory {num(g.memClockMhz)} MHz</span>
    </div>
    <div>
      <em>fan</em>
      <b>{Math.round(g.fanPct)} %</b>
      <span>{num(g.fanRpm)} rpm · 2 fans</span>
    </div>
    <div>
      <em>VRAM</em>
      <b>{(g.vramUsedMiB / 1024).toFixed(1)} GiB</b>
      <span>of {(g.vramTotalMiB / 1024).toFixed(0)} GiB in use</span>
    </div>
  </div>

  <h4>engines · <TruthTag truth="measured" /></h4>
  {#each ENGINES as e (e.k)}
    {@const v = g.engines[e.k]}
    <div class="srow">
      <i class="dot"></i>
      <span>{e.label}</span>
      <div class="bar"><i style="width: {Math.max(0, Math.min(100, v))}%"></i></div>
      <b class="num">{v.toFixed(0)} %</b>
    </div>
  {/each}

  <h4>VRAM chips · which holds what is modelled</h4>
  <div class="vstrip">
    {#each chips as c (c)}
      {@const u = Math.min(1, g.chipUsage[c])}
      <button class="vchip" style="--u: {u}" onclick={() => onopen({ kind: 'vram' })} title="VRAM chip {c + 1} · {(u * 100).toFixed(0)} % in use — open VRAM">
        <i></i><span>{c + 1}</span>
      </button>
    {/each}
  </div>
  <em class="cap">upper row 1–6, lower row 7–12 · fill = share of the chip in use (modelled)</em>

  <h4>{gpuHistLabel} · last 60 s</h4>
  <div class="spark">
    <Sparkline values={gpuHist} min={gpuDom[0]} max={gpuDom[1]} width={276} height={40} />
    <em>{gpuDom[0]} – {gpuDom[1]} {gpuHistUnit} · <TruthTag truth="measured" /></em>
  </div>

  <p class="note">
    <span class="lab"><TruthTag truth={truthOf('gpu')} /></span>what the colour of the die and the chips shows: {ovGpu}. {TRUTH_NOTE[ovGpu].gpu}
  </p>
  <p class="note">Which VRAM chip holds which process is modelled — no OS exposes VRAM placement.</p>
  <div class="acts">
    <button onclick={() => onopen({ kind: 'gdie' })}>open the GPU die</button>
    <button onclick={() => onopen({ kind: 'vram' })}>open VRAM</button>
    <button onclick={unpin}>deselect</button>
  </div>
{:else if chip >= 0 && g}
  <!-- one VRAM chip -->
  <div class="big">VRAM chip {chip + 1}</div>
  <div class="sub">2 GB GDDR6X · chip {chip + 1} of {VRAM_CHIPS} · {chip < 6 ? 'upper' : 'lower'} row</div>
  <div class="tiles">
    <div>
      <em>in use</em>
      <b>{num(chipUsed)} MiB</b>
      <span>of {num(VRAM_CHIP_MIB)} MiB · <TruthTag truth="modelled" /></span>
    </div>
    <div>
      <em>temperature</em>
      <b>≈ {chipTemp.toFixed(1)} °C</b>
      <span><TruthTag truth="modelled" /></span>
    </div>
    <div>
      <em>power</em>
      <b>≈ {chipPower.toFixed(2)} W</b>
      <span><TruthTag truth="estimated" /></span>
    </div>
    <div>
      <em>on the card</em>
      <b>{((g.vramUsedMiB / g.vramTotalMiB) * 100).toFixed(0)} %</b>
      <span>{num(g.vramUsedMiB)} of {num(g.vramTotalMiB)} MiB · <TruthTag truth="measured" /></span>
    </div>
  </div>

  <h4>what it holds · modelled</h4>
  {#each contents as c (c.name)}
    <div class="srow">
      <span class="n">{c.name}</span>
      <div class="bar"><i class="vram" style="width: {(c.mib / maxContent) * 100}%"></i></div>
      <b class="num">{num(c.mib)} MiB</b>
    </div>
  {/each}
  <div class="srow">
    <span class="n dim">driver &amp; desktop</span>
    <div class="bar"><i class="vram" style="width: {(overheadEach / maxContent) * 100}%"></i></div>
    <b class="num">{num(overheadEach)} MiB</b>
  </div>

  <p class="note">Which chip holds which process is modelled — no OS exposes VRAM placement. How much each process uses in total is measured.</p>
  <p class="note">
    <span class="lab"><TruthTag truth="modelled" /></span>VRAM temperature is one sensor reading ({g.vramTemp.toFixed(1)} °C, measured); the value per chip is spread from it.
    Board power is measured ({g.power.toFixed(0)} W); the split per chip is estimated.
  </p>
  <div class="acts">
    <button onclick={() => onopen({ kind: 'gdie' })}>open the GPU die</button>
    <button onclick={unpin}>deselect</button>
  </div>
{/if}

<style>
  .big {
    display: flex;
    align-items: center;
    gap: 10px;
    font: 300 21px / 1.2 var(--font-ui);
    letter-spacing: -0.01em;
  }
  .big.break {
    overflow-wrap: anywhere;
  }
  .sub {
    margin-top: -6px;
    color: var(--ink3);
    font-size: 11.5px;
  }
  .tiles {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .tiles > div {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--panel);
  }
  .tiles em {
    font: 600 9px var(--font-mono);
    font-style: normal;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--ink3);
  }
  .tiles b {
    font: 400 15px / 1.25 var(--font-ui);
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .tiles span {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    font-size: 10px;
    color: var(--ink3);
  }
  h4 {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 6px 0 2px;
    font: 600 9.5px var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: var(--ink3);
  }
  .srow {
    display: grid;
    grid-template-columns: 10px minmax(70px, 112px) minmax(30px, 1fr) 68px;
    align-items: center;
    gap: 8px;
    height: 22px;
  }
  .srow > .n {
    grid-column: 1 / 3;
    color: var(--ink2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
  }
  .srow > .n.dim {
    color: var(--ink3);
    font-style: italic;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    background: var(--panel2);
    box-shadow: inset 0 0 0 1px var(--line2);
  }
  .bar {
    height: 6px;
    border-radius: 3px;
    background: var(--panel);
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: var(--accent);
  }
  .bar i.vram {
    background: var(--c-pagefile);
  }
  .srow b {
    text-align: right;
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 500;
  }
  .spark em {
    display: flex;
    align-items: center;
    gap: 6px;
    font-style: normal;
    font-size: 10px;
    color: var(--ink3);
  }
  .cap {
    font-style: normal;
    font-size: 10px;
    color: var(--ink3);
  }
  .note {
    color: var(--ink3);
    font-size: 11.5px;
    line-height: 1.5;
  }
  .lab {
    margin-right: 6px;
  }
  /* the chiplet's cores, as on the die */
  .ccxs {
    display: flex;
    gap: 10px;
  }
  .ccx {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .ccx em {
    font: 600 9px var(--font-mono);
    font-style: normal;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--ink3);
  }
  .mini {
    display: grid;
    grid-template-columns: repeat(2, 56px);
    gap: 4px;
  }
  .cell {
    height: 44px;
    border: 0;
    border-radius: 6px;
    color: #fff;
    font: 700 11px var(--font-mono);
    cursor: pointer;
    /* the same outline the die draws under its numbers, so they read on any ramp colour */
    -webkit-text-stroke: 2.5px rgba(0, 0, 0, 0.6);
    paint-order: stroke fill;
    transition: transform 80ms ease;
  }
  .cell:hover,
  .cell:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 1px;
  }
  .legend {
    margin-top: 8px;
  }
  /* the card's 12 VRAM chips: two rows of six, fill = in use */
  .vstrip {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 5px;
  }
  .vchip {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--ink3);
    font: 600 9px var(--font-mono);
    cursor: pointer;
  }
  .vchip i {
    display: block;
    width: 100%;
    height: 16px;
    border-radius: 3px;
    background:
      linear-gradient(90deg, var(--c-pagefile) calc(var(--u) * 100%), transparent 0),
      var(--panel);
    box-shadow: inset 0 0 0 1px var(--line2);
    transition: box-shadow 80ms ease;
  }
  .vchip:hover i,
  .vchip:focus-visible i {
    box-shadow: inset 0 0 0 1px var(--ink3);
  }
  .vchip:focus-visible {
    outline: none;
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 4px;
  }
  .acts button {
    height: 28px;
    padding: 0 11px;
    border-radius: 7px;
    border: 1px solid var(--line2);
    background: var(--panel);
    color: var(--ink2);
    font-size: 12px;
  }
  .acts button:hover {
    color: var(--ink);
    border-color: var(--ink3);
  }
</style>
