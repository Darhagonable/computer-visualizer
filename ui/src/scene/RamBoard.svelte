<script lang="ts">
  /** The whole memory board: every slot (populated or empty), grouped by channel. Canvas: 1260 × 668. */
  import type { Dimm } from '../mock/model';
  import { getMachine } from '../mock/store.svelte';
  import DimmStick from './DimmStick.svelte';
  import EmptySlot from './EmptySlot.svelte';

  interface Props {
    interactive?: boolean;
    /** No controller box / channel rails — for thumbnails and small multiples. */
    compact?: boolean;
    onstick?: (d: Dimm) => void;
    onchip?: (d: Dimm, chip: number) => void;
  }
  let { interactive = true, compact = false, onstick, onchip }: Props = $props();

  const m = getMachine();
  const rows = [0, 1, 2].map((r) => [m.slots[2 * r], m.slots[2 * r + 1]]);
  const ROW_H = 196;
  const COL_X = [56, 656];
  const channelsOf = (row: typeof rows[number]) => [...new Set(row.map((s) => s.channel.replace('Channel ', '')))].join(' · ');
</script>

<g class="board" class:compact>
  {#each rows as row, r (r)}
    {#if !compact}
      <text x="20" y={r * ROW_H + ROW_H / 2} class="chan" transform="rotate(-90 20 {r * ROW_H + ROW_H / 2})" text-anchor="middle">
        CHANNEL {channelsOf(row)}
      </text>
    {/if}
    {#each row as slot, c (slot.index)}
      <g transform="translate({COL_X[c]},{r * ROW_H})">
        <text x="6" y="14" class="slot-label">
          {slot.label}
          <tspan class="slot-sub">
            {slot.dimm ? `  ·  ${slot.dimm.manufacturer} ${slot.dimm.type}  ·  ${slot.dimm.capacityGiB} GB  ·  ${slot.dimm.speedMts} MT/s` : '  ·  empty'}
          </tspan>
        </text>
        <g transform="translate(0,20)">
          {#if slot.dimm}
            <DimmStick dimm={slot.dimm} {interactive} {onstick} {onchip} labels={!compact} />
          {:else}
            <EmptySlot label={slot.label} channel={slot.channel} />
          {/if}
        </g>
      </g>
    {/each}
  {/each}

  {#if !compact}
    <path d="M336 596 V612 M936 596 V612 M336 612 H936 M636 612 V620" class="bus" />
    <rect x="436" y="620" width="400" height="44" rx="8" class="ctl" />
    <text x="636" y="638" text-anchor="middle" class="ctl-title">MEMORY CONTROLLER</text>
    <text x="636" y="654" text-anchor="middle" class="ctl-sub">mock · 2 × 64-bit DDR5 @ 6000 MT/s · chip placement: modeled</text>
  {/if}
</g>

<style>
  .chan {
    font: 600 10px var(--font-mono);
    letter-spacing: 0.2em;
    fill: var(--ink3);
    pointer-events: none;
  }
  .board.compact .slot-label {
    display: none;
  }
  .slot-label {
    font: 500 11px var(--font-mono);
    fill: var(--ink2);
    pointer-events: none;
  }
  .slot-sub {
    font-weight: 400;
    fill: var(--ink3);
  }
  .bus {
    fill: none;
    stroke: var(--line2);
    stroke-width: 1.5;
  }
  .ctl {
    fill: var(--panel);
    stroke: var(--line2);
    stroke-width: 1.2;
  }
  .ctl-title {
    font: 600 10px var(--font-mono);
    letter-spacing: 0.18em;
    fill: var(--ink2);
  }
  .ctl-sub {
    font: 400 9.5px var(--font-ui);
    fill: var(--ink3);
  }
</style>
