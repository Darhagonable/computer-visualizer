/**
 * Navigation model for UX B · Ionic — one chain of physical containment:
 *
 *   machine → stick (DIMM) → die → block → pages
 *
 * Each level fills the stage on its own. This module knows how to move along the chain
 * (up / down / sideways), how to read the start level from the URL, how large each level's
 * hero is on a given stage, how to project a location onto the compact board for the
 * mini-map, and how levels animate into each other. No rendering lives here.
 */
import { cubicIn, cubicOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';
import type { Machine } from '../../mock/model';
import { getSim } from '../../mock/store.svelte';
import { STICK } from '../../scene/geometry';

export type Level =
  | { kind: 'machine' }
  | { kind: 'stick'; dimm: number }
  | { kind: 'die'; chip: number }
  | { kind: 'block'; chip: number; cell: number };

export const DEPTH: Record<Level['kind'], number> = { machine: 0, stick: 1, die: 2, block: 3 };

export const keyOf = (l: Level): string => {
  switch (l.kind) {
    case 'stick':
      return `stick:${l.dimm}`;
    case 'die':
      return `die:${l.chip}`;
    case 'block':
      return `block:${l.chip}:${l.cell}`;
    default:
      return 'machine';
  }
};

/** Position among siblings — decides which way a sibling swap slides. */
export const orderOf = (l: Level): number =>
  l.kind === 'stick' ? l.dimm : l.kind === 'die' ? l.chip : l.kind === 'block' ? l.cell : 0;

export function dimmOf(l: Level, m: Machine): number | null {
  if (l.kind === 'stick') return l.dimm;
  if (l.kind === 'die' || l.kind === 'block') return m.chips[l.chip]?.dimm ?? null;
  return null;
}

export function upOf(l: Level, m: Machine): Level | null {
  if (l.kind === 'stick') return { kind: 'machine' };
  if (l.kind === 'die') return { kind: 'stick', dimm: m.chips[l.chip]?.dimm ?? 0 };
  if (l.kind === 'block') return { kind: 'die', chip: l.chip };
  return null;
}

/** Name of the level above — the dock's "up" button. */
export function parentName(l: Level, m: Machine): string {
  const u = upOf(l, m);
  if (!u || u.kind === 'machine') return 'Machine';
  if (u.kind === 'stick') return m.slots[m.dimms[u.dimm]?.slot ?? 0]?.label ?? 'Stick';
  return `Die ${(u.chip & 7) + 1}`;
}

/** `?level=machine|stick|die|block` (optionally `&dimm= &chip= &cell=`), read once at start-up. */
export function levelFromUrl(m: Machine): Level {
  const q = new URLSearchParams(location.search);
  const n = (k: string): number | null => {
    const raw = q.get(k);
    if (raw === null || raw.trim() === '') return null; // Number(null) would be 0
    const v = Number(raw);
    return Number.isInteger(v) && v >= 0 ? v : null;
  };
  const chip = Math.min(n('chip') ?? 0, m.chips.length - 1);
  switch (q.get('level')) {
    case 'stick':
      return { kind: 'stick', dimm: Math.min(n('dimm') ?? 0, m.dimms.length - 1) };
    case 'die':
      return { kind: 'die', chip };
    case 'block':
      return { kind: 'block', chip, cell: Math.min(n('cell') ?? 37, 255) };
    default:
      return { kind: 'machine' };
  }
}

export interface Crumb {
  /** Absent on the crumb that is the current level. */
  level?: Level;
  label: string;
  hint: string;
}

/** The containment trail: Machine › DIMM_A1 › Die 3 › Block 37. Ancestors are clickable. */
export function crumbsOf(l: Level, m: Machine): Crumb[] {
  const out: Crumb[] = [
    { level: l.kind === 'machine' ? undefined : { kind: 'machine' }, label: 'Machine', hint: 'All memory modules' },
  ];
  if (l.kind === 'machine') return out;
  const d = dimmOf(l, m) ?? 0;
  const dimm = m.dimms[d];
  out.push({
    level: l.kind === 'stick' ? undefined : { kind: 'stick', dimm: d },
    label: m.slots[dimm.slot]?.label ?? `DIMM ${d}`,
    hint: `${dimm.manufacturer} · ${dimm.capacityGiB} GB module`,
  });
  if (l.kind === 'die' || l.kind === 'block') {
    const c = m.chips[l.chip];
    out.push({
      level: l.kind === 'die' ? undefined : { kind: 'die', chip: l.chip },
      label: `Die ${(l.chip & 7) + 1}`,
      hint: `rank ${c.rank} · 256 blocks of 4 MiB`,
    });
  }
  if (l.kind === 'block') out.push({ level: undefined, label: `Block ${l.cell}`, hint: '4 MiB of pages' });
  return out;
}

// ---- how large each level's hero is on a stage of w × h ------------------------------

const FALLBACK_W = 1200;
const FALLBACK_H = 640;

/** Machine level: 2 × 2 modules with a band above and below for the floating tiles. */
const BAND = 104;
export const MACHINE_GAP = 32;
const MOD_HEAD = 46; // the module's header row (name pill, in-use meter)
export const STICK_AR = STICK.height / STICK.width;

export function machineLayout(w: number, h: number) {
  const W = w || FALLBACK_W;
  const H = h || FALLBACK_H;
  const stickW = Math.max(220, Math.min(640, (W - 112) / 2, ((H - 2 * BAND - MACHINE_GAP) / 2 - MOD_HEAD) / STICK_AR));
  const cellH = MOD_HEAD + stickW * STICK_AR;
  return { stickW, cellH, gridW: stickW * 2 + MACHINE_GAP, gridH: cellH * 2 + MACHINE_GAP };
}

/** Stick level: one module ≈ 2.2 × its native size, shrunk to fit smaller windows. */
export function stickLayout(w: number, h: number) {
  // 172 px above and below the module hold its rows of tiles
  const stickW = Math.max(320, Math.min(2.2 * STICK.width, (w || FALLBACK_W) - 96, ((h || FALLBACK_H) - 344) / STICK_AR));
  return { w: stickW, h: stickW * STICK_AR };
}

/** Die and block level: a square package, never larger than 600 px. */
export const BOX = { size: 600, pad: 38 };
export function boxLayout(w: number, h: number) {
  // 16 px above, room for the "modeled" badge below; 300 px either side for a tile column
  const side = Math.max(260, Math.min(BOX.size, (h || FALLBACK_H) - 80, (w || FALLBACK_W) - 600));
  return { side };
}

/** Centre-to-centre distance of cells in an n × n grid inside the package. */
export const gridPitch = (n: number, gap: number) => (BOX.size - 2 * BOX.pad - (n - 1) * gap) / n + gap;

/**
 * Where a level's own hero sits inside its *parent's* layout, in stage pixels — the
 * centre a zoom turns around, so a module grows out of its slot, a die out of its place
 * on the module, a block out of its clump. Null for the machine (the stage centre).
 */
export function anchorOf(l: Level, w: number, h: number): { x: number; y: number } | null {
  const W = w || FALLBACK_W;
  const H = h || FALLBACK_H;
  if (l.kind === 'machine') return null;
  if (l.kind === 'stick') {
    const g = machineLayout(W, H);
    return {
      x: (W - g.gridW) / 2 + (l.dimm % 2) * (g.stickW + MACHINE_GAP) + g.stickW / 2,
      y: (H - g.gridH) / 2 + Math.floor(l.dimm / 2) * (g.cellH + MACHINE_GAP) + g.cellH / 2,
    };
  }
  if (l.kind === 'die') {
    const s = stickLayout(W, H);
    const p = diePos(l.chip);
    return {
      x: (W - s.w) / 2 + ((p.x + DIE.w / 2) / STICK.width) * s.w,
      y: (H - s.h) / 2 + ((p.y + DIE.h / 2) / STICK.height) * s.h,
    };
  }
  const { side } = boxLayout(W, H);
  const clump = gridPitch(64, DIE_GRID.gap) * 4;
  return {
    x: (W - side) / 2 + ((BOX.pad + ((l.cell & 15) + 0.5) * clump) / BOX.size) * side,
    y: (H - side) / 2 + ((BOX.pad + ((l.cell >> 4) + 0.5) * clump) / BOX.size) * side,
  };
}

// ---- the page grids of the die and block levels (modeled below board zoom) ------------

/** Die level: each of the die's 256 board blocks opens into a 4 × 4 clump of 64-page cells. */
export const DIE_GRID = { n: 64, gap: 0.9 };
/** Block level: one board block opens into a 16 × 16 grid of 4-page cells. */
export const BLOCK_GRID = { n: 16, gap: 5 };

// ---- geometry of the shared scenes (not exported by scene/geometry.ts) ----------------
// RamBoard: rows of 196 units, two columns; DimmStick: 2 ranks × 8 dies of 52 × 46;
// ChipGrid: 16 × 16 board blocks in a 46-unit square with a 0.22 gap.

const ROW_H = 196;
const COL_X = [56, 656];
const STICK_Y = 20;
const BOARD_CELL = (46 - 15 * 0.22) / 16;
const BOARD_PITCH = BOARD_CELL + 0.22;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A module's place on the compact board. */
export function stickBox(slot: number): Box {
  return { x: COL_X[slot & 1], y: (slot >> 1) * ROW_H + STICK_Y, w: STICK.width, h: STICK.height };
}

/** Top-left of a die on its stick (560 × 162 units). */
export const diePos = (chip: number): { x: number; y: number } => ({
  x: 52 + (chip & 7) * 59,
  y: (chip >> 3) & 1 ? 14 : 70,
});
export const DIE = { w: 52, h: 46 };

/** Top-left of a board block inside its die. */
export const cellPos = (cell: number): { x: number; y: number } => ({
  x: 3 + (cell & 15) * BOARD_PITCH,
  y: 3 + (cell >> 4) * BOARD_PITCH,
});
export const BOARD_CELL_SIZE = BOARD_CELL;

/** A die's place on the compact board. */
export function dieBox(slot: number, chip: number): Box {
  const p = diePos(chip);
  return { x: COL_X[slot & 1] + p.x, y: (slot >> 1) * ROW_H + STICK_Y + p.y, w: DIE.w, h: DIE.h };
}

/** A board block's place on the compact board. */
export function cellBox(slot: number, chip: number, cell: number): Box {
  const d = dieBox(slot, chip);
  const c = cellPos(cell);
  return { x: d.x + c.x, y: d.y + c.y, w: BOARD_CELL, h: BOARD_CELL };
}

/** Pointer position in an SVG's viewBox units (assumes the box matches the viewBox aspect). */
export function svgPoint(svg: SVGSVGElement, e: { clientX: number; clientY: number }): { x: number; y: number } {
  const r = svg.getBoundingClientRect();
  const [vx, vy, vw, vh] = (svg.getAttribute('viewBox') ?? `0 0 ${r.width} ${r.height}`).split(' ').map(Number);
  const s = Math.min(r.width / vw, r.height / vh);
  return {
    x: vx + (e.clientX - r.left - (r.width - vw * s) / 2) / s,
    y: vy + (e.clientY - r.top - (r.height - vh * s) / 2) / s,
  };
}

// ---- wheel: one notch = one level ----------------------------------------------------

/**
 * Turns the wheel into level steps. Track-pad inertia is absorbed by a short cool-down;
 * `+1` zooms in, `-1` zooms out.
 */
export function levelWheel(step: (dir: 1 | -1, e: WheelEvent) => void): (e: WheelEvent) => void {
  let cool = 0;
  return (e) => {
    if (e.ctrlKey) return; // pinch-zoom
    e.preventDefault();
    if (Math.abs(e.deltaY) < 6) return;
    const now = performance.now();
    if (now < cool) return;
    cool = now + 560;
    step(e.deltaY > 0 ? 1 : -1, e);
  };
}

// ---- pulses: where memory changed this tick -------------------------------------------

export interface Pulse {
  key: string;
  x: number;
  y: number;
}

/** Board blocks changed in the last tick, projected into a hero's SVG units. */
export function pulsesOf(
  version: number,
  inScope: (chip: number) => boolean,
  project: (chip: number, cell: number) => { x: number; y: number },
  cap = 40,
): Pulse[] {
  const out: Pulse[] = [];
  const changes = getSim().changes;
  for (let i = 0; i < changes.length && out.length < cap; i++) {
    const p = changes[i];
    const chip = p >> 8;
    if (!inScope(chip)) continue;
    const at = project(chip, p & 255);
    out.push({ key: `${version}:${p}`, x: at.x, y: at.y });
  }
  return out;
}

// ---- state mix -------------------------------------------------------------------------

export interface Seg {
  n: number;
  pct: number;
  /** Token-built colour of the segment. */
  c: string;
  l: string;
}

/** Active / Modified / Standby / Free (and Bad when present) — how a set of blocks is split. */
export function stateSegments(c: ArrayLike<number>): Seg[] {
  const live = c[4];
  const mod = c[3];
  const cache = c[2];
  const free = c[1] + c[0];
  const bad = c[5] ?? 0;
  const total = live + mod + cache + free + bad || 1;
  const p = (n: number) => Math.round((n / total) * 100);
  const out: Seg[] = [
    {
      n: live,
      pct: p(live),
      c: 'linear-gradient(90deg, var(--c-private), var(--c-file), var(--c-pagefile), var(--c-kernel))',
      l: 'Active',
    },
    { n: mod, pct: p(mod), c: 'var(--c-modified)', l: 'Modified' },
    { n: cache, pct: p(cache), c: 'color-mix(in srgb, var(--c-private) 42%, transparent)', l: 'Standby' },
    { n: free, pct: p(free), c: 'var(--line2)', l: 'Free' },
  ];
  if (bad) out.push({ n: bad, pct: p(bad), c: 'var(--c-bad)', l: 'Bad' });
  return out;
}

// ---- level transitions -------------------------------------------------------------------

/** Where the incoming level comes from (and the outgoing one goes, mirrored). */
export type Whence = 'below' | 'above' | 'left' | 'right';

const PATH: Record<Whence, [{ s: number; x: number }, { s: number; x: number }]> = {
  below: [{ s: 0.82, x: 0 }, { s: 1.16, x: 0 }],
  above: [{ s: 1.16, x: 0 }, { s: 0.82, x: 0 }],
  left: [{ s: 0.97, x: 56 }, { s: 0.97, x: -56 }],
  right: [{ s: 0.97, x: -56 }, { s: 0.97, x: 56 }],
};

/**
 * Zoom-through transition: zooming in, the new level grows into place while the old one
 * swells past the viewer; zooming out reverses it; sibling swaps slide. Only ever animates
 * `transform` and `opacity`.
 */
export function zoom(
  node: Element,
  { whence = 'below', out = false, dur = 520 }: { whence?: Whence; out?: boolean; dur?: number } = {},
): TransitionConfig {
  const opacity = +getComputedStyle(node).opacity;
  const [from, to] = PATH[whence];
  const a = out ? { s: 1, x: 0 } : from;
  const b = out ? to : { s: 1, x: 0 };
  return {
    duration: out ? dur * 0.62 : dur,
    easing: out ? cubicIn : cubicOut,
    css: (t) =>
      `transform: translateX(${(a.x + (b.x - a.x) * t).toFixed(2)}px) scale(${(a.s + (b.s - a.s) * t).toFixed(4)}); opacity: ${(
        out
          ? opacity * (1 - t)
          : opacity * t
      ).toFixed(3)}`,
  };
}
