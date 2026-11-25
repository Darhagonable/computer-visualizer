/**
 * UX C · Task Manager — vocabulary that is local to this paradigm:
 *
 *   · the resource catalogue (what the master list offers),
 *   · "mock sensors": deterministic series for hardware the store does not model,
 *   · Task Manager style number formatting (GB / MB, D:HH:MM:SS),
 *   · the line-art glyphs the shared icon set does not carry.
 *
 * Nothing here writes to the shared store.
 */
import { app, getMachine, HIST_MAX } from '../../mock/store.svelte';
import { hash32, mulberry32 } from '../../mock/rng';

export type Page = 'processes' | 'performance';
export type ResId = 'cpu' | 'memory' | 'disk' | 'ethernet' | 'gpu';
/** Resources without a model in the mock — drawn from a local sensor instead. */
export type MockId = Extract<ResId, 'disk' | 'ethernet' | 'gpu'>;

export interface ResMeta {
  id: ResId;
  label: string;
  icon: string;
  /** CSS colour of the graph, the tile and the sparkline. */
  color: string;
  /** Unit of the big number in the header. */
  unit: string;
  mock: boolean;
}

export const RESOURCES: ResMeta[] = [
  { id: 'cpu', label: 'CPU', icon: 'cpu', color: 'var(--accent)', unit: '%', mock: false },
  { id: 'memory', label: 'Memory', icon: 'memory', color: 'var(--c-private)', unit: '%', mock: false },
  { id: 'disk', label: 'Disk 0 (C:)', icon: 'disk', color: 'var(--c-file)', unit: '%', mock: true },
  { id: 'ethernet', label: 'Ethernet', icon: 'ethernet', color: 'var(--c-kernel)', unit: 'Mbps', mock: true },
  { id: 'gpu', label: 'GPU 0', icon: 'gpu', color: 'var(--c-pagefile)', unit: '%', mock: true },
];

export const isResId = (x: string | null | undefined): x is ResId => RESOURCES.some((r) => r.id === x);

/** Status-bar hint per view; the three mock sensors share `mock`. */
export const HINTS: Record<'processes' | 'cpu' | 'memory' | 'mock', string> = {
  processes: 'Select a process to see its memory composition · click a column header to sort',
  cpu: 'Hover a core on the package for its temperature and clock',
  memory: 'Scroll to zoom · drag to pan · hover a block for page details',
  mock: 'Mock sensor · generated locally, nothing is measured',
};

// ---- formatting --------------------------------------------------------------

/** `[number, unit]` for an amount given in MiB, in the units Task Manager uses. */
export function bytesParts(mib: number): [string, string] {
  if (!Number.isFinite(mib) || mib <= 0) return ['0', 'MB'];
  if (mib < 1) return [String(Math.round(mib * 1024)), 'KB'];
  if (mib < 1024) return [mib < 100 ? mib.toFixed(1) : String(Math.round(mib)), 'MB'];
  const g = mib / 1024;
  return [g < 10 ? g.toFixed(2) : g < 100 ? g.toFixed(1) : String(Math.round(g)), 'GB'];
}
export const fmtBytes = (mib: number): string => bytesParts(mib).join(' ');

/** A rate given in the small unit (KB/s or Kbps). */
export function fmtRate(k: number, kind: 'disk' | 'net'): string {
  const u = kind === 'disk' ? 'B/s' : 'bps';
  if (k < 1000) return `${Math.round(k)} K${u}`;
  if (k < 1e6) return `${(k / 1000).toFixed(1)} M${u}`;
  return `${(k / 1e6).toFixed(2)} G${u}`;
}

