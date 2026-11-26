<script lang="ts">
  import type { Level, Target } from './nav';
  // STUB — replaced by the real level in this step; must not ship.
  let { w, h, go, down }: { w: number; h: number; go: (l: Level) => void; down: (t?: Target) => void } = $props();
</script>

<div class="lv lv-scope" data-short={h > 0 && h < 620 ? '1' : '0'}>
  <div class="stub"><b>DrivesLevel</b><span>NOT BUILT YET — a stub, not a view</span></div>
</div>

<style>
  .lv {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .stub {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 18px 26px;
    border: 1px dashed var(--warn);
    border-radius: 12px;
    color: var(--warn);
    font: 600 13px var(--font-mono);
  }
</style>
