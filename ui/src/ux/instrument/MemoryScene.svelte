<script lang="ts">
  import PanZoom from '../../scene/PanZoom.svelte';
  import RamBoard from '../../scene/RamBoard.svelte';
  import Legend from '../../scene/Legend.svelte';
  import { app, setHighlight } from '../../mock/store.svelte';
  import { RAM_BOARD } from '../../scene/geometry';

  const hl = $derived(app.highlight);
  const hlLabel = $derived.by(() => {
    if (!hl) return '';
    if (hl.kind === 'owner') return 'one owner';
    if (hl.kind === 'state') return 'one page state';
    return 'one use class';
  });
</script>

<div class="mem">
  <div class="toolbar">
    <Legend />
    <div class="grow"></div>
    {#if hl}
      <span class="hl">highlighting · {hlLabel}</span>
      <button class="clear" onclick={() => setHighlight(null)} title="Clear highlight (Esc)">clear ✕</button>
    {/if}
  </div>
  <div class="board">
    <PanZoom width={RAM_BOARD.width} height={RAM_BOARD.height}>
      <RamBoard />
    </PanZoom>
  </div>
</div>

<style>
  .mem {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .grow {
    flex: 1;
  }
  .hl {
    font: 500 11px var(--font-mono);
    color: var(--accent);
  }
  .clear {
    height: 24px;
    padding: 0 10px;
    border-radius: 6px;
    border: 1px solid var(--line2);
    background: var(--panel);
    color: var(--ink2);
    font-size: 11.5px;
  }
  .clear:hover {
    color: var(--ink);
    border-color: var(--ink3);
  }
  .board {
    flex: 1;
    min-height: 0;
    border-radius: var(--radius);
    border: 1px solid var(--line);
    background:
      linear-gradient(var(--line) 1px, transparent 1px) 0 0 / 40px 40px,
      linear-gradient(90deg, var(--line) 1px, transparent 1px) 0 0 / 40px 40px,
      var(--bg2);
    background-blend-mode: normal;
    overflow: hidden;
  }
</style>
