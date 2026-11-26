/**
 * Readings of the Applications level (levels/AppsLevel.svelte) over the mock's process data.
 *
 * Nothing here is a second model. Every figure is published by the store (`app.stats.procs`)
 * or is a count those stats already carry, converted at the model's own scale (one block is
 * 4 MiB — `MIB_PER_BLOCK`), and each is labelled in the level as what it is:
 *
 *   working set   what the mock reports as the process's working set
 *   blocks        the 4 MiB blocks on the board whose owner the process is — what lights up
 *   private       its own live pages: the active + modified blocks
 *   shared        its share of the mapped-file pages that are active
 *   standby       its blocks in the standby list — reclaimable at any time
 *
 * They are not parts of one whole: the mock's working set is its own figure, and the shared
 * share is not counted among the blocks. The level shows each beside its name and adds none
 * of them up.
 */
import { MIB_PER_BLOCK } from '../mock/model';
import type { MockProcess, ProcStat, Stats } from '../mock/model';

export interface ProcRow {
  /** Owner id in the machine — what `selectProcess` takes. */
  id: number;
  pid: number;
  name: string;
  alive: boolean;
  threads: number;
  /** CPU time in %; 0 once the process has exited. */
  cpuPct: number;
  /** Working set in MiB, as the mock reports it. */
  wsMiB: number;
  /** Blocks of 4 MiB whose owner this process is. */
  blocks: number;
  /** Its own live pages (active + modified), MiB. */
  privateMiB: number;
  /** Its share of the mapped-file pages that are active, MiB. */
  sharedMiB: number;
  /** Its blocks in the standby list, MiB. */
  standbyMiB: number;
}

/** A size in MiB, written the way the model writes blocks (fmtMiB): GiB from 1024 MiB, else MiB (a tenth under 10 MiB, nothing at zero). */
export const mib = (v: number) => (v >= 1024 ? `${(v / 1024).toFixed(2)} GiB` : `${v.toFixed(v > 0 && v < 10 ? 1 : 0)} MiB`);

/** Every process with this tick's readings. `stats` is a fresh object each tick; identity (pid, name, threads) is the machine's. */
export function procRows(stats: Stats | null, defs: readonly MockProcess[]): ProcRow[] {
  if (!stats) return [];
  const byId = new Map(defs.map((p) => [p.id, p]));
  return stats.procs.map((p: ProcStat) => {
    const d = byId.get(p.id);
    return {
      id: p.id,
      pid: d?.pid ?? 0,
      name: d?.name ?? '?',
      alive: p.alive,
      threads: d?.threads ?? 0,
      cpuPct: p.cpuPct,
      wsMiB: p.wsMiB,
      blocks: p.blocks,
      privateMiB: (p.active + p.modified) * MIB_PER_BLOCK,
      sharedMiB: p.sharedMiB,
      standbyMiB: p.standby * MIB_PER_BLOCK,
    };
  });
}

export type SortKey = 'name' | 'pid' | 'wsMiB' | 'blocks' | 'cpuPct' | 'threads';

/** Sorted by one column. Equals keep the order of their names and pids, so the list does not shuffle between ticks. */
export function sortRows(rows: readonly ProcRow[], key: SortKey, desc: boolean): ProcRow[] {
  return [...rows].sort((a, b) => {
    const c = key === 'name' ? a.name.localeCompare(b.name) : a[key] - b[key];
    return (desc ? -c : c) || a.name.localeCompare(b.name) || a.pid - b.pid;
  });
}
