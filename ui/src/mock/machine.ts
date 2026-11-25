/**
 * Deterministic mock machine: 4 × DDR5 16 GiB (16 chips each) + 2 empty slots,
 * ~25 processes, ~22 cached files. One seed always yields the same machine, so
 * screenshots and bug reports are reproducible.
 *
 * Placement follows docs/ram-model.md §3: real interleave maps are unknowable, so
 * blocks are scattered deterministically (clumped runs, per-DIMM weighting).
 */
import { mulberry32, hash32 } from './rng';
import { State, Use, CELLS_PER_CHIP, CHIPS_PER_DIMM, pack, useFamily } from './model';
import type { Machine, Dimm, Slot, Owner, MockProcess, MockFile } from './model';

/** name, private-memory weight, baseline CPU %, threads */
const PROCESS_DEFS: [string, number, number, number][] = [
  ['cs2.exe', 18, 24, 34],
  ['chrome.exe', 13, 4.2, 52],
  ['firefox.exe', 9, 1.6, 38],
  ['blender.exe', 7, 38, 41],
  ['Code.exe', 7, 2.8, 47],
  ['devenv.exe', 5, 1.1, 63],
  ['vmmemWSL', 6, 2.0, 12],
  ['idea64.exe', 4.5, 1.9, 58],
  ['python.exe', 4, 3.0, 9],
  ['OBS64.exe', 3.5, 6.0, 22],
  ['Discord.exe', 3, 0.9, 31],
  ['ms-teams.exe', 3, 0.7, 27],
  ['node.exe', 2.5, 1.5, 11],
  ['com.docker.backend.exe', 2.5, 1.2, 44],
  ['Spotify.exe', 2.5, 0.6, 19],
  ['postgres.exe', 2, 0.8, 6],
  ['dwm.exe', 1.8, 0.8, 14],
  ['cargo.exe', 1.5, 14, 17],
  ['MsMpEng.exe', 1.5, 2.1, 8],
  ['Explorer.exe', 1.2, 0.1, 7],
  ['SearchIndexer.exe', 1.2, 1.4, 13],
  ['ffmpeg.exe', 1.2, 20, 10],
  ['svchost.exe', 0.8, 0.2, 9],
  ['svchost.exe', 0.8, 0.2, 9],
  ['svchost.exe', 0.8, 0.2, 9],
  ['ShellExperienceHost.exe', 0.6, 0.1, 16],
  ['RuntimeBroker.exe', 0.5, 0.1, 8],
];

/** path, cache weight, shared by several processes */
const FILE_DEFS: [string, number, boolean][] = [
  ['C:\\Users\\dar\\models\\qwen2.5-7b-instruct-q4_k_m.gguf', 12, false],
  ['C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\csgo\\pak01_dir.vpk', 9, false],
  ['C:\\Users\\dar\\Videos\\capture-2026-11-25.mkv', 6, false],
  ['C:\\Users\\dar\\Downloads\\ubuntu-24.04.3-desktop-amd64.iso', 5, false],
  ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.dll', 4.5, true],
  ['C:\\Users\\dar\\AppData\\Local\\Spotify\\Storage\\data\\78\\12\\3a.file', 2.2, false],
  ['C:\\Program Files\\PostgreSQL\\17\\data\\base\\16384\\16390', 1.8, false],
  ['C:\\Windows\\System32\\shell32.dll', 1.5, true],
  ['C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64\\engine.dll', 1.4, true],
  ['C:\\Windows\\System32\\ntdll.dll', 1.2, true],
  ['C:\\Program Files\\Google\\Chrome\\Application\\138.0.7204.51\\icudtl.dat', 1.2, false],
  ['C:\\Program Files\\Microsoft VS Code\\Code.exe', 1.1, true],
  ['C:\\Windows\\WinSxS\\amd64_microsoft.windows.common-controls_6595b64144ccf1df_6.0.26100.1150_none_6e68e2c9d4a4e9e3\\comctl32.dll', 1.0, true],
  ['C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe', 1.0, true],
  ['C:\\Program Files\\Microsoft VS Code\\resources\\app\\out\\vs\\workbench\\workbench.desktop.main.js', 1.0, false],
  ['C:\\Program Files\\Blender Foundation\\Blender 4.5\\scripts\\addons_core\\io_scene_gltf2\\blender\\imp\\gltf2_blender_import.py', 0.8, false],
  ['C:\\Windows\\System32\\config\\SOFTWARE', 0.5, true],
  ['C:\\Program Files\\PostgreSQL\\17\\bin\\postgres.exe', 0.4, true],
  ['C:\\Users\\dar\\.cargo\\registry\\src\\index.crates.io-1949cf8c6b5b557f\\serde-1.0.219\\src\\de\\mod.rs', 0.4, false],
  ['C:\\Windows\\System32\\drivers\\ndis.sys', 0.3, true],
  ['C:\\Windows\\Fonts\\segoeui.ttf', 0.2, true],
  ['C:\\Windows\\System32\\kernel32.dll', 0.6, true],
];

