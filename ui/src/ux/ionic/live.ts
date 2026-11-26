/**
 * Ionic-local readouts over the mock telemetry:
 *
 *   · the overlay values each level colours by — the *same formulas* the shared scenes use
 *     (they keep them to themselves), so a unit on the big GPU die matches that unit on the card;
 *   · tooltip rows that always carry the truth word (measured / estimated / modelled) of the
 *     value they show — the words come straight from mock/telemetry.ts, never reworded;
 *   · the one number the top bar shows per component.
 *
 * Nothing here is a second model: every number is read from the store or derived exactly the
 * way the scene that shows it derives it.
 */
import { MODE_META, TRUTH, TRUTH_LABEL, DOMAIN, GPU_UNITS, GPU_UNITS_PER_ENGINE, VRAM_CHIPS, VRAM_CHIP_MIB, cellValue } from '../../mock/telemetry';
import type { Component, Mode, Overlay, Tele, GpuLive, Truth } from '../../mock/telemetry';
import { CELLS_PER_CHIP } from '../../mock/model';
import type { CpuLive, CoreLive, Machine, Stats } from '../../mock/model';
import type { HoverRow } from '../../mock/store.svelte';
import { hash32 } from '../../mock/rng';
import { rampColor, rangeFor } from '../../scene/paint.svelte';

export type Domain = [number, number];

export const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

/** What a component's colours encode under a mode. "Pages" means nothing outside memory, where the scenes fall back to temperature. */
export const overlayOf = (mode: Mode, c: Component): Overlay | null => (mode === 'pages' ? (c === 'memory' ? null : 'temperature') : mode);

export const truthOf = (ov: Overlay, c: Component): Truth => TRUTH[ov][c];

/** Colour of an overlay value on its ramp; `domain` overrides the component's range (a unit is not a board). */
export function overlayColor(ov: Overlay, c: Component, value: number, domain?: Domain): string {
  const [lo, hi] = domain ?? rangeFor(ov, c);
  return rampColor(ov, (value - lo) / (hi - lo));
}

export const fmt = (v: number, d = 0) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

// ---- tooltip rows ----------------------------------------------------------------------

/** One value with its truth word: `≈ 71.2 °C` / "modelled · spread across the die". */
export function truthRow(ov: Overlay, c: Component, value: number, why?: string, domain?: Domain): HoverRow[] {
  const truth = TRUTH[ov][c];
  const approx = truth === 'measured' ? '' : '≈ ';
  const hi = (domain ?? rangeFor(ov, c))[1];
  let text: string;
  if (ov === 'temperature') text = `${fmt(value, 1)} °C`;
  else if (ov === 'activity') text = `${fmt(value)} %`;
  else text = `${fmt(value, hi <= 10 ? 2 : 0)} W`; // a unit's watts want decimals, a board's do not
  return [
    { k: MODE_META[ov].label.toLowerCase(), v: `${approx}${text}`, mono: true },
    { k: '', v: `${TRUTH_LABEL[truth]}${why ? ` · ${why}` : ''}`, dim: true },
  ];
}

/** A reading that is not the overlay (a core's clock, a thread's load…), labelled with its own truth. */
export const labelled = (k: string, v: string, truth: Truth, mono = true): HoverRow[] => [
  { k, v, mono },
  { k: '', v: TRUTH_LABEL[truth], dim: true },
];

// ---- memory ----------------------------------------------------------------------------

/**
 * The overlay value of one *fine* cell of a zoomed grid. Everything below board zoom comes
 * from the cell's parent block (the telemetry has block granularity). This is the shared
 * model (mock/telemetry.ts — `cellValue`), the same one the board and the tooltips use, so
 * zoomed grids, tiles and legends cannot drift apart.
 */
export function blockValue(ov: Overlay, tele: Tele, chip: number, block: number, salt: number): number {
  return cellValue(ov, tele, chip, block, salt);
}

/** Tooltip rows for that value, with the truth word and where the number comes from. */
export function blockRows(ov: Overlay, tele: Tele, chip: number, block: number, value: number): HoverRow[] {
  const why =
    ov === 'temperature'
      ? `module sensor ${fmt(tele.dimmTemp[chip >> 4], 1)} °C + activity`
      : ov === 'activity'
        ? `page heat of block ${block}`
        : 'DIMMs have no power sensor';
  return truthRow(ov, 'memory', value, why);
}

