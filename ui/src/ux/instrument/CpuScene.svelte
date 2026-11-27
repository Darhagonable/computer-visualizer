<script lang="ts">
  /**
   * Processor scene: the package, its instruments and a table of the chiplets. Clicking a
   * core or a chiplet opens its part view — the table rows do the same for the keyboard. The
   * "pin" select holds a part in the inspector instead; the ring drawn over the die marks what
   * is pinned.
   */
  import { app } from '../../mock/store.svelte';
  import CpuDie from '../../scene/CpuDie.svelte';
  import AreaGraph from '../../scene/AreaGraph.svelte';
  import { CPU_DIE } from '../../scene/geometry';
  import type { Level } from '../../levels/nav';
  import { door } from './scenes';
  import { sel, pin, unpin, partKey, partFromKey, partReading } from './selection.svelte';

  let { onnavigate }: { onnavigate: (l: Level, el?: Element) => void } = $props();

  const cpu = $derived(app.cpu);
  const tele = $derived(app.tele);
  const cores = $derived(cpu?.cores ?? []);
  const part = $derived(sel.part);
  const key = $derived(partKey(part));

  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const ccd = (i: number) => {
    const cs = cores.filter((c) => c.ccd === i);
    return {
      load: avg(cs.map((c) => c.load)),
      temp: cs.length ? Math.max(...cs.map((c) => c.temp)) : 0,
      freq: avg(cs.map((c) => c.freq)),
    };
  };
  const hot = $derived(cores.length ? cores.reduce((a, c) => (c.temp > a.temp ? c : a)) : null);
  const busy = $derived(cores.filter((c) => c.load > 50).length);
  /** This chiplet's row is marked when it — or one of its cores — is pinned. */
  const rowOn = (i: number) => (part?.kind === 'ccd' ? part.index === i : part?.kind === 'core' ? cores[part.index]?.ccd === i : false);

  // The ring over the die, in the die's own canvas units (scene/CpuDie.svelte): the primitive
  // has no `selected` prop, so it is drawn in the same coordinate space, on top of it.
  const CORE = 30;
  const CCD_X = [50, 240];
  const CCD_Y = 44;
  const coreX = (i: number) => CCD_X[i >> 3] + 8 + ((i >> 2) & 1) * 90 + (i & 1) * (CORE + 4);
  const coreY = (i: number) => CCD_Y + 22 + ((i >> 1) & 1) * 42;
  const ring = $derived.by(() => {
    const p = sel.part;
    if (!p) return null;
    // a core's ring takes in the little load bar under it
    if (p.kind === 'core') return { x: coreX(p.index) - 4, y: coreY(p.index) - 4, w: CORE + 8, h: CORE + 13, rx: 7 };
    if (p.kind === 'ccd') return { x: CCD_X[p.index] - 4, y: CCD_Y - 4, w: 178, h: 142, rx: 9 };
    return null;
  });

  function onPick(e: Event) {
    const p = partFromKey((e.currentTarget as HTMLSelectElement).value);
    if (p) pin(p);
    else unpin();
  }
  const openCcd = (i: number, el?: Element) => onnavigate({ kind: 'ccd', ccd: i }, el);
</script>

