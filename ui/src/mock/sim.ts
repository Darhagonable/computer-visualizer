/**
 * Mock simulation: the page churn you would see on a live machine, plus scripted
 * scenarios the mock controls can trigger. Purely synthetic — no OS code paths.
 */
import { State, Use, CELLS_PER_CHIP, pack, stateOf, useOf } from './model';
import type { Machine, Stats, ProcStat, OwnerStat, CpuLive, CoreLive } from './model';
import { mulberry32, type Rng } from './rng';

export type Scenario = 'fileChurn' | 'allocBurst' | 'closeApp' | 'purgeStandby';
export const SCENARIO_LABEL: Record<Scenario, string> = {
  fileChurn: 'File cache churn',
  allocBurst: 'Allocation burst',
  closeApp: 'Close application',
  purgeStandby: 'Purge standby list',
};

interface Phase {
  kind: Scenario;
  owner: number;
  start: number;
  blocks: number[];
}

export class Sim {
  readonly m: Machine;
  /** Packed block indices (chip << 8 | cell) changed in the last tick. */
  changes: number[] = [];
  cpu: CpuLive;
  onlog: (msg: string) => void = () => {};

  private rng: Rng;
  private tickNo = 0;
  private changedAt: Uint32Array;
  private ownerBlocks: number[][];
  private ownerPos: Int32Array;
  private phase: Phase | null = null;
  private queue: { kind: Scenario; owner: number }[] = [];
  private coreTarget: number[];

  constructor(m: Machine, seed: number) {
    this.m = m;
    this.rng = mulberry32((seed ^ 0x51ed270b) >>> 0);
    this.changedAt = new Uint32Array(m.total).fill(0xffffffff);
    this.ownerBlocks = m.owners.map(() => []);
    this.ownerPos = new Int32Array(m.total).fill(-1);
    for (let p = 0; p < m.total; p++) this.addToOwner(m.chips[p >> 8].owners[p & 255], p);

    // A game pinned to CCD0: those cores run hot and loaded, the rest idle-ish.
    this.coreTarget = Array.from({ length: 16 }, (_, i) => (i < 8 ? 55 + this.rng() * 40 : 5 + this.rng() * 25));
    this.cpu = { cores: [], avgLoad: 0, maxTemp: 0, power: 0 };
    for (let i = 0; i < 16; i++) this.cpu.cores.push({ index: i, ccd: i >> 3, load: this.coreTarget[i], temp: 40, freq: 3.8 });
    this.cpu = this.cpuStep();
  }

  get currentTick(): number {
    return this.tickNo;
  }

  enqueue(kind: Scenario, owner = 0): void {
    this.queue.push({ kind, owner });
  }

  /** Blocks currently owned by `owner`. */
  blocksOf(owner: number): readonly number[] {
    return this.ownerBlocks[owner];
  }

  tick(): void {
    this.tickNo++;
    const T = this.m.total;
    const r = this.rng;

    // ---- steady churn ------------------------------------------------------
    const n = Math.round(T * 0.0035);
    for (let i = 0; i < n; i++) {
      const p = (r() * T) | 0;
      const v = this.m.chips[p >> 8].cells[p & 255];
      const s = stateOf(v);
      const u = useOf(v);
      const x = r();
      if (s === State.Active) {
        if ((u === Use.File || u === Use.Metafile) && x < 0.45) this.set(p, u, State.Standby); // trimmed from a working set
        else if (x < 0.1 && u !== Use.File && u !== Use.Metafile) this.set(p, u, State.Modified); // dirtied
      } else if (s === State.Modified && x < 0.5) this.set(p, u, State.Active); // write-back done
      else if (s === State.Standby && x < 0.3) this.set(p, u, State.Active); // soft fault / cache hit
      else if (s === State.Free && x < 0.25) this.set(p, Use.None, State.Zeroed); // zero-page thread
    }

    this.scenarioTick();

    // ---- process CPU drift -------------------------------------------------
    for (const p of this.m.processes) {
      if (!p.alive) {
        p.cpuPct = 0;
        continue;
      }
      const next = p.cpuPct + (r() - 0.5) * p.baseCpu * 0.28;
      p.cpuPct = Math.max(p.baseCpu * 0.3, Math.min(p.baseCpu * 2.5, next));
    }
    this.cpu = this.cpuStep();
  }