export interface Heat {
  /** Mean modelled page heat, 0–1. */
  mean: number;
  /** Highest modelled page heat, 0–1 … */
  max: number;
  /** … and where it was seen: a board block of `atChip`. */
  at: number;
  atChip: number;
}

/** Modelled page heat over a range of board blocks of one chip (by default the whole chip). */
export function chipHeat(tele: Tele, chip: number, lo = 0, hi = CELLS_PER_CHIP): Heat {
  let sum = 0;
  let max = 0;
  let at = lo;
  for (let p = lo; p < hi; p++) {
    const h = tele.heat[(chip << 8) | p];
    sum += h;
    if (h > max) {
      max = h;
      at = p;
    }
  }
  return { mean: sum / Math.max(1, hi - lo) / 255, max: max / 255, at, atChip: chip };
}

/** Modelled page heat over a set of chips (a module, the whole memory). */
export function chipsHeat(tele: Tele, chips: number[]): Heat {
  const out: Heat = { mean: 0, max: 0, at: 0, atChip: chips[0] ?? 0 };
  for (const chip of chips) {
    const h = chipHeat(tele, chip);
    out.mean += h.mean;
    if (h.max > out.max) {
      out.max = h.max;
      out.at = h.at;
      out.atChip = chip;
    }
  }
  out.mean /= Math.max(1, chips.length);
  return out;
}

/** The same power estimate the grids colour by (0.9 + heat × 3.1), so tiles and legend agree. */
export const heatWatts = (heat: number) => 0.9 + heat * 3.1;

/** The module with the warmest sensor reading. */
export function warmestDimm(tele: Tele, m: Machine): { dimm: number; temp: number } {
  let dimm = 0;
  let temp = -Infinity;
  m.dimms.forEach((d) => {
    const t = tele.dimmTemp[d.index] ?? 0;
    if (t > temp) {
      temp = t;
      dimm = d.index;
    }
  });
  return { dimm, temp: temp === -Infinity ? 0 : temp };
}

/** Chips of one module, in board order. */
export const chipsOf = (m: Machine, dimm: number) => m.dimms[dimm]?.chips.map((c) => c.index) ?? [];
export const allChips = (m: Machine) => m.chips.map((c) => c.index);

// ---- cpu -------------------------------------------------------------------------------

export const hottestCore = (cpu: CpuLive | null): CoreLive | null =>
  cpu ? cpu.cores.reduce<CoreLive | null>((a, c) => (!a || c.temp > a.temp ? c : a), null) : null;

export const ccdCores = (cpu: CpuLive | null, ccd: number): CoreLive[] => (cpu ? cpu.cores.filter((c) => c.ccd === ccd) : []);

/** What a core's colour encodes: its temperature, its load, or its estimated watts. */
export function coreValue(ov: Overlay, tele: Tele | null, c: CoreLive): number {
  return ov === 'activity' ? c.load : ov === 'power' ? (tele?.corePower[c.index] ?? 0) : c.temp;
}

/** Load of one SMT thread of a core, in %. */
export const threadLoad = (tele: Tele | null, core: number, half: number) => tele?.threadLoad[2 * core + half] ?? 0;

export const avgClock = (cores: CoreLive[]) => (cores.length ? cores.reduce((s, c) => s + c.freq, 0) / cores.length : 0);
export const ccdPower = (tele: Tele | null, cores: CoreLive[]) => cores.reduce((s, c) => s + (tele?.corePower[c.index] ?? 0), 0);

// ---- gpu -------------------------------------------------------------------------------
// Mirrors of scene/GpuCard.svelte's private helpers.

export const engineOf = (i: number) => Math.floor(i / GPU_UNITS_PER_ENGINE);
export const unitInEngine = (i: number) => i % GPU_UNITS_PER_ENGINE;

