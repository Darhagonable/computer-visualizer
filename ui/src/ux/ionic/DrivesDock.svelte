<script lang="ts">
  /**
   * Dock, the drives view and the drive level: the machine's three drives side by side, the one
   * that is open framed — click one to open it. Each is the shared drawing, coloured by the
   * storage overlay.
   *
   * A coloured reading carries its word. Under each drive: its reading under the mode, and the
   * truth of that overlay for a drive — TRUTH's word, the one the level's own guide states.
   * A drive without a temperature sensor reads "—" and says "no sensor": never a guess.
   */
  import { app, hoverCard, hoverOut } from '../../mock/store.svelte';
  import { TRUTH, type Overlay } from '../../mock/telemetry';
  import Drive from '../../scene/Drive.svelte';
  import TruthChip from '../../levels/TruthChip.svelte';
  import { DRIVE_CANVAS, NO_DATA_WHY, driveCard, driveValue, readingText, shortModel } from '../../levels/drives.live';
  import { overlayOf } from '../../levels/live';
  import type { Level } from '../../levels/nav';

  let { level, go }: { level: Level; go: (l: Level) => void } = $props();

  /** How tall each drawing is, in px; its width follows its own canvas. */
  const ART_H = 38;

  /** Pages are memory data only: the drives stay on their temperature colours. */
  const ov = $derived<Overlay>(overlayOf(app.mode, 'storage') ?? 'temperature');

  /** What each thumbnail says of its drive. The mock mutates the readings in place, so the tick is read here. */
  const drives = $derived.by(() => {
    void app.version;
    return (app.tele?.storage ?? []).map((d) => {
      const value = driveValue(ov, d);
      return { i: d.index, name: shortModel(d.model), canvas: DRIVE_CANVAS[d.kind], noData: value === null, text: value === null ? '—' : readingText(ov, value) };
    });
  });

  /** The drive's card — the one the drives view and the board show. */
  function enter(i: number, e: PointerEvent) {
    const d = app.tele?.storage[i];
    if (d) hoverCard(driveCard(d, ov, 'click to open this drive'), e);
  }
</script>

<div class="drives" role="group" aria-label="Drives — click one to open it">
  {#each drives as d (d.i)}
    {@const open = level.kind === 'drive' && level.drive === d.i}
    <button
      class="thumb"
      class:cur={open}
      onclick={() => go({ kind: 'drive', drive: d.i })}
      onpointerenter={(e) => enter(d.i, e)}
      onpointerleave={hoverOut}
      title="Open {d.name}"
      aria-pressed={open}
    >
      <svg viewBox="0 0 {d.canvas.w} {d.canvas.h}" style="width:{Math.round((d.canvas.w / d.canvas.h) * ART_H)}px; height:{ART_H}px" aria-hidden="true">
        <Drive drive={d.i} interactive={false} labels={false} />
      </svg>
      <span class="name">{d.name}</span>
      <span class="cap">
        {#if d.noData}
          <b class="reading nodata">—</b><span class="why">{NO_DATA_WHY[ov]}</span>
        {:else}
          <b class="reading">{d.text}</b><TruthChip truth={TRUTH[ov].storage} />
        {/if}
      </span>
    </button>
  {/each}
</div>

<style>
  .drives {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 0;
  }
  .thumb {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    min-width: 140px;
    padding: 9px 10px 6px;
    border-radius: 16px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--ink3);
    transition: background 160ms ease, border-color 160ms ease, transform 200ms cubic-bezier(0.2, 0.75, 0.25, 1);
  }
  .thumb:hover {
    background: var(--panel2);
    transform: translateY(-3px);
  }
  .thumb.cur {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 13%, var(--panel2));
    box-shadow: 0 0 20px color-mix(in srgb, var(--accent) 32%, transparent);
  }
  .thumb > svg {
    display: block;
  }
  /* the doors light up in this UX's accent */
  .thumb:hover :global(.drive .case),
  .thumb.cur :global(.drive .case) {
    stroke: var(--accent);
  }
  .name {
    font: 600 10.5px var(--font-mono);
    color: var(--ink2);
    white-space: nowrap;
  }
  .cap {
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }
  .reading {
    font: 600 12.5px var(--font-ui);
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .reading.nodata {
    color: var(--ink3);
  }
  .why {
    font-size: 11px;
    color: var(--ink3);
  }
</style>
