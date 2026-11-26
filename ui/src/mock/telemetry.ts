/**
 * Mock telemetry for the overlays. These are NOT page data (see docs/ram-model.md) — they are
 * the physical quantities docs/VISION.md wants on the delidded views.
 *
 * Everything here is synthetic, but each value is shaped like what the real provider will be
 * able to deliver, and carries the honesty label the UI must show where reality is limited:
 *
 *   memory temperature   one sensor per DIMM (DDR5 SPD hub) is REAL; per-die values are ESTIMATED
 *   memory activity      per-page access is not exposed by Windows → here: modelled "page heat"
 *   memory power         consumer DIMMs have no power sensor → ESTIMATED
 *   cpu temperature      per core, REAL (driver-assisted on Windows)
 *   cpu activity         per thread, REAL
 *   cpu power            package is REAL (RAPL / SMN); per core is ESTIMATED
 *   gpu                  temperature, power, per-engine load, per-process VRAM are REAL;
 *                        the die-level distribution and the VRAM chip placement are MODELLED
 */
import { hash32, mulberry32, type Rng } from './rng';
import type { Machine, Stats } from './model';
import type { Sim } from './sim';

export type Component = 'memory' | 'cpu' | 'gpu';
export type Mode = 'pages' | 'temperature' | 'activity' | 'power';
export type Overlay = Exclude<Mode, 'pages'>;

export const MODES: Mode[] = ['pages', 'temperature', 'activity', 'power'];

export const MODE_META: Record<Mode, { label: string; unit: string; hint: string }> = {
  pages: { label: 'Pages', unit: '', hint: 'What each page is for and whether it is live' },
  temperature: { label: 'Temperature', unit: '°C', hint: 'How warm each unit is' },
  activity: { label: 'Activity', unit: '%', hint: 'How busy each unit is right now' },
  power: { label: 'Power', unit: 'W', hint: 'How much power each unit draws' },
};

/** "Pages" is page data — it only exists for system memory. */
export const modeApplies = (mode: Mode, c: Component) => mode !== 'pages' || c === 'memory';

/** Value ranges that map onto the colour ramps. */
export const DOMAIN: Record<Overlay, Record<Component, [number, number]>> = {
  temperature: { memory: [30, 85], cpu: [30, 100], gpu: [30, 100] },
  activity: { memory: [0, 100], cpu: [0, 100], gpu: [0, 100] },
  power: { memory: [0, 6], cpu: [0, 10], gpu: [0, 450] },
};

/** Where each component starts to throttle — the marker on the temperature scale. */
export const THROTTLE: Record<Component, number> = { memory: 85, cpu: 95, gpu: 95 };

/** How honest a number is. The UI must show this next to the value. */
export type Truth = 'measured' | 'estimated' | 'modelled' | 'unavailable';

export const TRUTH_LABEL: Record<Truth, string> = {
  measured: 'measured',
  estimated: 'estimated',
  modelled: 'modelled',
  unavailable: 'not available',
};

/** Truth of each overlay per component (the matrix in docs/VISION.md). */
export const TRUTH: Record<Overlay, Record<Component, Truth>> = {
  temperature: { memory: 'estimated', cpu: 'measured', gpu: 'modelled' },
  activity: { memory: 'modelled', cpu: 'measured', gpu: 'modelled' },
  power: { memory: 'estimated', cpu: 'estimated', gpu: 'estimated' },
};

/** Why it isn't measured, for tooltips. */
export const TRUTH_NOTE: Record<Overlay, Record<Component, string>> = {
  temperature: {
    memory: 'One temperature sensor per DDR5 module. Per-die values are spread out from it.',
    cpu: 'Digital thermal sensor of each core.',
    gpu: 'GPU, hotspot and VRAM temperatures are sensor readings; the spread across the die is modelled.',
  },
  activity: {
    memory: 'Windows does not expose per-page access frequency. This heat is modelled from page churn.',
    cpu: 'Scheduler time per thread.',
    gpu: 'Per-engine utilisation is real; which units of the die are busy is modelled.',
  },
  power: {
    memory: 'Consumer DIMMs have no power sensor. Estimated from activity.',
    cpu: 'Package power is measured (RAPL); the split per core is estimated from load and clock.',
    gpu: 'Board power is measured; the split per unit is estimated.',
  },
};

