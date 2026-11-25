/**
 * The cockpit's scenes: rail order, titles, and which component's data each one colours.
 * `component` is what the stage header's mode switch gets — a scene without one (Apps)
 * paints no overlay, so it offers no mode switch.
 */
import type { Component } from '../../mock/telemetry';

export type SceneId = 'overview' | 'memory' | 'cpu' | 'gpu' | 'apps';

export interface SceneDef {
  id: SceneId;
  label: string;
  sub: string;
  /** Icon.svelte name, or `gpu` (UX-local glyph — the shared set has none). */
  icon: string;
  /** The component whose pages / temperature / activity / power the scene paints. */
  component?: Component;
}

export const SCENES: SceneDef[] = [
  { id: 'overview', label: 'Overview', sub: 'The whole machine at a glance', icon: 'overview', component: 'memory' },
  { id: 'memory', label: 'Memory', sub: 'Physical pages across every DIMM and chip', icon: 'memory', component: 'memory' },
  { id: 'cpu', label: 'Processor', sub: 'Package, chiplets, per-core telemetry', icon: 'cpu', component: 'cpu' },
  { id: 'gpu', label: 'GPU', sub: 'Graphics card: die, VRAM, engines, per-process memory', icon: 'gpu', component: 'gpu' },
  { id: 'apps', label: 'Apps', sub: 'Which process owns which pages', icon: 'apps' },
];

/** `?scene=` — anything unknown opens on Memory. */
export function sceneFromUrl(): SceneId {
  const s = new URLSearchParams(location.search).get('scene');
  return SCENES.find((x) => x.id === s)?.id ?? 'memory';
}
