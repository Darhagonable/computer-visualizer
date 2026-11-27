/**
 * UX C · Task Manager — vocabulary that is local to this paradigm:
 *
 *   · the resources its device pages show, and the part view (the section) each one is,
 *   · where this UX starts — the `?level=` hooks every UX shares first, then its own older
 *     `?page=` / `?res=` — and what it writes back to the address bar,
 *   · the status bar's hint for the view on stage,
 *   · Task Manager style number formatting (GB / MB, D:HH:MM:SS),
 *   · the line-art glyphs the shared icon set does not carry.
 *
 * Every number a page shows is read from the store: the processor, the memory and the GPU from
 * the mock machine, the drives from its storage model (`app.tele.storage`). Nothing is generated
 * here — a drive's formats and hover cards are the drive scene's own (`scene/Drive.svelte`).
 */
import { app, HIST_MAX } from '../../mock/store.svelte';
import type { Machine } from '../../mock/model';
import type { Truth } from '../../mock/telemetry';
import { levelFromUrl, type Kind, type Level } from '../../levels/nav';

export type ResId = 'cpu' | 'memory' | 'disk' | 'gpu';

export interface ResMeta {
  id: ResId;
  label: string;
  icon: string;
  /** CSS colour of the graph and the tile: the hue the section's data is drawn in elsewhere. */
  color: string;
  /** Unit of the big number in the header. */
  unit: string;
  /** The part view this page is: the level the side menu's section opens. */
  level: Level;
}

export const RESOURCES: ResMeta[] = [
  { id: 'cpu', label: 'CPU', icon: 'cpu', color: 'var(--accent)', unit: '%', level: { kind: 'package' } },
  { id: 'memory', label: 'Memory', icon: 'memory', color: 'var(--c-private)', unit: '%', level: { kind: 'memory' } },
  { id: 'disk', label: 'Storage', icon: 'disk', color: 'var(--c-file)', unit: '%', level: { kind: 'drives' } },
  { id: 'gpu', label: 'GPU 0', icon: 'gpu', color: 'var(--c-pagefile)', unit: '%', level: { kind: 'card' } },
];

// ---- the address bar ----------------------------------------------------------------------

/** The parameters that say where a view is: the ones every UX shares, and this UX's own older ones. */
const SHARED = ['level', 'part', 'dimm', 'chip', 'cell', 'ccd', 'core', 'drive'] as const;
const OWN = ['page', 'res', 'nav'] as const;

/**
 * This UX's older hooks, kept working and kept written: `?page=processes|performance` and
 * `&res=cpu|memory|disk|gpu` name a section (Ethernet has none any more). Every level below a
 * section keeps its section's pair, and says exactly where it is with the shared `level`.
 */
const OLDER: Partial<Record<Kind, { page: string; res?: string }>> = {
  apps: { page: 'processes' },
  package: { page: 'performance', res: 'cpu' },
  ccd: { page: 'performance', res: 'cpu' },
  core: { page: 'performance', res: 'cpu' },
  memory: { page: 'performance', res: 'memory' },
  stick: { page: 'performance', res: 'memory' },
  die: { page: 'performance', res: 'memory' },
  block: { page: 'performance', res: 'memory' },
  drives: { page: 'performance', res: 'disk' },
  drive: { page: 'performance', res: 'disk' },
  card: { page: 'performance', res: 'gpu' },
  gdie: { page: 'performance', res: 'gpu' },
  vram: { page: 'performance', res: 'gpu' },
};

/** The parameters that reopen a view exactly, in the form every UX reads (`levels/nav.ts: levelFromUrl`). */
export function viewParams(l: Level): Record<string, string> {
  switch (l.kind) {
    case 'machine':
      return {}; // the root needs none
    case 'stick':
      return { level: 'stick', dimm: String(l.dimm) };
    case 'die':
      return { level: 'die', chip: String(l.chip) };
    case 'block':
      return { level: 'block', chip: String(l.chip), cell: String(l.cell) };
    case 'ccd':
      return { level: 'ccd', ccd: String(l.ccd) };
    case 'core':
      return { level: 'core', core: String(l.core) };
    case 'drive':
      return { level: 'drive', drive: String(l.drive) };
    default:
      return { level: l.kind };
  }
}

/** Where this UX opens. Read once, when it mounts. */
export function startLevel(m: Machine): Level {
  const q = new URLSearchParams(location.search);
  // 1. the hooks every UX shares: ?level=stick&dimm=2, ?part=storage&level=drive&drive=1 …
  if (SHARED.some((k) => q.has(k))) return levelFromUrl(m);
  // 2. this UX's own older ones: ?res=<resource>, or ?page=processes|performance
  const byRes = RESOURCES.find((r) => r.id === q.get('res'));
  if (byRes) return byRes.level;
  const page = q.get('page');
  if (page === 'processes') return { kind: 'apps' };
  // the Performance page opened on its first resource; `?res=ethernet` has no section any more and lands there too
  if (page === 'performance') return { kind: 'memory' };
  return { kind: 'machine' };
}

