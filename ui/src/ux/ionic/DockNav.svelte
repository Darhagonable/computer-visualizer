<script lang="ts">
  /**
   * The dock's middle for a level with few siblings: a small map of the parent on the left
   * — a snippet, each level brings its own — then what is open and the way to its neighbours.
   */
  import type { Snippet } from 'svelte';
  import Icon from '../../scene/Icon.svelte';

  export interface Step {
    label: string;
    go: () => void;
  }

  interface Props {
    map: Snippet;
    em: string;
    big: string;
    sub?: string;
    prev?: Step | null;
    next?: Step | null;
    /** Replaces the previous / next arrows (for named siblings). */
    steps?: Snippet | null;
  }
  let { map, em, big, sub = '', prev = null, next = null, steps = null }: Props = $props();
</script>

<div class="bmap">
  {@render map()}
  <div class="nav">
    <span class="lbl">
      <em>{em}</em>
      <b>{big}</b>
      {#if sub}<i>{sub}</i>{/if}
    </span>
    {#if steps}
      {@render steps()}
    {:else if prev || next}
      <div class="steps">
        {#if prev}
          <button class="step prev" onclick={prev.go} title={prev.label} aria-label={prev.label}><Icon name="chevronRight" size={15} /></button>
        {/if}
        {#if next}
          <button class="step" onclick={next.go} title={next.label} aria-label={next.label}><Icon name="chevronRight" size={15} /></button>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .bmap {
    display: flex;
    align-items: center;
    gap: 18px;
    height: 100%;
    padding: 10px 0;
  }
  .bmap > :global(svg) {
    display: block;
    flex: none;
  }
  .nav {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .lbl {
    display: block;
    white-space: nowrap;
  }
  .lbl em {
    display: block;
    font: 600 9.5px var(--font-mono);
    font-style: normal;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: var(--ink3);
  }
  .lbl b {
    font: 300 24px/1.1 var(--font-ui);
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .lbl i {
    margin-left: 8px;
    font: 500 11px var(--font-mono);
    font-style: normal;
    color: var(--ink3);
  }
  .steps {
    display: flex;
    gap: 6px;
  }
  .step {
    display: grid;
    place-items: center;
    min-width: 30px;
    height: 26px;
    padding: 0 10px;
    border-radius: 999px;
    border: 1px solid var(--line2);
    background: var(--panel2);
    color: var(--ink2);
    font: 600 11.5px var(--font-ui);
    white-space: nowrap;
    transition: border-color 140ms ease, transform 160ms ease, color 140ms ease;
  }
  .step.prev :global(svg) {
    transform: rotate(180deg);
  }
  .step:hover {
    border-color: var(--accent);
    color: var(--ink);
  }
  .step:active {
    transform: scale(0.94);
  }
  .step:disabled {
    opacity: 0.35;
  }
</style>