<div class="lv cpu">
  <div class="panel art">
    <header>
      <b>Package</b>
      <span>delidded · 2 CCD + I/O die</span>
      <label class="pick" title="Hold a core or a chiplet in the inspector — a click on the die opens the part's own view">
        pin
        <select value={key} onchange={onPick}>
          <option value="">a core or chiplet…</option>
          <optgroup label="Chiplets">
            <option value="ccd:0">CCD 0</option>
            <option value="ccd:1">CCD 1</option>
          </optgroup>
          <optgroup label="Cores">
            {#each cores as c (c.index)}
              <option value={'core:' + c.index}>Core {c.index + 1} · CCD {c.ccd}</option>
            {/each}
          </optgroup>
        </select>
        {#if part}<span class="reading mono num">{partReading(part, true)}</span>{/if}
      </label>
    </header>
    <div class="canvas">
      <svg viewBox="0 0 {CPU_DIE.width} {CPU_DIE.height}" preserveAspectRatio="xMidYMid meet">
        <CpuDie oncore={(i) => onnavigate({ kind: 'core', core: i })} onccd={(d) => onnavigate({ kind: 'ccd', ccd: d })} />
        {#if ring}
          <rect x={ring.x} y={ring.y} width={ring.w} height={ring.h} rx={ring.rx} class="ring" vector-effect="non-scaling-stroke" />
        {/if}
      </svg>
    </div>
  </div>

  <div class="side">
    <section class="panel graph">
      <AreaGraph values={app.hist.cpu} label="processor utility · 60 s" unit="%" />
    </section>
    <section class="panel stats">
      <div class="stat"><em>hottest core</em><b>{hot ? `Core ${hot.index + 1}` : '–'}</b><span>{hot ? hot.temp.toFixed(1) : '–'} °C · CCD{hot?.ccd}</span></div>
      <div class="stat"><em>average clock</em><b>{avg(cores.map((c) => c.freq)).toFixed(2)}<i> GHz</i></b><span>{busy} of {cores.length} cores above 50%</span></div>
      <div class="stat"><em>package power</em><b>{cpu ? cpu.power.toFixed(0) : '–'}<i> W</i></b><span>mock model</span></div>
    </section>
    <section class="panel table">
      <table>
        <thead><tr><th>chiplet</th><th>cores</th><th>load</th><th>max temp</th><th>clock</th></tr></thead>
        <tbody>
          {#each [0, 1] as i (i)}
            {@const on = rowOn(i)}
            <tr
              class:on
              tabindex="0"
              role="button"
              aria-pressed={on}
              title={on ? 'Pinned in the inspector — click to open it' : `Open CCD ${i}`}
              onclick={(e) => openCcd(i, door(e))}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openCcd(i, door(e));
                }
              }}
            >
              <td>CCD{i}</td>
              <td class="l">
                {#if on}<span class="tag">{part?.kind === 'core' ? `core ${part.index + 1}` : 'pinned'}</span>{/if}
                8 / 16T
              </td>
              <td class="num">{ccd(i).load.toFixed(0)}%</td>
              <td class="num">{ccd(i).temp.toFixed(0)} °C</td>
              <td class="num">{ccd(i).freq.toFixed(2)} GHz</td>
            </tr>
          {/each}
          <tr class="io"><td>I/O die</td><td class="l">–</td><td class="num">{cpu ? cpu.power.toFixed(0) : '–'} W</td><td class="num">–</td><td class="num">–</td></tr>
        </tbody>
      </table>
    </section>
  </div>
</div>

<style>
  .cpu {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(300px, 1fr);
    gap: 12px;
  }
  .panel {
    border-radius: var(--radius);
    border: 1px solid var(--line);
    background: var(--panel);
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .art header {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: none;
    padding: 7px 14px 6px;
    border-bottom: 1px solid var(--line);
  }
  .art header b {
    font-size: 12.5px;
    font-weight: 650;
  }
  .art header > span {
    color: var(--ink3);
    font-size: 11px;
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
    max-width: 190px;
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
  /* the pinned part's reading: shown here when the stage header has no room for its chip */
  .reading {
    display: none;
    min-width: 52px;
    color: var(--accent);
    font-size: 11.5px;
    text-align: right;
  }
  .canvas {
    position: relative;
    flex: 1;
    min-height: 0;
    margin: 8px 16px 16px;
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
  .side {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
  }
  .graph {
    flex: 1.1;
    min-height: 120px;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    padding: 12px 14px;
    gap: 12px;
    flex: none;
  }
  .stat em {
    display: block;
    font: 600 9.5px var(--font-mono);
    font-style: normal;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--ink3);
  }
  .stat b {
    display: block;
    font: 300 21px / 1.3 var(--font-ui);
    color: var(--ink);
    white-space: nowrap;
  }
  .stat b i {
    font-style: normal;
    font-size: 12px;
    color: var(--ink3);
  }
  .stat span {
    color: var(--ink3);
    font-size: 10.5px;
    white-space: nowrap;
  }
  .table {
    overflow: auto;
    flex: none;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  th,
  td {
    padding: 6px 12px;
    text-align: right;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
  }
  th:first-child,
  td:first-child {
    text-align: left;
  }
  th {
    font: 600 9.5px var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--ink3);
  }
  td {
    color: var(--ink2);
  }
  td.l {
    text-align: left;
  }
  tbody tr[role='button'] {
    cursor: pointer;
    outline: none;
    transition: background 80ms ease;
  }
  tbody tr[role='button']:hover,
  tbody tr[role='button']:focus-visible {
    background: var(--panel2);
  }
  tbody tr.on td {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: var(--ink);
  }
  tbody tr.on td:first-child {
    box-shadow: inset 2px 0 0 var(--accent);
  }
  .tag {
    display: inline-block;
    margin-right: 7px;
    padding: 0 5px;
    border-radius: 6px;
    border: 1px solid var(--accent);
    color: var(--accent);
    font: 600 9px var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    line-height: 14px;
  }
  tr:last-child td {
    border-bottom: 0;
  }
  tr.io td {
    color: var(--ink3);
  }
  @media (max-width: 1399px) {
    .reading {
      display: inline-block;
    }
    /* the row is still marked (accent bar + tint); the tag would not fit the narrow table */
    .tag {
      display: none;
    }
  }
  /* Narrow (the inspector is gone, so two columns fit down to here): one column that scrolls
     rather than two rows squeezed into the height. */
  @media (max-width: 940px) {
    .cpu {
      display: flex;
      flex-direction: column;
      overflow: auto;
    }
    .art,
    .side {
      flex: none;
    }
    .canvas {
      flex: none;
      height: min(58vh, 440px);
      min-height: 240px;
    }
    .graph {
      flex: none;
      height: 170px;
    }
    .table {
      overflow: visible;
    }
  }
</style>
