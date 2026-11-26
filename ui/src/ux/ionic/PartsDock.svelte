<script lang="ts">
  /**
   * Dock, machine and the first level of every chain: the machine's children in one row —
   * the processor, the graphics card, and every memory module — with the one that is open
   * (or, at the machine, none) framed.
   */
  import { app, getMachine } from '../../mock/store.svelte';
  import DimmStick from '../../scene/DimmStick.svelte';
  import Icon from '../../scene/Icon.svelte';
  import { STICK } from '../../scene/geometry';
  import type { Level } from './nav';
  import { fmt } from './live';

  let { level, go }: { level: Level; go: (l: Level) => void } = $props();

  const m = getMachine();
  const st = $derived(app.stats);
  const load = $derived(app.cpu?.avgLoad ?? 0);
  const l3 = $derived(app.tele?.gpu?.engines['3d'] ?? 0);
</script>

<div class="parts">
  <button class="thumb" class:cur={level.kind === 'package'} onclick={() => go({ kind: 'package' })} title="Open the processor">
    <span class="art"><Icon name="cpu" size={28} /></span>
    <span><b>Processor</b><i>{fmt(load)}% load</i></span>
  </button>
  <button class="thumb" class:cur={level.kind === 'card'} onclick={() => go({ kind: 'card' })} title="Open the graphics card">
    <span class="art"><Icon name="overview" size={28} /></span>
    <span><b>Graphics</b><i>{fmt(l3)}% 3D</i></span>
  </button>
  {#each m.dimms as d (d.index)}
    {@const label = m.slots[d.slot].label}
    <button
      class="thumb"
      class:cur={level.kind === 'stick' && level.dimm === d.index}
      onclick={() => go({ kind: 'stick', dimm: d.index })}
      title="Open {label}"
    >
      <svg viewBox="0 0 {STICK.width} {STICK.height}" width="112" height="32" aria-hidden="true"><DimmStick dimm={d} interactive={false} labels={false} /></svg>
      <span><b>{label}</b><i>{fmt((st?.dimmUsed[d.index] ?? 0) * 100)}% in use</i></span>
    </button>
  {/each}
</div>

<style>
  .parts {
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
    padding: 9px 10px 5px;
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
  .thumb > svg,
  .art {
    display: grid;
    place-items: center;
    width: 112px;
    height: 32px;
  }
  .art {
    color: var(--ink2);
  }
  .thumb.cur .art {
    color: var(--accent);
  }
  .thumb > span:last-child {
    display: flex;
    gap: 6px;
    align-items: baseline;
    font: 500 10.5px var(--font-mono);
    white-space: nowrap;
  }
  .thumb > span:last-child b {
    color: var(--ink2);
    font-weight: 600;
  }
  .thumb > span:last-child i {
    font-style: normal;
  }

  /* a tight dock (a selected owner beside Apps, a narrower window): the art goes, the names stay */
  @container (max-width: 850px) {
    .thumb {
      padding: 12px 12px 8px;
    }
    .thumb > svg,
    .art {
      display: none;
    }
  }
</style>
