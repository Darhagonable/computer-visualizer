<script lang="ts">
  /**
   * GPU scene — the graphics card as the centrepiece, its instruments around it: live
   * graphs, board telemetry, the per-engine breakdown and VRAM by process. Clicking the die
   * or a VRAM chip opens its part view; clicking the rest of the card pins the whole card in
   * the inspector (the "pin" select does it for the keyboard, for any part); the outline
   * drawn over the card marks what is pinned.
   *
   * Only the card is painted by the overlay — its reading guide is in the stage header.
   * Everything else here is plain gauges, each saying how honest it is.
   */
  import { app, getMachine, selectProcess } from '../../mock/store.svelte';
  import { DOMAIN, VRAM_CHIPS } from '../../mock/telemetry';
  import GpuCard from '../../scene/GpuCard.svelte';
  import AreaGraph from '../../scene/AreaGraph.svelte';
  import { GPU_CARD } from '../../scene/geometry';
  import { norm } from '../../scene/paint.svelte';
  import type { Level } from '../../levels/nav';
  import { sel, pin, unpin, partKey, partFromKey, partReading, vramOverhead } from './selection.svelte';
  import TruthTag from './TruthTag.svelte';

  let { onnavigate }: { onnavigate: (l: Level, el?: Element) => void } = $props();

  type Key = 'mib' | 'name';
  let sort = $state<Key>('mib');
  let desc = $state(true);

  const m = getMachine();
  const g = $derived(app.tele?.gpu ?? null);
  const part = $derived(sel.part);
  const key = $derived(partKey(part));
  const num = (v: number) => Math.round(v).toLocaleString('en-US');

  // ---- what is pinned: an outline in the card's own canvas units (scene/GpuCard.svelte) ----
  // The primitive has no `selected` prop, so the outline is drawn on top of it, same space.
  const DIE = { x: 341, y: 240, s: 4, w: 98 }; // the substrate is the die ± `s`
  const chipX = (c: number) => 131 + (c % 6) * 90;
  const chipY = (c: number) => (c < 6 ? 178 : 208);
  const isDie = $derived(part?.kind === 'gpu' && part.part !== 'card');
  const isCard = $derived(part?.kind === 'gpu' && part.part === 'card');
  const chip = $derived(part?.kind === 'vram' ? part.chip : -1);

  function onPick(e: Event) {
    const p = partFromKey((e.currentTarget as HTMLSelectElement).value);
    if (p) pin(p);
    else unpin();
  }

  // ---- board telemetry --------------------------------------------------------------
  const ENGINES: { k: '3d' | 'copy' | 'decode' | 'encode'; label: string }[] = [
    { k: '3d', label: '3D' },
    { k: 'copy', label: 'Copy' },
    { k: 'decode', label: 'Video decode' },
    { k: 'encode', label: 'Video encode' },
  ];
  interface Tile {
    label: string;
    v: string;
    sub: string;
    /** reading / max → the gauge under the value; null: no gauge */
    gauge: number | null;
    truth: 'measured' | null;
  }
  const tiles = $derived.by(() => {
    const x = g;
    if (!x) return [];
    const temp = (v: number) => norm('temperature', 'gpu', v);
    const out: Tile[] = [
      { label: 'temperature', v: `${x.temp.toFixed(1)} °C`, sub: 'GPU sensor', gauge: temp(x.temp), truth: 'measured' },
      { label: 'hotspot', v: `${x.hotspot.toFixed(0)} °C`, sub: 'sensor', gauge: temp(x.hotspot), truth: 'measured' },
      { label: 'VRAM temp', v: `${x.vramTemp.toFixed(0)} °C`, sub: 'sensor', gauge: temp(x.vramTemp), truth: 'measured' },
      { label: 'board power', v: `${x.power.toFixed(0)} W`, sub: `of ${x.powerLimit} W`, gauge: x.power / x.powerLimit, truth: 'measured' },
      { label: 'core clock', v: `${num(x.clockMhz)} MHz`, sub: 'boost clock', gauge: null, truth: null },
      { label: 'memory clock', v: `${num(x.memClockMhz)} MHz`, sub: 'GDDR6X', gauge: null, truth: null },
      { label: 'fan', v: `${Math.round(x.fanPct)} %`, sub: 'curve · 2 fans', gauge: x.fanPct / 100, truth: null },
      { label: 'fan speed', v: `${num(x.fanRpm)} rpm`, sub: 'both fans', gauge: x.fanRpm / 3000, truth: null },
    ];
    return out;
  });

  // ---- VRAM by process ----------------------------------------------------------------
  const rows = $derived.by(() => {
    const x = app.tele?.gpu;
    const st = app.stats;
    if (!x || !st) return [];
    const def = new Map(m.processes.map((p) => [p.name, p]));
    const alive = new Map(st.procs.map((p) => [p.id, p.alive]));
    const r = x.procs.map((p) => {
      const d = def.get(p.name);
      return { name: p.name, mib: p.mib, id: d?.id ?? null, alive: d ? (alive.get(d.id) ?? true) : false };
    });
    r.sort((a, b) => {
      if (sort === 'name') return desc ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name);
      return desc ? b.mib - a.mib : a.mib - b.mib;
    });
    return r;
  });
  const maxMiB = $derived(rows.length ? Math.max(...rows.map((r) => r.mib)) : 1);
  /** what is in VRAM beyond the processes: driver + desktop composition */
  const overhead = $derived(vramOverhead());
  const overheadShare = $derived(g ? overhead / g.vramTotalMiB : 0);
  const by = (k: Key) => {
    if (sort === k) desc = !desc;
    else {
      sort = k;
      desc = k !== 'name';
    }
  };
  const arrow = (k: Key) => (sort === k ? (desc ? '▾' : '▴') : '');
  function open(id: number | null) {
    if (id === null) return; // not a process of this mock machine — nothing to select
    unpin(); // the process card takes over in the inspector
    selectProcess(id);
  }
