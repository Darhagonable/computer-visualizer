<script lang="ts">
  /** A populated DDR5 UDIMM drawn as line art. Internal canvas: 560 × 162 units. */
  import type { Dimm } from '../mock/model';
  import { app, selectDimm } from '../mock/store.svelte';
  import ChipGrid from './ChipGrid.svelte';

  interface Props {
    dimm: Dimm;
    onstick?: (d: Dimm) => void;
    onchip?: (d: Dimm, chip: number) => void;
    interactive?: boolean;
    /** Hide the small labels (thumbnails). */
    labels?: boolean;
  }
  let { dimm, onstick, onchip, interactive = true, labels = true }: Props = $props();

  const selected = $derived(app.selectedDimm === dimm.index);

  // rank 1 (back) on top, rank 0 (front) below; 4 chips per 32-bit subchannel
  const CW = 52;
  const CH = 46;
  const GAP = 7;
  const X0 = 52;
  const xOf = [0, 1, 2, 3, 4, 5, 6, 7].map((p) => X0 + p * (CW + GAP));
  const rank1 = [8, 9, 10, 11, 12, 13, 14, 15];
  const rank0 = [0, 1, 2, 3, 4, 5, 6, 7];
  const fingers = Array.from({ length: 130 }, (_, i) => i);
  const fingerLen = [24, 24, 17, 24, 20, 24, 24, 15];
  const pins = [0, 1, 2, 3, 4, 5];

  function stickClick(e: MouseEvent) {
    if (!interactive) return;
    if ((e.target as Element).closest('[data-chip]')) return; // a chip handled it
    selectDimm(dimm.index);
    onstick?.(dimm);
  }
  function chipClick(pos: number) {
    if (!interactive) return;
    selectDimm(dimm.index);
    onchip?.(dimm, dimm.chips[pos].index);
  }
  function keyActivate(e: KeyboardEvent) {
    if (!interactive || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    selectDimm(dimm.index);
    onstick?.(dimm);
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<g
  class={'stick' + (selected ? ' is-selected' : '') + (labels ? '' : ' no-labels')}
  data-stick={dimm.index}
  onclick={stickClick}
  onkeydown={keyActivate}
  role={interactive ? 'button' : undefined}
  tabindex={interactive ? 0 : -1}
  aria-label={`${dimm.capacityGiB} GB ${dimm.type} module`}
>
  <!-- notch cut-out sits behind the PCB so the key slot reads as a gap -->
  <rect x="6" y="6" width="548" height="124" rx="4" class="s-pcb" />
  <text x="16" y="41" class="s-rank">R1</text>
  <text x="16" y="97" class="s-rank">R0</text>

  <!-- PMIC + SPD hub -->
  <rect x="12" y="106" width="13" height="9" rx="1" class="s-part"><title>PMIC — power management IC</title></rect>
  <rect x="28" y="106" width="13" height="9" rx="1" class="s-part"><title>SPD hub (SPD5118) — module EEPROM + temperature sensor</title></rect>

  {#each rank1 as p, i (p)}
    <g class="chip" transform="translate({xOf[i]},14)">
      <rect x="0" y="0" width={CW} height={CH} rx="2" class="s-chip"><title>{dimm.manufacturer} {dimm.partNumber} — rank 1, die {i + 1}</title></rect>
      {#each pins as k (k)}
        <rect x="-2.2" y={5.5 + k * 6.6} width="2.2" height="2.6" class="s-pin" />
        <rect x={CW} y={5.5 + k * 6.6} width="2.2" height="2.6" class="s-pin" />
      {/each}
      <ChipGrid chip={dimm.chips[p].index} x={3} y={3} w={CW - 6} h={CH - 6} {interactive} oncellclick={() => chipClick(i)} />
    </g>
  {/each}
  {#each rank0 as p, i (p)}
    <g class="chip" transform="translate({xOf[i]},70)">
      <rect x="0" y="0" width={CW} height={CH} rx="2" class="s-chip"><title>{dimm.manufacturer} {dimm.partNumber} — rank 0, die {i + 1}</title></rect>
      {#each pins as k (k)}
        <rect x="-2.2" y={5.5 + k * 6.6} width="2.2" height="2.6" class="s-pin" />
        <rect x={CW} y={5.5 + k * 6.6} width="2.2" height="2.6" class="s-pin" />
      {/each}
      <ChipGrid chip={dimm.chips[p].index} x={3} y={3} w={CW - 6} h={CH - 6} {interactive} oncellclick={() => chipClick(i)} />
    </g>
  {/each}

  <!-- label sticker -->
  <rect x="522" y="14" width="24" height="101" rx="2" class="s-sticker" />
  <text x="534" y="64.5" class="s-sticker-text" transform="rotate(-90 534 64.5)" text-anchor="middle">
    {dimm.capacityGiB}GB {dimm.type} {dimm.speedMts}
  </text>

  <!-- edge connector: gold fingers, DDR5 key notch -->
  {#each fingers as i (i)}
    <rect x={12 + i * 4.07} y="130" width="2.3" height={fingerLen[i % 8]} class="s-gold" />
  {/each}
  <rect x="47" y="128" width="12" height="34" class="s-notch" />
</g>

<style>
  .stick {
    cursor: pointer;
    outline: none;
  }
  .s-pcb {
    fill: var(--dimm-pcb);
    stroke: var(--dimm-line);
    stroke-width: 1.2;
    transition: stroke 120ms ease, stroke-width 120ms ease;
  }
  .stick:hover .s-pcb {
    stroke: var(--ink3);
  }
  .stick:focus-visible .s-pcb,
  .stick.is-selected .s-pcb {
    stroke: var(--accent);
    stroke-width: 2;
  }
  .stick.is-selected .s-pcb {
    filter: drop-shadow(0 0 9px var(--accent-glow));
  }
  .stick.no-labels text {
    display: none;
  }
  .s-rank,
  .s-sub {
    font-family: var(--font-mono);
    fill: var(--ink3);
    pointer-events: none;
  }
  .s-rank {
    font-size: 9px;
    font-weight: 600;
  }
  .s-sub {
    font-size: 7px;
    letter-spacing: 0.12em;
    text-anchor: middle;
  }
  .s-part {
    fill: var(--dimm-chip);
    stroke: var(--dimm-chip-line);
    stroke-width: 0.8;
  }
  .chip {
    pointer-events: all;
  }
  .s-chip {
    fill: var(--dimm-chip);
    stroke: var(--dimm-chip-line);
    stroke-width: 1;
  }
  .s-pin {
    fill: var(--dimm-chip-line);
  }
  .s-sticker {
    fill: var(--dimm-sticker);
    stroke: var(--dimm-line);
    stroke-width: 0.6;
  }
  .s-sticker-text {
    font-family: var(--font-mono);
    font-size: 6.5px;
    fill: var(--dimm-sticker-ink);
    pointer-events: none;
  }
  .s-gold {
    fill: var(--dimm-gold);
  }
  .s-notch {
    fill: var(--bg);
    pointer-events: none;
  }
</style>
