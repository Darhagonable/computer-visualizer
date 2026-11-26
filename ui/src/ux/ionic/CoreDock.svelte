<script lang="ts">
  /**
   * Dock, core level: the package's 16 cores as a small map, each coloured by the mode —
   * click a core to jump to it. The arrows step through the siblings on this chiplet.
   */
  import { app, hoverCard, hoverOut } from '../../mock/store.svelte';
  import { TRUTH, TRUTH_LABEL, MODE_META, type Overlay } from '../../mock/telemetry';
  import DockNav from './DockNav.svelte';
  import type { Level } from '../../levels/nav';
  import { overlayOf, overlayColor, coreValue, threadLoad, truthRow, fmt } from '../../levels/live';

  let { core, go }: { core: number; go: (l: Level) => void } = $props();
  const ccd = $derived(core >> 3);
  const local = $derived(core & 7);
  const CORES = Array.from({ length: 16 }, (_, i) => i);
  const ov = $derived<Overlay>(overlayOf(app.mode, 'cpu') ?? 'temperature');

  /** Two chiplet panels; inside each, 2 CCX × (2 × 2) cores — the package's own arrangement. */
  const cell = (i: number) => ({ x: 7 + (i >> 3) * 118 + ((i >> 2) & 1) * 54 + (i & 1) * 26, y: 9 + ((i >> 1) & 1) * 26 });
  const fill = (i: number) => {
    const c = app.cpu?.cores[i];
    return c ? overlayColor(ov, 'cpu', coreValue(ov, app.tele, c)) : 'transparent';
  };
  const move = (d: number) => go({ kind: 'core', core: ccd * 8 + local + d });

  function card(i: number) {
    const c = app.cpu?.cores[i];
    if (!c) return null;
    return {
      title: `Core ${i + 1}`,
      sub: `CCD ${c.ccd} · CCX ${(i >> 2) & 1}`,
      rows: [
        ...truthRow(ov, 'cpu', coreValue(ov, app.tele, c), ov === 'activity' ? `${Math.round(threadLoad(app.tele, i, 0))} % / ${Math.round(threadLoad(app.tele, i, 1))} % per thread` : undefined),
      ],
      note: `what the colour shows: ${MODE_META[ov].label.toLowerCase()} · ${TRUTH_LABEL[TRUTH[ov].cpu]}`,
      hint: i === core ? 'this is the core you are on' : 'click to jump to this core',
    };
  }
</script>

<DockNav
  em="cores of CCD {ccd}"
  big="Core {core + 1}"
  sub="threads {2 * core} / {2 * core + 1}"
  prev={local > 0 ? { label: `Core ${core}`, go: () => move(-1) } : null}
  next={local < 7 ? { label: `Core ${core + 2}`, go: () => move(1) } : null}
>
  {#snippet map()}
    <svg viewBox="0 0 232 66" width="208" height="59" class="map" role="group" aria-label="The package's sixteen cores — click one to jump to it">
      {#each [0, 1] as c (c)}
        <rect x={1 + c * 118} y="1" width="112" height="64" rx="9" class="pan" class:here={c === ccd} />
      {/each}
      {#each CORES as i (i)}
        {@const p = cell(i)}
        <!-- svelte-ignore a11y_click_events_have_key_events (the arrows step through the cores) -->
        <rect
          x={p.x}
          y={p.y}
          width="22"
          height="22"
          rx="4"
          fill={fill(i)}
          class="cell"
          class:on={i === core}
          onclick={() => go({ kind: 'core', core: i })}
          onpointerenter={(e) => hoverCard(card(i), e)}
          onpointerleave={hoverOut}
        />
      {/each}
    </svg>
  {/snippet}
</DockNav>

<style>
  .pan {
    fill: var(--panel2);
    stroke: var(--line2);
    stroke-width: 1;
  }
  .pan.here {
    stroke: var(--accent);
  }
  .cell {
    cursor: pointer;
    outline: none;
  }
  .cell:hover {
    stroke: var(--ink);
    stroke-width: 1.5;
  }
  .cell.on {
    stroke: var(--ink);
    stroke-width: 2.2;
    filter: drop-shadow(0 0 4px var(--accent-glow));
  }
</style>