export const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

// ---- how a memory block's overlay values are derived — THE definition --------------------
// Grids, tiles, legends and tooltips must all call these, never re-derive them.

/** Modelled: the share of a block's page heat carried by one of its finer cells (0–1). Deterministic, so a block always "contains" the same pattern. */
export function cellHeat(tele: Tele, chip: number, block: number, cell = -1): number {
  const parent = tele.heat[(chip << 8) | block] / 255;
  if (cell < 0) return parent;
  const share = 0.2 + ((hash32(block * 131 + chip, cell) & 255) / 255) * 1.6; // 0.2 … 1.8
  return Math.min(1, parent * share);
}

/**
 * Estimated °C of a block (or one of its finer cells): the die's estimate from the module
 * sensor, warmer where pages are working — DRAM power is dominated by activate / precharge
 * activity. It is an estimate: one sensor per module, not one per die.
 */
export function cellTemperature(tele: Tele, chip: number, block: number, cell = -1): number {
  const texture = ((hash32(chip, block * 257 + cell) & 7) - 3.5) * 0.12;
  return tele.dieTemp[chip] + cellHeat(tele, chip, block, cell) * 2.4 + texture;
}

/** Modelled % busy of a block (or cell). */
export const cellActivity = (tele: Tele, chip: number, block: number, cell = -1) => cellHeat(tele, chip, block, cell) * 100;

/** Estimated watts of a block (or cell) — consumer DIMMs have no power sensor. */
export const cellPower = (tele: Tele, chip: number, block: number, cell = -1) => 0.9 + cellHeat(tele, chip, block, cell) * 3.1;

export function cellValue(ov: Overlay, tele: Tele, chip: number, block: number, cell = -1): number {
  return ov === 'temperature' ? cellTemperature(tele, chip, block, cell) : ov === 'activity' ? cellActivity(tele, chip, block, cell) : cellPower(tele, chip, block, cell);
}

/**
 * The span a MEMORY temperature scale should show right now. Module sensors sit in a narrow
 * band, so the full 30–85 °C ramp would paint everything one colour. The scale follows the
 * coolest … warmest die, padded, and is never narrower than 12 °C so that small differences
 * are not dramatised. The throttle point is still stated next to it.
 */
export function memoryTempRange(tele: Tele | null): [number, number] {
  if (!tele || tele.dieTemp.length === 0) return DOMAIN.temperature.memory;
  let lo = Infinity;
  let hi = -Infinity;
  for (const t of tele.dieTemp) {
    if (t < lo) lo = t;
    if (t > hi) hi = t;
  }
  let a = Math.floor(lo - 2.5);
  let b = Math.ceil(hi + 2.5);
  if (b - a < 12) {
    const mid = (a + b) / 2;
    a = Math.floor(mid - 6);
    b = Math.ceil(mid + 6);
  }
  return [a, b];
}

// ---- GPU shape (a generic reference design, mock) --------------------------
export const GPU_ENGINES = 6;
export const GPU_UNITS_PER_ENGINE = 16; // "compute units" per engine → 96 on the die
export const GPU_UNITS = GPU_ENGINES * GPU_UNITS_PER_ENGINE;
export const VRAM_CHIPS = 12;
export const VRAM_CHIP_MIB = 2048;

export interface GpuProc {
  name: string;
  base: number;
  mib: number;
}

