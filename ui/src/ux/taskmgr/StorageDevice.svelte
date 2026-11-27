<script lang="ts">
  /**
   * The device view of the storage page — the machine's drives as they physically are (the
   * shared Drive drawing: an NVMe stick under its lifted heatsink, a 2.5″ SSD and a 3.5″ hard
   * disk with their lids off), each a door into its own part view. A drive's colour is its
   * reading under the overlay, and the drive says so under itself: the reading and its truth
   * word, or "— no sensor" in the no-data colour where it has none. The column beside the stage
   * lists the drives with their capacity, split into their partitions.
   *
   * Every number is the storage model's (`app.tele.storage`); what is honest about it is
   * mock/telemetry.ts's: busy time and rates are measured, an NVMe drive's temperature is
   * measured, the watts are estimated, and a drive without a sensor is "no data" — never a
   * guess. The drawings are illustrations: how many flash packages a drive shows is line art.
   */
  import { app, hoverCard, hoverOut } from '../../mock/store.svelte';
  import { TRUTH, type DriveLive, type Overlay } from '../../mock/telemetry';
  import { metricColor } from '../../scene/paint.svelte';
  import Drive, { DRIVE_CANVAS, NO_DATA_WHY, capShort, driveCard, driveOverlay, driveValue, hours, partitionCard, pct, readingText, shortModel } from '../../scene/Drive.svelte';
  import TruthChip from '../../levels/TruthChip.svelte';
  import type { Level } from '../../levels/nav';

  let { onnavigate }: { onnavigate: (l: Level) => void } = $props();

  /** Pages are memory data only: the drives stay on their temperature colours. */
  const ov = $derived<Overlay>(driveOverlay(app.mode));

  /** Each drive as the stage shows it. The readings are mutated in place, so the tick is read here and a fresh list comes out. */
  const drives = $derived.by(() => {
    void app.version;
    return (app.tele?.storage ?? []).map((d: DriveLive) => {
      const value = driveValue(ov, d);
      const total = d.partitions.reduce((s, p) => s + p.totalGiB, 0);
      return {
        i: d.index,
        name: shortModel(d.model),
        model: d.model,
        bus: d.bus,
        canvas: DRIVE_CANVAS[d.kind],
        value,
        noData: value === null,
        reading: value === null ? null : readingText(ov, value),
        fill: metricColor(ov, 'storage', value),
        usedPct: pct(d.usedGiB, d.totalGiB),
        parts: d.partitions.map((p, k) => ({ k, of: total > 0 ? (p.totalGiB / total) * 100 : 0, full: pct(p.usedGiB, p.totalGiB) })),
        health: d.wearPct !== null ? `${Math.round(d.wearPct)} % worn` : 'wear —',
        hours: d.powerOnHours,
      };
    });
  });

  // ---- the stage: one drawing per drive, all at the same scale ------------------------------

  /** Stage margins, the gaps between the drives, and the lines above and under each drawing. */
  const PAD_X = 16;
  const PAD_Y = 12;
  const GAP = 32;
  const NAME_H = 22;
  const CAP_H = 22;
  const ALL_W = DRIVE_CANVAS.nvme.w + DRIVE_CANVAS.ssd.w + DRIVE_CANVAS.hdd.w;
  const TALL_H = Math.max(DRIVE_CANVAS.nvme.h, DRIVE_CANVAS.ssd.h, DRIVE_CANVAS.hdd.h);

  let sw = $state(0);
  let sh = $state(0);
  const scale = $derived(Math.max(0.3, Math.min(2.4, (sw - 2 * PAD_X - (drives.length - 1) * GAP) / ALL_W, (sh - 2 * PAD_Y - NAME_H - CAP_H) / TALL_H)));

  const open = (i: number) => {
    hoverOut(); // the door is about to go: its card should not linger over the next view
    onnavigate({ kind: 'drive', drive: i });
  };
  /** The drive's card follows the pointer. */
  function enter(i: number, e: PointerEvent) {
    const d = app.tele?.storage[i];
    if (d) hoverCard(driveCard(d, ov, 'click to open this drive'), e);
  }
  /** Over a partition of the capacity bar the partition explains itself — its activity share is modelled, and the card says so. */
  function enterPart(i: number, k: number, e: PointerEvent) {
    const d = app.tele?.storage[i];
    if (d) hoverCard(partitionCard(d, k), e);
  }
</script>

