/**
 * Reactive app state (Svelte 5 runes). The mutable machine + sim live *outside* the
 * `$state` proxy for speed — typed arrays are mutated in place and consumers re-read
 * them when `app.version` changes. Everything a UX needs to render is on `app`.
 */
import { buildMachine } from './machine';
import { Sim, SCENARIO_LABEL, type Scenario } from './sim';
import { STATE_COUNT, CELLS_PER_CHIP, BLOCK_PAGES, PAGE_SIZE, STATE_NAMES, USE_NAMES } from './model';
import { useFamilyIndex } from './model';
import type { Machine, Stats, CpuLive, Owner } from './model';
import { hash32 } from './rng';
import { Telemetry, MODES, modeApplies, type Mode, type Component, type Tele, type Truth } from './telemetry';

export { MODES, modeApplies };
export type { Mode, Component, Tele, Truth };

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
  /** Packed block index (chip << 8 | cell) when this is a board block. */
  block?: number;
  /** Overlay rows for tooltips (e.g. zoomed grids that are not board blocks). */
  metrics?: HoverRow[];
  /** Replaces the tooltip's default "what a click does" hint. */
  note?: string;
}

export interface HoverRow {
  k: string;
  v: string;
  mono?: boolean;
  dim?: boolean;
}

/**
 * What the global tooltip shows. Memory pages get one via `pageCard()`; anything else
 * (a CPU core, a VRAM chip, a fan…) builds one directly and calls `hoverCard()`.
 */
export interface HoverCard {
  title: string;
  sub?: string;
  /** Any CSS colour. */
  swatch?: string;
  rows: HoverRow[];
  note?: string;
  /** Replaces the default "what a click does" hint. */
  hint?: string;
}

export interface HoverInfo {
  x: number;
  y: number;
  card: HoverCard;
  /** Set when the pointer is over a memory block. */
  d?: PageDetails;
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
  hist: { mem: number[]; cached: number[]; cpu: number[]; temp: number[]; gpu: number[]; gpuTemp: number[] };
  /** What the grids encode — see mock/telemetry.ts. */
  mode: Mode;
  tele: Tele | null;
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
  hist: { mem: [], cached: [], cpu: [], temp: [], gpu: [], gpuTemp: [] },
  mode: 'pages',
  tele: null,
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
let tele: Telemetry | null = null;
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
    block: (chipIdx << 8) | cell,
  };
}

export function stateName(s: number): string {
  return STATE_NAMES[s] ?? `state ${s}`;
}
export function useName(u: number): string {
  return u === 15 ? '—' : (USE_NAMES[u] ?? `use ${u}`);
}

const FAM_VAR = ['--c-private', '--c-file', '--c-pagefile', '--c-kernel'];

/** CSS colour of a page by state (same encoding as the grids). */
export function stateSwatch(d: { state: number; use: number }): string {
  const fam = `var(${FAM_VAR[useFamilyIndex(d.use)]})`;
  switch (d.state) {
    case 0:
      return 'var(--c-zeroed)';
    case 1:
      return 'var(--c-free)';
    case 2:
      return `color-mix(in srgb, ${fam} 34%, transparent)`;
    case 3:
      return 'var(--c-modified)';
    case 5:
      return 'var(--c-bad)';
    default:
      return fam;
  }
}

/** The overlay's value for one board block, as tooltip rows. */
function overlayRows(block: number): HoverRow[] {
  const t = app.tele;
  if (!t || app.mode === 'pages') return [];
  const chip = block >> 8;
  if (app.mode === 'temperature') {
    return [
      { k: 'temperature', v: `≈ ${t.dieTemp[chip].toFixed(1)} °C`, mono: true },
      { k: '', v: `estimated · module sensor ${t.dimmTemp[chip >> 4].toFixed(1)} °C`, dim: true },
    ];
  }
  const heat = t.heat[block] / 255;
  if (app.mode === 'activity') {
    return [
      { k: 'activity', v: `${Math.round(heat * 100)} %`, mono: true },
      { k: '', v: 'modelled page heat', dim: true },
    ];
  }
  return [
    { k: 'power', v: `≈ ${(0.9 + heat * 3.1).toFixed(2)} W`, mono: true },
    { k: '', v: 'estimated · DIMMs have no power sensor', dim: true },
  ];
}

