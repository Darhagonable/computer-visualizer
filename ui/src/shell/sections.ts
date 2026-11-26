/**
 * The six sections every UX offers in its side menu, and what each row shows live.
 *
 * The menu is the one navigation all three UXs share: Overview · Processor · Memory · Storage ·
 * Graphics · Applications. `SECTION_LEVEL` (levels/nav.ts) says which part view a section opens.
 *
 * ─── What a row shows, and how honest it is ───────────────────────────────────────────────────
 * The mode is global, so a row's figure follows it — a processor reads "84 °C" on a screen that
 * is coloured by temperature, "46 %" on one coloured by activity. Each figure therefore carries
 * the truth of THAT FIGURE, which is not always the truth of the overlay:
 *
 *   · a reading from a sensor or a counter is measured: the hottest core, the GPU's own
 *     temperature, a module's sensor, an NVMe drive's temperature, package and board power,
 *     a load, an engine's utilisation, a drive's busy time. The overlay built on the same
 *     thing may be estimated or modelled — the spread across a die, the split between
 *     partitions — and its guide says so; the row is about the number it shows. Rows where the
 *     row's word is not TRUTH[mode][component]'s, and why:
 *       graphics · temperature   row "measured", overlay "modelled": TRUTH_NOTE.temperature.gpu
 *                 · activity     row "measured", overlay "modelled": TRUTH_NOTE.activity.gpu
 *       memory   · temperature   row "measured", overlay "estimated": TRUTH_NOTE.temperature.memory
 *       processor· power         row "measured", overlay "estimated": TRUTH_NOTE.power.cpu
 *       graphics · power         row "measured", overlay "estimated": TRUTH_NOTE.power.gpu
 *     Each of those notes says the same: the total is a reading, the split is not.
 *   · memory: per-page activity is modelled and watts are estimated — as the overlay is.
 *   · storage: watts are estimated; a drive without a temperature sensor shows "—", never a
 *     guess.
 *
 * Every word below is one of TRUTH's, and every reason is TRUTH_NOTE's (telemetry.ts), except
 * where a row shows a plain fact outside any overlay (a load, a count): those say what the fact
 * is. Nothing here derives a value that telemetry.ts does not publish.
 */
import { app, getMachine } from '../mock/store.svelte';
import { DOMAIN, TRUTH_NOTE, type DriveLive, type Truth } from '../mock/telemetry';
import { SECTION_LEVEL, type Level, type Section } from '../levels/nav';
import { allChips, chipsHeat, fmt, heatWatts, warmestDimm } from '../levels/live';

export interface SectionDef {
  id: Section;
  label: string;
  /** One line: what the section is about (the row's tooltip). */
  sub: string;
  /** Icon.svelte name. */
  icon: string;
  /** The sparkline's colour: the hue the section's data is drawn in elsewhere. */
  color: string;
}

export const SECTIONS: SectionDef[] = [
  { id: 'overview', label: 'Overview', sub: 'The whole machine', icon: 'overview', color: 'var(--ink3)' },
  { id: 'processor', label: 'Processor', sub: 'Package, chiplets, cores', icon: 'cpu', color: 'var(--accent)' },
  { id: 'memory', label: 'Memory', sub: 'Modules, dies, blocks, pages', icon: 'memory', color: 'var(--c-private)' },
  { id: 'storage', label: 'Storage', sub: 'Drives and their partitions', icon: 'storage', color: 'var(--c-file)' },
  { id: 'graphics', label: 'Graphics', sub: 'The card: die, VRAM, engines', icon: 'gpu', color: 'var(--c-pagefile)' },
  { id: 'applications', label: 'Applications', sub: 'Processes and the memory they hold', icon: 'apps', color: 'var(--accent)' },
];

/** The part view a section opens. */
export const sectionLevel = (s: Section): Level => SECTION_LEVEL[s];

export interface SectionLive {
  /** The figure, without its unit; "—" when there is nothing to show. */
  value: string;
  unit: string;
  /** What the figure is, in a few words. It may name a part ("hottest core", "busiest: …"). */
  caption: string;
  /** The truth of this figure; null when there is no reading ("—" is shown). */
  truth: Truth | null;
  /** Why it is what it is — one line, for the tooltip. */
  why: string;
  /** Something worth knowing that does not fit the caption (tooltip only). */
  more?: string;
  /** The figure's history, when there is a ring for it. */
  ring?: { values: number[]; max: number };
}

const NONE = (caption: string, why = ''): SectionLive => ({ value: '—', unit: '', caption, truth: null, why });

/** The figure's decimals: loads and temperatures whole, watts and sensor temperatures tenths. */
const short = (model: string) => model.replace(/^Mock /, '');

/**
 * What a section's row shows right now. Reads the tick, the stats and the telemetry, so it is
 * fresh whenever it is evaluated from a template or a `$derived`.
 */