<div class="sto">
  <div class="stage" bind:clientWidth={sw} bind:clientHeight={sh}>
    {#each drives as d (d.i)}
      <button
        class="unit"
        style="width: {d.canvas.w * scale}px"
        aria-label="{d.model} · {d.reading ?? NO_DATA_WHY[ov]} · open this drive"
        onpointerenter={(e) => enter(d.i, e)}
        onpointermove={(e) => enter(d.i, e)}
        onpointerleave={hoverOut}
        onclick={() => open(d.i)}
      >
        <span class="name">{d.name}</span>
        <!-- every drawing in a box as tall as the tallest one: the names line up, so do the readings -->
        <svg viewBox="0 0 {d.canvas.w} {d.canvas.h}" style="height: {TALL_H * scale}px" class="dsvg" aria-hidden="true">
          <Drive drive={d.i} interactive={false} labels={false} />
        </svg>
        <span class="cap">
          {#if d.noData}
            <b class="reading nodata">—</b><span class="why">{NO_DATA_WHY[ov]}</span>
          {:else}
            <b class="reading">{d.reading}</b><TruthChip truth={TRUTH[ov].storage} />
          {/if}
        </span>
      </button>
    {/each}
  </div>

  <aside class="side">
    <h4>Drives <span class="hint">click to open</span></h4>
    <ul class="list">
      {#each drives as d (d.i)}
        {@const live = app.tele?.storage[d.i]}
        <li>
          <button
            class="drv"
            class:nodata={d.noData}
            onpointerenter={(e) => enter(d.i, e)}
            onpointermove={(e) => enter(d.i, e)}
            onpointerleave={hoverOut}
            onclick={() => open(d.i)}
            aria-label="Open {d.name}, {d.bus}"
          >
            <span class="l1"><i class="sw" style="background: {d.fill}"></i><span class="n">{d.name}</span>{#if live}<b class="busy">{Math.round(live.busyPct)} %</b>{/if}</span>
            <span class="bar" aria-hidden="true">
              {#each d.parts as p (p.k)}
                <i class="seg" style="flex-basis: {p.of}%" data-part={p.k} onpointerenter={(e) => enterPart(d.i, p.k, e)} onpointerleave={hoverOut}><span style="width: {Math.min(100, p.full)}%"></span></i>
              {/each}
            </span>
            <span class="l3"><span>{live ? `${capShort(live.usedGiB, live.totalGiB)} in use` : ''}</span><span class="health">{d.health} · {hours(d.hours)}</span></span>
          </button>
        </li>
      {/each}
    </ul>
  </aside>
</div>

<style>
  /* Fills the device card's body, like the `.body` of every other resource: the stage and the
     list column take their height from it. */
  .sto {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 236px;
  }
  .stage {
    position: relative;
    min-width: 0;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 32px;
    padding: 12px 16px;
    background: radial-gradient(circle, var(--line2) 1px, transparent 1.3px) 0 0 / 24px 24px;
  }
  /* one door per drive: its name, its drawing, its reading under the overlay with its word */
  .unit {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    padding: 0;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--ink);
    text-align: center;
  }
  .unit:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .name {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    height: 22px;
    padding-bottom: 5px;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ink2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: color 140ms ease;
  }
  .unit:hover .name,
  .unit:focus-visible .name {
    color: var(--ink);
  }
  .dsvg {
    display: block;
    width: 100%;
  }
  /* the doors light up in this UX's accent */
  .unit:hover :global(.drive .pcb),
  .unit:hover :global(.drive .case),
  .unit:focus-visible :global(.drive .pcb),
  .unit:focus-visible :global(.drive .case) {
    stroke: var(--accent);
    filter: drop-shadow(0 0 5px var(--accent-glow));
  }
  .cap {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0 6px;
    height: 22px;
    padding-top: 6px;
  }
  .reading {
    font-size: 13.5px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .reading.nodata {
    color: var(--ink3);
  }
  .why {
    font-size: 11px;
    color: var(--ink3);
    white-space: nowrap;
  }

  /* ---- the list beside the stage ---- */
  .side {
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
    padding: 10px 12px 10px 12px;
    border-left: 1px solid var(--line);
  }
  h4 {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin: 0 0 6px;
    font-size: 11px;
    font-weight: 600;
    color: var(--ink3);
    white-space: nowrap;
  }
  h4 .hint {
    font-weight: 400;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
  }
  .drv {
    display: grid;
    gap: 5px;
    width: 100%;
    padding: 7px 8px 6px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--ink2);
    text-align: left;
    font-size: 12px;
    transition: background 80ms ease, box-shadow 80ms ease;
  }
  .drv:hover {
    background: var(--panel);
    box-shadow: inset 0 0 0 1px var(--line2);
  }
  .drv:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .l1 {
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
  }
  .sw {
    width: 10px;
    height: 10px;
    border-radius: 2.5px;
    box-shadow: inset 0 0 0 1px var(--line2);
  }
  .n {
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ink);
  }
  .busy {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: var(--ink);
  }
  /* the capacity, split into the partitions: each segment as wide as the partition, filled by how much it holds */
  .bar {
    display: flex;
    gap: 2px;
    height: 6px;
  }
  .seg {
    display: block;
    min-width: 2px;
    height: 100%;
    border-radius: 2px;
    background: var(--line);
    overflow: hidden;
    transition: box-shadow 120ms ease;
  }
  .seg > span {
    display: block;
    height: 100%;
    background: var(--ink2);
    opacity: 0.7;
  }
  .seg:hover {
    box-shadow: inset 0 0 0 1px var(--ink);
  }
  .l3 {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 11px;
    color: var(--ink3);
    white-space: nowrap;
  }
  .health {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* A short card: the rows pack, then the list scrolls. */
  @container (max-height: 259px) {
    .drv {
      gap: 3px;
      padding-top: 5px;
      padding-bottom: 4px;
    }
    h4 {
      margin-bottom: 3px;
    }
  }
  @container (max-width: 760px) {
    .sto {
      grid-template-columns: minmax(0, 1fr) 208px;
    }
    .stage {
      gap: 20px;
      padding-inline: 10px;
    }
  }
</style>