/** Tooltip card for a memory block. */
export function pageCard(d: PageDetails): HoverCard {
  const rows: HoverRow[] = [...(d.metrics ?? (d.block !== undefined ? overlayRows(d.block) : []))];
  rows.push(
    { k: 'used for', v: useName(d.use) },
    { k: 'owner', v: d.owner.name + (d.owner.shared ? ' · shared' : '') },
    { k: 'frame', v: d.pfn, mono: true },
    { k: 'covers', v: d.size },
  );
  if (d.state === 2) rows.push({ k: 'priority', v: `${d.priority} of 7`, mono: true });
  const hint = d.note
    ? undefined
    : app.mode === 'pages'
      ? `click to highlight everything owned by ${d.owner.kind === 'file' ? 'this file' : d.owner.kind === 'process' ? 'this process' : 'this component'}`
      : undefined;
  return { title: d.where, sub: stateName(d.state), swatch: stateSwatch(d), rows, note: d.note, hint };
}

export function hoverCard(card: HoverCard | null, ev?: { clientX: number; clientY: number }): void {
  app.hover = card ? { x: ev?.clientX ?? 0, y: ev?.clientY ?? 0, card } : null;
}

export function hoverPage(d: PageDetails | null, ev?: { clientX: number; clientY: number }): void {
  if (!d) {
    app.hover = null;
    return;
  }
  app.hover = { x: ev?.clientX ?? 0, y: ev?.clientY ?? 0, card: pageCard(d), d };
}

/** Pointer left whatever it was over. */
export function hoverOut(): void {
  app.hover = null;
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
  if (tele) {
    tele.step(sim, st);
    app.tele = tele.data;
  }
  const h = app.hist;
  h.mem.push((st.inUse / st.total) * 100);
  h.cached.push((st.byState[2] / st.total) * 100);
  h.cpu.push(sim.cpu.avgLoad);
  h.temp.push(sim.cpu.maxTemp);
  const g = app.tele?.gpu;
  h.gpu.push(g ? g.engines['3d'] : 0);
  h.gpuTemp.push(g ? g.temp : 0);
  for (const k of ['mem', 'cached', 'cpu', 'temp', 'gpu', 'gpuTemp'] as const) if (h[k].length > HIST_MAX) h[k].shift();
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
  tele = new Telemetry(machine, seed);
  sim.onlog = (msg) => {
    app.log = [`T+${(sim!.currentTick * 0.5).toFixed(1)}s  ${msg}`, ...app.log].slice(0, 14);
  };
  app.selectedDimm = null;
  app.selectedProcess = null;
  app.selectedFile = null;
  app.highlight = null;
  app.procHist = [];
  app.hist = { mem: [], cached: [], cpu: [], temp: [], gpu: [], gpuTemp: [] };
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
  const modeFromUrl = q.get('mode') as Mode | null;
  const savedMode = localStorage.getItem('cv.mode') as Mode | null;
  app.mode = modeFromUrl && MODES.includes(modeFromUrl) ? modeFromUrl : savedMode && MODES.includes(savedMode) ? savedMode : 'pages';
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
        if (pd) app.hover = { x: innerWidth * 0.4, y: innerHeight * 0.45, card: pageCard(pd), d: pd };
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
export function setMode(mode: Mode): void {
  if (!MODES.includes(mode)) return;
  app.mode = mode;
  localStorage.setItem('cv.mode', mode);
  const url = new URL(location.href);
  url.searchParams.set('mode', mode);
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
