<script lang="ts">
  /**
   * Mock processor package, "delidded": substrate, two CCDs (2 CCX × 4 cores each) and
   * the I/O die. Core fill = temperature, bar underneath = load. Canvas: 460 × 390.
   * Layout is a generic stand-in — the real die-layout DB arrives with M6 (docs/cpu-model.md).
   */
  import { app } from '../mock/store.svelte';

  const cpu = $derived(app.cpu);
  const cores = $derived(cpu?.cores ?? []);

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

  function tempColor(t: number): string {
    const x = Math.max(0, Math.min(1, (t - 35) / 52));
    const mix = (a: number[], b: number[], k: number) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
    const c = x < 0.5 ? mix([62, 224, 160], [255, 194, 51], x * 2) : mix([255, 194, 51], [255, 77, 109], (x - 0.5) * 2);
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  const coreX = (i: number) => CCD_X[i >> 3] + 8 + ((i >> 2) & 1) * CCX_DX + (i & 1) * (CORE + 4);
  const coreY = (i: number) => CCD_Y + 22 + ((i >> 1) & 1) * 42;
</script>

<g class="cpu" aria-label="Processor package (mock)">
  <rect x="20" y="20" width="420" height="346" rx="10" class="substrate" />
  <path d="M30 358 L30 346 L42 358 Z" class="pin1" />

  {#each [0, 1] as c (c)}
    <rect x={CCD_X[c]} y={CCD_Y} width="170" height="134" rx="6" class="ccd" />
    <text x={CCD_X[c] + 10} y={CCD_Y + 15} class="lbl">CCD{c} · 8C / 16T</text>
    <text x={CCD_X[c] + 160} y={CCD_Y + 15} text-anchor="end" class="lbl2">5 nm</text>
    {#each [0, 1] as x (x)}
      <rect x={CCD_X[c] + 8 + x * CCX_DX} y={CCD_Y + 106} width="64" height="14" rx="3" class="l3" />
      <text x={CCD_X[c] + 40 + x * CCX_DX} y={CCD_Y + 116} text-anchor="middle" class="lbl2">L3 · 32 MB</text>
    {/each}
  {/each}

  {#each cores as c (c.index)}
    <g class="core" transform="translate({coreX(c.index)},{coreY(c.index)})">
      <title>Core {c.index + 1} · {Math.round(c.temp)} °C · {Math.round(c.load)} % · {c.freq.toFixed(2)} GHz</title>
      <rect width={CORE} height={CORE} rx="4" fill={tempColor(c.temp)} />
      <line x1={CORE / 2} y1="3" x2={CORE / 2} y2={CORE - 3} class="smt" />
      <text x={CORE / 2} y="19" text-anchor="middle" class="ct">{Math.round(c.temp)}°</text>
      <rect y={CORE + 2} width={Math.max(1.5, (CORE * c.load) / 100)} height="3" rx="1.5" class="load" />
    </g>
  {/each}

  <rect x="50" y="196" width="360" height="150" rx="6" class="iod" />
  <text x="60" y="212" class="lbl">I/O DIE</text>
  <text x="400" y="212" text-anchor="end" class="lbl2">{cpu ? Math.round(cpu.power) : 0} W package</text>
  {#each IO_BLOCKS as [t, x, y] (t)}
    <rect {x} {y} width="166" height="48" rx="4" class="iob" />
    <text x={x + 10} y={y + 28} class="lbl2">{t}</text>
  {/each}
</g>

<style>
  .substrate {
    fill: var(--cpu-sub);
    stroke: var(--cpu-line);
    stroke-width: 1.4;
  }
  .pin1 {
    fill: var(--ink3);
  }
  .ccd,
  .iod {
    fill: var(--cpu-die);
    stroke: var(--cpu-line);
    stroke-width: 1.2;
  }
  .l3,
  .iob {
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
  .core {
    cursor: default;
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
