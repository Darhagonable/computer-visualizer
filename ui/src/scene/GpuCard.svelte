<script lang="ts">
  /**
   * A graphics card as an exploded technical illustration: the cooler is lifted off the
   * board so the GPU die and every VRAM chip stay visible. Line art + live data.
   * Canvas: 780 × 420.
   *
   * What is real and what is not (docs/VISION.md — every cell is measured or labelled):
   *   die units      temperature, power and per-engine load are measured; how they spread
   *                  across the die is MODELLED
   *   VRAM chips     total and per-process usage are measured; WHICH chip holds WHAT is
   *                  MODELLED — no OS exposes VRAM placement
   */
  import { app, hoverCard, hoverOut } from '../mock/store.svelte';
  import { rampColor } from './paint.svelte';
  import {
    DOMAIN,
    GPU_ENGINES,
    GPU_UNITS,
    GPU_UNITS_PER_ENGINE,
    TRUTH,
    TRUTH_NOTE,
    VRAM_CHIPS,
    VRAM_CHIP_MIB,
    type Overlay,
  } from '../mock/telemetry';

  interface Props {
    interactive?: boolean;
    labels?: boolean;
    ondie?: () => void;
    onvram?: (chip: number) => void;
    oncard?: () => void;
  }
  let { interactive = true, labels = true, ondie, onvram, oncard }: Props = $props();

  const g = $derived(app.tele?.gpu ?? null);
  const ov = $derived<Overlay>(app.mode === 'pages' ? 'temperature' : app.mode);
  const truth = $derived(TRUTH[ov].gpu);
  const t3 = $derived((g?.engines['3d'] ?? 0) / 100);
  const unitSum = $derived.by(() => {
    if (!g) return 0;
    let s = 0;
    for (const v of g.unitLoad) s += v;
    return s;
  });
  const vramPct = $derived(g ? (g.vramUsedMiB / g.vramTotalMiB) * 100 : 0);

  // ---- geometry -----------------------------------------------------------------------
  const DIE = { x: 341, y: 240, w: 98, h: 98 };
  const blkX = (e: number) => DIE.x + 5 + (e % 3) * 33;
  const blkY = (e: number) => DIE.y + 18 + Math.floor(e / 3) * 33;
  const CELL = 6;
  const CGAP = 1.33;
  const CHIP_W = 68;
  const CHIP_H = 24;
  const chipX = (c: number) => 131 + (c % 6) * 90;
  const chipY = (c: number) => (c < 6 ? 178 : 208);
  const FAN_X = [240, 540];
  const units = Array.from({ length: GPU_UNITS }, (_, i) => i);
  const chips = Array.from({ length: VRAM_CHIPS }, (_, c) => c);
  const engines = Array.from({ length: GPU_ENGINES }, (_, e) => e);
  const fingers = Array.from({ length: 60 }, (_, i) => i);
  const blades = Array.from({ length: 9 }, (_, k) => k);
  const pins = Array.from({ length: 8 }, (_, k) => k);
  const engineOf = (i: number) => Math.floor(i / GPU_UNITS_PER_ENGINE);
  const unitPos = (i: number) => {
    const e = engineOf(i);
    const u = i % GPU_UNITS_PER_ENGINE;
    return { x: blkX(e) + (u & 3) * (CELL + CGAP), y: blkY(e) + (u >> 2) * (CELL + CGAP) };
  };
  /** 0.5 at the edge of the die → 1 at its centre: silicon towards the middle runs warmer. */
  function unitCentre(i: number): number {
    const e = engineOf(i);
    const u = i % GPU_UNITS_PER_ENGINE;
    const cx = ((e % 3) + ((u & 3) + 0.5) / 4) / 2.5 - 0.5;
    const cy = (Math.floor(e / 3) + ((u >> 2) + 0.5) / 4) / 1.5 - 0.5;
    return 1 - Math.min(1, Math.hypot(cx, cy) / 0.5) * 0.5;
  }

  // ---- values (what each colour means) ----------------------------------------------
  const unitTemp = (i: number) => (g ? g.temp + 16 * unitCentre(i) * t3 + g.unitLoad[i] * 3 : 0);
  const unitLoadPct = (i: number) => (g ? g.unitLoad[i] * 100 : 0);
  const unitPower = (i: number) => (g ? g.power * (0.5 * (unitSum > 0 ? g.unitLoad[i] / unitSum : 1 / GPU_UNITS) + 0.5 / GPU_UNITS) : 0);
  const unitValue = (i: number) => (ov === 'activity' ? unitLoadPct(i) : ov === 'power' ? unitPower(i) : unitTemp(i));

  const chipJit = (c: number) => ((c * 37) % 5) - 2; // deterministic ±2, so chips differ
  const chipTemp = (c: number) => (g ? g.vramTemp + chipJit(c) : 0);
  const chipBusy = (c: number) => (g ? Math.min(100, g.engines.copy * 6 + t3 * 55 + chipJit(c) * 2) : 0);
  const chipPower = (c: number) => (g ? ((14 + g.engines['3d'] * 0.06) * (0.5 + g.chipUsage[c])) / VRAM_CHIPS : 0);
  const chipValue = (c: number) => (ov === 'activity' ? chipBusy(c) : ov === 'power' ? chipPower(c) : chipTemp(c));

  /**
   * A unit or a VRAM chip is a small part of the board, so "power" needs its own range —
   * board watts (hundreds) would render every unit black.
   */
  const UNIT_POWER: [number, number] = [0, 6];
  const CHIP_POWER: [number, number] = [0, 5];
  const scale = (v: number, [lo, hi]: [number, number]) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  const rangeOf = (own: [number, number]): [number, number] => (ov === 'power' ? own : DOMAIN[ov].gpu);
  const unitFill = (i: number) => rampColor(ov, scale(unitValue(i), rangeOf(UNIT_POWER)));
  const chipFill = (c: number) => rampColor(ov, scale(chipValue(c), rangeOf(CHIP_POWER)));
  const period = $derived(g ? (4.2 - (g.fanPct / 100) * 3.2).toFixed(2) : '4');

  // ---- hover cards --------------------------------------------------------------------
  const mib = (v: number) => `${Math.round(v).toLocaleString('en-US')} MiB`;
  function unitCard(i: number) {
    return {
      title: `Shader engine ${engineOf(i) + 1} · unit ${(i % GPU_UNITS_PER_ENGINE) + 1}`,
      sub: `GPU die · ${GPU_UNITS} units in ${GPU_ENGINES} engines`,
      rows: [
        { k: 'load', v: `${unitLoadPct(i).toFixed(0)} %`, mono: true },
        { k: 'temperature', v: `≈ ${unitTemp(i).toFixed(1)} °C`, mono: true },
        { k: 'power', v: `≈ ${unitPower(i).toFixed(2)} W`, mono: true },
      ],
      note: TRUTH_NOTE[ov].gpu,
      hint: ondie ? 'click to open the GPU die' : undefined,
    };
  }
  function dieCard() {
    return {
      title: 'GPU die',
      sub: `${GPU_UNITS} units · ${GPU_ENGINES} shader engines`,
      rows: [
        { k: '3D', v: `${(g?.engines['3d'] ?? 0).toFixed(0)} %`, mono: true },
        { k: 'copy / video', v: `${(g?.engines.copy ?? 0).toFixed(0)} % · ${(g?.engines.decode ?? 0).toFixed(0)} % dec · ${(g?.engines.encode ?? 0).toFixed(0)} % enc` },
        { k: 'temperature', v: `${(g?.temp ?? 0).toFixed(1)} °C · hotspot ${(g?.hotspot ?? 0).toFixed(0)} °C`, mono: true },
        { k: 'power', v: `${(g?.power ?? 0).toFixed(0)} W of ${g?.powerLimit ?? 0} W`, mono: true },
      ],
      note: `what the colour shows: ${ov} · ${truth}`,
      hint: ondie ? 'click to open the GPU die' : undefined,
    };
  }
  function chipCard(c: number) {
    const used = (g?.chipUsage[c] ?? 0) * VRAM_CHIP_MIB;
    return {
      title: `VRAM chip ${c + 1} · 2 GB GDDR6X`,
      sub: `${Math.min(100, (g?.chipUsage[c] ?? 0) * 100).toFixed(0)} % in use`,
      rows: [
        { k: 'in use', v: `${mib(used)} of ${VRAM_CHIP_MIB} MiB`, mono: true },
        { k: 'temperature', v: `≈ ${chipTemp(c).toFixed(1)} °C`, mono: true },
        { k: 'power', v: `≈ ${chipPower(c).toFixed(2)} W`, mono: true },
      ],
      note: 'VRAM temperature is a sensor reading. Which chip holds which process is modelled — no OS exposes VRAM placement.',
      hint: onvram ? 'click to open VRAM' : undefined,
    };
  }
  function fanCard(k: number) {
    return {
      title: `Fan ${k + 1}`,
      sub: `${g ? Math.round(g.fanPct) : 0} % · ${g ? g.fanRpm.toLocaleString('en-US') : 0} rpm`,
      rows: [{ k: 'temperature', v: `${(g?.temp ?? 0).toFixed(1)} °C GPU · ${(g?.hotspot ?? 0).toFixed(0)} °C hotspot`, mono: true }],
    };
  }
  function powerCard() {
    return {
      title: 'Power input · 12V-2×6',
      sub: `${(g?.power ?? 0).toFixed(0)} W of ${g?.powerLimit ?? 0} W limit`,
      rows: [
        { k: 'clock', v: `${g?.clockMhz ?? 0} MHz core · ${g?.memClockMhz ?? 0} MHz memory`, mono: true },
        { k: 'fans', v: `${Math.round(g?.fanPct ?? 0)} %`, mono: true },
      ],
    };
  }
  function cardCard() {
    return {
      title: g?.name ?? 'Graphics card',
      sub: `${mib(g?.vramUsedMiB ?? 0)} of ${mib(g?.vramTotalMiB ?? 0)} VRAM in use`,
      rows: [
        { k: 'temperature', v: `${(g?.temp ?? 0).toFixed(1)} °C · hotspot ${(g?.hotspot ?? 0).toFixed(0)} °C · VRAM ${(g?.vramTemp ?? 0).toFixed(0)} °C`, mono: true },
        { k: 'engines', v: `3D ${(g?.engines['3d'] ?? 0).toFixed(0)} % · copy ${(g?.engines.copy ?? 0).toFixed(0)} % · video ${(g?.engines.decode ?? 0).toFixed(0)} % / ${(g?.engines.encode ?? 0).toFixed(0)} %` },
        { k: 'power', v: `${(g?.power ?? 0).toFixed(0)} W of ${g?.powerLimit ?? 0} W`, mono: true },
      ],
      note: `what the colour shows: ${ov} · ${truth}`,
      hint: oncard ? 'click to open this card' : undefined,
    };
  }
