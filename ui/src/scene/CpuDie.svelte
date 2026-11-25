<script lang="ts">
  /**
   * Mock processor package, "delidded": substrate, two CCDs (2 CCX × 4 cores each) and the
   * I/O die. Line art + live data. Canvas: 460 × 390.
   *
   * What a core's colour means follows the global mode ("pages" falls back to temperature —
   * a core has no pages):
   *   temperature  the core's thermal sensor            (measured)
   *   activity     the core's load, one half per thread (measured)
   *   power        estimated watts                     (the package total is measured, the split is not)
   *
   * Hovering a core or chiplet explains it; `oncore` / `onccd` let a UX open it.
   * The layout is a generic stand-in — the die-layout DB arrives with M6 (docs/cpu-model.md).
   */
  import { app, hoverCard, hoverOut } from '../mock/store.svelte';
  import { rampColor, norm } from './paint.svelte';
  import { TRUTH, TRUTH_NOTE, type Overlay } from '../mock/telemetry';

  interface Props {
    interactive?: boolean;
    labels?: boolean;
    onccd?: (ccd: number) => void;
    oncore?: (core: number) => void;
  }
  let { interactive = true, labels = true, onccd, oncore }: Props = $props();

  const cpu = $derived(app.cpu);
  const tele = $derived(app.tele);
  const cores = $derived(cpu?.cores ?? []);
  const ov = $derived<Overlay>(app.mode === 'pages' ? 'temperature' : app.mode);
  const truth = $derived(TRUTH[ov].cpu);

  const CORE = 30;
  const CCX_DX = 90;
  const CCD_X = [50, 240];
  const CCD_Y = 44;

  const IO_BLOCKS: [string, number, number][] = [
    ['DDR5 PHY · 2 channels', 62, 222],
    ['PCIe 5.0 ×24', 232, 222],
    ['USB4 / USB 3.2', 62, 284],
    ['Infinity Fabric', 232, 284],
  ];

  function valueOf(i: number): number {
    const c = cores[i];
    if (!c) return 0;
    if (ov === 'activity') return c.load;
    if (ov === 'power') return tele?.corePower[i] ?? 0;
    return c.temp;
  }
  const colourOf = (i: number) => rampColor(ov, norm(ov, 'cpu', valueOf(i)));
  const textOf = (i: number) => {
    const v = valueOf(i);
    return ov === 'power' ? v.toFixed(1) : `${Math.round(v)}${ov === 'activity' ? '%' : '°'}`;
  };
  const ccdAvg = (d: number) => {
    let s = 0;
    let n = 0;
    for (const c of cores) if (c.ccd === d) (s += valueOf(c.index)), n++;
    return n ? s / n : 0;
  };
  const ccdColour = (d: number) => rampColor(ov, norm(ov, 'cpu', ccdAvg(d)));

  let hot = $state<{ kind: 'core' | 'ccd'; i: number } | null>(null);

  function coreCard(i: number) {
    const c = cores[i];
    const t = tele;
    return {
      title: `Core ${i + 1}`,
      sub: `CCD ${c.ccd} · CCX ${(i >> 2) & 1} · 2 threads`,
      rows: [
        { k: 'temperature', v: `${c.temp.toFixed(1)} °C`, mono: true },
        { k: 'load', v: `${Math.round(c.load)} % · threads ${Math.round(t?.threadLoad[2 * i] ?? 0)} % / ${Math.round(t?.threadLoad[2 * i + 1] ?? 0)} %` },
        { k: 'clock', v: `${c.freq.toFixed(2)} GHz`, mono: true },
        { k: 'power', v: `≈ ${(t?.corePower[i] ?? 0).toFixed(2)} W`, mono: true },
      ],
      note: TRUTH_NOTE[ov].cpu,
      hint: oncore ? 'click to open this core' : undefined,
    };
  }
  function ccdCard(d: number) {
    const cs = cores.filter((c) => c.ccd === d);
    const avg = (f: (c: (typeof cs)[number]) => number) => (cs.length ? cs.reduce((s, c) => s + f(c), 0) / cs.length : 0);
    const hottest = cs.reduce((a, c) => (c.temp > a.temp ? c : a), cs[0]);
    return {
      title: `CCD ${d}`,
      sub: 'compute chiplet · 8 cores / 16 threads · 32 MB L3 per CCX',
      rows: [
        { k: 'load', v: `${avg((c) => c.load).toFixed(0)} %` },
        { k: 'hottest', v: hottest ? `core ${hottest.index + 1} · ${hottest.temp.toFixed(1)} °C` : '—', mono: true },
        { k: 'clock', v: `${avg((c) => c.freq).toFixed(2)} GHz`, mono: true },
        { k: 'power', v: `≈ ${cs.reduce((s, c) => s + (tele?.corePower[c.index] ?? 0), 0).toFixed(1)} W`, mono: true },
      ],
      note: `what the colour shows: ${ov} · ${truth}`,
      hint: onccd ? 'click to open this chiplet' : undefined,
    };
  }
  const coreX = (i: number) => CCD_X[i >> 3] + 8 + ((i >> 2) & 1) * CCX_DX + (i & 1) * (CORE + 4);
  const coreY = (i: number) => CCD_Y + 22 + ((i >> 1) & 1) * 42;
  const clickable = $derived(!!(oncore || onccd));
</script>

