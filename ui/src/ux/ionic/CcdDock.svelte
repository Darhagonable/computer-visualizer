<script lang="ts">
  /**
   * Dock, CCD level: the package as a small map — click a chiplet or a core to jump to it.
   * The texts are hidden at this size; the level's own hero says everything.
   */
  import CpuDie from '../../scene/CpuDie.svelte';
  import { CPU_DIE } from '../../scene/geometry';
  import DockNav from './DockNav.svelte';
  import { CPU_GEO, type Level } from '../../levels/nav';

  let { ccd, go }: { ccd: number; go: (l: Level) => void } = $props();
</script>

<DockNav
  em="chiplets of the package"
  big="CCD {ccd}"
  sub="8 cores / 16 threads"
  prev={ccd > 0 ? { label: 'CCD 0', go: () => go({ kind: 'ccd', ccd: 0 }) } : null}
  next={ccd < 1 ? { label: 'CCD 1', go: () => go({ kind: 'ccd', ccd: 1 }) } : null}
>
  {#snippet map()}
    <svg
      viewBox="0 0 {CPU_DIE.width} {CPU_DIE.height}"
      width="109"
      height="92"
      class="map"
      role="group"
      aria-label="Processor package — click a chiplet or a core to jump to it"
    >
      <CpuDie labels={false} onccd={(c) => go({ kind: 'ccd', ccd: c })} oncore={(i) => go({ kind: 'core', core: i })} />
      <rect class="cur" x={CPU_GEO.ccdX[ccd] - 3} y={CPU_GEO.ccdY - 3} width={CPU_GEO.ccdW + 6} height={CPU_GEO.ccdH + 6} rx="9" />
    </svg>
  {/snippet}
</DockNav>

<style>
  .map {
    border-radius: 10px;
  }
  .map :global(text) {
    display: none; /* unreadable at this size */
  }
  .map :global(.ccd:hover .ccd-body) {
    stroke: var(--accent);
  }
  .map :global(.core:hover .core-body) {
    stroke: var(--accent);
  }
  .cur {
    fill: none;
    stroke: var(--accent);
    stroke-width: 4;
    filter: drop-shadow(0 0 4px var(--accent-glow));
    pointer-events: none;
  }
</style>