</script>

<svg viewBox="0 0 780 420" class="gpu" class:passive={!interactive} role="group" aria-label="Graphics card (mock)">
  <!-- cooler, lifted off the card -->
  <g class="cooler">
    <rect x="70" y="8" width="640" height="118" rx="16" class="shroud" />
    {#if labels}
      <text x="390" y="62" text-anchor="middle" class="lbl">{g?.name ?? 'GPU'}</text>
      <text x="390" y="77" text-anchor="middle" class="lbl2">cooler · shown lifted off the card</text>
    {/if}
    {#each FAN_X as fx, k (fx)}
      <g
        transform="translate({fx},67)"
        onpointerenter={(e) => hoverCard(fanCard(k), e)}
        onpointerleave={hoverOut}
      >
        <circle r="50" class="ring" />
        <g class="blades" style="--period: {period}s">
          {#each blades as b (b)}
            <line x1="0" y1="-12" x2="0" y2="-45" transform="rotate({b * 40})" class="blade" />
          {/each}
        </g>
        <circle r="9" class="hub" />
      </g>
    {/each}
  </g>
  {#each [96, 684] as x (x)}
    <line x1={x} y1="128" x2={x} y2="164" class="guide" />
  {/each}

  <!-- the card -->
  <rect
    x="30"
    y="168"
    width="720"
    height="190"
    rx="6"
    class="pcb"
    onpointermove={(e) => hoverCard(cardCard(), e)}
    onpointerleave={hoverOut}
    onclick={() => oncard?.()}
  />
  <rect x="8" y="176" width="22" height="174" rx="3" class="part" />
  {#each [0, 1, 2, 3] as p (p)}
    <rect x="13" y={190 + p * 30} width="12" height="14" rx="1.5" class="port" />
  {/each}

  <!-- power input -->
  <g class="pwr" onpointerenter={(e) => hoverCard(powerCard(), e)} onpointerleave={hoverOut}>
    <rect x="560" y="146" width="120" height="24" rx="3" class="part" />
    {#each pins as k (k)}
      <rect x={567 + k * 14} y="151" width="9" height="6" rx="1" class="pin" />
      <rect x={567 + k * 14} y="160" width="9" height="6" rx="1" class="pin" />
    {/each}
  </g>

  <!-- VRAM -->
  {#each chips as c (c)}
    <g
      class="vram"
      onpointerenter={(e) => hoverCard(chipCard(c), e)}
      onpointermove={(e) => hoverCard(chipCard(c), e)}
      onpointerleave={hoverOut}
      onclick={(e) => {
        e.stopPropagation();
        onvram?.(c);
      }}
    >
      <rect x={chipX(c)} y={chipY(c)} width={CHIP_W} height={CHIP_H} rx="2" class="part" />
      <rect x={chipX(c) + 1} y={chipY(c) + 1} width={CHIP_W - 2} height={CHIP_H - 8} rx="1.5" fill={chipFill(c)} class="tint" />
      {#if labels}
        <text x={chipX(c) + CHIP_W / 2} y={chipY(c) + 14} text-anchor="middle" class="ct">2 GB</text>
      {/if}
      <rect x={chipX(c) + 1} y={chipY(c) + CHIP_H - 6} width={(CHIP_W - 2) * Math.min(1, g?.chipUsage[c] ?? 0)} height="5" rx="1" class="usage" />
    </g>
  {/each}

  <!-- GPU die -->
  <g
    class="die"
    onpointerenter={(e) => hoverCard(dieCard(), e)}
    onpointerleave={hoverOut}
    onclick={(e) => {
      e.stopPropagation();
      ondie?.();
    }}
  >
    <rect x={DIE.x - 4} y={DIE.y - 4} width={DIE.w + 8} height={DIE.h + 8} rx="5" class="substrate" />
    <rect
      x={DIE.x}
      y={DIE.y}
      width={DIE.w}
      height={DIE.h}
      rx="3"
      class="die-body"
      onpointermove={(e) => hoverCard(dieCard(), e)}
    />
    {#each engines as e (e)}
      <rect x={blkX(e)} y={blkY(e)} width="27.3" height="27.3" rx="1.5" class="engine" />
    {/each}
    {#each units as i (i)}
      {@const p = unitPos(i)}
      <rect x={p.x} y={p.y} width={CELL} height={CELL} rx="1" fill={unitFill(i)} onpointerenter={(e) => hoverCard(unitCard(i), e)} />
    {/each}
  </g>

  <!-- edge connector: PCIe x16 with its key notch -->
  {#each fingers as i (i)}
    {#if i < 30 || i > 33}
      <rect x={150 + i * 8} y="358" width="5" height={i % 7 === 3 ? 15 : 24} class="gold" />
    {/if}
  {/each}
  {#if labels}
    <text x="390" y="352" text-anchor="middle" class="lbl2">GPU DIE · {GPU_UNITS} units</text>
    <text x="60" y="352" class="lbl2">VRAM {mib(g?.vramUsedMiB ?? 0)} / {mib(g?.vramTotalMiB ?? 0)} · {vramPct.toFixed(0)} %</text>
    <text x="390" y="402" text-anchor="middle" class="lbl2">PCIe 5.0 ×16</text>
  {/if}
</svg>

<style>
  .gpu {
    overflow: visible;
  }
  .pcb {
    fill: var(--dimm-pcb);
    stroke: var(--dimm-line);
    stroke-width: 1.4;
  }
  .part {
    fill: var(--dimm-chip);
    stroke: var(--dimm-chip-line);
    stroke-width: 1;
  }
  .port {
    fill: var(--panel2);
    stroke: var(--line2);
    stroke-width: 0.8;
  }
  .pin {
    fill: var(--dimm-gold);
  }
  .shroud {
    fill: var(--panel);
    stroke: var(--line2);
    stroke-width: 1.4;
  }
  .ring {
    fill: var(--panel2);
    stroke: var(--line2);
    stroke-width: 1.4;
  }
  .hub {
    fill: var(--panel);
    stroke: var(--line2);
    stroke-width: 1;
  }
  .blade {
    stroke: var(--ink3);
    stroke-width: 1.4;
    stroke-linecap: round;
  }
  .blades {
    transform-box: fill-box;
    transform-origin: center;
    animation: gpu-fan-spin var(--period, 4s) linear infinite;
  }
  @keyframes gpu-fan-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .blades {
      animation: none;
    }
  }
  .guide {
    stroke: var(--line2);
    stroke-dasharray: 3 4;
    stroke-width: 1;
  }
  .substrate {
    fill: var(--cpu-sub);
    stroke: var(--cpu-line);
    stroke-width: 1.4;
  }
  .die-body {
    fill: var(--cpu-die);
    stroke: var(--cpu-line);
    stroke-width: 1.2;
  }
  .engine {
    fill: none;
    stroke: var(--cpu-line);
    stroke-width: 0.8;
    pointer-events: none;
  }
  .tint {
    opacity: 0.62;
  }
  .usage {
    fill: var(--c-pagefile);
  }
  .gold {
    fill: var(--dimm-gold);
  }
  .ct {
    font: 600 7px var(--font-mono);
    fill: #fff;
    paint-order: stroke;
    stroke: rgba(0, 0, 0, 0.6);
    stroke-width: 2px;
    pointer-events: none;
  }
  .lbl {
    font: 600 10px var(--font-mono);
    fill: var(--ink2);
    letter-spacing: 0.08em;
    pointer-events: none;
  }
  .lbl2 {
    font: 400 9px var(--font-ui);
    fill: var(--ink3);
    pointer-events: none;
  }
  .gpu:not(.passive) .die,
  .gpu:not(.passive) .vram {
    cursor: pointer;
  }
  .gpu:not(.passive) .pcb {
    cursor: pointer;
  }
</style>