/** 0.5 at the edge of the die → 1 at its centre: silicon towards the middle runs warmer. */
export function unitCentre(i: number): number {
  const e = engineOf(i);
  const u = unitInEngine(i);
  const cx = ((e % 3) + ((u & 3) + 0.5) / 4) / 2.5 - 0.5;
  const cy = (Math.floor(e / 3) + ((u >> 2) + 0.5) / 4) / 1.5 - 0.5;
  return 1 - Math.min(1, Math.hypot(cx, cy) / 0.5) * 0.5;
}

/** A unit or a VRAM chip is a small part of the board, so "power" needs its own range. */
export const UNIT_POWER: Domain = [0, 6];
export const CHIP_POWER: Domain = [0, 5];
export const unitDomain = (ov: Overlay): Domain => (ov === 'power' ? UNIT_POWER : DOMAIN[ov].gpu);
export const chipDomain = (ov: Overlay): Domain => (ov === 'power' ? CHIP_POWER : DOMAIN[ov].gpu);

export function unitSum(g: GpuLive): number {
  let s = 0;
  for (const v of g.unitLoad) s += v;
  return s;
}
export const unitTemp = (g: GpuLive, i: number) => g.temp + 16 * unitCentre(i) * (g.engines['3d'] / 100) + g.unitLoad[i] * 3;
export const unitLoadPct = (g: GpuLive, i: number) => g.unitLoad[i] * 100;
export const unitPower = (g: GpuLive, i: number, sum: number) =>
  g.power * (0.5 * (sum > 0 ? g.unitLoad[i] / sum : 1 / GPU_UNITS) + 0.5 / GPU_UNITS);

export function unitValue(ov: Overlay, g: GpuLive, i: number, sum: number): number {
  return ov === 'activity' ? unitLoadPct(g, i) : ov === 'power' ? unitPower(g, i, sum) : unitTemp(g, i);
}

/** Which part of an overlay is not measured, per overlay — the reason behind the truth word. */
export const GPU_WHY = {
  temperature: 'spread across the die',
  activity: 'which units are busy',
  power: 'split of the board power',
} as const satisfies Record<Overlay, string>;

const chipJit = (c: number) => ((c * 37) % 5) - 2; // deterministic ±2, so chips differ
export const chipTemp = (g: GpuLive, c: number) => g.vramTemp + chipJit(c);
export const chipBusy = (g: GpuLive, c: number) => Math.min(100, g.engines.copy * 6 + (g.engines['3d'] / 100) * 55 + chipJit(c) * 2);
export const chipPower = (g: GpuLive, c: number) => ((14 + g.engines['3d'] * 0.06) * (0.5 + g.chipUsage[c])) / VRAM_CHIPS;
export function chipValue(ov: Overlay, g: GpuLive, c: number): number {
  return ov === 'activity' ? chipBusy(g, c) : ov === 'power' ? chipPower(g, c) : chipTemp(g, c);
}
export const CHIP_WHY = {
  temperature: 'VRAM sensor reading, spread per chip',
  activity: 'how busy the memory bus is',
  power: 'split of the board power',
} as const satisfies Record<Overlay, string>;

export const mib = (v: number) => `${fmt(Math.round(v))} MiB`;

/** MiB the driver and desktop composition keep on every chip (the mock adds it outside the process list). */
export const GPU_OVERHEAD = (g: GpuLive) => Math.max(0, g.vramUsedMiB - g.procs.reduce((s, p) => s + p.mib, 0));

export interface Slice {
  /** Index into `gpu.procs`, or −1 for the driver / desktop overhead. */
  proc: number;
  mib: number;
}

/**
 * Which process (is modelled to) sit on a VRAM chip. The telemetry stripes every process
 * over the chips by a fixed hash; this reads the same hash back, so the slices add up to the
 * chip's usage bar. MODELLED — no OS exposes VRAM placement.
 */
export function chipSlices(g: GpuLive, c: number): Slice[] {
  const out: Slice[] = [];
  g.procs.forEach((p, pi) => {
    let n = 0;
    for (let k = 0; k < 16; k++) if (hash32(pi, k) % VRAM_CHIPS === c) n++;
    if (n) out.push({ proc: pi, mib: (n * p.mib) / 16 });
  });
  const over = GPU_OVERHEAD(g) / VRAM_CHIPS;
  if (over > 0.5) out.push({ proc: -1, mib: over });
  return out;
}

// ---- the number in the top bar -----------------------------------------------------------

