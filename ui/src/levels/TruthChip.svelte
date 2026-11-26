<script lang="ts">
  /**
   * A truth badge outside a reading guide: for something that is coloured by an overlay the
   * level's own legend does not cover — the socket and the card on the mini-map of a memory
   * level, or a number that is not the mode's own. The word is telemetry.ts's, the look is
   * ScaleLegend's.
   *
   * With `component` and `ov` the word is the overlay's on that component. A figure whose truth
   * is its own — a sensor reading under an overlay that is estimated, as in the side menu —
   * passes that word as `truth` instead.
   */
  import { MODE_META, TRUTH, TRUTH_LABEL, type Component, type Overlay, type Truth } from '../mock/telemetry';

  let {
    component,
    ov,
    name,
    truth: own,
    showMode = true,
  }: { component?: Component; ov?: Overlay; name?: string; truth?: Truth | null; showMode?: boolean } = $props();

  const NAME: Record<Component, string> = { memory: 'memory', cpu: 'CPU', gpu: 'GPU', storage: 'storage' };
  const truth = $derived(own !== undefined ? own : component && ov ? TRUTH[ov][component] : null);
  const who = $derived(name !== undefined ? name : component ? NAME[component] : '');
  /** "CPU · temperature — measured": the part, the overlay when it is shown, and the word. */
  const title = $derived.by(() => {
    if (truth === null) return '';
    const parts = [who, showMode && ov ? MODE_META[ov].label.toLowerCase() : ''].filter(Boolean);
    return `${parts.join(' · ')}${parts.length ? ' — ' : ''}${TRUTH_LABEL[truth]}`;
  });
</script>

{#if truth !== null}
  <span class="tc" {title}>
    {#if who}<i>{who}</i>{/if}
    {#if showMode && ov}<b>{MODE_META[ov].label}</b>{/if}
    <span class="truth" data-truth={truth}>{TRUTH_LABEL[truth]}</span>
  </span>
{/if}

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
