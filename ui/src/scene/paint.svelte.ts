/**
 * Cell colouring shared by every grid. Two dimensions, one colour:
 *   hue       = use class  → what a live page is *for* (private / file / pagefile / kernel)
 *   intensity = page state → whether it is live (active), cached (standby) or dirty (modified)
 * Free / zeroed / bad pages ignore hue. Colours come from CSS custom properties so each
 * UX theme restyles the board without touching the grid code.
 */
import { app, getMachine } from '../mock/store.svelte';
import { State, Use, useFamilyIndex, STATE_COUNT } from '../mock/model';

export interface Palette {
  lut: string[];
  dim: string;
  hidden: string;
  shared: string;
  hue: string[];
}

interface PaintState {
  pal: Palette;
  stateOn: Uint8Array;
  stateMatch: Uint8Array;
  useMatch: Uint8Array;
  ownerMatch: Uint8Array;
  dimAll: boolean;
}

/** Bumped whenever highlight / visibility / theme changes → grids fully recolour. */
export const paint = $state({ rev: 0 });

function blankPalette(): Palette {
  return { lut: new Array<string>(256).fill('#333'), dim: '#222', hidden: '#111', shared: '', hue: [] };
}

export const ps: PaintState = {
  pal: blankPalette(),
  stateOn: new Uint8Array(16).fill(1),
  stateMatch: new Uint8Array(16).fill(1),
  useMatch: new Uint8Array(16).fill(1),
  ownerMatch: new Uint8Array(0),
  dimAll: false,
};

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** `#rgb`, `#rrggbb`, `rgb()`, `rgba()` → rgba() with the given alpha. */
export function withAlpha(color: string, a: number): string {
  const c = color.trim();
  let r = 0;
  let g = 0;
  let b = 0;
  if (c[0] === '#') {
    const h = c.slice(1);
    if (h.length === 3) {
      r = parseInt(h[0] + h[0], 16);
      g = parseInt(h[1] + h[1], 16);
      b = parseInt(h[2] + h[2], 16);
    } else {
      r = parseInt(h.slice(0, 2), 16);
      g = parseInt(h.slice(2, 4), 16);
      b = parseInt(h.slice(4, 6), 16);
    }
  } else {
    const m = c.match(/[\d.]+/g);
    if (!m || m.length < 3) return c;
    r = +m[0];
    g = +m[1];
    b = +m[2];
  }
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function readPalette(): Palette {
  const v = cssVar;
  const family = [v('--c-private'), v('--c-file'), v('--c-pagefile'), v('--c-kernel')];
  const hue = Array.from({ length: 16 }, (_, u) => family[useFamilyIndex(u)]);
  const free = v('--c-free');
  const zeroed = v('--c-zeroed');
  const bad = v('--c-bad');
  const modified = v('--c-modified');
  const lut = new Array<string>(256).fill(bad);
  for (let u = 0; u < 16; u++) {
    lut[(u << 4) | State.Zeroed] = zeroed;
    lut[(u << 4) | State.Free] = free;
    lut[(u << 4) | State.Standby] = withAlpha(hue[u], 0.34);
    lut[(u << 4) | State.Modified] = modified;
    lut[(u << 4) | State.Active] = hue[u];
  }
  return { lut, dim: v('--c-dim'), hidden: v('--c-hidden'), shared: v('--shared-stroke'), hue };
}

let lastKey = '';

/**
 * Recompute the shared paint state. Must be called from an `$effect` after the
 * `data-ux` attribute is set, so theme variables are current.
 */
export function refreshPaint(): void {
  const h = app.highlight;
  const vis = app.visible;
  const ux = app.ux;
  const key = JSON.stringify(h) + '|' + vis.join('') + '|' + ux;
  if (key === lastKey) return;
  lastKey = key;

  const m = getMachine();
  ps.pal = readPalette();
  ps.stateOn = new Uint8Array(16).fill(1);
  for (let i = 0; i < STATE_COUNT; i++) ps.stateOn[i] = vis[i] ? 1 : 0;
  ps.ownerMatch = new Uint8Array(m.owners.length).fill(1);
  ps.stateMatch = new Uint8Array(16).fill(1);
  ps.useMatch = new Uint8Array(16).fill(1);
  ps.dimAll = false;
  if (h) {
    ps.dimAll = true;
    if (h.kind === 'owner') {
      ps.ownerMatch.fill(0);
      ps.ownerMatch[h.id] = 1;
    } else if (h.kind === 'state') {
      ps.stateMatch.fill(0);
      ps.stateMatch[h.state] = 1;
    } else if (h.kind === 'family') {
      ps.useMatch.fill(0);
      for (let u = 0; u < 16; u++) ps.useMatch[u] = useFamilyIndex(u) === h.family ? 1 : 0;
    } else {
      ps.useMatch.fill(0);
      ps.useMatch[h.use] = 1;
    }
  }
  paint.rev++;
}

/** Final colour of block `i`. */
export function colorOf(cells: Uint8Array, owners: Uint16Array, i: number): string {
  const v = cells[i];
  const s = v & 15;
  if (!ps.stateOn[s]) return ps.pal.hidden;
  if (ps.dimAll) {
    if (!ps.ownerMatch[owners[i]] || !ps.stateMatch[s] || !ps.useMatch[v >> 4]) return ps.pal.dim;
  }
  return ps.pal.lut[v];
}

export function familyColor(use: number): string {
  return ps.pal.hue[use] ?? ps.pal.hue[Use.File];
}
