/**
 * Reactive app state (Svelte 5 runes). The mutable machine + sim live *outside* the
 * `$state` proxy for speed — typed arrays are mutated in place and consumers re-read
 * them when `app.version` changes. Everything a UX needs to render is on `app`.
 */
import { buildMachine } from './machine';
import { Sim, SCENARIO_LABEL, type Scenario } from './sim';
import { STATE_COUNT, CELLS_PER_CHIP, BLOCK_PAGES, PAGE_SIZE, STATE_NAMES, USE_NAMES } from './model';
import type { Machine, Stats, CpuLive, Owner } from './model';
import { hash32 } from './rng';

export type UxId = 'instrument' | 'ionic' | 'taskmgr';
export const UX_ORDER: UxId[] = ['instrument', 'ionic', 'taskmgr'];
export const UX_META: Record<UxId, { name: string; tag: string; keys: string }> = {
  instrument: { name: 'Instrument', tag: 'Cockpit · rail → stage → inspector', keys: 'Ctrl+1' },
  ionic: { name: 'Ionic', tag: 'Hero · physical zoom levels', keys: 'Ctrl+2' },
  taskmgr: { name: 'Task Manager', tag: 'Tabs · master → detail', keys: 'Ctrl+3' },
};

export type Highlight =
  | { kind: 'owner'; id: number }
  | { kind: 'state'; state: number }
  | { kind: 'use'; use: number }
  | { kind: 'family'; family: number }
  | null;

export interface PageDetails {
  where: string;
  state: number;
  use: number;
  owner: Owner;
  pfn: string;
  addr: string;
  size: string;
  priority: number;
  note?: string;
}

export interface HoverInfo {
  x: number;
  y: number;
  d: PageDetails;
}

export const HIST_MAX = 240; // 2 minutes at 2 Hz

export interface AppState {
  ux: UxId;
  running: boolean;
  speed: number;
  tickMs: number;
  /** Bumped every tick. */
  version: number;
  tick: number;
  stats: Stats | null;
  cpu: CpuLive | null;
  hist: { mem: number[]; cached: number[]; cpu: number[]; temp: number[] };
  hover: HoverInfo | null;
  highlight: Highlight;
  /** Per state: shown on the board (legend toggles). */
  visible: boolean[];
  selectedDimm: number | null;
  selectedProcess: number | null;
  selectedFile: number | null;
  /** Blocks owned by the selected process over time. */
  procHist: number[];
  log: string[];
  /** e.g. "Windows x86_64" when running inside the native shell. */
  native: string | null;
  ready: boolean;
}

export const app = $state<AppState>({
  ux: 'instrument',
  running: true,
  speed: 1,
  tickMs: 500,
  version: 0,
  tick: 0,
  stats: null,
  cpu: null,
  hist: { mem: [], cached: [], cpu: [], temp: [] },
  hover: null,
  highlight: null,
  visible: Array.from({ length: STATE_COUNT }, () => true),
  selectedDimm: null,
  selectedProcess: null,
  selectedFile: null,
  procHist: [],
  log: [],
  native: null,
  ready: false,
});

let machine: Machine | null = null;
let sim: Sim | null = null;
let timer: ReturnType<typeof setInterval> | undefined;

export function getMachine(): Machine {
  if (!machine) boot();
  return machine!;
}
export function getSim(): Sim {
  if (!sim) boot();
  return sim!;
}

const hex = (n: number, w: number) => '0x' + n.toString(16).toUpperCase().padStart(w, '0');

/** Details for one board block, in the vocabulary a real provider would report. */
export function boardPage(chipIdx: number, cell: number): PageDetails | null {
  const m = getMachine();
  const ch = m.chips[chipIdx];
  if (!ch) return null;
  const v = ch.cells[cell];
  const pfn = (chipIdx * CELLS_PER_CHIP + cell) * BLOCK_PAGES;
  const owner = m.owners[ch.owners[cell]];
  return {
    where: `${m.slots[m.dimms[ch.dimm].slot].label} · R${ch.rank}·S${ch.sub}·U${(chipIdx & 7) + 1}`,
    state: v & 15,
    use: v >> 4,
    owner,
    pfn: hex(pfn, 8),
    addr: hex(pfn * PAGE_SIZE, 16),
    size: `${(BLOCK_PAGES).toLocaleString('en-US')} pages · 4 MiB`,
    priority: hash32(pfn) & 7,
  };
}

export function stateName(s: number): string {
  return STATE_NAMES[s] ?? `state ${s}`;
}
export function useName(u: number): string {
  return u === 15 ? '—' : (USE_NAMES[u] ?? `use ${u}`);
}

export function hoverPage(d: PageDetails | null, ev?: { clientX: number; clientY: number }): void {
  app.hover = d ? { x: ev?.clientX ?? 0, y: ev?.clientY ?? 0, d } : null;
}

// ---- selection / highlight ------------------------------------------------

export function setHighlight(h: Highlight): void {
  app.highlight = h;
}
export function toggleHighlightOwner(id: number): void {
  app.highlight = app.highlight?.kind === 'owner' && app.highlight.id === id ? null : { kind: 'owner', id };
}
export function selectDimm(i: number | null): void {
  app.selectedDimm = i;
}
export function selectProcess(id: number | null, highlight = true): void {
  app.selectedProcess = id;
  app.selectedFile = null;
  app.procHist = [];
  if (highlight) app.highlight = id === null ? null : { kind: 'owner', id };
}
export function selectFile(id: number | null, highlight = true): void {
  app.selectedFile = id;
  app.selectedProcess = null;
  app.procHist = [];
  if (highlight) app.highlight = id === null ? null : { kind: 'owner', id };
}
export function setStateVisible(state: number, on: boolean): void {
  app.visible[state] = on;
}

