/**
 * Navigation model of the part views — the chains of physical containment, all rooted at
 * the machine:
 *
 *   machine (motherboard) ├─ memory (the modules) › stick (DIMM) › die › block › pages
 *                        ├─ package (CPU) › CCD › core                              processor
 *                        ├─ card (GPU) › GPU die | VRAM                             graphics
 *                        ├─ drives › drive                                         storage
 *                        └─ apps                                                    applications
 *
 * `memory` is the entry the side menu opens for Memory; `up` from a module still returns to
 * the machine, so the motherboard stays the hub. `apps` is not a physical part: processes
 * and what they hold.
 *
 * Each level fills the stage on its own. This module knows how to move along a chain
 * (up / down / sideways), how to read the start level from the URL, how large each level's
 * hero is on a given stage, where a hero sits inside its parent's layout (the centre a zoom
 * turns around), how to project a location onto the motherboard for the mini-map, and how
 * levels animate into each other. No rendering lives here.
 */
import { cubicIn, cubicOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';
import type { Machine } from '../mock/model';
import type { Component } from '../mock/telemetry';
import { app, getMachine, getSim } from '../mock/store.svelte';
import { STICK, CPU_DIE, GPU_CARD, MOTHERBOARD } from '../scene/geometry';

export type Level =
  | { kind: 'machine' }
  | { kind: 'memory' }
  | { kind: 'stick'; dimm: number }
  | { kind: 'die'; chip: number }
  | { kind: 'block'; chip: number; cell: number }
  | { kind: 'package' }
  | { kind: 'ccd'; ccd: number }
  | { kind: 'core'; core: number }
  | { kind: 'card' }
  | { kind: 'gdie' }
  | { kind: 'vram' }
  | { kind: 'drives' }
  | { kind: 'drive'; drive: number }
  | { kind: 'apps' };

export type Kind = Level['kind'];

export const DEPTH: Record<Kind, number> = {
  machine: 0,
  memory: 1,
  stick: 2,
  die: 2,
  block: 3,
  package: 1,
  ccd: 2,
  core: 3,
  card: 1,
  gdie: 2,
  vram: 2,
  drives: 1,
  drive: 2,
  apps: 1,
};

/** Which component of the machine a level is about (the machine itself reads as memory). */
export const PART: Record<Kind, Component> = {
  machine: 'memory',
  memory: 'memory',
  stick: 'memory',
  die: 'memory',
  block: 'memory',
  package: 'cpu',
  ccd: 'cpu',
  core: 'cpu',
  card: 'gpu',
  gdie: 'gpu',
  vram: 'gpu',
  drives: 'storage',
  drive: 'storage',
  apps: 'memory',
};

/** The level a side-menu section opens. */
export type Section = 'overview' | 'processor' | 'memory' | 'storage' | 'graphics' | 'applications';

export const SECTION_LEVEL: Record<Section, Level> = {
  overview: { kind: 'machine' },
  processor: { kind: 'package' },
  memory: { kind: 'memory' },
  storage: { kind: 'drives' },
  graphics: { kind: 'card' },
  applications: { kind: 'apps' },
};

/** Which side-menu section a level belongs to (the menu highlights it). */
export function sectionOf(l: Level): Section {
  switch (l.kind) {
    case 'machine':
      return 'overview';
    case 'package':
    case 'ccd':
    case 'core':
      return 'processor';
    case 'card':
    case 'gdie':
    case 'vram':
      return 'graphics';
    case 'drives':
    case 'drive':
      return 'storage';
    case 'apps':
      return 'applications';
    default:
      return 'memory';
  }
}

/** What a "zoom in" from a level opens. `dimm` / `gpu` / `cpu` only matter at the machine. */
export type Target = {
  dimm?: number;
  chip?: number;
  cell?: number;
  ccd?: number;
  core?: number;
  cpu?: boolean;
  gpu?: boolean;
  vram?: boolean;
  memory?: boolean;
  storage?: boolean;
  /** A drive by index; omitted for the drives view. */
  drive?: number;
  apps?: boolean;
};

export const keyOf = (l: Level): string => {
  switch (l.kind) {
    case 'stick':
      return `stick:${l.dimm}`;
    case 'die':
      return `die:${l.chip}`;
    case 'block':
      return `block:${l.chip}:${l.cell}`;
    case 'ccd':
      return `ccd:${l.ccd}`;
    case 'core':
      return `core:${l.core}`;
    case 'drive':
      return `drive:${l.drive}`;
    default:
      return l.kind;
  }
};

/** Position among siblings — decides which way a sibling swap slides. */
export const orderOf = (l: Level): number => {
  switch (l.kind) {
    case 'stick':
      return l.dimm;
    case 'die':
      return l.chip;
    case 'block':
      return l.cell;
    case 'ccd':
      return l.ccd;
    case 'core':
      return l.core & 7;
    case 'package':
      return -1; // the socket sits left of the memory slots
    case 'card':
      return 9; // …and the graphics card below them
    case 'gdie':
      return 0;
    case 'vram':
      return 1;
    case 'drive':
      return l.drive;
    case 'memory':
      return -2; // the memory slots, left of the socket
    case 'drives':
      return 10; // …and the drive bays below the graphics card
    case 'apps':
      return 11;
    default:
      return 0;
  }
};

export function dimmOf(l: Level, m: Machine): number | null {
  if (l.kind === 'stick') return l.dimm;
  if (l.kind === 'die' || l.kind === 'block') return m.chips[l.chip]?.dimm ?? null;
  return null;
}

export function upOf(l: Level, m: Machine): Level | null {
  switch (l.kind) {
    case 'stick':
    case 'package':
    case 'card':
    case 'drives':
    case 'apps':
      return { kind: 'machine' };
    case 'drive':
      return { kind: 'drives' };
    case 'die':
      return { kind: 'stick', dimm: m.chips[l.chip]?.dimm ?? 0 };
    case 'block':
      return { kind: 'die', chip: l.chip };
    case 'ccd':
      return { kind: 'package' };
    case 'core':
      return { kind: 'ccd', ccd: l.core >> 3 };
    case 'gdie':
    case 'vram':
      return { kind: 'card' };
    default:
      return null;
  }
}

/** Name of the level above — the dock's "up" button. */
export function parentName(l: Level, m: Machine): string {
  const u = upOf(l, m);
  if (!u) return 'Machine';
  switch (u.kind) {
    case 'machine':
      return 'Machine';
    case 'stick':
      return m.slots[m.dimms[u.dimm]?.slot ?? 0]?.label ?? 'Stick';
    case 'die':
      return `Die ${(u.chip & 7) + 1}`;
    case 'package':
      return 'Processor';
    case 'ccd':
      return `CCD ${u.ccd}`;
    case 'drives':
      return 'Storage';
    default:
      return 'Graphics card';
  }
}

/** A non-negative integer URL parameter, or null when absent or malformed. */
export function urlNum(k: string): number | null {
  const raw = new URLSearchParams(location.search).get(k);
  if (raw === null || raw.trim() === '') return null; // Number(null) would be 0
  const v = Number(raw);
  return Number.isInteger(v) && v >= 0 ? v : null;
}

/**
 * `?level=machine|stick|die|block` (optionally `&dimm= &chip= &cell=`) for memory, and
 * `?part=cpu|gpu&level=package|ccd|core|card|die|vram` (optionally `&ccd= &core= &engine=`)
 * for the other two chains. Read once at start-up.
 */
export function levelFromUrl(m: Machine): Level {
  const q = new URLSearchParams(location.search);
  const lvl = q.get('level');
  const part = q.get('part');
  if (part === 'storage' || (part === null && (lvl === 'drives' || lvl === 'drive'))) {
    return lvl === 'drive' ? { kind: 'drive', drive: Math.min(urlNum('drive') ?? 0, 2) } : { kind: 'drives' };
  }
  if (part === 'apps' || (part === null && lvl === 'apps')) return { kind: 'apps' };
  if (part === 'memory' || (part === null && lvl === 'memory')) return { kind: 'memory' };
  if (part === 'cpu' || (part === null && (lvl === 'package' || lvl === 'ccd' || lvl === 'core'))) {
    if (lvl === 'ccd') return { kind: 'ccd', ccd: Math.min(urlNum('ccd') ?? 0, 1) };
    if (lvl === 'core') return { kind: 'core', core: Math.min(urlNum('core') ?? 0, 15) };
    return { kind: 'package' };
  }
  if (part === 'gpu' || (part === null && (lvl === 'card' || lvl === 'vram' || lvl === 'gdie'))) {
    if (lvl === 'die' || lvl === 'gdie') return { kind: 'gdie' };
    return lvl === 'vram' ? { kind: 'vram' } : { kind: 'card' };
  }
  const chip = Math.min(urlNum('chip') ?? 0, m.chips.length - 1);
  switch (lvl) {
    case 'stick':
      return { kind: 'stick', dimm: Math.min(urlNum('dimm') ?? 0, m.dimms.length - 1) };
    case 'die':
      return { kind: 'die', chip };
    case 'block':
      return { kind: 'block', chip, cell: Math.min(urlNum('cell') ?? 37, 255) };
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

const CRUMB_MACHINE: Crumb = {
  level: { kind: 'machine' },
  label: 'Machine',
  hint: 'The whole machine: processor, memory modules and graphics card',
};
const CRUMB_PACKAGE: Crumb = {
  level: { kind: 'package' },
  label: 'Processor',
  hint: '16 cores / 32 threads on two compute chiplets (mock)',
};
const CRUMB_CARD: Crumb = {
  level: { kind: 'card' },
  label: 'Graphics card',
  hint: '24 GB GDDR6X in a PCIe 5.0 ×16 slot (mock)',
};
const CRUMB_STORAGE: Crumb = { level: { kind: 'drives' }, label: 'Storage', hint: 'An NVMe stick, a SATA SSD and a hard disk (mock)' };

/** The containment trail: Machine › DIMM_A1 › Die 3 › Block 37. Ancestors are clickable. */
export function crumbsOf(l: Level, m: Machine): Crumb[] {
  const out: Crumb[] = [l.kind === 'machine' ? { ...CRUMB_MACHINE, level: undefined } : CRUMB_MACHINE];
  switch (l.kind) {
    case 'machine':
      return out;
    case 'memory':
      return [...out, { label: 'Memory', hint: 'The memory modules and their slots' }];
    case 'apps':
      return [...out, { label: 'Applications', hint: 'Processes and the memory they hold' }];
    case 'drives':
      return [...out, { label: CRUMB_STORAGE.label, hint: CRUMB_STORAGE.hint }];
    case 'drive':
      return [...out, CRUMB_STORAGE, { label: `Drive ${l.drive + 1}`, hint: 'Partitions, activity, temperature and health' }];
    case 'package':
      return [...out, { label: CRUMB_PACKAGE.label, hint: CRUMB_PACKAGE.hint }];
    case 'ccd':
      return [
        ...out,
        CRUMB_PACKAGE,
        { label: `CCD ${l.ccd}`, hint: 'Compute chiplet · 8 cores / 16 threads · 32 MB L3 per CCX' },
      ];
    case 'core':
      return [
        ...out,
        CRUMB_PACKAGE,
        { level: { kind: 'ccd', ccd: l.core >> 3 }, label: `CCD ${l.core >> 3}`, hint: 'Compute chiplet · 8 cores' },
        { label: `Core ${l.core + 1}`, hint: 'Two SMT threads · one thermal sensor' },
      ];
    case 'card':
      return [...out, { label: CRUMB_CARD.label, hint: CRUMB_CARD.hint }];
    case 'gdie':
      return [...out, CRUMB_CARD, { label: 'GPU die', hint: '96 units in 6 shader engines' }];
    case 'vram':
      return [...out, CRUMB_CARD, { label: 'VRAM', hint: '12 chips of 2 GB' }];
    default:
      break;
  }
  // memory chain
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

/** The "You are here" panel, top-right of every level but the machine. */
export const MINI = { w: 316, h: 158, hShort: 128, board: 132, boardShort: 104 };
const miniBox = (h: number) =>
  (h || FALLBACK_H) < 620 ? { h: MINI.hShort, board: MINI.boardShort } : { h: MINI.h, board: MINI.board };
/** Where a right-hand tile column starts: below the mini-map. */
export const colTop = (h: number) => miniBox(h).h + 30;
export const miniBoard = (h: number) => miniBox(h).board;
/** A centred hero may not run under the mini-map: its right edge stays this far from the stage's right. */
const HERO_W = 720;
/** Column either side of such a hero. */
export const HERO_COL = 304;

export const STICK_AR = STICK.height / STICK.width;

/** Machine level: the motherboard as tall as the stage allows, a KPI column either side. */
export const BOARD_COL = 342;
const MACHINE_GAP = 24;
const BOARD_AR = MOTHERBOARD.height / MOTHERBOARD.width;
export function boardLayout(w: number, h: number) {
  const W = w || FALLBACK_W;
  const H = h || FALLBACK_H;
  const room = W - 2 * (BOARD_COL + MACHINE_GAP);
  const bh = Math.max(280, Math.min(H - 24, room * BOARD_AR));
  const bw = bh / BOARD_AR;
  return { x: (W - bw) / 2, y: (H - bh) / 2, w: bw, h: bh };
}

/** Stick level: one module ≈ 2.2 × its native size, below the mini-map, rows of tiles above and below. */
export function stickLayout(w: number, h: number) {
  const W = w || FALLBACK_W;
  const H = h || FALLBACK_H;
  const TOP = miniBox(H).h + 28; // the mini-map sits above the module's right end
  const BOT = 152; // a 44 px gap, a 92 px tile row and a 16 px margin
  const sw = Math.max(300, Math.min(2.2 * STICK.width, W - 96, (H - TOP - BOT) / STICK_AR));
  const sh = sw * STICK_AR;
  const y = Math.max(TOP, (H - sh) / 2); // centred, but never under the mini-map
  return { x: (W - sw) / 2, y, w: sw, h: sh };
}

/** Memory level: the modules in two columns, a tile column either side. */
export const MEMORY_GAP = 28;
export function memoryLayout(w: number, h: number) {
  const W = w || FALLBACK_W;
  const H = h || FALLBACK_H;
  const roomW = W - 2 * (HERO_COL + 48);
  const s = Math.max(0.3, Math.min(1.25, (roomW - MEMORY_GAP) / (2 * STICK.width), (H - 32 - MEMORY_GAP) / (2 * STICK.height)));
  const bw = 2 * STICK.width * s + MEMORY_GAP;
  const bh = 2 * STICK.height * s + MEMORY_GAP;
  const x0 = (W - bw) / 2;
  const y0 = (H - bh) / 2;
  /** Where module `dimm` (0–3) sits: row-major. */
  const at = (dimm: number): Box => ({ x: x0 + (dimm & 1) * (STICK.width * s + MEMORY_GAP), y: y0 + (dimm >> 1) * (STICK.height * s + MEMORY_GAP), w: STICK.width * s, h: STICK.height * s });
  return { s, x0, y0, w: bw, h: bh, at };
}

/** Drives level: the three drives side by side, a tile column either side. */
export const DRIVE_BOX = { w: 300, h: 224, gap: 24 };
export function drivesLayout(w: number, h: number) {
  const W = w || FALLBACK_W;
  const H = h || FALLBACK_H;
  const full = 3 * DRIVE_BOX.w + 2 * DRIVE_BOX.gap;
  const s = Math.max(0.3, Math.min(1, (W - 2 * (HERO_COL + 48)) / full, (H - 96) / DRIVE_BOX.h));
  const bw = full * s;
  const bh = DRIVE_BOX.h * s;
  const x0 = (W - bw) / 2;
  const y0 = (H - bh) / 2;
  /** Where drive `i` (0–2) sits. */
  const at = (i: number): Box => ({ x: x0 + i * (DRIVE_BOX.w + DRIVE_BOX.gap) * s, y: y0, w: DRIVE_BOX.w * s, h: DRIVE_BOX.h * s });
  return { s, x0, y0, w: bw, h: bh, at };
}

/** Drive level: one drive as the hero (viewBox DRIVE_VIEW), between the tile columns. */
export const DRIVE_VIEW = { w: 620, h: 400 };
export function driveLayout(w: number, h: number) {
  return centred(w, h, DRIVE_VIEW.w, DRIVE_VIEW.h, 1, 56);
}

/** Applications level: a table across the stage, the selected process in a column on the right. */
export const APPS_COL = 320;
export function appsLayout(w: number, h: number) {
  const W = w || FALLBACK_W;
  const H = h || FALLBACK_H;
  const rightX = W - 24 - APPS_COL;
  return { x: 24, y: 16, w: rightX - 24 - 24, h: H - 32, rightX, rightW: APPS_COL };
}

/** Die and block level: a square package, never larger than 600 px. */
export const BOX = { size: 600, pad: 38 };
export function boxLayout(w: number, h: number) {
  // 16 px above, room for the "modeled" badge below; 300 px either side for a tile column
  const side = Math.max(240, Math.min(BOX.size, (h || FALLBACK_H) - 80, (w || FALLBACK_W) - 600));
  return { side };
}

/** Canvas of this UX's own heroes: the CCD chiplet, the core and the GPU die. */
export const CCD = { w: 760, h: 480 };
export const CORE = { w: 560, h: 560 };
export const GDIE = { w: 720, h: 520 };

/** A hero centred on the stage, fitted between the tile columns and under the top edge. */
function centred(w: number, h: number, vw: number, vh: number, maxScale: number, padY: number, maxX = HERO_W) {
  const W = w || FALLBACK_W;
  const H = h || FALLBACK_H;
  // room for a column either side: 24 px margin + HERO_COL + 24 px gap
  const s = Math.max(0.3, Math.min(maxScale, (H - padY) / vh, Math.min(maxX, W - 2 * (HERO_COL + 48)) / vw));
  const hw = vw * s;
  const hh = vh * s;
  return { x: (W - hw) / 2, y: (H - hh) / 2, w: hw, h: hh, s };
}

/** Processor package (CpuDie, 460 × 390) large, between the tile columns. */
export function packageLayout(w: number, h: number) {
  return centred(w, h, CPU_DIE.width, CPU_DIE.height, 1.6, 56);
}

/** One CCD as a chiplet (viewBox CCD). Room below for the truth badge. */
export function ccdLayout(w: number, h: number) {
  return centred(w, h, CCD.w, CCD.h, 1, 116);
}

/** One core as the hero (viewBox CORE). */
export function coreLayout(w: number, h: number) {
  return centred(w, h, CORE.w, CORE.h, 1, 56);
}

/** GPU die level (viewBox GDIE). Room below for the truth badge. */
export function gdieLayout(w: number, h: number) {
  return centred(w, h, GDIE.w, GDIE.h, 1, 116);
}

/** Card level: KPI row and history band above, then the card — wide and low, so it may run under the mini-map. */
export const CARD = { colW: 252, top: 236 };
export function cardLayout(w: number, h: number) {
  const W = w || FALLBACK_W;
  const H = h || FALLBACK_H;
  const s = Math.max(0.3, Math.min(1.1, (H - CARD.top - 22) / GPU_CARD.height, (W - 2 * (CARD.colW + 48)) / GPU_CARD.width));
  const cw = GPU_CARD.width * s;
  const ch = GPU_CARD.height * s;
  return { x: (W - cw) / 2, y: H - 16 - ch, w: cw, h: ch, s };
}

/** VRAM level: the 12 chips in two rows of six on the left, the process list in a column on the right. */
export const VRAM_COL = 364;
export function vramLayout(w: number, h: number) {
  const W = w || FALLBACK_W;
  const short = (h || FALLBACK_H) < 620;
  const gap = 16;
  const rightX = W - 24 - VRAM_COL;
  const bandW = Math.max(3 * 96 + 2 * gap, rightX - 24 - 24);
  const chipW = Math.min(162, (bandW - 5 * gap) / 6);
  const chipH = short ? 112 : 150;
  const top = short ? 16 : Math.max(16, Math.min(64, ((h || FALLBACK_H) - 550) / 2));
  const bottom = top + 2 * chipH + gap;
  return {
    x: 24,
    top,
    chipW,
    chipH,
    gap,
    bandW: 6 * chipW + 5 * gap,
    rightX,
    rightW: VRAM_COL,
    badgeY: bottom + 14,
    tilesY: bottom + 56,
    guideY: bottom + 172,
  };
}

/**
 * The tile columns of a centred-hero level hug the hero, so the group reads as one thing.
 * The right-hand column would run under the mini-map on all but the widest stages — there it
 * snaps to the stage's right edge, flush beneath the mini-map, and starts below it; on a wide
 * stage it stays beside the hero from the top edge.
 */
export function heroCols(lay: { x: number; w: number }, w: number, h: number, leftW = HERO_COL, rightW = HERO_COL) {
  const W = w || FALLBACK_W;
  const miniX = W - 12 - MINI.w;
  const beside = Math.round(lay.x + lay.w + 24);
  const width = Math.max(180, Math.min(rightW, W - 24 - beside));
  const underMini = beside + width > miniX;
  return {
    leftX: Math.max(24, Math.round(lay.x - 24 - leftW)),
    rightX: underMini ? W - 24 - width : beside,
    rightW: width,
    rightTop: underMini ? colTop(h) : 16,
  };
}

/**
 * Where a level's own hero sits inside its *parent's* layout, in stage pixels — the
 * centre a zoom turns around, so a module grows out of its slot, a die out of its place
 * on the module, a core out of its cell on the chiplet. Null for the machine (the stage centre).
 */
export function anchorOf(l: Level, w: number, h: number): { x: number; y: number } | null {
  const W = w || FALLBACK_W;
  const H = h || FALLBACK_H;
  const at = (b: { x: number; y: number; w: number; h: number }, vw: number, vh: number, p: { x: number; y: number; w: number; h: number }) => ({
    x: b.x + ((p.x + p.w / 2) / vw) * b.w,
    y: b.y + ((p.y + p.h / 2) / vh) * b.h,
  });
  const pt = (b: { x: number; y: number; w: number; h: number }, vw: number, vh: number, px: number, py: number) => ({
    x: b.x + (px / vw) * b.w,
    y: b.y + (py / vh) * b.h,
  });
  switch (l.kind) {
    case 'machine':
    case 'memory':
    case 'apps':
      return null;
    case 'drives':
      return at(boardLayout(W, H), MOTHERBOARD.width, MOTHERBOARD.height, MOBO.bay);
    case 'drive':
      return at(boardLayout(W, H), MOTHERBOARD.width, MOTHERBOARD.height, MOBO.drives[l.drive] ?? MOBO.bay);
    case 'stick': {
      const slot = getMachine().dimms[l.dimm]?.slot ?? 0;
      return at(boardLayout(W, H), MOTHERBOARD.width, MOTHERBOARD.height, MOBO.slot(slot));
    }
    case 'package':
      return at(boardLayout(W, H), MOTHERBOARD.width, MOTHERBOARD.height, MOBO.socket);
    case 'card':
      return at(boardLayout(W, H), MOTHERBOARD.width, MOTHERBOARD.height, MOBO.card);
    case 'die': {
      const s = stickLayout(W, H);
      const p = diePos(l.chip);
      return pt(s, STICK.width, STICK.height, p.x + DIE.w / 2, p.y + DIE.h / 2);
    }
    case 'block': {
      const { side } = boxLayout(W, H);
      const x = (W - side) / 2;
      const y = (H - side) / 2;
      const clump = 4 * diePitch() - DIE_GRID.gap;
      return {
        x: x + ((BOX.pad + ((l.cell & 15) + 0.5) * clump) / BOX.size) * side,
        y: y + ((BOX.pad + ((l.cell >> 4) + 0.5) * clump) / BOX.size) * side,
      };
    }
    case 'ccd': {
      const p = packageLayout(W, H);
      return at(p, CPU_DIE.width, CPU_DIE.height, { x: CPU_GEO.ccdX[l.ccd], y: CPU_GEO.ccdY, w: CPU_GEO.ccdW, h: CPU_GEO.ccdH });
    }
    case 'core': {
      const c = ccdLayout(W, H);
      return at(c, CCD.w, CCD.h, coreCell(l.core));
    }
    case 'gdie':
      return at(cardLayout(W, H), GPU_CARD.width, GPU_CARD.height, GPU_GEO.die);
    case 'vram':
      return at(cardLayout(W, H), GPU_CARD.width, GPU_CARD.height, GPU_VRAM);
    default:
      return null;
  }
}

/** Centre-to-centre distance of board cells in the die level's 64 × 64 grid. */
const diePitch = () => (BOX.size - 2 * BOX.pad - (DIE_GRID.n - 1) * DIE_GRID.gap) / DIE_GRID.n + DIE_GRID.gap;

// ---- the page grids of the die and block levels (modeled below board zoom) ------------

/** Die level: each of the die's 256 board blocks opens into a 4 × 4 clump of 64-page cells. */
export const DIE_GRID = { n: 64, gap: 0.9 };
/** Block level: one board block opens into a 16 × 16 grid of 4-page cells. */
export const BLOCK_GRID = { n: 16, gap: 5 };

// ---- geometry of the shared scenes (not exported by scene/*) ---------------------------
// RamBoard: rows of 196 units, two columns; DimmStick: 2 ranks × 8 dies of 52 × 46;
// ChipGrid: 16 × 16 board blocks in a 46-unit square with a 0.22 gap.

const BOARD_CELL = (46 - 15 * 0.22) / 16;
const BOARD_PITCH = BOARD_CELL + 0.22;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
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

// ---- Motherboard (scene/Motherboard.svelte, canvas 960 × 1000) --------------------------
// The shared scene keeps its layout to itself; these are the same numbers, so a level can
// find a part on the board (mini-map outline, zoom anchor, hit-testing for the wheel).

export const MOBO = {
  socket: { x: 140, y: 124, w: 224, h: 224 },
  /** A memory slot by slot index. */
  slot: (i: number): Box => ({ x: 376 + i * 88, y: 70, w: 81, h: 280 }),
  /** The graphics card as placed on the board, lifted cooler included. */
  card: { x: 70 + 0.6 * 8, y: 425 + 0.6 * 8, w: 0.6 * 742, h: 0.6 * 374 },
  /** Where the CPU package and the GPU card sit on the board: translate, then scale. */
  cpuAt: { x: 151, y: 150, s: 0.44 },
  gpuAt: { x: 70, y: 425, s: 0.6 },
  /** The drive bays below the graphics card, and the three drives in them. */
  bay: { x: 76, y: 686, w: 548, h: 216 },
  drives: [
    { x: 96, y: 704, w: 218, h: 60 }, // NVMe stick in its M.2 slot
    { x: 96, y: 772, w: 87, h: 125 }, // 2.5" SATA SSD
    { x: 340, y: 770, w: 182, h: 127 }, // 3.5" hard disk
  ] as [Box, Box, Box],
};

/** CpuDie's layout: two CCDs, each 2 CCX × 4 cores. */
export const CPU_GEO = { ccdX: [50, 240], ccdY: 44, ccdW: 170, ccdH: 134, core: 30, ccxDx: 90 };
export const coreX = (i: number) => CPU_GEO.ccdX[i >> 3] + 8 + ((i >> 2) & 1) * CPU_GEO.ccxDx + (i & 1) * (CPU_GEO.core + 4);
export const coreY = (i: number) => CPU_GEO.ccdY + 22 + ((i >> 1) & 1) * 42;

/**
 * Workaround for a quirk of the shared Motherboard: GpuCard's root is a nested `<svg>` with
 * no `width` / `height` of its own, so on the board it takes the whole 960 × 1000 as its
 * viewport — fitted and centred in it before the group's own transform, i.e. drawn ×1.23 and
 * pushed below its PCIe slot. Giving the element its authored size puts it where
 * scene/Motherboard.svelte places it (which is what `MOBO.gpuAt` mirrors). CSS cannot do it:
 * a nested svg's viewport follows its attributes, not its computed size.
 */
export function seatGpuCard(root: Element | null | undefined): void {
  if (!root) return;
  for (const el of root.querySelectorAll('svg.gpu')) {
    el.setAttribute('width', String(GPU_CARD.width));
    el.setAttribute('height', String(GPU_CARD.height));
  }
}

/** GpuCard's layout: the die and the two rows of VRAM chips. */
export const GPU_GEO = {
  die: { x: 341, y: 240, w: 98, h: 98 },
  pcb: { x: 30, y: 168, w: 720, h: 190 },
  chipW: 68,
  chipH: 24,
  chipX: (c: number) => 131 + (c % 6) * 90,
  chipY: (c: number) => (c < 6 ? 178 : 208),
};
export const GPU_VRAM: Box = { x: 131, y: 178, w: 5 * 90 + 68, h: 54 };

const onBoard = (at: { x: number; y: number; s: number }, b: Box): Box => ({
  x: at.x + at.s * b.x,
  y: at.y + at.s * b.y,
  w: at.s * b.w,
  h: at.s * b.h,
});

/** A module's dies are rotated 90° on the board: map a point of the stick (560 × 162) onto it. */
const stickOnBoard = (slot: number, sx: number, sy: number) => ({ x: 376 + slot * 88 + 81 - 0.5 * sy, y: 70 + 0.5 * sx });

/** A die's place on the motherboard. */
export function dieOnBoard(slot: number, chip: number): Box {
  const p = diePos(chip);
  const a = stickOnBoard(slot, p.x, p.y);
  const b = stickOnBoard(slot, p.x + DIE.w, p.y + DIE.h);
  return { x: b.x, y: a.y, w: a.x - b.x, h: b.y - a.y };
}

/** The centre of a board block on the motherboard. */
export function cellOnBoard(slot: number, chip: number, cell: number): { x: number; y: number } {
  const p = diePos(chip);
  const c = cellPos(cell);
  return stickOnBoard(slot, p.x + c.x + BOARD_CELL / 2, p.y + c.y + BOARD_CELL / 2);
}

export const ccdOnBoard = (ccd: number): Box =>
  onBoard(MOBO.cpuAt, { x: CPU_GEO.ccdX[ccd], y: CPU_GEO.ccdY, w: CPU_GEO.ccdW, h: CPU_GEO.ccdH });

export function coreOnBoard(core: number): { x: number; y: number } {
  const x = MOBO.cpuAt.x + MOBO.cpuAt.s * (coreX(core) + CPU_GEO.core / 2);
  const y = MOBO.cpuAt.y + MOBO.cpuAt.s * (coreY(core) + CPU_GEO.core / 2);
  return { x, y };
}

export const dieOnCard = (): Box => onBoard(MOBO.gpuAt, GPU_GEO.die);
export const vramOnCard = (): Box => onBoard(MOBO.gpuAt, GPU_VRAM);

/** What the mini-map outlines: the part the level is in, the piece of it, and the exact spot (a block, a core). */
export interface Here {
  part: Box;
  inner: Box | null;
  dot: { x: number; y: number } | null;
}

/** A level's place on the motherboard, in the board's own 960 × 1000 units. Null at the machine. */
export function hereOf(l: Level, m: Machine): Here | null {
  switch (l.kind) {
    case 'machine':
      return null;
    case 'stick':
      return { part: MOBO.slot(m.dimms[l.dimm]?.slot ?? 0), inner: null, dot: null };
    case 'die':
    case 'block': {
      const ch = m.chips[l.chip];
      if (!ch) return null;
      const slot = m.dimms[ch.dimm].slot;
      return {
        part: MOBO.slot(slot),
        inner: dieOnBoard(slot, l.chip),
        dot: l.kind === 'block' ? cellOnBoard(slot, l.chip, l.cell) : null,
      };
    }
    case 'package':
      return { part: MOBO.socket, inner: null, dot: null };
    case 'ccd':
      return { part: MOBO.socket, inner: ccdOnBoard(l.ccd), dot: null };
    case 'core':
      return { part: MOBO.socket, inner: ccdOnBoard(l.core >> 3), dot: coreOnBoard(l.core) };
    case 'card':
      return { part: MOBO.card, inner: null, dot: null };
    case 'gdie':
      return { part: MOBO.card, inner: dieOnCard(), dot: null };
    case 'vram':
      return { part: MOBO.card, inner: vramOnCard(), dot: null };
    case 'drives':
      return { part: MOBO.bay, inner: null, dot: null };
    case 'drive':
      return { part: MOBO.bay, inner: MOBO.drives[l.drive] ?? null, dot: null };
    default:
      return null;
  }
}

/** What the pointer is over on the motherboard, in its own 960 × 1000 units. */
export type MoboHit = { kind: 'cpu' } | { kind: 'gpu' } | { kind: 'dimm'; dimm: number } | { kind: 'storage'; drive: number };
export function moboHit(x: number, y: number, m: Machine): MoboHit | null {
  const inBox = (b: Box) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  if (inBox(MOBO.socket)) return { kind: 'cpu' };
  if (inBox(MOBO.card)) return { kind: 'gpu' };
  if (inBox(MOBO.bay)) return { kind: 'storage', drive: MOBO.drives.findIndex(inBox) };
  for (const s of m.slots) if (s.dimm && inBox(MOBO.slot(s.index))) return { kind: 'dimm', dimm: s.dimm.index };
  return null;
}

/** What the pointer is over on the processor package (CpuDie units): a core, else a chiplet. */
export function cpuHit(x: number, y: number): { kind: 'core' | 'ccd'; i: number } | null {
  for (let i = 0; i < 16; i++) {
    const cx = coreX(i);
    const cy = coreY(i);
    if (x >= cx && x <= cx + CPU_GEO.core && y >= cy && y <= cy + CPU_GEO.core) return { kind: 'core', i };
  }
  for (let c = 0; c < 2; c++) {
    if (x >= CPU_GEO.ccdX[c] && x <= CPU_GEO.ccdX[c] + CPU_GEO.ccdW && y >= CPU_GEO.ccdY && y <= CPU_GEO.ccdY + CPU_GEO.ccdH) {
      return { kind: 'ccd', i: c };
    }
  }
  return null;
}

/** What the pointer is over on the graphics card (GpuCard units): a VRAM chip, the die, or just the card. */
export function gpuHit(x: number, y: number): { kind: 'vram'; chip: number } | { kind: 'die' } | null {
  const d = GPU_GEO.die;
  if (x >= d.x && x <= d.x + d.w && y >= d.y && y <= d.y + d.h) return { kind: 'die' };
  for (let c = 0; c < 12; c++) {
    const cx = GPU_GEO.chipX(c);
    const cy = GPU_GEO.chipY(c);
    if (x >= cx && x <= cx + GPU_GEO.chipW && y >= cy && y <= cy + GPU_GEO.chipH) return { kind: 'vram', chip: c };
  }
  return null;
}

// ---- the CCD chiplet of this UX (viewBox CCD.w × CCD.h) ---------------------------------

/** The two CCX panels of the chiplet. */
export const CCX = (x: number) => ({ x: x === 0 ? 56 : 392, y: 62, w: 312, h: 366 });
export const CORE_CELL = 128;
export const CORE_GAP = 16;
/** Where core `i` of this chiplet sits: CCX (i & 4) >> 2, 2 × 2 inside it. */
export function coreCell(i: number): Box {
  const p = CCX((i >> 2) & 1);
  const local = i & 3;
  return { x: p.x + 20 + (local & 1) * (CORE_CELL + CORE_GAP), y: p.y + 46 + (local >> 1) * (CORE_CELL + CORE_GAP), w: CORE_CELL, h: CORE_CELL };
}
/** The L3 cache block under the four cores of a CCX. */
export const l3Cell = (x: number): Box => {
  const p = CCX(x);
  return { x: p.x + 20, y: p.y + 324, w: 2 * CORE_CELL + CORE_GAP, h: 32 };
};

// ---- the GPU die of this UX (viewBox GDIE.w × GDIE.h) ----------------------------------

export const ENGINE_COLS = 3;
export const UNIT = 34;
export const UNIT_GAP = 5;
/** Side of one engine's 4 × 4 block of units. */
export const ENGINE_SIZE = 4 * UNIT + 3 * UNIT_GAP;
const ENGINE_PITCH = 200;
const GDIE_X0 = (GDIE.w - (2 * ENGINE_PITCH + ENGINE_SIZE)) / 2;
const GDIE_Y0 = 32 + (456 - (ENGINE_PITCH + ENGINE_SIZE + 20)) / 2 + 20;

/** Top-left of shader engine `e` (0–5), laid out 3 × 2 like the blocks on the card's die. */
export const enginePos = (e: number): { x: number; y: number } => ({
  x: GDIE_X0 + (e % ENGINE_COLS) * ENGINE_PITCH,
  y: GDIE_Y0 + Math.floor(e / ENGINE_COLS) * ENGINE_PITCH,
});
/** Top-left of unit `i` (0–95) inside the die. */
export function unitPos(i: number): { x: number; y: number } {
  const o = enginePos(Math.floor(i / 16));
  const u = i & 15;
  return { x: o.x + (u & 3) * (UNIT + UNIT_GAP), y: o.y + (u >> 2) * (UNIT + UNIT_GAP) };
}

// ---- the core of this UX (viewBox CORE.w × CORE.h) -------------------------------------

/** The two SMT halves of the core: thread 2·i on the left, 2·i + 1 on the right. */
export const HALF = [
  { x: 76, y: 122, w: 196, h: 292 },
  { x: 288, y: 122, w: 196, h: 292 },
];

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
/**
 * True when a wheel falls inside something in the level that has more content than it shows — a
 * tile column running past a short stage. That wheel belongs to the column: it scrolls it, and at
 * its end it does nothing. It never falls through into the zoom gesture, which would fly the user
 * off to another part for one notch too many.
 */
export function overScrollable(e: WheelEvent): boolean {
  for (let el = e.target instanceof Element ? e.target : null; el && !el.classList.contains('lv'); el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) return true;
  }
  return false;
}

export function levelWheel(step: (dir: 1 | -1, e: WheelEvent) => void): (e: WheelEvent) => void {
  let cool = 0;
  return (e) => {
    if (e.ctrlKey) return; // pinch-zoom
    if (overScrollable(e)) return;
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

// ---- the tooltip of a shared scene promises the wrong click ----------------------------

/**
 * The shared scenes write their own hover cards. Where a click does something else in this
 * UX, the level rewrites the card's hint line (and its note) while the pointer moves.
 */
export function patchHover(hint: string): void {
  const h = app.hover;
  if (!h) return;
  if (h.card.hint === hint) return;
  app.hover = { ...h, card: { ...h.card, hint }, d: h.d ? { ...h.d, note: hint } : undefined };
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