export interface GpuLive {
  name: string;
  vramTotalMiB: number;
  vramUsedMiB: number;
  temp: number;
  hotspot: number;
  vramTemp: number;
  fanPct: number;
  fanRpm: number;
  power: number;
  powerLimit: number;
  clockMhz: number;
  memClockMhz: number;
  engines: Record<'3d' | 'copy' | 'decode' | 'encode', number>;
  /** Modelled: 0–1 load of each unit on the die. */
  unitLoad: Float32Array;
  /** Modelled placement: used fraction of each VRAM chip. */
  chipUsage: Float32Array;
  procs: GpuProc[];
}

export interface Tele {
  /** °C — one sensor per DIMM. */
  dimmTemp: number[];
  /** °C — estimated per DRAM die. */
  dieTemp: Float32Array;
  /** 0–255 modelled page heat per block. */
  heat: Uint8Array;
  /** Estimated watts per core. */
  corePower: Float32Array;
  /** Per thread (2 per core). */
  threadLoad: Float32Array;
  gpu: GpuLive;
}

const DIMM_BASE = [41.2, 39.6, 44.8, 40.7]; // the module nearest the socket exhaust runs warmest

export class Telemetry {
  readonly data: Tele;
  private rng: Rng;
  private t = 0;

  constructor(m: Machine, seed: number) {
    this.rng = mulberry32((seed ^ 0x7f4a7c15) >>> 0);
    const procs: GpuProc[] = [
      { name: 'blender.exe', base: 6420, mib: 6420 },
      { name: 'cs2.exe', base: 3180, mib: 3180 },
      { name: 'chrome.exe', base: 1240, mib: 1240 },
      { name: 'firefox.exe', base: 890, mib: 890 },
      { name: 'OBS64.exe', base: 640, mib: 640 },
      { name: 'ms-teams.exe', base: 310, mib: 310 },
      { name: 'Code.exe', base: 220, mib: 220 },
      { name: 'dwm.exe', base: 186, mib: 186 },
    ];
    this.data = {
      dimmTemp: m.dimms.map((_, i) => DIMM_BASE[i % DIMM_BASE.length]),
      dieTemp: new Float32Array(m.chips.length).fill(41),
      heat: new Uint8Array(m.total),
      corePower: new Float32Array(16).fill(4),
      threadLoad: new Float32Array(32),
      gpu: {
        name: 'Mock GPU · 24 GB',
        vramTotalMiB: VRAM_CHIPS * VRAM_CHIP_MIB,
        vramUsedMiB: 0,
        temp: 64,
        hotspot: 81,
        vramTemp: 70,
        fanPct: 42,
        fanRpm: 1260,
        power: 230,
        powerLimit: 320,
        clockMhz: 2550,
        memClockMhz: 1313,
        engines: { '3d': 72, copy: 5, decode: 6, encode: 28 },
        unitLoad: new Float32Array(GPU_UNITS),
        chipUsage: new Float32Array(VRAM_CHIPS),
        procs,
      },
    };
  }

