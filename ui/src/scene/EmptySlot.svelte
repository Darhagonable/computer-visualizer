<script lang="ts">
  /** An unpopulated DIMM slot — drawn honestly as empty, never as fake silicon. */
  let { label, channel }: { label: string; channel: string } = $props();
</script>

<g class="empty" aria-label={`${label}, empty slot`}>
  <rect x="6" y="6" width="548" height="124" rx="4" class="e-pcb" />
  <text x="280" y="58" text-anchor="middle" class="e-title">{label}</text>
  <text x="280" y="78" text-anchor="middle" class="e-sub">{channel} · empty slot · no module</text>
  <!-- slot body + latches -->
  <rect x="0" y="128" width="560" height="16" rx="3" class="e-slot" />
  <rect x="-8" y="110" width="14" height="38" rx="3" class="e-latch" />
  <rect x="554" y="110" width="14" height="38" rx="3" class="e-latch" />
</g>

<style>
  .e-pcb {
    fill: var(--slot-fill);
    stroke: var(--slot-line);
    stroke-width: 1.2;
    stroke-dasharray: 7 5;
  }
  .e-title {
    font: 600 13px var(--font-mono);
    fill: var(--ink2);
  }
  .e-sub {
    font: 400 10px var(--font-ui);
    fill: var(--ink3);
  }
  .e-slot {
    fill: var(--slot-body);
    stroke: var(--slot-line);
    stroke-width: 1;
  }
  .e-latch {
    fill: var(--slot-body);
    stroke: var(--slot-line);
    stroke-width: 1;
  }
</style>
