<script lang="ts">
  /**
   * The memory board. How to read it — the page legend, or the overlay's scale with its
   * truth label — sits in the stage header (StageToolbar); the board's grids recolour by
   * themselves when the global mode changes.
   */
  import PanZoom from '../../scene/PanZoom.svelte';
  import RamBoard from '../../scene/RamBoard.svelte';
  import { RAM_BOARD } from '../../scene/geometry';
</script>

<div class="board">
  <PanZoom width={RAM_BOARD.width} height={RAM_BOARD.height}>
    <RamBoard />
  </PanZoom>
</div>

<style>
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