const SLOT_DEFS: [string, string, boolean][] = [
  ['DIMM_A1', 'Channel A', true],
  ['DIMM_A2', 'Channel A', false],
  ['DIMM_B1', 'Channel B', true],
  ['DIMM_B2', 'Channel B', false],
  ['DIMM_C1', 'Channel C', true],
  ['DIMM_D1', 'Channel D', true],
];

const DIMM_DEFS = [
  ['G.Skill', 'F5-6000J3238G16G', 'Flare X5'],
  ['Kingston', 'KF560C36BBE-16', 'Fury Beast'],
  ['Corsair', 'CMK16GX5M2B6000C30', 'Vengeance'],
  ['Crucial', 'CT16G56C46U5', 'Pro'],
] as const;

export function buildMachine(seed = 7): Machine {
  const rng = mulberry32(seed);

  // ---- owners -------------------------------------------------------------
  const owners: Owner[] = [{ id: 0, kind: 'kernel', name: '—', shared: false }];
  const processes: MockProcess[] = PROCESS_DEFS.map(([name, weight, cpu, threads], i) => {
    const id = owners.length;
    owners.push({ id, kind: 'process', name, shared: false });
    return { id, pid: 1180 + ((seed * 131 + i * 977) % 8200), name, weight, baseCpu: cpu, cpuPct: cpu, threads, alive: true };
  });
  const files: MockFile[] = FILE_DEFS.map(([path, weight, shared]) => {
    const id = owners.length;
    owners.push({ id, kind: 'file', name: path, shared });
    return { id, path, weight };
  });
  const kernelOwners = new Map<string, number>();
  const kernel = (name: string): number => {
    let id = kernelOwners.get(name);
    if (id === undefined) {
      id = owners.length;
      owners.push({ id, kind: 'kernel', name, shared: false });
      kernelOwners.set(name, id);
    }
    return id;
  };

  // ---- slots & DIMMs ------------------------------------------------------
  const slots: Slot[] = [];
  const dimms: Dimm[] = [];
  for (const [si, [label, channel, populated]] of SLOT_DEFS.entries()) {
    if (!populated) {
      slots.push({ index: si, label, channel, dimm: null });
      continue;
    }
    const d = dimms.length;
    const [manufacturer, partNumber, family] = DIMM_DEFS[d % DIMM_DEFS.length];
    const dimm: Dimm = {
      index: d,
      slot: si,
      capacityGiB: 16,
      type: `DDR5 ${family}`,
      speedMts: 6000,
      manufacturer,
      partNumber,
      serial: (((seed * 7919 + d * 104729) % 0xffffff) + 0x1000000).toString(16).toUpperCase().slice(1),
      chips: [],
    };
    slots.push({ index: si, label, channel, dimm });
    dimms.push(dimm);
  }

  const chips: Machine['chips'] = [];
  for (const dimm of dimms) {
    for (let i = 0; i < CHIPS_PER_DIMM; i++) {
      const chip = {
        index: chips.length,
        dimm: dimm.index,
        rank: i >> 3,
        sub: (i & 7) < 4 ? 0 : 1,
        cells: new Uint8Array(CELLS_PER_CHIP),
        owners: new Uint16Array(CELLS_PER_CHIP).fill(0),
      };
      chips.push(chip);
      dimm.chips.push(chip);
    }
  }

  const total = chips.length * CELLS_PER_CHIP;
  const machine: Machine = { seed, slots, dimms, chips, owners, processes, files, total };

  // ---- allocation plan (blocks) ------------------------------------------
  interface Seg {
    owner: number;
    use: number;
    state: number;
    count: number;
  }
  const segs: Seg[] = [];
  const kern = (use: number, count: number, ownerName: string) =>
    segs.push({ owner: kernel(ownerName), use, state: State.Active, count });

  kern(Use.PageTable, 330, 'System');
  kern(Use.PagedPool, 570, 'ntoskrnl.exe');
  kern(Use.NonPagedPool, 490, 'ndis.sys');
  kern(Use.DriverLocked, 410, 'dxgkrnl.sys');
  kern(Use.KernelStack, 100, 'ntoskrnl.exe');
  kern(Use.SystemPTE, 230, 'System');
  kern(Use.Metafile, 160, 'Metafile');
  kern(Use.SessionPrivate, 410, 'csrss.exe');

  const procSum = processes.reduce((s, p) => s + p.weight, 0);
  const fileSum = files.reduce((s, f) => s + f.weight, 0);
  const spreadProcs = (use: number, state: number, count: number) => {
    for (const p of processes) segs.push({ owner: p.id, use, state, count: Math.round((count * p.weight) / procSum) });
  };
  const spreadFiles = (use: number, state: number, count: number) => {
    for (const f of files) segs.push({ owner: f.id, use, state, count: Math.round((count * f.weight) / fileSum) });
  };

  const game = processes.find((p) => p.name === 'cs2.exe')!;
  segs.push({ owner: game.id, use: Use.AWE, state: State.Active, count: 60 });
  spreadProcs(Use.ProcessPrivate, State.Active, 5600);
  spreadProcs(Use.ProcessPrivate, State.Standby, 490);
  spreadFiles(Use.File, State.Active, 1150);
  spreadFiles(Use.File, State.Standby, 4100);
  spreadProcs(Use.PagefileMapped, State.Active, 520);
  spreadProcs(Use.ProcessPrivate, State.Modified, 250);
  spreadFiles(Use.File, State.Modified, 240);

  const ZEROED = 740;
  const BAD = 2;
  const assigned = segs.reduce((s, x) => s + x.count, 0);
  segs.push({ owner: 0, use: Use.None, state: State.Free, count: total - assigned - ZEROED - BAD });
  segs.push({ owner: 0, use: Use.None, state: State.Zeroed, count: ZEROED });
  if (total - assigned - ZEROED - BAD < 0) throw new Error('mock plan over-allocates');

  // ---- placement ----------------------------------------------------------
  // Each DIMM owns a contiguous quarter of the (packed) block space. Within a DIMM,
  // blocks are handed out in clump order: same 8-block neighbourhood first, so a
  // run of blocks shows up as adjacent cells instead of pure noise.
  const perDimm = total / dimms.length;
  const lists: number[][] = dimms.map((_, d) => {
    const a = Array.from({ length: perDimm }, (_, i) => d * perDimm + i);
    a.sort((x, y) => {
      const hx = hash32(x >> 3, d), hy = hash32(y >> 3, d);
      return hx !== hy ? hx - hy : (x & 7) - (y & 7);
    });
    return a;
  });
  const cursor = new Array<number>(dimms.length).fill(0);
  const take = (d: number): number => {
    if (cursor[d] >= perDimm) {
      // preferred DIMM is full → fall back to the one with the most room left
      let best = 0;
      for (let k = 1; k < dimms.length; k++) if (perDimm - cursor[k] > perDimm - cursor[best]) best = k;
      d = best;
    }
    return lists[d][cursor[d]++];
  };
  // Process-private memory is biased onto two sticks ("local node"), so the board
  // shows the asymmetric loading you see on real machines.
  const PRIVATE_W = [0.34, 0.2, 0.16, 0.3];
  const pickDimm = (family: string): number => {
    const base = family === 'private' ? PRIVATE_W : dimms.map(() => 1 / dimms.length);
    let sum = 0;
    const w = base.map((b, i) => {
      const v = b * (perDimm - cursor[i]);
      sum += v;
      return v;
    });
    let x = rng() * sum;
    for (let i = 0; i < w.length; i++) {
      x -= w[i];
      if (x <= 0) return i;
    }
    return w.length - 1;
  };

  const write = (packed: number, use: number, state: number, owner: number) => {
    const chip = chips[packed >> 8];
    const cell = packed & 255;
    chip.cells[cell] = pack(use, state);
    chip.owners[cell] = owner;
  };

  for (const s of segs) {
    let left = s.count;
    while (left > 0) {
      const n = Math.min(left, 3 + Math.floor(rng() * 12));
      const d = pickDimm(useFamily(s.use));
      for (let k = 0; k < n; k++) write(take(d), s.use, s.state, s.owner);
      left -= n;
    }
  }

  // A couple of bad blocks on one chip, so the legend's "Bad" entry is real.
  const badChip = chips[(seed * 5 + 2) % chips.length];
  for (const c of [37, 201]) {
    badChip.cells[c] = pack(Use.None, State.Bad);
    badChip.owners[c] = 0;
  }

  return machine;
}