/**
 * The address bar with a view written into it, so the view can be reloaded or passed on. Only
 * the parameters that say where a view is change: `?ux=`, `?mode=`, `?ticks=`, `?paused=` are
 * left as they are. The pane's own `?nav=collapsed|expanded` is read once and dropped, as before.
 */
export function viewUrl(l: Level, href: string): string {
  const url = new URL(href);
  for (const k of [...SHARED, ...OWN]) url.searchParams.delete(k);
  for (const [k, v] of Object.entries(viewParams(l))) url.searchParams.set(k, v);
  const older = OLDER[l.kind];
  if (older) {
    url.searchParams.set('page', older.page);
    if (older.res) url.searchParams.set('res', older.res);
  }
  return String(url);
}

// ---- the status bar -----------------------------------------------------------------------

/** What a click does on the view on stage. */
export const HINTS: Record<Kind, string> = {
  machine: 'Click the socket, a module, a drive or the card to open it · scroll on it zooms in',
  apps: 'Select a process to see its memory composition · click a column header to sort',
  package: 'Hover a core for its details · click a core or a chiplet to open it · Esc goes back to the Overview',
  ccd: 'Click a core to open it · Esc goes up to the processor page',
  core: 'Hover a thread to read it · Esc returns to the chiplet',
  memory: 'Scroll to zoom the board · drag to pan · hover a block for page details · click a module to open it',
  stick: 'Hover a die to frame it · click it to open · scroll on it zooms in · Esc goes up to the Overview',
  die: 'Click a block to open it · scroll on it zooms in · Esc goes up to the module',
  block: 'Click a page group to highlight its owner · Esc goes up to the die',
  drives: 'Hover a drive for its details · click a drive to open it',
  drive: 'Click a partition — on the drive or in the list — to see its details · Esc goes up to the storage page',
  card: 'Scroll to zoom the card · drag to pan · hover the die, a VRAM chip or a fan for details · click the die or a chip to open it',
  gdie: 'Hover a unit to read it · click an engine to pin it · Esc returns to the GPU page',
  vram: 'Hover a process to see where it is modelled to sit · click a chip to pin it · Esc returns to the GPU page',
};

// ---- formatting ----------------------------------------------------------------------------

/** `[number, unit]` for an amount given in MiB, in the units Task Manager uses. */
export function bytesParts(mib: number): [string, string] {
  if (!Number.isFinite(mib) || mib <= 0) return ['0', 'MB'];
  if (mib < 1) return [String(Math.round(mib * 1024)), 'KB'];
  if (mib < 1024) return [mib < 100 ? mib.toFixed(1) : String(Math.round(mib)), 'MB'];
  const g = mib / 1024;
  return [g < 10 ? g.toFixed(2) : g < 100 ? g.toFixed(1) : String(Math.round(g)), 'GB'];
}
export const fmtBytes = (mib: number): string => bytesParts(mib).join(' ');

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

/** Samples that make up 60 s at the current tick rate (the store's rings hold two minutes). */
export function windowSize(): number {
  return Math.max(2, Math.min(HIST_MAX, Math.round(60000 / app.tickMs)));
}

// ---- GPU (the mock GPU component: app.tele.gpu) ---------------------------------------------

/** Dedicated GPU memory of a process, matched by name; 0 when it has none. */
export function gpuMiB(name: string): number {
  return app.tele?.gpu.procs.find((p) => p.name === name)?.mib ?? 0;
}

// ---- statistics grid -----------------------------------------------------------------------

/** One stat cell of the grid at the bottom of a device page. */
export interface StatCell {
  label: string;
  value: string;
  unit?: string;
  /** Tooltip text. */
  note?: string;
  /** The truth of the value, where it is not plain ink: shown beside it, as the guides show theirs. */
  truth?: Truth | null;
}
export const EMPTY_CELL: StatCell = { label: '', value: '' };
export const dash = (label: string): StatCell => ({ label, value: '—', note: 'Not in the mock' });

// ---- line-art glyphs -----------------------------------------------------------------------

/** 24 × 24 stroke paths in the style of `scene/Icon.svelte` (1.6 stroke, round caps). */
export const GLYPHS: Record<string, string> = {
  menu: 'M4 6.5h16M4 12h16M4 17.5h16',
  disk: 'M5 4.5h14A1.5 1.5 0 0 1 20.5 6v3.5A1.5 1.5 0 0 1 19 11H5A1.5 1.5 0 0 1 3.5 9.5V6A1.5 1.5 0 0 1 5 4.5zM5 13h14a1.5 1.5 0 0 1 1.5 1.5V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18v-3.5A1.5 1.5 0 0 1 5 13zM7 8h.01M7 16.25h.01',
  chevronUp: 'M5 15l7-7 7 7',
  chevronDown: 'M5 9l7 7 7-7',
};
