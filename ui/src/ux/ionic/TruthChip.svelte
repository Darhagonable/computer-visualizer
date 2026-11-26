<script lang="ts">
  /**
   * A truth badge outside a reading guide: for something that is coloured by an overlay the
   * level's own legend does not cover — the socket and the card on the mini-map of a memory
   * level, or a number that is not the mode's own. The word is telemetry.ts's, the look is
   * ScaleLegend's.
   */
  import { MODE_META, TRUTH, TRUTH_LABEL, type Component, type Overlay } from '../../mock/telemetry';

  let { component, ov, name, showMode = true }: { component: Component; ov: Overlay; name?: string; showMode?: boolean } = $props();

  const NAME: Record<Component, string> = { memory: 'memory', cpu: 'CPU', gpu: 'GPU' };
  const truth = $derived(TRUTH[ov][component]);
  const who = $derived(name ?? NAME[component]);
</script>

<span class="tc" title="{who} · {MODE_META[ov].label.toLowerCase()} — {TRUTH_LABEL[truth]}">
  {#if who}<i>{who}</i>{/if}
  {#if showMode}<b>{MODE_META[ov].label}</b>{/if}
  <span class="truth" data-truth={truth}>{TRUTH_LABEL[truth]}</span>
</span>

<style>
  .tc {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 6px;
    max-width: 100%;
    font: 500 10px var(--font-ui);
    color: var(--ink3);
    white-space: nowrap;
  }
  .tc b {
    font-weight: 500;
    color: var(--ink2);
  }
  .truth {
    padding: 0 6px;
    border-radius: 7px;
    border: 1px solid currentColor;
    font: 600 9px var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    line-height: 15px;
  }
  .truth[data-truth='measured'] {
    color: var(--good);
  }
  .truth[data-truth='estimated'] {
    color: var(--warn);
  }
  .truth[data-truth='modelled'] {
    color: var(--accent);
  }
  .truth[data-truth='unavailable'] {
    color: var(--ink3);
  }
</style>
