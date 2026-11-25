<script lang="ts">
  /**
   * Second row of the stage header: what the colours mean right now. The global mode switch,
   * then the reading guide of the scene's component (the page legend, or the overlay's scale
   * with its truth label). Scenes add whatever belongs beside it through `children`.
   *
   * `scale`:
   *   always  the scene paints exactly this component (Memory, Processor, GPU)
   *   pages   the scene shows several components, each with its own caption — the page legend
   *           still belongs here, because pages cover all of them (Overview)
   *   never   nothing to read
   */
  import type { Snippet } from 'svelte';
  import { app } from '../../mock/store.svelte';
  import { modeApplies, type Component } from '../../mock/telemetry';
  import ModeSwitch from '../../scene/ModeSwitch.svelte';
  import SceneScale from './SceneScale.svelte';

  let {
    component,
    scale = 'always',
    note = '',
    domain,
    children,
  }: {
    component: Component;
    scale?: 'always' | 'pages' | 'never';
    note?: string;
    /** The range the scene paints against, when it is not the component's own. */
    domain?: [number, number];
    children?: Snippet;
  } = $props();

  /** The page legend is two rows of pills — it gets a row of its own. */
  const legend = $derived(scale === 'always' || (scale === 'pages' && app.mode === 'pages'));
  const pages = $derived(app.mode === 'pages' && modeApplies('pages', component));
</script>

<div class="tools" class:pages>
  <ModeSwitch {component} />
  {#if legend}
    <div class="scale"><SceneScale {component} {note} {domain} /></div>
  {/if}
  {#if children}
    <div class="right">{@render children()}</div>
  {/if}
</div>

<style>
  .tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    margin-top: 10px;
    min-height: 34px;
  }
  .scale {
    flex: none;
    min-width: 0;
    padding-right: 4px;
  }
  /* ScaleLegend caps itself at 360 px; a long note ("per die · estimated from the module sensor")
     is cut to an ellipsis there. The stage header has the room, so lift the cap — nothing else changes. */
  .scale :global(.scale) {
    max-width: 420px;
  }
  /* pages: the legend drops to its own full row, what the scene added stays beside the switch */
  .tools.pages .scale {
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
</style>
