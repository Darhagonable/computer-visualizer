<script lang="ts">
  /**
   * Icons the shared set does not carry (navigation pane, mock sensors, sort arrows), drawn in
   * the same 24 × 24 / 1.6 stroke line-art style. Names the shared `Icon` knows fall through to it.
   */
  import Icon from '../../scene/Icon.svelte';
  import { GLYPHS } from './resources';

  let { name, size = 18 }: { name: string; size?: number } = $props();

  const d = $derived(GLYPHS[name]);
</script>

{#if d}
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path {d} />
  </svg>
{:else}
  <Icon {name} {size} />
{/if}

<style>
  svg {
    display: block;
    flex: none;
  }
</style>
