/**
 * What the stage header calls a section while one of Instrument's own views is on stage, and
 * the cockpit's own URL hook.
 *
 * The navigation is the shared shell's: the side menu's six sections, the part view a section
 * opens (`shell/sections.ts` → `levels/nav.ts`), and the shared part views below it. A section
 * lands on this UX's own scene where it has one; its name in the header is then the menu's,
 * and the line under it is the cockpit's.
 */
import { levelFromUrl, type Level, type Section } from '../../levels/nav';
import { sectionLevel } from '../../shell/sections';
import type { Machine } from '../../mock/model';

/**
 * The element an event was fired at — for a door to say where it was opened, so that the zoom
 * can turn around it (see `onnavigate`).
 */
export function door(e: Event): Element | undefined {
  return e.currentTarget instanceof Element ? e.currentTarget : undefined;
}

/** `?scene=` as the cockpit's rail knew it, plus the names the shared menu goes by. */
const SCENE_OF: Record<string, Section> = {
  overview: 'overview',
  memory: 'memory',
  cpu: 'processor',
  gpu: 'graphics',
  apps: 'applications',
  processor: 'processor',
  graphics: 'graphics',
  applications: 'applications',
  storage: 'storage',
};

/** `?scene=` — the section it names, or null when it is absent or unknown. */
export function sceneFromUrl(): Section | null {
  return SCENE_OF[new URLSearchParams(location.search).get('scene') ?? ''] ?? null;
}

/** The level the page opens on: `?scene=` (where that section lands), else the shared `?level=` / `?part=`. */
export function startLevel(m: Machine): Level {
  const s = sceneFromUrl();
  return s ? sectionLevel(s) : levelFromUrl(m);
}

/** The line under the section's name in the stage header, on this UX's own view of it. */
export const SCENE_SUB: Partial<Record<Section, string>> = {
  overview: 'The whole machine at a glance',
  memory: 'Physical pages across every DIMM and chip',
  processor: 'Package, chiplets, per-core telemetry',
  graphics: 'Graphics card: die, VRAM, engines, per-process memory',
  applications: 'Which process owns which pages',
};
