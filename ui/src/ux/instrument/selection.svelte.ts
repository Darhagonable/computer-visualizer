/**
 * Instrument-local selection and history.
 *
 * The global store's selection model is memory: pages → processes / files → DIMMs. What was
 * *clicked* on the Processor and GPU scenes (a core, a chiplet, the GPU, a VRAM chip) is this
 * cockpit's own concern, so it lives here — a module-level `$state`, nothing global.
 *
 * Also here:
 *   · the overlay a component paints right now ("pages" is memory data; the processor and
 *     the GPU fall back to temperature, exactly like scene/CpuDie.svelte and GpuCard.svelte)
 *   · a small ring buffer per pinned part, behind the inspector's sparkline
 *   · a replay of the mock's VRAM placement, so a chip can say what it (modelled) holds
 */
import { app } from '../../mock/store.svelte';
import { hash32 } from '../../mock/rng';
import { MODE_META, TRUTH, VRAM_CHIPS, VRAM_CHIP_MIB, modeApplies, type Component, type Overlay, type Truth } from '../../mock/telemetry';

/** A part pinned in the inspector. `part` on the GPU says what was clicked: the die or the board. */
export type Part =
  | { kind: 'core'; index: number }
  | { kind: 'ccd'; index: number }
  | { kind: 'gpu'; part?: 'die' | 'card' }
  | { kind: 'vram'; chip: number };

export const sel = $state<{ part: Part | null }>({ part: null });

export function pin(p: Part): void {
  sel.part = p;
}
export function unpin(): void {
  sel.part = null;
}

// ---- naming / serialising (select controls, ?pick=) -------------------------

export function partLabel(p: Part): string {
  switch (p.kind) {
    case 'core':
      return `Core ${p.index + 1}`;
    case 'ccd':
      return `CCD ${p.index}`;
    case 'vram':
      return `VRAM chip ${p.chip + 1}`;
    default:
      return p.part === 'card' ? 'Graphics card' : 'GPU die';
  }
}

export function partKey(p: Part | null): string {
  if (!p) return '';
  switch (p.kind) {
    case 'core':
      return `core:${p.index}`;
    case 'ccd':
      return `ccd:${p.index}`;
    case 'vram':
      return `vram:${p.chip}`;
    default:
      return p.part === 'card' ? 'card' : 'gpu';
  }
}

export function partFromKey(k: string): Part | null {
  const [kind, n] = k.split(':');
  const i = Number(n);
  if (kind === 'core' && Number.isInteger(i) && i >= 0 && i < 16) return { kind, index: i };
  if (kind === 'ccd' && (i === 0 || i === 1)) return { kind, index: i };
  if (kind === 'vram' && Number.isInteger(i) && i >= 0 && i < VRAM_CHIPS) return { kind, chip: i };
  if (kind === 'gpu') return { kind: 'gpu', part: 'die' };
  if (kind === 'card') return { kind: 'gpu', part: 'card' };
  return null;
}

// ---- what the colours mean right now ----------------------------------------

export function overlayOf(c: Component): Overlay {
  return modeApplies(app.mode, c) ? (app.mode as Overlay) : 'temperature';
}
export function truthOf(c: Component): Truth {
  return TRUTH[overlayOf(c)][c];
}

/**
 * The GPU's reading guide. Temperature and activity use the component's own range, so the
 * note only has to say what is modelled. Power does not: the card paints a die unit against
 * 0–6 W and a VRAM chip against 0–5 W — parts of the board, not board watts
 * (scene/GpuCard.svelte) — so the scale legend must show that range, or a 3 W unit would
 * read as nothing on a 0–450 W bar.
 */
export const GPU_NOTE = 'per unit · die spread modelled';
export const GPU_UNIT_POWER: [number, number] = [0, 6];
export const GPU_POWER_NOTE = 'per unit 0–6 W · VRAM chips 0–5 W';

/** A core's reading on an overlay — the same rule the die paints by. */
export function coreValue(i: number, ov: Overlay): number {
  const c = app.cpu?.cores[i];
  if (!c) return 0;
  if (ov === 'activity') return c.load;
  if (ov === 'power') return app.tele?.corePower[i] ?? 0;
  return c.temp;
}

export function ccdValue(d: number, ov: Overlay): number {
  let s = 0;
  let n = 0;
  for (const c of app.cpu?.cores ?? []) if (c.ccd === d) (s += coreValue(c.index, ov)), n++;
  return n ? s / n : 0;
}

/** The GPU's reading on an overlay: 3D load, board power, or the GPU sensor. */
export function gpuValue(ov: Overlay): number | null {
  const g = app.tele?.gpu;
  if (!g) return null;
  if (ov === 'activity') return g.engines['3d'];
  if (ov === 'power') return g.power;
  return g.temp;
}