export function sectionLive(s: Section): SectionLive {
  void app.version; // the readings are mutated in place: depend on the tick explicitly
  const mode = app.mode;
  const st = app.stats;
  const cpu = app.cpu;
  const tele = app.tele;
  const g = tele?.gpu ?? null;
  if (!st || !cpu || !tele || !g) return NONE('waiting for the mock');

  const m = getMachine();
  const drives = tele.storage;
  const busiest = drives.reduce<DriveLive | null>((a, d) => (!a || d.busyPct > a.busyPct ? d : a), null);
  const sensed = drives.filter((d) => d.tempC !== null);
  const memPct = (st.inUse / st.total) * 100;

  switch (s) {
    case 'overview':
      return {
        value: fmt(memPct),
        unit: '%',
        caption: 'memory in use',
        truth: 'measured',
        why: 'Active and modified pages: what the system counts as in use.',
        ring: { values: app.hist.mem, max: 100 },
      };

    case 'processor':
      if (mode === 'temperature')
        return {
          value: fmt(cpu.maxTemp),
          unit: '°C',
          caption: 'hottest core',
          truth: 'measured',
          why: TRUTH_NOTE.temperature.cpu,
          ring: { values: app.hist.temp, max: DOMAIN.temperature.cpu[1] },
        };
      if (mode === 'power')
        return { value: fmt(cpu.power), unit: 'W', caption: 'package power', truth: 'measured', why: TRUTH_NOTE.power.cpu };
      return {
        value: fmt(cpu.avgLoad),
        unit: '%',
        caption: 'load',
        truth: 'measured',
        why: mode === 'pages' ? 'Scheduler time across the cores.' : TRUTH_NOTE.activity.cpu,
        ring: { values: app.hist.cpu, max: 100 },
      };

    case 'memory': {
      if (mode === 'temperature') {
        const w = warmestDimm(tele, m);
        return {
          value: fmt(w.temp, 1),
          unit: '°C',
          caption: `${m.slots[m.dimms[w.dimm].slot].label} · its sensor`,
          truth: 'measured',
          why: TRUTH_NOTE.temperature.memory,
        };
      }
      if (mode === 'activity' || mode === 'power') {
        const mean = chipsHeat(tele, allChips(m)).mean;
        return mode === 'activity'
          ? { value: fmt(mean * 100), unit: '%', caption: 'mean page heat', truth: 'modelled', why: TRUTH_NOTE.activity.memory }
          : { value: `≈ ${fmt(heatWatts(mean), 1)}`, unit: 'W', caption: 'all modules', truth: 'estimated', why: TRUTH_NOTE.power.memory };
      }
      return {
        value: fmt(memPct),
        unit: '%',
        caption: 'in use',
        truth: 'measured',
        why: 'Active and modified pages: what the system counts as in use.',
        ring: { values: app.hist.mem, max: 100 },
      };
    }

    case 'storage':
      if (mode === 'temperature') {
        if (sensed.length === 0) return NONE('no drive reports a temperature', TRUTH_NOTE.temperature.storage);
        const d = sensed[0];
        return {
          value: fmt(d.tempC ?? 0, 1),
          unit: '°C',
          caption: `${short(d.model)} · its sensor`,
          truth: 'measured',
          why: TRUTH_NOTE.temperature.storage,
          more: sensed.length < drives.length ? `${sensed.length} of ${drives.length} drives reports a temperature.` : '',
        };
      }
      if (mode === 'power') {
        const w = drives.reduce((sum, d) => sum + d.power, 0);
        return { value: `≈ ${fmt(w, 1)}`, unit: 'W', caption: 'all drives', truth: 'estimated', why: TRUTH_NOTE.power.storage };
      }
      if (!busiest) return NONE('no drives');
      return {
        value: fmt(busiest.busyPct),
        unit: '%',
        caption: `busiest: ${short(busiest.model)}`,
        truth: 'measured',
        why: mode === 'pages' ? 'Share of time the drive had a request outstanding.' : TRUTH_NOTE.activity.storage,
        ring: { values: app.hist.storage, max: 100 },
      };

    case 'graphics':
      if (mode === 'temperature')
        return {
          value: fmt(g.temp),
          unit: '°C',
          caption: 'GPU sensor',
          truth: 'measured',
          why: TRUTH_NOTE.temperature.gpu,
          ring: { values: app.hist.gpuTemp, max: DOMAIN.temperature.gpu[1] },
        };
      if (mode === 'power') return { value: fmt(g.power), unit: 'W', caption: 'board power', truth: 'measured', why: TRUTH_NOTE.power.gpu };
      return {
        value: fmt(g.engines['3d']),
        unit: '%',
        caption: '3D engine load',
        truth: 'measured',
        why: mode === 'pages' ? 'Engine utilisation, as the driver reports it.' : TRUTH_NOTE.activity.gpu,
        ring: { values: app.hist.gpu, max: 100 },
      };

    case 'applications': {
      const n = st.procs.filter((p) => p.alive).length;
      return { value: String(n), unit: '', caption: 'running processes', truth: 'measured', why: 'The processes the system lists as running.' };
    }
  }
}