  // ---- mutations ----------------------------------------------------------

  private addToOwner(id: number, p: number): void {
    const l = this.ownerBlocks[id];
    this.ownerPos[p] = l.length;
    l.push(p);
  }

  private removeFromOwner(id: number, p: number): void {
    const l = this.ownerBlocks[id];
    const i = this.ownerPos[p];
    const last = l.pop()!;
    if (last !== p) {
      l[i] = last;
      this.ownerPos[last] = i;
    }
    this.ownerPos[p] = -1;
  }

  /** owner < 0 keeps the current owner. */
  set(p: number, use: number, state: number, owner = -1): void {
    const chip = this.m.chips[p >> 8];
    const cell = p & 255;
    chip.cells[cell] = pack(use, state);
    if (owner >= 0 && owner !== chip.owners[cell]) {
      this.removeFromOwner(chip.owners[cell], p);
      this.addToOwner(owner, p);
      chip.owners[cell] = owner;
    }
    if (this.changedAt[p] !== this.tickNo) {
      this.changedAt[p] = this.tickNo;
      this.changes.push(p);
    }
  }

  private scan(pred: (v: number, owner: number) => boolean): number[] {
    const out: number[] = [];
    for (const ch of this.m.chips) {
      const base = ch.index << 8;
      for (let i = 0; i < CELLS_PER_CHIP; i++) if (pred(ch.cells[i], ch.owners[i])) out.push(base + i);
    }
    return out;
  }

  // ---- scenarios ----------------------------------------------------------

  private scenarioTick(): void {
    if (!this.phase && this.queue.length) {
      const q = this.queue.shift()!;
      this.phase = { kind: q.kind, owner: q.owner, start: this.tickNo, blocks: [] };
      this.onlog(`▶ ${SCENARIO_LABEL[q.kind]}${q.owner ? ` — ${this.m.owners[q.owner].name}` : ''}`);
      if (q.kind === 'closeApp') this.freeOwner(q.owner);
      if (q.kind === 'purgeStandby') this.purge();
    }
    const ph = this.phase;
    if (!ph) return;
    const age = this.tickNo - ph.start;
    switch (ph.kind) {
      case 'fileChurn':
        if (age < 6) this.claim(70, ph.owner, Use.File, State.Active, ph.blocks, 'cache');
        else if (age > 14 && age < 22) this.ageOut(ph.blocks, State.Standby, 0.25);
        else if (age >= 22) this.phase = null;
        break;
      case 'allocBurst':
        if (age < 10) this.claim(60, ph.owner, Use.ProcessPrivate, State.Modified, ph.blocks, 'commit');
        else this.phase = null;
        break;
      case 'closeApp':
        if (age > 3) this.phase = null;
        break;
      case 'purgeStandby':
        if (age < 14) this.zeroSome(0.08);
        else this.phase = null;
        break;
    }
  }

  private claim(n: number, owner: number, use: number, state: number, into: number[], mode: 'cache' | 'commit'): void {
    const order = mode === 'commit' ? [State.Zeroed, State.Free, State.Standby] : [State.Standby, State.Free, State.Zeroed];
    for (const s of order) {
      if (n <= 0) break;
      const pool = this.scan((v, o) => stateOf(v) === s && o !== owner);
      const k = Math.min(n, Math.floor(pool.length * 0.25));
      // partial Fisher–Yates: pick k distinct entries
      for (let i = 0; i < k; i++) {
        const j = i + Math.floor(this.rng() * (pool.length - i));
        const t = pool[i];
        pool[i] = pool[j];
        pool[j] = t;
        const p = pool[i];
        this.set(p, use, state, owner);
        into.push(p);
      }
      n -= k;
    }
  }

  private ageOut(blocks: number[], state: number, frac: number): void {
    for (const p of blocks) {
      const chip = this.m.chips[p >> 8];
      if (stateOf(chip.cells[p & 255]) === State.Active && this.rng() < frac) this.set(p, useOf(chip.cells[p & 255]), state);
    }
  }

  private freeOwner(owner: number): void {
    for (const p of [...this.ownerBlocks[owner]]) this.set(p, Use.None, State.Free, 0);
    const proc = this.m.processes.find((x) => x.id === owner);
    if (proc) proc.alive = false;
  }

  private purge(): void {
    for (const p of this.scan((v) => stateOf(v) === State.Standby)) this.set(p, Use.None, State.Free, 0);
  }

