<script lang="ts">
  /**
   * The mode row: what the colours mean right now. The global mode switch, then the reading
   * guide of the component on stage — the page legend in "Pages", otherwise the ramp's scale
   * with its throttle mark and its truth label. Whatever a view wants beside it goes in
   * `children` (a pin, a highlight, a hint).
   *
   * Styled with tokens only, so it takes on each UX's theme.
   *
   * `scale`:
   *   always  the view paints exactly this component (Memory, Processor, a drive, the GPU)
   *   pages   the view shows several components, each with its own caption — the page legend
   *           still belongs here, because pages cover all of them (an overview)
   *   never   nothing to read
   */
  import type { Snippet } from 'svelte';
  import { app } from '../mock/store.svelte';
  import type { Component } from '../mock/telemetry';
  import ModeSwitch from '../scene/ModeSwitch.svelte';
  import ScaleLegend from '../scene/ScaleLegend.svelte';

  let {
    component,
    scale = 'always',
    note = '',
    domain,
    compact = false,
    children,
  }: {
    component: Component;
    scale?: 'always' | 'pages' | 'never';
    note?: string;
    /** The range the view paints against, when it is not the component's own. */
    domain?: [number, number];
    /** A short stage: a smaller switch, no qualifier, and no reason line under the scale. */
    compact?: boolean;
    children?: Snippet;
  } = $props();

  /** The page legend is two rows of pills — it gets a row of its own. */
  const legend = $derived(scale === 'always' || (scale === 'pages' && app.mode === 'pages'));
</script>

<div class="mr" class:pages={legend && app.mode === 'pages'} class:compact>
  <ModeSwitch {component} {compact} />
  {#if legend}
    <div class="scale"><ScaleLegend {component} {note} {domain} {compact} explain /></div>
  {/if}
  {#if children}
    <div class="right">{@render children()}</div>
  {/if}
</div>

<style>
  .mr {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    min-height: 34px;
    color: var(--ink);
  }
  .scale {
    flex: none;
    min-width: 0;
    padding-right: 4px;
  }
  /* pages: the legend drops to its own full row, what the view added stays beside the switch */
  .mr.pages .scale {
    order: 2;
    flex-basis: 100%;
    padding-right: 0;
  }
  .right {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    margin-left: auto;
  }
  /* a short stage has no room for the reason a pages-less part is on the temperature scale */
  .compact :global(.why) {
    display: none;
  }
</style>