const fixed = (v: number, ov: Overlay) => (ov === 'power' ? v.toFixed(1) : ov === 'activity' ? String(Math.round(v)) : v.toFixed(1));

/**
 * One live reading for the pin chip in the stage header, or for the "pin" control in a scene
 * panel when the stage is too narrow for the chip (`short`: no "of 2,048 MiB").
 */
export function partReading(p: Part, short = false): string {
  if (p.kind === 'vram') {
    const used = Math.round((app.tele?.gpu.chipUsage[p.chip] ?? 0) * VRAM_CHIP_MIB).toLocaleString('en-US');
    return short ? `${used} MiB` : `${used} of ${VRAM_CHIP_MIB} MiB`;
  }
  if (p.kind === 'gpu') {
    const ov = overlayOf('gpu');
    const v = gpuValue(ov);
    return v === null ? '–' : `${fixed(v, ov)} ${MODE_META[ov].unit}`;
  }
  // per-core and per-chiplet watts are estimated — the "≈" stays
  const ov = overlayOf('cpu');
  const v = p.kind === 'core' ? coreValue(p.index, ov) : ccdValue(p.index, ov);
  return `${ov === 'power' ? '≈ ' : ''}${fixed(v, ov)} ${MODE_META[ov].unit}`;
}

// ---- ring buffer for the sparklines -----------------------------------------

const RING = 60;
const rings = new Map<'core' | 'gpu', number[]>();
/**
 * Bumped on every sample: the arrays are plain, so this is what re-renders a sparkline.
 * `sample()` runs in an effect, and an effect must not read the state it writes (`n++` would)
 * — so the counter itself lives outside the state and is only ever assigned to it.
 */
export const ringRev = $state({ n: 0 });
let rev = 0;
let lastTick = -1;
let lastKey = '';

/**
 * Call from an effect once per tick. Appends what the scene paints for the pinned part, so
 * the sparkline always shows the quantity the die is coloured by. The buffer restarts when
 * another part is pinned, when the overlay changes, or when the mock is reset.
 */
export function sample(): void {
  const p = sel.part;
  const key = p ? `${partKey(p)}|${p.kind === 'gpu' ? overlayOf('gpu') : overlayOf('cpu')}` : '';
  if (app.tick < lastTick || key !== lastKey) rings.clear();
  lastTick = app.tick;
  lastKey = key;
  if (!p) return;
  let kind: 'core' | 'gpu';
  let v: number | null;
  if (p.kind === 'core') {
    kind = 'core';
    v = coreValue(p.index, overlayOf('cpu'));
  } else if (p.kind === 'gpu') {
    kind = 'gpu';
    v = gpuValue(overlayOf('gpu'));
  } else {
    return; // a chiplet or a VRAM chip has no sparkline
  }
  if (v === null) return;
  const arr = rings.get(kind) ?? [];
  if (arr.length >= RING) arr.shift();
  arr.push(v);
  rings.set(kind, arr);
  ringRev.n = ++rev;
}

/** A copy, so a consumer's `$derived` sees a new array whenever a sample arrives. */
export function ringOf(kind: 'core' | 'gpu'): number[] {
  void ringRev.n;
  return [...(rings.get(kind) ?? [])];
}

// ---- the mock's VRAM placement, replayed ------------------------------------

/** Stripes each process is spread over in mock/telemetry.ts (`k < 16`). */
const STRIPES = 16;

/**
 * What a VRAM chip holds, per the mock's placement: every process is striped across the
 * chips by a fixed hash. This is MODELLED — no OS exposes VRAM placement — and it is the
 * same split the usage bar on the card is drawn from.
 */
export function vramContents(chip: number): { name: string; mib: number }[] {
  const g = app.tele?.gpu;
  if (!g || chip < 0 || chip >= VRAM_CHIPS) return [];
  const out: { name: string; mib: number }[] = [];
  g.procs.forEach((p, pi) => {
    let n = 0;
    for (let k = 0; k < STRIPES; k++) if (hash32(pi, k) % VRAM_CHIPS === chip) n++;
    if (n) out.push({ name: p.name, mib: (p.mib / STRIPES) * n });
  });
  return out.sort((a, b) => b.mib - a.mib);
}

/** What is in VRAM beyond the processes: driver + desktop composition (the mock adds 410 MiB). */
export function vramOverhead(): number {
  const g = app.tele?.gpu;
  if (!g) return 0;
  return Math.round(g.vramUsedMiB - g.procs.reduce((s, p) => s + p.mib, 0));
}