// ---- simulation loop -------------------------------------------------------

function step(): void {
  if (!sim) return;
  sim.changes.length = 0;
  sim.tick();
  const st = sim.stats();
  app.version++;
  app.tick = sim.currentTick;
  app.stats = st;
  app.cpu = sim.cpu;
  const h = app.hist;
  h.mem.push((st.inUse / st.total) * 100);
  h.cached.push((st.byState[2] / st.total) * 100);
  h.cpu.push(sim.cpu.avgLoad);
  h.temp.push(sim.cpu.maxTemp);
  for (const k of ['mem', 'cached', 'cpu', 'temp'] as const) if (h[k].length > HIST_MAX) h[k].shift();
  if (app.selectedProcess !== null) {
    const p = st.procs.find((x) => x.id === app.selectedProcess);
    app.procHist.push(p?.blocks ?? 0);
    if (app.procHist.length > HIST_MAX) app.procHist.shift();
  }
}

export function startLoop(): void {
  stopLoop();
  if (app.running) timer = setInterval(step, app.tickMs);
}
export function stopLoop(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
export function toggleRunning(): void {
  app.running = !app.running;
  startLoop();
}
export function setSpeed(s: number): void {
  app.speed = s;
  app.tickMs = 500 / s;
  startLoop();
}

function boot(seedOverride?: number): void {
  const q = new URLSearchParams(location.search);
  const seed = seedOverride ?? (Number(q.get('seed') ?? 7) || 7);
  machine = buildMachine(seed);
  sim = new Sim(machine, seed);
  sim.onlog = (msg) => {
    app.log = [`T+${(sim!.currentTick * 0.5).toFixed(1)}s  ${msg}`, ...app.log].slice(0, 14);
  };
  app.selectedDimm = null;
  app.selectedProcess = null;
  app.selectedFile = null;
  app.highlight = null;
  app.procHist = [];
  app.hist = { mem: [], cached: [], cpu: [], temp: [] };
  app.log = [];
  app.ready = true;
  const pre = Number(q.get('ticks') ?? 0) || 0; // pre-roll for screenshots
  for (let i = 0; i < pre; i++) step();
  step();
}

/** Call once from the root component. */
export function init(): void {
  const q = new URLSearchParams(location.search);
  const fromUrl = q.get('ux') as UxId | null;
  const saved = localStorage.getItem('cv.ux') as UxId | null;
  const ux = fromUrl && fromUrl in UX_META ? fromUrl : saved && saved in UX_META ? saved : 'instrument';
  app.ux = ux;
  if (q.get('paused') === '1') app.running = false;
  boot();
  applyDemo(q.get('demo'));
  startLoop();
}

/** `?demo=` — preset selection states, used for screenshots and quick tours. */
function applyDemo(d: string | null): void {
  if (!d) return;
  const m = getMachine();
  if (d === 'hover') {
    for (const ch of m.chips) {
      const cell = Array.from(ch.cells).findIndex((v) => (v & 15) === 4);
      if (cell >= 0) {
        const pd = boardPage(ch.index, cell);
        if (pd) app.hover = { x: innerWidth * 0.4, y: innerHeight * 0.45, d: pd };
        break;
      }
    }
  } else if (d === 'process') {
    const p = m.processes.find((x) => x.name === 'cs2.exe') ?? m.processes[0];
    selectProcess(p.id);
  } else if (d === 'file') selectFile(m.files[0].id);
  else if (d === 'dimm') selectDimm(0);
  else if (d === 'family') app.highlight = { kind: 'family', family: 3 };
}

export function setUx(ux: UxId): void {
  if (!(ux in UX_META)) return;
  app.ux = ux;
  localStorage.setItem('cv.ux', ux);
  const url = new URL(location.href);
  url.searchParams.set('ux', ux);
  history.replaceState(null, '', url);
}
export function cycleUx(dir = 1): void {
  const i = UX_ORDER.indexOf(app.ux);
  setUx(UX_ORDER[(i + dir + UX_ORDER.length) % UX_ORDER.length]);
}

// ---- scenarios -------------------------------------------------------------

function resolveOwner(kind: Scenario, ownerName?: string): number {
  const m = getMachine();
  if (kind === 'purgeStandby') return 0;
  if (ownerName) {
    const o = m.owners.find((x) => x.name === ownerName);
    if (o) return o.id;
  }
  if (kind === 'fileChurn') {
    const f = [...m.files].sort((a, b) => b.weight - a.weight);
    return f[Math.floor(Math.random() * 3)].id;
  }
  const alive = m.processes.filter((p) => p.alive && p.weight >= 3);
  return (alive.find((p) => p.name === 'cs2.exe') ?? alive[0] ?? m.processes[0]).id;
}

export function trigger(kind: Scenario, ownerName?: string): void {
  getSim().enqueue(kind, resolveOwner(kind, ownerName));
  if (!app.running) toggleRunning();
}

export function reset(seed?: number): void {
  boot(seed);
}

export { SCENARIO_LABEL };
