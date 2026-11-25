/**
 * Deterministic expansion of one board block into finer blocks, for zoom levels
 * below board zoom (chip → bank block → page). Purely a function of (key, parent),
 * so a block always "contains" the same finer pattern and follows its parent's state.
 * Explicitly part of the modeled view — see docs/ram-model.md §3–4.
 */
import { State, Use, pack, stateOf, useOf } from './model';
import { hashRng } from './rng';

export interface DerivedGrid {
  cells: Uint8Array;
  owners: Uint16Array;
}

const cache = new Map<string, DerivedGrid>();
const CACHE_MAX = 96;

export function deriveGrid(key: number, parent: number, owner: number, n: number): DerivedGrid {
  const id = `${key}|${parent}|${owner}|${n}`;
  const hit = cache.get(id);
  if (hit) return hit;

  const rng = hashRng(key, 0x5bd1e995);
  const ps = stateOf(parent);
  const pu = useOf(parent);
  const cells = new Uint8Array(n);
  const owners = new Uint16Array(n).fill(owner);
  for (let i = 0; i < n; i++) {
    let s = ps;
    let u = pu;
    const x = rng();
    if (ps === State.Active) {
      if (x < 0.08) s = State.Modified;
      else if (x < 0.17) s = State.Standby;
    } else if (ps === State.Standby) {
      if (x < 0.12) s = State.Active;
      else if (x < 0.17) {
        s = State.Free;
        u = Use.None;
      }
    } else if (ps === State.Modified) {
      if (x < 0.2) s = State.Active;
    } else if (ps === State.Free) {
      if (x < 0.15) s = State.Zeroed;
    } else if (ps === State.Zeroed) {
      if (x < 0.08) s = State.Free;
    }
    cells[i] = pack(u, s);
  }
  const grid = { cells, owners };
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(id, grid);
  return grid;
}

/** 8 × 8 blocks → one visual "page block" is 16 × 16 pages = 256 pages. */
export const BLOCK_SQ = 8;
export const CHIP_SQ = 64;
