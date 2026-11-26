<script lang="ts">
  /**
   * Dock, GPU die and VRAM levels: the card as a small map — click the die or the VRAM to
   * jump to it — with the card's two children named beside it.
   */
  import GpuCard from '../../scene/GpuCard.svelte';
  import { GPU_CARD } from '../../scene/geometry';
  import DockNav from './DockNav.svelte';
  import { GPU_GEO, GPU_VRAM, type Level } from './nav';

  let { kind, go }: { kind: 'gdie' | 'vram'; go: (l: Level) => void } = $props();

  const SIBS = {
    gdie: { label: 'GPU die', sub: '96 units · 6 shader engines', box: GPU_GEO.die },
    vram: { label: 'VRAM', sub: '12 × 2 GB GDDR6X', box: GPU_VRAM },
  } as const;
  const cur = $derived(SIBS[kind]);
</script>

<DockNav em="on the graphics card" big={cur.label} sub={cur.sub}>
  {#snippet map()}
    <svg
      viewBox="0 0 {GPU_CARD.width} {GPU_CARD.height}"
      width="162"
      height="87"
      class="map"
      role="group"
      aria-label="Graphics card — click the die or the VRAM to jump to it"
    >
      <GpuCard labels={false} ondie={() => go({ kind: 'gdie' })} onvram={() => go({ kind: 'vram' })} />
      <rect class="cur" x={cur.box.x - 5} y={cur.box.y - 5} width={cur.box.w + 10} height={cur.box.h + 10} rx="7" />
    </svg>
  {/snippet}
  {#snippet steps()}
    <div class="seg">
      <button class:on={kind === 'gdie'} onclick={() => go({ kind: 'gdie' })} title="Open the GPU die">GPU die</button>
      <button class:on={kind === 'vram'} onclick={() => go({ kind: 'vram' })} title="Open VRAM">VRAM</button>
    </div>
  {/snippet}
</DockNav>

<style>
  .map {
    border-radius: 10px;
  }
  .map :global(text) {
    display: none; /* unreadable at this size */
  }
  .cur {
    fill: none;
    stroke: var(--accent);
    stroke-width: 5;
    filter: drop-shadow(0 0 4px var(--accent-glow));
    pointer-events: none;
  }
  .seg {
    display: inline-flex;
    border: 1px solid var(--line2);
    border-radius: 999px;
    overflow: hidden;
  }
  .seg button {
    height: 26px;
    padding: 0 12px;
    border: 0;
    background: var(--panel2);
    color: var(--ink3);
    font: 600 11.5px var(--font-ui);
    white-space: nowrap;
    transition: background 140ms ease, color 140ms ease;
  }
  .seg button + button {
    border-left: 1px solid var(--line2);
  }
  .seg button:hover {
    color: var(--ink);
  }
  .seg button.on {
    background: var(--accent);
    color: #fff;
  }
</style>
