<script lang="ts">
  /**
   * The device view — what makes this Task Manager different: the hardware itself, drawn.
   *   Memory → the DIMM board with the real mock pages (hover a block for details)
   *   CPU    → the package plus a per-core table
   *   disk / Ethernet / GPU → an honest placeholder: the mock has no model for them.
   */
  import { app, getMachine, selectDimm, setHighlight, stateName, useName } from '../../mock/store.svelte';
  import { STATE_NAMES, USE_FAMILY_NAMES, type CoreLive } from '../../mock/model';
  import CpuDie from '../../scene/CpuDie.svelte';
  import Legend from '../../scene/Legend.svelte';
  import PanZoom from '../../scene/PanZoom.svelte';
  import RamBoard from '../../scene/RamBoard.svelte';
  import { CPU_DIE, RAM_BOARD } from '../../scene/geometry';
  import Glyph from './Glyph.svelte';
  import { RESOURCES, type ResId } from './resources';

  interface Bar {
    label: string;
    pct: number;
    text: string;
  }
  let { res, bars = [], busy = false }: { res: ResId; bars?: Bar[]; busy?: boolean } = $props();

  const m = getMachine();
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
    disk: { title: 'Disk 0 (C:)', note: 'illustrative — no disk model in the mockup', hint: 'The mock provider models memory and CPU only' },
    ethernet: { title: 'Ethernet adapter', note: 'illustrative — no network model in the mockup', hint: 'The mock provider models memory and CPU only' },
    gpu: { title: 'GPU 0', note: 'illustrative — no GPU model in the mockup', hint: 'The mock provider models memory and CPU only' },
  };
  const meta = $derived(RESOURCES.find((r) => r.id === res) ?? RESOURCES[0]);
  const text = $derived(TEXT[res] ?? TEXT.memory);
  const st = $derived(app.stats);

  /** One line about whatever dims the board. */
  const hlText = $derived.by(() => {
    const h = app.highlight;
    if (!h) return '';
    if (h.kind === 'owner') return m.owners[h.id]?.name.split('\\').pop() ?? 'one owner';
    if (h.kind === 'family') return USE_FAMILY_NAMES[h.family];
    if (h.kind === 'state') return `${STATE_NAMES[h.state]} pages`;
    return useName(h.use);
  });

  // ---- CPU ----
  const cores = $derived(app.cpu?.cores ?? []);
  const ccd = (i: number) => cores.filter((c) => c.ccd === i);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const hot = $derived(cores.reduce<CoreLive | null>((a, c) => (!a || c.temp > a.temp ? c : a), null));
  const busiest = $derived(cores.reduce<CoreLive | null>((a, c) => (!a || c.load > a.load ? c : a), null));
  const power = $derived(app.cpu?.power ?? 0);

  // ---- line art for the placeholder devices (shared 320 × 171 frame) ----
  const NAND = [0, 1, 2];
  const PINS = Array.from({ length: 8 }, (_, i) => i);
  const FINS = Array.from({ length: 10 }, (_, i) => i);
  const FINGERS = Array.from({ length: 42 }, (_, i) => i);
  const FAN = { x: 109, y: 83.5 };
  /** Nine curved fan blades. */
  const BLADES = Array.from({ length: 9 }, (_, i) => {
    const a = (i * 40 * Math.PI) / 180;
    const pt = (r: number, d: number) => `${(FAN.x + r * Math.cos(a + d)).toFixed(1)} ${(FAN.y + r * Math.sin(a + d)).toFixed(1)}`;
    return `M${pt(12, 0)} Q${pt(28, 0.5)} ${pt(37, 0.62)}`;
  });
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
    <div class="body mem">
      <div class="board">
        <PanZoom width={RAM_BOARD.width} height={RAM_BOARD.height}>
          <RamBoard />
        </PanZoom>
      </div>
      <aside class="guide">
        <div class="legendbox"><Legend compact /></div>
        <div class="modbox">
          <h4>Modules <span class="hint">click to outline</span></h4>
          <ul class="mods">
            {#each m.dimms as d (d.index)}
              <li>
                <button
                  class="mod"
                  class:on={app.selectedDimm === d.index}
                  onclick={() => selectDimm(app.selectedDimm === d.index ? null : d.index)}
                  title="{m.slots[d.slot].label} · {d.manufacturer} {d.type} · {d.capacityGiB} GB · live blocks per module"
                  aria-pressed={app.selectedDimm === d.index}
                >
                  <span>{m.slots[d.slot].label}</span>
                  <span class="mbar"><i style="width: {(st?.dimmUsed[d.index] ?? 0) * 100}%"></i></span>
                  <b>{Math.round((st?.dimmUsed[d.index] ?? 0) * 100)}%</b>
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
        <svg viewBox="0 0 {CPU_DIE.width} {CPU_DIE.height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Processor package, core fill shows temperature">
          <CpuDie />
        </svg>
        <div class="ramp">
          <span>35 °C</span><i></i><span>87 °C</span>
          <em>core fill = temperature · bar = load</em>
        </div>
      </div>
      <div class="cores">
        {#each [0, 1] as i (i)}
          {@const cs = ccd(i)}
          <table>
            <caption>CCD{i}<span>8C / 16T</span></caption>
            <thead>
              <tr><th>Core</th><th>Load</th><th>Temp</th><th>Clock</th></tr>
            </thead>
            <tbody>
              {#each cs as c (c.index)}
                <tr class:hot={c.index === hot?.index}>
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
        <p class="cfoot">
          Package <b>{Math.round(power)} W</b>
          <span class="sep"></span>
          Hottest <b>Core {(hot?.index ?? 0) + 1}</b> at <b>{hot ? hot.temp.toFixed(1) : '–'} °C</b>
          <span class="sep"></span>
          Busiest <b>Core {(busiest?.index ?? 0) + 1}</b>
        </p>
      </div>
    </div>
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
        <p class="note">The mock provider models memory and CPU only. This drive, and every number beside it, is generated locally to show how a disk would sit in this layout.</p>
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
        <p class="note">The mock provider models memory and CPU only. This adapter, and every number beside it, is generated locally to show how a network device would sit in this layout.</p>
      </div>
    </div>
  {:else}
    <div class="body mockdev">
      <div class="art">
        <svg viewBox="0 0 320 171" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Illustration of a graphics card">
          <rect x="31" y="31.5" width="272" height="104" rx="6" class="shell" />
          <path d="M17 24h14v122H17z" class="bracket" />
          <path d="M24 44v22M24 78v22M24 112v22" class="vent" />
          {#each FINS as i (i)}<path d={`M${175 + i * 12} 49.5v68`} class="fin" />{/each}
          <circle cx={FAN.x} cy={FAN.y} r="40" class="ring" />
          {#each BLADES as d (d)}<path {d} class="blade" />{/each}
          <circle cx={FAN.x} cy={FAN.y} r="9" class="hub" class:on={busy} />
          <rect x="243" y="19.5" width="40" height="12" rx="2" class="conn" />
          {#each FINGERS as i (i)}
            {#if i !== 22}<rect x={39 + i * 6.3} y="135.5" width="3.4" height="16" class="gold" />{/if}
          {/each}
          <text x="31" y="22" class="t2">GPU 0 · fictional card</text>
        </svg>
      </div>
      <div class="side">
        <h4>Activity <span class="tm-tag mock">mock sensor</span></h4>
        {#each bars as b (b.label)}
          <div class="brow"><span>{b.label}</span><span class="track"><i style="width: {b.pct}%"></i></span><b>{b.text}</b></div>
        {/each}
        <p class="note">The mock provider models memory and CPU only. This card, and every number beside it, is generated locally to show how a GPU would sit in this layout.</p>
      </div>
    </div>
  {/if}
</section>

<style>
  /* One inset card per resource; its contents lay themselves out from its own width. */
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
    grid-template-columns: 64px minmax(0, 1fr) 32px;
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

  /* Beside the board — i.e. unless the card is narrow *and* tall — the legend reads as a column. */
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
  }
  /* Short cards (720p class): the legend fits beside the board, the module list does not. */
  @container (max-height: 399px) {
    .modbox {
      display: none;
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
  /* Tiny card (600 px-tall window): states and families side by side in a wider guide. */
  @container (max-height: 199px) {
    .mem {
      grid-template-columns: minmax(0, 1fr) minmax(300px, 46%);
    }
    .legendbox :global(.legend) {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 12px;
    }
    /* The columns are too narrow for name + share; the share is on the tooltips. */
    .legendbox :global(.pill b) {
      display: none;
    }
  }
  /* Narrow and short (but not tiny — that gets the wide two-column guide above): slimmer side guide. */
  @container (max-width: 720px) and (min-height: 200px) and (max-height: 429px) {
    .mem {
      grid-template-columns: minmax(0, 1fr) 168px;
    }
    .guide {
      padding: 8px 8px 8px 8px;
    }
    .mod {
      grid-template-columns: 60px minmax(0, 1fr) 30px;
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

  /* ---- CPU: package + per-core table ---- */
  .cpu {
    display: grid;
    grid-template-columns: minmax(280px, 1fr) minmax(0, 1fr);
  }
  .die {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    padding: 10px 6px 4px 12px;
  }
  .die svg {
    flex: 1;
    min-height: 0;
    width: 100%;
  }
  .ramp {
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px 6px;
    color: var(--ink3);
    font-size: 10.5px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  /* Mirrors the ramp hard-coded in scene/CpuDie.svelte, so the key matches the core fills. */
  .ramp i {
    width: 88px;
    height: 6px;
    border-radius: 3px;
    background: linear-gradient(90deg, rgb(62 224 160), rgb(255 194 51), rgb(255 77 109));
  }
  .ramp em {
    margin-left: auto;
    font-style: normal;
  }
  .cores {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 2px 18px;
    min-width: 0;
    min-height: 0;
    padding: 10px 14px 10px 12px;
    overflow-y: auto;
    scrollbar-width: thin;
    border-left: 1px solid var(--line);
  }
  table {
    width: 100%;
    grid-row: span 2;
    border-collapse: collapse;
    font-size: 12px;
  }
  caption {
    padding: 2px 8px 8px;
    color: var(--ink);
    font-size: 12.5px;
    font-weight: 600;
    text-align: left;
    white-space: nowrap;
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
  tr.hot td {
    background: color-mix(in srgb, var(--warn) 10%, transparent);
  }
  tr.hot .temp {
    color: var(--warn);
    font-weight: 600;
  }
  tr.sum td {
    border-bottom: 0;
    color: var(--ink2);
    font-weight: 600;
  }
  .cfoot {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--ink3);
    font-size: 11.5px;
    white-space: nowrap;
  }
  .cfoot b {
    color: var(--ink2);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .sep {
    width: 1px;
    height: 12px;
    background: var(--line2);
  }
  /* Short card: every core still gets a row; the averages give way. */
  @container (max-height: 310px) {
    td {
      height: 21px;
    }
    th {
      padding-block: 2px;
    }
    .cores {
      padding-top: 6px;
      padding-bottom: 6px;
    }
    .sum,
    .cfoot {
      display: none;
    }
    .cores {
      grid-template-rows: auto minmax(0, 1fr);
    }
    .die {
      padding-top: 6px;
    }
    .ramp {
      padding-top: 0;
    }
    .ramp em {
      display: none;
    }
  }
  @container (max-width: 720px) {
    .cpu {
      grid-template-columns: minmax(200px, 0.7fr) minmax(0, 1.3fr);
      gap: 0;
    }
    .sbar {
      display: none;
    }
    .ramp em {
      display: none;
    }
  }

  /* ---- disk / Ethernet / GPU: illustrative line art, honestly labelled ---- */
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
  .conn,
  .hub {
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
  .bracket {
    fill: var(--panel);
    stroke: var(--line2);
    stroke-width: 1.5;
  }
  .vent,
  .fin,
  .blade {
    fill: none;
    stroke: var(--line2);
    stroke-width: 1.5;
    stroke-linecap: round;
  }
  .ring {
    fill: var(--panel2);
    stroke: var(--line2);
    stroke-width: 1.5;
  }
  .hub.on {
    fill: var(--rc);
    stroke: color-mix(in srgb, var(--rc) 70%, var(--ink));
  }
  .gold {
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