/** `D:HH:MM:SS`, the way Task Manager prints Up time. */
export function fmtUptime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${Math.floor(s / 86400)}:${p(Math.floor((s % 86400) / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

export function fmtHz(tickMs: number): string {
  const hz = 1000 / tickMs;
  return Number.isInteger(hz) ? String(hz) : hz.toFixed(1);
}

const NICE = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
/** Smallest "round" ceiling that fits the window — keeps a throughput graph readable. */
export function niceMax(values: number[], min = 100): number {
  const peak = values.reduce((a, v) => Math.max(a, v), 0) * 1.15;
  return NICE.find((n) => n >= peak && n >= min) ?? NICE[NICE.length - 1];
}

// ---- mock sensors -------------------------------------------------------------

/** Samples that make up 60 s at the current tick rate (same ring as `app.hist`). */
export function windowSize(): number {
  return Math.max(2, Math.min(HIST_MAX, Math.round(60000 / app.tickMs)));
}

interface SensorCfg {
  seed: number;
  /** Resting level. */
  base: number;
  /** Noise per tick. */
  vol: number;
  max: number;
  /** `[chance per tick, low, high]` of a burst, and how many ticks it is held. */
  spike?: [number, number, number];
  hold?: number;
}

const SENSORS: Record<MockId, SensorCfg> = {
  disk: { seed: 0x0d15, base: 4, vol: 5, max: 100, spike: [0.07, 28, 100], hold: 2 },
  ethernet: { seed: 0x2747, base: 52, vol: 26, max: 1000, spike: [0.05, 160, 640], hold: 3 },
  gpu: { seed: 0x6c70, base: 21, vol: 8, max: 100, spike: [0.035, 52, 97], hold: 5 },
};

interface Gen {
  vals: number[];
  rng: () => number;
  v: number;
  spikeLeft: number;
}
const gens = new Map<string, Gen>();

/**
 * A mean-reverting walk with occasional bursts. A pure function of
 * (sensor, machine seed, tick): the same moment always shows the same numbers.
 */
export function mockSeries(id: MockId, tick: number, n: number): number[] {
  const c = SENSORS[id];
  const key = `${id}|${getMachine().seed}`;
  let g = gens.get(key);
  if (!g) {
    g = { vals: [], rng: mulberry32(hash32(c.seed, getMachine().seed)), v: c.base, spikeLeft: 0 };
    gens.set(key, g);
  }
  while (g.vals.length <= tick) {
    if (g.spikeLeft > 0) {
      g.spikeLeft--;
    } else {
      g.v += (c.base - g.v) * 0.14 + (g.rng() - 0.5) * c.vol;
      if (c.spike && g.rng() < c.spike[0]) {
        g.v = c.spike[1] + g.rng() * (c.spike[2] - c.spike[1]);
        g.spikeLeft = c.hold ?? 3;
      }
    }
    g.vals.push(Math.max(0, Math.min(c.max, g.v)));
  }
  return g.vals.slice(Math.max(0, tick + 1 - n), tick + 1);
}

/** Splits a rate into two directions (read / write, send / receive) — deterministic in the tick. */
export function split(value: number, t: number, a: number, b: number): [number, number] {
  const k = 0.5 + 0.22 * Math.sin(t * 0.05 + a) + 0.08 * Math.sin(t * 0.31 + b);
  return [value * k, value * (1 - k)];
}

/**
 * Per-process disk / network activity for the Processes table. Deterministic from
 * (process, 2 s bucket); most processes are idle most of the time, like on a real machine.
 * Returns KB/s (disk) or Kbps (network), 0 = idle.
 */
export function mockIo(id: number, weight: number, t: number, kind: 'disk' | 'net'): number {
  const bucket = Math.floor(t / 4);
  const salt = kind === 'disk' ? 0x15 : 0x3c;
  const gate = hash32(id * 2654435761, bucket ^ salt) / 4294967296;
  if (gate > 0.1 + Math.min(0.32, weight * 0.035)) return 0;
  const mag = hash32(bucket + 101, id ^ (salt * 7919)) / 4294967296;
  return Math.round(48 + mag * mag * weight * 1400);
}

/** Handle count: the mock has processes and threads, but no handles — so this is a stable stand-in. */
export function mockHandles(threads: number, seed: number, t: number): number {
  return threads * 38 + (hash32(seed, t >> 4) % 997);
}

// ---- line-art glyphs ----------------------------------------------------------

/** 24 × 24 stroke paths in the style of `scene/Icon.svelte` (1.6 stroke, round caps). */
export const GLYPHS: Record<string, string> = {
  menu: 'M4 6.5h16M4 12h16M4 17.5h16',
  processes: 'M5.5 4.5h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2zM3.5 9.5h17M9.5 9.5v10',
  performance: 'M4.5 4v14.5a1 1 0 0 0 1 1H20M7.5 15l3.5-4.5 3 2.5 4.5-6',
  history: 'M12 5.3a7.2 7.2 0 1 0 0 14.4 7.2 7.2 0 0 0 0-14.4zM12 8.6v4.1l2.8 1.7M4 4.2v4.2h4.2',
  startup: 'M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15M12 15.5V4.5M7.5 9 12 4.5 16.5 9',
  users:
    'M9 4.5a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5zM3.25 19.75c0-3.3 2.58-5.5 5.75-5.5s5.75 2.2 5.75 5.5M16.25 4.75a3.25 3.25 0 0 1 0 6.1M18 14.5c1.75.75 2.75 2.35 2.75 4.5',
  details: 'M9 6h11.5M9 12h11.5M9 18h11.5M4.25 6h.01M4.25 12h.01M4.25 18h.01',
  services:
    'M18.73 10.07L21.09 10.56L21.09 13.44L18.73 13.93L18.12 15.39L19.44 17.41L17.41 19.44L15.39 18.12L13.93 18.73L13.44 21.09L10.56 21.09L10.07 18.73L8.61 18.12L6.59 19.44L4.56 17.41L5.88 15.39L5.27 13.93L2.91 13.44L2.91 10.56L5.27 10.07L5.88 8.61L4.56 6.59L6.59 4.56L8.61 5.88L10.07 5.27L10.56 2.91L13.44 2.91L13.93 5.27L15.39 5.88L17.41 4.56L19.44 6.59L18.12 8.61ZM12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z',
  disk: 'M5 4.5h14A1.5 1.5 0 0 1 20.5 6v3.5A1.5 1.5 0 0 1 19 11H5A1.5 1.5 0 0 1 3.5 9.5V6A1.5 1.5 0 0 1 5 4.5zM5 13h14a1.5 1.5 0 0 1 1.5 1.5V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18v-3.5A1.5 1.5 0 0 1 5 13zM7 8h.01M7 16.25h.01',
  ethernet:
    'M12 3a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM12 8v4.5M5.5 15.5V13a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v2.5M5.5 15.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM18.5 15.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  gpu: 'M4 5.5h16A1.5 1.5 0 0 1 21.5 7v8a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 15V7A1.5 1.5 0 0 1 4 5.5zM14.5 7.75a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 0 0 0-5.5zM5.75 8.5h3.5v3.5h-3.5zM4.5 16.5v3M19.5 16.5v3M2.5 19.5h19',
  chevronUp: 'M5 15l7-7 7 7',
  chevronDown: 'M5 9l7 7 7-7',
};

/** One stat cell of the two-column grid at the bottom of the detail pane. */
export interface StatCell {
  label: string;
  value: string;
  unit?: string;
  /** Tooltip text. */
  note?: string;
  /** The mock has no model for this — flagged next to the value. */
  mock?: boolean;
}
export const EMPTY_CELL: StatCell = { label: '', value: '' };
export const dash = (label: string): StatCell => ({ label, value: '—', note: 'Not in the mock' });
