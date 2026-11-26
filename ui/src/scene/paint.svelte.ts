/**
 * Cell colouring shared by every grid. What a colour MEANS depends on the mode:
 *
 *   pages        hue = use class (what a live page is for)
 *                intensity = page state (active / standby / modified / free)
 *   temperature  a thermal ramp, °C
 *   activity     a sequential ramp, % busy
 *   power        a sequential ramp, W
 *
 * Overlay values come from the scene (a telemetry number per cell). Colours are built from
 * CSS custom properties so each UX theme restyles everything without touching grid code.
 */
import { app, getMachine } from '../mock/store.svelte';
import { State, Use, useFamilyIndex, STATE_COUNT } from '../mock/model';
import { DOMAIN, cellActivity, cellPower, cellTemperature, memoryTempRange, type Mode, type Overlay, type Component, type Tele } from '../mock/telemetry';

export interface Palette {
  /** [use << 4 | state] → colour, for the "pages" mode. */
  lut: string[];
  dim: string;
  hidden: string;
  noData: string;
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
  /** The overlay every grid currently encodes. */
  mode: Mode;
  /** 65-step colour tables for the three overlays. */
  ramps: Record<Overlay, string[]>;
}

/** Bumped whenever highlight / visibility / theme / mode changes → grids fully recolour. */
export const paint = $state({ rev: 0 });

const RAMP_STEPS = 64;

function blankPalette(): Palette {
  return { lut: new Array<string>(256).fill('#333'), dim: '#222', hidden: '#111', noData: '#000', shared: '', hue: [] };
}

export const ps: PaintState = {
  pal: blankPalette(),
  stateOn: new Uint8Array(16).fill(1),
  stateMatch: new Uint8Array(16).fill(1),
  useMatch: new Uint8Array(16).fill(1),
  ownerMatch: new Uint8Array(0),
  dimAll: false,
  mode: 'pages',
  ramps: { temperature: [], activity: [], power: [] },
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

/** Interpolate a colour table from equally spaced stops. */
function buildRamp(stops: string[]): string[] {
  const rgb = stops
    .filter((s) => s.startsWith('#') && s.length >= 7)
    .map((s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]);
  if (rgb.length < 2) return new Array<string>(RAMP_STEPS + 1).fill('#808080');
  const out: string[] = [];
  for (let i = 0; i <= RAMP_STEPS; i++) {
    const x = (i / RAMP_STEPS) * (rgb.length - 1);
    const a = Math.min(rgb.length - 2, Math.floor(x));
    const t = x - a;
    const c = rgb[a].map((v, k) => Math.round(v + (rgb[a + 1][k] - v) * t));
    out.push(`rgb(${c[0]},${c[1]},${c[2]})`);
  }
  return out;
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
  return { lut, dim: v('--c-dim'), hidden: v('--c-hidden'), noData: v('--c-nodata'), shared: v('--shared-stroke'), hue };
}

export function readRamps(): Record<Overlay, string[]> {
  const split = (name: string) => cssVar(name).split(/\s+/).filter(Boolean);
  return {
    temperature: buildRamp(split('--ramp-thermal')),
    activity: buildRamp(split('--ramp-activity')),
    power: buildRamp(split('--ramp-power')),
  };
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
  const mode = app.mode;
  const key = JSON.stringify(h) + '|' + vis.join('') + '|' + ux + '|' + mode;
  if (key === lastKey) return;
  lastKey = key;

  const m = getMachine();
  ps.pal = readPalette();
  ps.ramps = readRamps();
  ps.mode = mode;
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

/** Colour of block `i` in "pages" mode. */
export function colorOf(cells: Uint8Array, owners: Uint16Array, i: number): string {
  const v = cells[i];
  const s = v & 15;
  if (!ps.stateOn[s]) return ps.pal.hidden;
  if (ps.dimAll) {
    if (!ps.ownerMatch[owners[i]] || !ps.stateMatch[s] || !ps.useMatch[v >> 4]) return ps.pal.dim;
  }
  return ps.pal.lut[v];
}

// ---- overlays -----------------------------------------------------------------

export function rampColor(ramp: Overlay, t: number): string {
  // Reading the revision makes callers that run inside a `$derived` / template / `$effect`
  // recompute when the ramps (re)load — otherwise shapes stay grey until something else changes.
  void paint.rev;
  return ps.ramps[ramp][Math.max(0, Math.min(RAMP_STEPS, Math.round(t * RAMP_STEPS)))] ?? '#808080';
}

/**
 * The range a ramp spans for a component right now. Memory temperature follows the module
 * sensors (see `memoryTempRange`); everything else is the fixed range. Reading `app.tele`
 * makes callers recompute when the sensors move.
 */
export function rangeFor(ramp: Overlay, component: Component): [number, number] {
  return ramp === 'temperature' && component === 'memory' ? memoryTempRange(app.tele) : DOMAIN[ramp][component];
}

/** 0–1 position of a value on its component's ramp. */
export function norm(ramp: Overlay, component: Component, value: number): number {
  const [lo, hi] = rangeFor(ramp, component);
  return (value - lo) / (hi - lo);
}

/**
 * Colour of a reading on the ramp of the overlay it is shown by — the caller passes the overlay
 * *that part* is on, since a part without pages (a processor, a drive) stays on its temperature
 * colours while the global mode is "pages". `null` / `undefined` means "no data".
 *
 * Reads the paint revision on every path: the palette comes from the theme, which is not loaded
 * on the first render, and `ps` itself is not reactive.
 */
export function metricColor(ramp: Overlay, component: Component, value: number | null | undefined): string {
  void paint.rev;
  return value === null || value === undefined ? ps.pal.noData : rampColor(ramp, norm(ramp, component, value));
}

/** A CSS `linear-gradient()` of a ramp — for scale legends. */
export function rampCss(ramp: Overlay): string {
  return `linear-gradient(90deg, ${ps.ramps[ramp].filter((_, i) => i % 8 === 0 || i === RAMP_STEPS).join(', ')})`;
}

/**
 * Overlay values of a board chip straight from the mock telemetry:
 *   temperature → the die's estimate (± a hair of texture)
 *   activity    → modelled page heat
 *   power       → estimate from that heat
 * Callers with their own idea of the values pass an `overlay` callback instead.
 */
export function boardOverlay(tele: Tele, chip: number): ((cell: number) => number) | null {
  switch (ps.mode) {
    case 'temperature':
      return (cell) => cellTemperature(tele, chip, cell);
    case 'activity':
      return (cell) => cellActivity(tele, chip, cell);
    case 'power':
      return (cell) => cellPower(tele, chip, cell);
    default:
      return null;
  }
}

export function familyColor(use: number): string {
  return ps.pal.hue[use] ?? ps.pal.hue[Use.File];
}
