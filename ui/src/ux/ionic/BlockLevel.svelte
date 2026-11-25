<script lang="ts">
  /**
   * Level 3 · block — one 4 MiB board block opened into a 16 × 16 grid of 4-page cells.
   * Clicking a cell highlights everything its owner has in memory. Like the die level
   * this zoom is modeled, and it says so.
   */
  import { untrack } from 'svelte';
  import { app, getMachine, getSim, setHighlight, stateName, type PageDetails } from '../../mock/store.svelte';
  import { deriveGrid } from '../../mock/derive';
  import { hash32 } from '../../mock/rng';
  import { PAGE_SIZE, fmtInt } from '../../mock/model';
  import ChipGrid from '../../scene/ChipGrid.svelte';
  import { levelWheel, boxLayout, BOX, BLOCK_GRID, type Level } from './nav';

  interface Props {
    chip: number;
    cell: number;
    w: number;
    h: number;
    go: (l: Level) => void;
  }
  let { chip: chipProp, cell: cellProp, w, h, go }: Props = $props();

  const m = getMachine();
  // the component is re-created for every location on the chain, so identity is read once
  const chipIndex = untrack(() => chipProp);
  const cell = untrack(() => cellProp);
  const ch = m.chips[chipIndex];
  const dimm = m.dimms[ch.dimm];
  const slot = m.slots[dimm.slot];
  const dieNo = (chipIndex & 7) + 1;
  const owner = m.owners[ch.owners[cell]];
  const ownerName = owner.kind === 'file' ? (owner.name.split('\\').pop() ?? owner.name) : owner.name;
  const hex = (n: number, width: number) => '0x' + n.toString(16).toUpperCase().padStart(width, '0');

  // package geometry (viewBox BOX.size square)
  const N = BLOCK_GRID.n;
  const SIZE = BOX.size;
  const PAD = BOX.pad;
  const INNER = SIZE - 2 * PAD;
  const GAP = BLOCK_GRID.gap;
  const CELL = (INNER - (N - 1) * GAP) / N;
  const PITCH = CELL + GAP;
  const first = (chipIndex * 256 + cell) * 1024;
  const row = cell >> 4;
  const col = cell & 15;

  // ---- the 256 page groups, following their parent block ------------------------------
  const grid = $derived.by(() => {
    void app.version; // the parent mutates in place — the version read schedules the rebuild
    return deriveGrid(chipIndex, ch.cells[cell], ch.owners[cell], N * N);
  });

  function details(i: number): PageDetails {
    const v = grid.cells[i];
    const pfn = first + i * 4;
    return {
      where: `${slot.label} · R${ch.rank}·U${dieNo} · block ${cell} · +${i * 4} pages`,
      state: v & 15,
      use: v >> 4,
      owner: m.owners[grid.owners[i]],
      pfn: hex(pfn, 8),
      addr: hex(pfn * PAGE_SIZE, 16),
      size: '4 pages · 16 KiB',
      priority: hash32(pfn) & 7,
      note: 'modeled · zoom below board level · click lights up everything this owner has in memory',
    };
  }

  /** The parent block itself changed this tick → the whole grid just flipped: flash its frame. */
  let pulseAt = $state(-999);
  $effect(() => {
    const v = app.version;
    if (getSim().changes.some((p) => (p >> 8) === chipIndex && (p & 255) === cell)) pulseAt = v;
  });
  const flash = $derived(app.version - pulseAt <= 1);

  // ---- numbers -----------------------------------------------------------------------
  const ROWS = [
    { s: 4, c: 'linear-gradient(90deg, var(--c-private), var(--c-file), var(--c-pagefile), var(--c-kernel))' },
    { s: 3, c: 'var(--c-modified)' },
    { s: 2, c: 'color-mix(in srgb, var(--c-private) 42%, transparent)' },
    { s: 1, c: 'var(--line2)' },
    { s: 0, c: 'color-mix(in srgb, var(--ink3) 55%, transparent)' },
    { s: 5, c: 'var(--c-bad)' },
  ];
  const counts = $derived.by(() => {
    void app.version;
    const c = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < N * N; i++) c[grid.cells[i] & 15]++;
    return c;
  });
  const maxCount = $derived(Math.max(1, ...counts));
  const owned = owner.id !== 0;
  const isOn = $derived(app.highlight?.kind === 'owner' && app.highlight.id === owner.id);

  const side = $derived(boxLayout(w, h).side);

  let root: HTMLDivElement;
  $effect(() => {
    const onWheel = levelWheel((dir) => {
      if (dir < 0) go({ kind: 'die', chip: chipIndex });
    });
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  });
</script>

