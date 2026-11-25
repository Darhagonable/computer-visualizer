/**
 * Mock machine vocabulary. The names are deliberately the ones the real Windows
 * provider will report (RamMap's page lists and MMPFNUSE_* use descriptions), so the
 * mockups speak the same language as real data later. See docs/ram-model.md §5.
 */

export const PAGE_SIZE = 4096;
/** 4 KiB pages represented by one visual block at board zoom. */
export const BLOCK_PAGES = 1024;
/** Blocks per chip at board zoom (16 × 16 grid). */
export const CELLS_PER_CHIP = 256;
export const CHIPS_PER_DIMM = 16;

export const State = {
  Zeroed: 0,
  Free: 1,
  Standby: 2,
  Modified: 3,
  Active: 4,
  Bad: 5,
} as const;
export type StateId = (typeof State)[keyof typeof State];
export const STATE_COUNT = 6;
export const STATE_NAMES = ['Zeroed', 'Free', 'Standby', 'Modified', 'Active', 'Bad'] as const;

export const Use = {
  ProcessPrivate: 0,
  File: 1,
  PagefileMapped: 2,
  PageTable: 3,
  PagedPool: 4,
  NonPagedPool: 5,
  SystemPTE: 6,
  SessionPrivate: 7,
  Metafile: 8,
  AWE: 9,
  DriverLocked: 10,
  KernelStack: 11,
  /** No use class (free / zeroed pages). */
  None: 15,
} as const;
export type UseId = (typeof Use)[keyof typeof Use];

export const USE_NAMES = [
  'Process Private',
  'Mapped File',
  'Pagefile Mapped',
  'Page Table',
  'Paged Pool',
  'Nonpaged Pool',
  'System PTE',
  'Session Private',
  'Metafile',
  'AWE',
  'Driver Locked',
  'Kernel Stack',
];
/** Colour family of a use class: hue tells you *what a live page is for*. */
export const USE_FAMILY_NAMES = ['Process Private', 'Mapped File', 'Pagefile Mapped', 'Kernel / System'];

export type UseFamily = 'private' | 'file' | 'pagefile' | 'kernel';
export function useFamily(use: number): UseFamily {
  switch (use) {
    case Use.ProcessPrivate:
    case Use.SessionPrivate:
    case Use.AWE:
      return 'private';
    case Use.File:
    case Use.Metafile:
      return 'file';
    case Use.PagefileMapped:
      return 'pagefile';
    default:
      return 'kernel';
  }
}

/** Colour-family index (0..3) for a use class. */
export function useFamilyIndex(use: number): number {
  switch (useFamily(use)) {
    case 'private':
      return 0;
    case 'file':
      return 1;
    case 'pagefile':
      return 2;
    default:
      return 3;
  }
}

export const pack = (use: number, state: number) => (use << 4) | state;
export const stateOf = (v: number) => v & 15;
export const useOf = (v: number) => v >> 4;

export interface Owner {
  id: number;
  kind: 'process' | 'file' | 'kernel';
  name: string;
  /** Mapped by more than one process (images, shared sections). */
  shared: boolean;
}

export interface MockProcess {
  id: number;
  pid: number;
  name: string;
  weight: number;
  baseCpu: number;
  cpuPct: number;
  threads: number;
  alive: boolean;
}

export interface MockFile {
  id: number;
  path: string;
  weight: number;
}

export interface Chip {
  index: number;
  dimm: number;
  rank: number;
  sub: number;
  /** (use << 4) | state per block. Mutated in place by the sim. */
  cells: Uint8Array;
  /** Owner id per block (0 = none). */
  owners: Uint16Array;
}

export interface Dimm {
  index: number;
  slot: number;
  capacityGiB: number;
  type: string;
  speedMts: number;
  manufacturer: string;
  partNumber: string;
  serial: string;
  chips: Chip[];
}

export interface Slot {
  index: number;
  label: string;
  channel: string;
  dimm: Dimm | null;
}

export interface Machine {
  seed: number;
  slots: Slot[];
  dimms: Dimm[];
  /** Flat list, index === chip.index. */
  chips: Chip[];
  owners: Owner[];
  processes: MockProcess[];
  files: MockFile[];
  /** Total blocks == chips × CELLS_PER_CHIP. */
  total: number;
}

export interface ProcStat {
  id: number;
  blocks: number;
  active: number;
  modified: number;
  standby: number;
  cpuPct: number;
  alive: boolean;
  wsMiB: number;
  sharedMiB: number;
}

export interface OwnerStat {
  blocks: number;
  active: number;
  modified: number;
  standby: number;
}

export interface Stats {
  total: number;
  byState: number[];
  byUse: number[];
  /** [use][state] block counts. */
  byUseState: number[][];
  /** Per owner id — processes, files and kernel components alike. */
  byOwner: Record<string, OwnerStat>;
  /** Active + Modified blocks. */
  inUse: number;
  /** Fraction of live (active + modified) blocks per chip. */
  chipHot: Float32Array;
  /** Fraction of live blocks per DIMM. */
  dimmUsed: number[];
  procs: ProcStat[];
}

export interface CoreLive {
  index: number;
  ccd: number;
  load: number;
  temp: number;
  freq: number;
}

export interface CpuLive {
  cores: CoreLive[];
  avgLoad: number;
  maxTemp: number;
  power: number;
}

export const MIB_PER_BLOCK = (BLOCK_PAGES * PAGE_SIZE) / 1048576; // 4
export const blocksMiB = (blocks: number) => blocks * MIB_PER_BLOCK;
export const blocksGiB = (blocks: number) => blocks * MIB_PER_BLOCK / 1024;

export const fmtMiB = (blocks: number) => {
  const mib = blocksMiB(blocks);
  return mib >= 1024 ? `${(mib / 1024).toFixed(2)} GiB` : `${mib.toFixed(mib < 10 ? 1 : 0)} MiB`;
};

export const fmtInt = (n: number) => n.toLocaleString('en-US');