  /** Call once per tick, after the sim and its stats. */
  step(sim: Sim, st: Stats): void {
    this.t++;
    const r = this.rng;
    const d = this.data;
    const walk = (cur: number, base: number, amp: number, k = 0.08) => cur + (base - cur) * k + (r() - 0.5) * amp;

    // ---- memory temperature: module sensors (measured) → per-die estimate ----
    for (let i = 0; i < d.dimmTemp.length; i++) {
      d.dimmTemp[i] = walk(d.dimmTemp[i], DIMM_BASE[i % DIMM_BASE.length], 0.22, 0.03);
    }
    for (const ch of sim.m.chips) {
      const pos = ch.index & 7;
      const centre = 1 - Math.abs(pos - 3.5) / 3.5; // edge dies shed a little more heat
      const target = d.dimmTemp[ch.dimm] + (ch.rank ? 0.9 : 0) + centre * 1.1 + st.chipHot[ch.index] * 2.6;
      d.dieTemp[ch.index] += (target - d.dieTemp[ch.index]) * 0.15;
    }

    // ---- page heat (modelled activity): decays, spikes on change, warmed by touches ----
    const h = d.heat;
    for (let i = 0; i < h.length; i++) h[i] = (h[i] * 242) >> 8;
    for (const p of sim.changes) h[p] = Math.min(255, h[p] + 56);
    const touches = Math.round(h.length * 0.012);
    for (let k = 0; k < touches; k++) {
      const p = (r() * h.length) | 0;
      if ((sim.m.chips[p >> 8].cells[p & 255] & 15) === 4) h[p] = Math.min(255, h[p] + 20 + ((r() * 50) | 0));
    }

    // ---- CPU: per-thread load (measured), per-core power (estimated from the package) ----
    const cores = sim.cpu.cores;
    let dynSum = 0;
    const w: number[] = [];
    for (const c of cores) {
      const v = (c.load / 100) * (c.freq / 5) ** 2;
      w.push(v);
      dynSum += v;
    }
    const idleEach = 0.55;
    const dynamic = Math.max(0, sim.cpu.power - idleEach * cores.length);
    cores.forEach((c, i) => {
      d.corePower[i] = idleEach + (dynSum > 0 ? (dynamic * w[i]) / dynSum : 0);
      const share = 0.5 + (r() - 0.5) * 0.3;
      d.threadLoad[2 * i] = c.load * share;
      d.threadLoad[2 * i + 1] = c.load * (1 - share);
    });

    // ---- GPU ------------------------------------------------------------------------------
    const g = d.gpu;
    g.engines['3d'] = clamp(walk(g.engines['3d'], 72, 6));
    g.engines.copy = clamp(walk(g.engines.copy, 5, 2));
    g.engines.decode = clamp(walk(g.engines.decode, 6, 2));
    g.engines.encode = clamp(walk(g.engines.encode, 28, 3)); // OBS is streaming
    g.temp = walk(g.temp, 60 + g.engines['3d'] * 0.16, 0.3);
    g.hotspot = g.temp + 17 + (r() - 0.5) * 0.4;
    g.vramTemp = g.temp + 6 + (r() - 0.5) * 0.3;
    g.fanPct = clamp(walk(g.fanPct, 28 + (g.temp - 50) * 1.4, 0.6));
    g.fanRpm = Math.round(g.fanPct * 30);
    g.power = clamp(walk(g.power, 70 + g.engines['3d'] * 2.2, 1.5), 0, g.powerLimit * 1.05); // watts, not a percentage
    g.clockMhz = Math.round(2100 + g.engines['3d'] * 6 + (r() - 0.5) * 12);

    let used = 0;
    for (const p of g.procs) {
      p.mib = Math.max(24, walk(p.mib, p.base, p.base * 0.004));
      used += p.mib;
    }
    g.vramUsedMiB = Math.round(used + 410); // driver + desktop composition overhead

    // modelled: each unit trails its shader engine, engines trail the 3D load
    const t3 = g.engines['3d'] / 100;
    for (let e = 0; e < GPU_ENGINES; e++) {
      const bias = 0.55 + 0.45 * ((hash32(e, this.t >> 3) & 255) / 255);
      for (let u = 0; u < GPU_UNITS_PER_ENGINE; u++) {
        const i = e * GPU_UNITS_PER_ENGINE + u;
        const target = t3 * bias * (0.7 + 0.3 * r());
        g.unitLoad[i] += (target - g.unitLoad[i]) * 0.2;
      }
    }
    // modelled placement: every process is striped across the chips by a fixed hash
    g.chipUsage.fill(0);
    for (const [pi, p] of g.procs.entries()) {
      for (let k = 0; k < 16; k++) g.chipUsage[hash32(pi, k) % VRAM_CHIPS] += p.mib / 16 / VRAM_CHIP_MIB;
    }
    for (let c = 0; c < VRAM_CHIPS; c++) g.chipUsage[c] += 410 / VRAM_CHIPS / VRAM_CHIP_MIB;
  }
}