<div class="lv" bind:this={root}>
  <div class="col l">
    <div class="io-tile">
      <em>Block</em>
      <b>{cell}<i>of 256</i></b>
      <span>{slot.label} · die {dieNo} · rank {ch.rank} · row {row}, col {col}</span>
    </div>
    <div class="io-tile">
      <em>Covers</em>
      <b>4<i>MiB</i></b>
      <span>{fmtInt(1024)} pages of 4 KiB · 4 pages per cell</span>
    </div>
    <div class="io-tile">
      <em>Page frames</em>
      <div class="range">
        <span>first</span><b class="plain">{hex(first, 8)}</b>
        <span>last</span><b class="plain">{hex(first + 1023, 8)}</b>
      </div>
    </div>
  </div>

  <div class="die io-package" style="width:{side}px; height:{side}px">
    <svg viewBox="0 0 {SIZE} {SIZE}" class="die-svg">
      <rect x="4" y="4" width={SIZE - 8} height={SIZE - 8} rx="42" class="pkg" />
      <rect x="24" y="24" width={SIZE - 48} height={SIZE - 48} rx="26" class="rim" />
      <circle cx="13.5" cy="13.5" r="3.2" class="pin" />
      <text x="30" y="18.5" class="etch">BLOCK {cell} · DIE {dieNo} · 16 × 16 PAGE GROUPS</text>
      <text x={SIZE - 30} y="18.5" text-anchor="end" class="etch">PIN 1</text>
      {#each [0, 4, 8, 12] as t (t)}
        <text x="21" y={PAD + t * PITCH + 4.5} text-anchor="end" class="tick">+{t * 4}</text>
        <text x={PAD + t * PITCH} y={SIZE - 11} class="tick">+{t * 4}</text>
      {/each}
      <ChipGrid
        chip={chipIndex}
        x={PAD}
        y={PAD}
        w={INNER}
        h={INNER}
        cols={N}
        rows={N}
        gap={GAP}
        rx={0.26}
        cells={grid.cells}
        owners={grid.owners}
        {details}
        oncellclick={(i) => owned && setHighlight({ kind: 'owner', id: grid.owners[i] })}
      />
      {#if flash}
        <rect x={PAD} y={PAD} width={INNER} height={INNER} rx="12" class="pulse" />
      {/if}
    </svg>
    <span class="io-badge modeled" title="Nothing below board zoom is measured: the 256 page groups are a deterministic pattern that follows the block's state.">
      modeled · zoom below board level
    </span>
  </div>

  <div class="col r">
    <div class="io-tile">
      <em>Page groups by state</em>
      <div class="io-list">
        {#each ROWS as r (r.s)}
          {#if counts[r.s] || r.s === 4}
            <div class="io-row static">
              <span class="n"><i class="sw" style="background: {r.c}"></i>{stateName(r.s)}</span>
              <span class="track"><i style="transform: scaleX({(counts[r.s] / maxCount).toFixed(3)}); background: {r.c}"></i></span>
              <b>{counts[r.s]}</b>
            </div>
          {/if}
        {/each}
      </div>
      <span class="io-foot">of 256 page groups · live now</span>
    </div>
    <div class="io-tile">
      <em>Owner</em>
      {#if owned}
        <b class="io-name" class:kernel={owner.kind === 'kernel'} title={owner.name}>{ownerName}</b>
        <span>{fmtInt(1024)} pages here{owner.shared ? ' · shared' : ''}</span>
        <button class="act" class:on={isOn} onclick={() => setHighlight(isOn ? null : { kind: 'owner', id: owner.id })}>
          {isOn ? 'shown everywhere · clear' : 'show its pages everywhere'}
        </button>
      {:else}
        <b class="io-name">free</b>
        <span>this block belongs to no process or file</span>
      {/if}
    </div>
  </div>
</div>

<style>
  .lv {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
  }
  .col {
    position: absolute;
    top: 16px;
    bottom: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 236px;
  }
  .col.l {
    left: 24px;
    justify-content: center;
  }
  .col.r {
    right: 24px;
    top: 212px;
    justify-content: flex-start;
    width: 250px;
  }

  /* package chrome (frame, rim, pin, etching, badge) is shared with the die level via .io-package */
  .die-svg :global(g.chip-grid) {
    filter: url(#io-glow-lg);
  }
  .die-svg :global(.tick) {
    fill: color-mix(in srgb, var(--ink3) 80%, transparent);
    letter-spacing: 0.04em;
  }
  .pulse {
    fill: none;
    stroke: var(--ink);
    stroke-width: 2;
    opacity: 0;
    transform-box: fill-box;
    transform-origin: center;
    animation: io-block-pulse 480ms ease-out forwards;
    pointer-events: none;
  }
  @keyframes io-block-pulse {
    0% {
      opacity: 0.9;
      transform: scale(1);
    }
    100% {
      opacity: 0;
      transform: scale(1.045);
    }
  }

  .range {
    display: grid;
    grid-template-columns: 34px auto;
    gap: 1px 8px;
    margin-top: 6px;
  }
  .range span {
    font: 500 10px var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--ink3);
    padding-top: 3px;
  }
  .col .range :global(b.plain) {
    font-size: 13.5px;
    color: var(--ink);
  }
  .sw {
    display: inline-block;
    width: 9px;
    height: 9px;
    margin-right: 2px;
    border-radius: 2.5px;
    vertical-align: -1px;
  }
  .io-foot {
    display: block;
    margin-top: 6px;
    font-size: 10.5px;
    color: var(--ink3);
  }
  .io-name.kernel {
    font-style: italic;
  }
  .act {
    margin-top: 8px;
    height: 30px;
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid var(--line2);
    background: var(--panel2);
    color: var(--ink2);
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    transition: border-color 140ms ease, color 140ms ease, transform 160ms ease;
  }
  .act:hover {
    border-color: var(--accent);
    color: var(--ink);
  }
  .act:active {
    transform: scale(0.97);
  }
  .act.on {
    border-color: var(--accent);
    color: var(--ink);
    background: color-mix(in srgb, var(--accent) 18%, var(--panel2));
  }

  @media (max-width: 1180px) {
    .col.l {
      width: 200px;
    }
    .col.r {
      display: none;
    }
  }
</style>