</script>

<div class="lv gpu">
  <div class="col">
    <section class="panel card">
      <header>
        <b>Graphics card</b>
        <span>{g ? g.name : 'GPU'}<i class="bus"> · PCIe 5.0 ×16</i></span>
        <label class="pick" title="Hold a part in the inspector — a click on the die or a VRAM chip opens the part's own view">
          pin
          <select value={key} onchange={onPick}>
            <option value="">a part…</option>
            <optgroup label="GPU">
              <option value="gpu">GPU die</option>
              <option value="card">whole card</option>
            </optgroup>
            <optgroup label="VRAM chips">
              {#each Array.from({ length: VRAM_CHIPS }, (_, c) => c) as c (c)}
                <option value={'vram:' + c}>Chip {c + 1} · {c < 6 ? 'upper' : 'lower'} row</option>
              {/each}
            </optgroup>
          </select>
          {#if part}<span class="reading mono num">{partReading(part, true)}</span>{/if}
        </label>
      </header>
      <div class="canvas">
        <svg viewBox="0 0 {GPU_CARD.width} {GPU_CARD.height}" preserveAspectRatio="xMidYMid meet">
          <GpuCard
            ondie={() => onnavigate({ kind: 'gdie' })}
            onvram={() => onnavigate({ kind: 'vram' })}
            oncard={() => pin({ kind: 'gpu', part: 'card' })}
          />
          {#if isDie}
            <rect x={DIE.x - DIE.s - 3} y={DIE.y - DIE.s - 3} width={DIE.w + 2 * DIE.s + 6} height={DIE.w + 2 * DIE.s + 6} rx="8" class="ring" vector-effect="non-scaling-stroke" />
          {/if}
          {#if isCard}
            <rect x="27" y="165" width="726" height="196" rx="9" class="ring" vector-effect="non-scaling-stroke" />
          {/if}
          {#if chip >= 0}
            <rect x={chipX(chip) - 4} y={chipY(chip) - 4} width="76" height="32" rx="5" class="ring" vector-effect="non-scaling-stroke" />
          {/if}
        </svg>
      </div>
    </section>

    <section class="panel stats">
      <div class="tiles">
        {#each tiles as t (t.label)}
          <div class="tile">
            <em>{t.label}</em>
            <b>{t.v}</b>
            <span>
              {#if t.truth}<TruthTag truth={t.truth} />{/if}
              {t.sub}
            </span>
            {#if t.gauge !== null}
              <div class="gauge"><i style="width: {Math.max(0, Math.min(100, t.gauge * 100))}%"></i></div>
            {/if}
          </div>
        {/each}
      </div>
      <div class="engines">
        <h4>engines · per-engine utilisation <TruthTag truth="measured" /></h4>
        <div class="engs">
          {#each ENGINES as e (e.k)}
            {@const v = g?.engines[e.k] ?? 0}
            <div class="eng">
              <div class="top"><span>{e.label}</span><b class="num">{v.toFixed(0)} %</b></div>
              <div class="bar"><i style="width: {Math.min(100, v)}%"></i></div>
            </div>
          {/each}
        </div>
      </div>
    </section>
  </div>

  <div class="col">
    <!-- the caption sits in the panel's corner rather than in the graph: on a short graph the
         shared AreaGraph draws its own label right where the line runs -->
    <section class="panel graph">
      <AreaGraph values={app.hist.gpu} unit="%" />
      <span class="glabel">GPU load · 3D engine · 60 s <TruthTag truth="measured" /></span>
    </section>
    <section class="panel graph">
      <AreaGraph values={app.hist.gpuTemp} min={DOMAIN.temperature.gpu[0]} max={DOMAIN.temperature.gpu[1]} color="var(--warn)" unit="°C" decimals={1} />
      <span class="glabel">GPU temperature · 60 s <TruthTag truth="measured" /></span>
    </section>
    <section class="panel vram">
      <header><b>VRAM by process</b><span>per-process total: measured</span></header>
      <div class="tablewrap">
        <table>
          <thead>
            <tr>
              <th><button onclick={() => by('name')}>Process {arrow('name')}</button></th>
              <th class="barcell"><button onclick={() => by('mib')}>GPU memory {arrow('mib')}</button></th>
              <th><button onclick={() => by('mib')}>Share {arrow('mib')}</button></th>
            </tr>
          </thead>
          <tbody>
            {#each rows as r (r.name)}
              <tr
                class:on={app.selectedProcess === r.id}
                class:dead={!r.alive}
                class:link={r.id !== null}
                tabindex={r.id !== null ? 0 : undefined}
                title={r.id !== null ? 'Select this process — highlights its pages on the Memory board' : undefined}
                onclick={() => open(r.id)}
                onkeydown={(e) => e.key === 'Enter' && open(r.id)}
              >
                <td class="name">{r.name}</td>
                <td class="barcell"><i style="width:{(r.mib / maxMiB) * 100}%"></i><span class="num">{num(r.mib)} MiB</span></td>
                <td class="num">{g ? ((r.mib / g.vramTotalMiB) * 100).toFixed(1) : 0} %</td>
              </tr>
            {/each}
            <tr class="sys">
              <td class="name" title="Driver and desktop composition overhead — not attributed to any process">driver &amp; desktop</td>
              <td class="barcell"><i style="width:{(overhead / maxMiB) * 100}%"></i><span class="num">{num(overhead)} MiB</span></td>
              <td class="num">{(overheadShare * 100).toFixed(1)} %</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td>Total in use</td>
              <td class="num">{g ? num(g.vramUsedMiB) : 0} MiB</td>
              <td class="num">{g ? ((g.vramUsedMiB / g.vramTotalMiB) * 100).toFixed(1) : 0} %</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p class="foot">Which VRAM chip holds which process is <b>modelled</b> — no OS exposes VRAM placement.</p>
    </section>
  </div>
</div>

<style>
  .gpu {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) clamp(300px, 34%, 340px);
    gap: 12px;
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    min-width: 0;
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
  header {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: none;
    padding: 4px 14px 4px;
    border-bottom: 1px solid var(--line);
    font-size: 12px;
    white-space: nowrap;
  }
  header b {
    font-size: 12.5px;
    font-weight: 650;
  }
  header > span {
    color: var(--ink3);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* the card */
  .card {
    flex: 1 1 0;
  }
  .canvas {
    position: relative;
    flex: 1;
    min-height: 0;
    margin: 8px 14px 10px;
  }
  /* pinned to the canvas box, so the drawing is scaled to fit (never sized from its content) */
  .canvas svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .ring {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2;
    filter: drop-shadow(0 0 5px var(--accent-glow));
    pointer-events: none;
  }
  .pick {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-left: auto;
    font: 500 11px var(--font-ui);
    color: var(--ink3);
  }
  .pick select {
    height: 24px;
    max-width: 170px;
    padding: 0 4px;
    border-radius: 6px;
    border: 1px solid var(--line2);
    background: var(--panel2);
    color: var(--ink2);
    font: 500 11.5px var(--font-ui);
    cursor: pointer;
  }
  .pick select:hover {
    color: var(--ink);
    border-color: var(--ink3);
  }
  header .bus {
    font-style: normal;
  }
  /* the pinned part's reading: shown here when the stage header has no room for its chip */
  .reading {
    display: none;
    min-width: 56px;
    color: var(--accent);
    font-size: 11.5px;
    text-align: right;
  }

  /* telemetry */
  /* content-sized: every pixel it does not need goes to the card above */
  .stats {
    flex: none;
    padding: 8px 12px 10px;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }
  .tile {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1px;
    min-width: 0;
    min-height: 58px;
    padding: 6px 10px 6px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--bg2);
  }
  .tile em {
    font: 600 9px var(--font-mono);
    font-style: normal;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--ink3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tile b {
    font: 300 18px / 1.2 var(--font-ui);
    letter-spacing: -0.01em;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .tile span {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 1px 5px;
    font-size: 10px;
    color: var(--ink3);
    white-space: nowrap;
  }
  .gauge {
    height: 3px;
    margin-top: 4px;
    border-radius: 2px;
    background: var(--panel2);
    overflow: hidden;
  }
  .gauge i {
    display: block;
    height: 100%;
    border-radius: 2px;
    background: var(--ink3);
  }
  .engines {
    flex: none;
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px solid var(--line);
  }
  h4 {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0 0 5px;
    font: 600 9.5px var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: var(--ink3);
  }
  .engs {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px 12px;
  }
  .eng .top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 6px;
    font-size: 11px;
    color: var(--ink2);
    white-space: nowrap;
  }
  .eng .top b {
    font-weight: 500;
    color: var(--ink);
    font-size: 10.5px;
  }
  .bar {
    height: 6px;
    margin-top: 2px;
    border-radius: 3px;
    background: var(--panel2);
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: var(--accent);
  }

  /* graphs */
  .graph {
    position: relative;
    flex: 1 1 0;
    min-height: 97px;
    padding: 4px 2px 2px;
  }
  .glabel {
    position: absolute;
    right: 10px;
    bottom: 5px;
    display: flex;
    align-items: center;
    gap: 6px;
    font: 400 11px var(--font-ui);
    color: var(--ink3);
    pointer-events: none;
  }

  /* VRAM by process: as tall as its rows, but never at the cost of the graphs (it scrolls).
     The cap leaves both graphs their minimum height plus the two gaps. */
  .vram {
    flex: 0 1 auto;
    min-height: 150px;
    max-height: calc(100% - 218px);
  }
  .tablewrap {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  th,
  td {
    padding: 0 10px;
    text-align: right;
    white-space: nowrap;
  }
  th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--panel);
    border-bottom: 1px solid var(--line);
  }
  th:first-child,
  td:first-child {
    text-align: left;
  }
  th button {
    width: 100%;
    padding: 2px 0;
    border: 0;
    background: transparent;
    text-align: right;
    font: 600 9.5px var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--ink3);
    cursor: pointer;
  }
  th button:hover {
    color: var(--ink);
  }
  tbody td {
    height: 21px;
    border-bottom: 1px solid var(--line);
    color: var(--ink2);
  }
  tbody tr {
    outline: none;
  }
  tbody tr.link {
    cursor: pointer;
    transition: background 80ms ease;
  }
  tbody tr.link:hover,
  tbody tr.link:focus-visible {
    background: var(--panel2);
  }
  tbody tr.on td {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: var(--ink);
  }
  tbody tr.on td:first-child {
    box-shadow: inset 2px 0 0 var(--accent);
  }
  tbody tr.dead {
    opacity: 0.5;
  }
  .name {
    max-width: 112px;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--ink);
    font-weight: 500;
  }
  tr.sys td {
    color: var(--ink3);
  }
  .barcell {
    position: relative;
    min-width: 104px;
  }
  .barcell i {
    position: absolute;
    left: 10px;
    right: 10px;
    top: 50%;
    height: 6px;
    transform: translateY(-50%);
    border-radius: 3px;
    background: color-mix(in srgb, var(--c-pagefile) 26%, transparent);
  }
  .barcell span {
    position: relative;
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
  .foot {
    flex: none;
    margin: 0;
    padding: 4px 12px 6px;
    border-top: 1px solid var(--line);
    color: var(--ink3);
    font-size: 10.5px;
    line-height: 1.45;
  }
  .foot b {
    font-weight: 650;
    color: var(--accent);
  }
  /* Narrow: one column that scrolls. (A grid would squeeze its rows into the height.) */
  @media (max-width: 1399px) {
    .reading {
      display: inline-block;
    }
    .pick select {
      max-width: 150px;
    }
    header .bus {
      display: none;
    }
  }
  @media (max-width: 880px) {
    .gpu {
      display: flex;
      flex-direction: column;
      overflow: auto;
    }
    .col {
      flex: none;
      min-height: auto;
    }
    .col > .panel {
      flex: none;
    }
    .canvas {
      flex: none;
      height: min(50vw, 300px);
      min-height: 200px;
    }
    .tiles,
    .engs {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .vram {
      max-height: 320px;
    }
    .graph {
      min-height: 150px;
    }
  }
</style>
