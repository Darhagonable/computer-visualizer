<script lang="ts">
  /**
   * The honesty label — measured / estimated / modelled — for a single reading. Same words
   * and same colours as the tag on the scale legends, so the two never disagree.
   */
  import { TRUTH_LABEL, type Truth } from '../../mock/telemetry';

  let { truth }: { truth: Truth } = $props();
</script>

<span class="truth" data-truth={truth}>{TRUTH_LABEL[truth]}</span>

<style>
  .truth {
    display: inline-block;
    flex: none;
    padding: 0 6px;
    border-radius: 7px;
    border: 1px solid currentColor;
    font: 600 9px var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    line-height: 15px;
    vertical-align: 1px;
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