<g class="cpu" class:clickable={clickable} aria-label="Processor package (mock)">
  <rect x="20" y="20" width="420" height="346" rx="10" class="substrate" />
  <path d="M30 358 L30 346 L42 358 Z" class="pin1" />

  {#each [0, 1] as c (c)}
    <g
      class="ccd"
      class:hot={hot?.kind === 'ccd' && hot.i === c}
      onpointerenter={(e) => {
        hot = { kind: 'ccd', i: c };
        if (interactive) hoverCard(ccdCard(c), e);
      }}
      onpointerleave={() => {
        hot = null;
        hoverOut();
      }}
      onclick={(e) => {
        e.stopPropagation();
        onccd?.(c);
      }}
    >
      <rect x={CCD_X[c]} y={CCD_Y} width="170" height="134" rx="6" class="ccd-body" />
      <rect x={CCD_X[c]} y={CCD_Y} width="170" height="134" rx="6" fill={ccdColour(c)} class="tint" />
      <text x={CCD_X[c] + 10} y={CCD_Y + 15} class="lbl">CCD{c} · 8C / 16T</text>
      <text x={CCD_X[c] + 160} y={CCD_Y + 15} text-anchor="end" class="lbl2">{truth}</text>
      {#each [0, 1] as x (x)}
        <rect x={CCD_X[c] + 8 + x * CCX_DX} y={CCD_Y + 106} width="64" height="14" rx="3" class="block" />
        <text x={CCD_X[c] + 40 + x * CCX_DX} y={CCD_Y + 116} text-anchor="middle" class="lbl2">L3 · 32 MB</text>
      {/each}
    </g>
  {/each}

  {#each cores as c (c.index)}
    <g
      class="core"
      class:hot={hot?.kind === 'core' && hot.i === c.index}
      transform="translate({coreX(c.index)},{coreY(c.index)})"
      onpointerenter={(e) => {
        hot = { kind: 'core', i: c.index };
        if (interactive) hoverCard(coreCard(c.index), e);
      }}
      onpointerleave={() => {
        hot = null;
        hoverOut();
      }}
      onclick={(e) => {
        e.stopPropagation();
        oncore?.(c.index);
      }}
    >
      <rect width={CORE} height={CORE} rx="4" class="core-body" />
      {#if ov === 'activity'}
        <rect x="1" y="1" width={(CORE - 3) / 2} height={CORE - 2} rx="2" fill={rampColor(ov, norm(ov, 'cpu', tele?.threadLoad[2 * c.index] ?? 0))} />
        <rect x={(CORE + 1) / 2} y="1" width={(CORE - 3) / 2} height={CORE - 2} rx="2" fill={rampColor(ov, norm(ov, 'cpu', tele?.threadLoad[2 * c.index + 1] ?? 0))} />
      {:else}
        <rect x="1" y="1" width={CORE - 2} height={CORE - 2} rx="3" fill={colourOf(c.index)} />
        <line x1={CORE / 2} y1="3" x2={CORE / 2} y2={CORE - 3} class="smt" />
      {/if}
      <text x={CORE / 2} y="19" text-anchor="middle" class="ct">{textOf(c.index)}</text>
      {#if ov !== 'activity'}
        <rect y={CORE + 2} width={Math.max(1.5, (CORE * c.load) / 100)} height="3" rx="1.5" class="load" />
      {/if}
    </g>
  {/each}

  <rect x="50" y="196" width="360" height="150" rx="6" class="iod" />
  {#if labels}
    <text x="60" y="212" class="lbl">I/O DIE</text>
    <text x="400" y="212" text-anchor="end" class="lbl2">{cpu ? cpu.power.toFixed(0) : 0} W package</text>
  {/if}
  {#each IO_BLOCKS as [t, x, y] (t)}
    <rect {x} {y} width="166" height="48" rx="4" class="block" />
    <text x={x + 10} y={y + 28} class="lbl2">{t}</text>
  {/each}
</g>

<style>
  .cpu {
    cursor: default;
  }
  .cpu.clickable .ccd,
  .cpu.clickable .core {
    cursor: pointer;
  }
  .substrate {
    fill: var(--cpu-sub);
    stroke: var(--cpu-line);
    stroke-width: 1.4;
  }
  .pin1 {
    fill: var(--ink3);
  }
  .ccd-body,
  .iod {
    fill: var(--cpu-die);
    stroke: var(--cpu-line);
    stroke-width: 1.2;
  }
  .tint {
    opacity: 0.2;
    pointer-events: none;
  }
  .block {
    fill: var(--panel2);
    stroke: var(--line2);
    stroke-width: 1;
  }
  .lbl {
    font: 600 9px var(--font-mono);
    fill: var(--ink2);
    letter-spacing: 0.06em;
    pointer-events: none;
  }
  .lbl2 {
    font: 400 8.5px var(--font-ui);
    fill: var(--ink3);
    pointer-events: none;
  }
  .ccd,
  .core {
    outline: none;
  }
  .ccd.hot > .ccd-body {
    stroke: var(--ink);
    stroke-width: 1.8;
  }
  .core-body {
    fill: none;
    stroke: var(--cpu-line);
    stroke-width: 1.2;
    transition: stroke 100ms ease;
  }
  .core.hot .core-body {
    stroke: var(--ink);
    stroke-width: 1.8;
  }
  .smt {
    stroke: rgba(0, 0, 0, 0.35);
    stroke-width: 1;
    pointer-events: none;
  }
  .ct {
    font: 700 9px var(--font-mono);
    fill: #fff;
    paint-order: stroke;
    stroke: rgba(0, 0, 0, 0.6);
    stroke-width: 2.5px;
    pointer-events: none;
  }
  .load {
    fill: var(--ink);
    opacity: 0.85;
    pointer-events: none;
  }
</style>