  private zeroSome(frac: number): void {
    for (const p of this.scan((v) => stateOf(v) === State.Free)) if (this.rng() < frac) this.set(p, Use.None, State.Zeroed, 0);
  }

  // ---- CPU ----------------------------------------------------------------

  private cpuStep(): CpuLive {
    const r = this.rng;
    const cores: CoreLive[] = [];
    let loadSum = 0;
    let maxTemp = 0;
    for (let i = 0; i < 16; i++) {
      if (r() < 0.04) this.coreTarget[i] = i < 8 ? 55 + r() * 40 : 5 + r() * 25;
      const prev = this.cpu.cores[i];
      const load = Math.max(0, Math.min(100, prev.load + (this.coreTarget[i] - prev.load) * 0.25 + (r() - 0.5) * 9));
      // Core 2 runs ~8 °C hot — the "find the hot core" demo case.
      const temp = 34 + load * 0.47 + (i === 2 ? 8 : 0) + (r() - 0.5) * 0.9;
      const freq = 3.8 + (load / 100) * 1.85 + (r() - 0.5) * 0.06;
      cores.push({ index: i, ccd: i >> 3, load, temp, freq });
      loadSum += load;
      if (temp > maxTemp) maxTemp = temp;
    }
    const avgLoad = loadSum / 16;
    return { cores, avgLoad, maxTemp, power: 28 + avgLoad * 0.9 };
  }

  // ---- derived numbers ----------------------------------------------------

  stats(): Stats {
    const m = this.m;
    const byState = [0, 0, 0, 0, 0, 0];
    const byUse = Array.from({ length: 16 }, () => 0);
    const byUseState = Array.from({ length: 16 }, () => [0, 0, 0, 0, 0, 0]);
    const chipHot = new Float32Array(m.chips.length);
    const dimmLive = m.dimms.map(() => 0);
    const dimmTot = m.dimms.map(() => 0);
    const acc = new Map<number, { blocks: number; active: number; modified: number; standby: number }>();
    const fileActive = new Map<number, number>();

    for (const ch of m.chips) {
      let hot = 0;
      for (let i = 0; i < CELLS_PER_CHIP; i++) {
        const v = ch.cells[i];
        const s = stateOf(v);
        const u = useOf(v);
        byState[s]++;
        byUse[u]++;
        byUseState[u][s]++;
        dimmTot[ch.dimm]++;
        if (s === State.Active || s === State.Modified) {
          hot++;
          dimmLive[ch.dimm]++;
        }
        const o = ch.owners[i];
        if (!o) continue;
        const a = acc.get(o) ?? { blocks: 0, active: 0, modified: 0, standby: 0 };
        a.blocks++;
        if (s === State.Active) a.active++;
        else if (s === State.Modified) a.modified++;
        else if (s === State.Standby) a.standby++;
        acc.set(o, a);
        if (u === Use.File && s === State.Active) fileActive.set(o, (fileActive.get(o) ?? 0) + 1);
      }
      chipHot[ch.index] = hot / CELLS_PER_CHIP;
    }

    const wsum = m.processes.reduce((s, p) => s + p.weight, 0);
    const fileActiveTotal = [...fileActive.values()].reduce((s, x) => s + x, 0);
    const procs: ProcStat[] = m.processes.map((p) => {
      const a = acc.get(p.id) ?? { blocks: 0, active: 0, modified: 0, standby: 0 };
      // Working set ≈ live private pages + a share of the mapped-file pages (mock).
      return {
        id: p.id,
        blocks: a.blocks,
        active: a.active,
        modified: a.modified,
        standby: a.standby,
        cpuPct: p.alive ? p.cpuPct : 0,
        alive: p.alive,
        wsMiB: (a.active + a.modified) * 4 * 1.25,
        sharedMiB: p.alive ? fileActiveTotal * 4 * (p.weight / wsum) : 0,
      };
    });

    const byOwner: Record<string, OwnerStat> = {};
    for (const [id, a] of acc) byOwner[String(id)] = a;

    return {
      total: m.total,
      byState,
      byUse,
      byUseState,
      byOwner,
      inUse: byState[State.Active] + byState[State.Modified],
      chipHot,
      dimmUsed: dimmLive.map((x, i) => x / dimmTot[i]),
      procs,
    };
  }
}
