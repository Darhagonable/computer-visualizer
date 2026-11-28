<script lang="ts">
  /**
   * The memory board. How to read it — the page legend, or the overlay's scale with its
   * truth label — sits in the stage header (the mode row); the board's grids recolour by
   * themselves when the global mode changes.
   *
   * Every module is a door: click it — or any block on it — to open the module's own view.
   * The inspector follows the pointer over the blocks; their hover cards say what a click does
   * (the shared grids promise an owner highlight, which is not what a click does here).
   */
  import { app, getMachine, hoverCard, hoverOut } from '../../mock/store.svelte';
  import { CELLS_PER_CHIP, type Dimm } from '../../mock/model';
  import { TRUTH, type Overlay } from '../../mock/telemetry';
  import RamBoard from '../../scene/RamBoard.svelte';
  import { RAM_BOARD } from '../../scene/geometry';
  import { patchHover, type Level } from '../../levels/nav';
  import { chipsHeat, chipsOf, fmt, heatWatts, labelled, truthRow } from '../../levels/live';

  let { onnavigate }: { onnavigate: (l: Level, el?: Element) => void } = $props();

  const m = getMachine();
  /** The overlay on the grids; null in "Pages", where they show page data. */
  const ov = $derived<Overlay | null>(app.mode === 'pages' ? null : app.mode);
  const slotLabel = (dimm: number) => m.slots[m.dimms[dimm]?.slot ?? 0]?.label ?? `DIMM ${dimm}`;

  /** A module, by its index on the board. */
  const open = (dimm: number, el?: Element) => onnavigate({ kind: 'stick', dimm }, el);

  /** Why an overlay's value for a module is what it is — the card's second row. */
  const WHY: Record<Overlay, string> = {
    temperature: 'the mean of its dies, spread out from the sensor',
    activity: 'mean page heat of its blocks',
    power: 'DIMMs have no power sensor',
  };

  /** Everything a module is, each reading with its truth word. */
  function moduleCard(d: Dimm) {
    const tele = app.tele;
    const heat = tele ? chipsHeat(tele, chipsOf(m, d.index)).mean : 0;
    const dies = tele ? d.chips.reduce((sum, c) => sum + tele.dieTemp[c.index], 0) / d.chips.length : 0;
    const value = ov === 'temperature' ? dies : ov === 'activity' ? heat * 100 : heatWatts(heat);
    return {
      title: `${slotLabel(d.index)} · ${d.capacityGiB} GiB ${d.type}`,
      sub: `${d.manufacturer} ${d.partNumber}`,
      rows: [
        { k: 'in use', v: `${Math.round((app.stats?.dimmUsed[d.index] ?? 0) * 100)} %`, mono: true },
        ...(tele ? labelled('temperature', `${fmt(tele.dimmTemp[d.index], 1)} °C module sensor`, 'measured') : []),
        ...(ov && tele ? truthRow(ov, 'memory', value, WHY[ov]) : []),
        { k: 'holds', v: `${d.chips.length * CELLS_PER_CHIP} blocks of 4 MiB`, mono: true },
      ],
      hint: 'click to open this module',
    };
  }

  /**
   * Over a block, the grid has already shown the block's own card — which promises an owner
   * highlight; here a click opens the module, so say so. Over the rest of a module: its card.
   */
  function onMove(e: PointerEvent) {
    const t = e.target instanceof Element ? e.target : null;
    const stick = t?.closest<HTMLElement>('[data-stick]');
    if (!stick) return;
    const d = m.dimms[Number(stick.dataset.stick)];
    if (!d) return;
    if (t?.closest('[data-chip]')) return patchHover(`click to open ${slotLabel(d.index)} — its dies and blocks`);
    if (!app.hover) hoverCard(moduleCard(d), e);
  }
</script>

<!-- the handlers only show hover cards: the modules are the controls -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="lv board" onpointermove={onMove} onpointerleave={hoverOut}>
  <!-- a fixed drawing, fitted and centred like this UX's other scenes: no panning, no zoom -->
  <svg viewBox="0 0 {RAM_BOARD.width} {RAM_BOARD.height}" preserveAspectRatio="xMidYMid meet">
    <RamBoard onstick={(d) => open(d.index)} onchip={(d) => open(d.index)} />
  </svg>
</div>

<style>
  .board {
    display: flex;
    flex-direction: column;
    border-radius: var(--radius);
    border: 1px solid var(--line);
    background:
      linear-gradient(var(--line) 1px, transparent 1px) 0 0 / 40px 40px,
      linear-gradient(90deg, var(--line) 1px, transparent 1px) 0 0 / 40px 40px,
      var(--bg2);
    background-blend-mode: normal;
    overflow: hidden;
  }
  .board > svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