export interface Vital {
  id: Component;
  /** Ring fill, 0–100. */
  pct: number;
  big: string;
  unit: string;
  cap: string;
  title: string;
  color: string;
}

/**
 * The headline number of a component under a mode. Memory keeps "in use" wherever it has no
 * sensor for the mode's quantity (power); the ring takes the mode's ramp at its own fill.
 */
export function vitalOf(c: Component, mode: Mode, cpu: CpuLive | null, tele: Tele | null, st: Stats | null, m: Machine): Vital {
  const ov = overlayOf(mode, c);
  const at = (pct: number) => (ov ? rampColor(ov, clamp01(pct / 100)) : 'var(--accent)');
  if (c === 'cpu') {
    const hot = hottestCore(cpu);
    const load = cpu?.avgLoad ?? 0;
    if (ov === 'temperature') {
      const t = hot?.temp ?? 0;
      const pct = clamp01((t - DOMAIN.temperature.cpu[0]) / (DOMAIN.temperature.cpu[1] - DOMAIN.temperature.cpu[0])) * 100;
      return { id: c, pct, big: fmt(t), unit: '°C', cap: 'hottest core', title: `Core ${hot ? hot.index + 1 : 1} · load ${fmt(load)} % · ${fmt(cpu?.power ?? 0)} W`, color: at(pct) };
    }
    if (ov === 'power') {
      const p = cpu?.power ?? 0;
      const pct = clamp01(p / 120) * 100;
      return { id: c, pct, big: fmt(p), unit: 'W', cap: 'package', title: `load ${fmt(load)} % · hottest core ${fmt(hot?.temp ?? 0)} °C`, color: at(pct) };
    }
    return { id: c, pct: clamp01(load / 100) * 100, big: fmt(load), unit: '%', cap: 'cpu load', title: `hottest core ${fmt(hot?.temp ?? 0)} °C · ${fmt(cpu?.power ?? 0)} W package`, color: at(load) };
  }
  if (c === 'gpu') {
    const g = tele?.gpu ?? null;
    const l3 = g?.engines['3d'] ?? 0;
    if (ov === 'temperature') {
      const t = g?.temp ?? 0;
      const pct = clamp01((t - DOMAIN.temperature.gpu[0]) / (DOMAIN.temperature.gpu[1] - DOMAIN.temperature.gpu[0])) * 100;
      return { id: c, pct, big: fmt(t), unit: '°C', cap: 'gpu', title: `hotspot ${fmt(g?.hotspot ?? 0)} °C · 3D ${fmt(l3)} % · ${fmt(g?.power ?? 0)} W`, color: at(pct) };
    }
    if (ov === 'power') {
      const p = g?.power ?? 0;
      const lim = g?.powerLimit ?? 1;
      const pct = clamp01(p / lim) * 100;
      return { id: c, pct, big: fmt(p), unit: 'W', cap: `of ${fmt(lim)} W`, title: `3D ${fmt(l3)} % · ${fmt(g?.temp ?? 0)} °C`, color: at(pct) };
    }
    return { id: c, pct: clamp01(l3 / 100) * 100, big: fmt(l3), unit: '%', cap: '3D load', title: `${fmt(g?.temp ?? 0)} °C · ${fmt(g?.power ?? 0)} W`, color: at(l3) };
  }
  // memory
  const use = st ? (st.inUse / st.total) * 100 : 0;
  const [tlo, thi] = DOMAIN.temperature.memory;
  if (ov === 'temperature' && tele) {
    const w = warmestDimm(tele, m);
    const pct = clamp01((w.temp - tlo) / (thi - tlo)) * 100;
    const label = m.slots[m.dimms[w.dimm]?.slot ?? 0]?.label ?? '';
    return { id: c, pct, big: fmt(w.temp, 1), unit: '°C', cap: 'warmest module', title: label, color: at(pct) };
  }
  const giB = st ? st.total * 4 / 1024 : 0; // blocks of 4 MiB
  return { id: c, pct: clamp01(use / 100) * 100, big: fmt(use), unit: '%', cap: 'in use', title: st ? `of ${fmt(giB)} GiB` : '', color: at(use) };
}

export { VRAM_CHIPS, VRAM_CHIP_MIB };
