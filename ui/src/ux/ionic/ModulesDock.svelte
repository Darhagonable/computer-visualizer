<script lang="ts">
  /**
   * Dock, the modules view and the module level: every module as it sits in its slot, the one
   * that is open framed — the dies row's counterpart one level up. Click one to open it.
   *
   * Each is the shared stick, so its grids are live and coloured by the mode; the word for
   * that colour is on stage, in the level's own reading guide. The figure is the module's
   * share in use — what the system counts as in use, active and modified pages.
   */
  import { app, getMachine } from '../../mock/store.svelte';
  import DimmStick from '../../scene/DimmStick.svelte';
  import { STICK } from '../../scene/geometry';
  import type { Level } from '../../levels/nav';
  import { fmt } from '../../levels/live';

  let { level, go }: { level: Level; go: (l: Level) => void } = $props();

  const m = getMachine();
  const st = $derived(app.stats);
  /** Share of a module's blocks that are live (active + modified), in %. */
  const used = (dimm: number) => fmt((st?.dimmUsed[dimm] ?? 0) * 100);
</script>

<div class="mods" role="group" aria-label="Memory modules — click one to open it">
  {#each m.dimms as d (d.index)}
    {@const label = m.slots[d.slot].label}
    {@const open = level.kind === 'stick' && level.dimm === d.index}
    <button class="thumb" class:cur={open} onclick={() => go({ kind: 'stick', dimm: d.index })} title="Open {label} · {used(d.index)} % in use" aria-pressed={open}>
      <svg viewBox="0 0 {STICK.width} {STICK.height}" width="92" height="27" aria-hidden="true"><DimmStick dimm={d} interactive={false} labels={false} /></svg>
      <span><b>{label}</b><i>{used(d.index)}%</i></span>
    </button>
  {/each}
</div>

<style>
  .mods {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-width: 0;
  }
  .thumb {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 9px 8px 5px;
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
    border-radius: 5px;
  }
  .thumb > span {
    display: flex;
    gap: 6px;
    align-items: baseline;
    font: 500 10.5px var(--font-mono);
    white-space: nowrap;
  }
  .thumb > span b {
    color: var(--ink2);
    font-weight: 600;
  }
  .thumb > span i {
    font-style: normal;
  }
</style>
