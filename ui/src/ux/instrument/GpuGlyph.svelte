<script lang="ts">
  /**
   * Rail glyph for the GPU scene. The shared Icon set has no graphics-card symbol, so the
   * Instrument UX carries its own — drawn to the same rules (24 × 24, 1.6 stroke, round caps).
   * Card seen from the cooler side: shroud, one fan, bracket, edge connector.
   */
  let { size = 18 }: { size?: number } = $props();
</script>

<svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M5 6h16v10H5z" />
  <circle cx="13" cy="11" r="3" />
  <path d="M2.5 4v16M5 16v3.5M9 16v3.5M13 16v3.5M17 16v3.5" />
</svg>

<style>
  svg {
    display: block;
    flex: none;
  }
</style>
