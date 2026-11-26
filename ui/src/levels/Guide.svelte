<script lang="ts">
  /**
   * The reading guide for a level's colours: the shared ScaleLegend — the page legend in
   * "Pages", otherwise the ramp with its throttle mark and its truth label — under the
   * overlay's own figure for this level, and with the one-line reason behind the label.
   * Wherever a level colours by an overlay, one of these is on stage.
   *
   * A part without pages (a processor, a drive) is on its temperature colours while the mode is
   * "Pages". ScaleLegend shows that scale and, asked to, states why in one sentence.
   */
  import { app } from '../mock/store.svelte';
  import { TRUTH_NOTE, pagesFallbackNote, type Component } from '../mock/telemetry';
  import ScaleLegend from '../scene/ScaleLegend.svelte';
  import { overlayOf } from './live';

  let {
    component,
    note = '',
    domain,
    compact = false,
    k = null,
    u = '',
    accent = false,
    sub = '',
    flat = false,
    reason = true,
    noData = false,
  }: {
    component: Component;
    /** Short qualifier after the truth badge, e.g. "per die · estimated from the module sensor". */
    note?: string;
    domain?: [number, number];
    compact?: boolean;
    /** The overlay's own value for this level, as the figure above the scale (null: no figure). */
    k?: string | null;
    u?: string;
    accent?: boolean;
    /** One line under the figure. */
    sub?: string;
    /** Scale and reason side by side — for a low band under a wide hero. */
    flat?: boolean;
    /** The one-line reason under the scale (off where the caption already says it). */
    reason?: boolean;
    /** Nothing on stage has a reading for this overlay: the scale says "not available". */
    noData?: boolean;
  } = $props();

  const mode = $derived(app.mode);
  const ov = $derived(overlayOf(mode, component));
  const fallback = $derived(component !== 'memory' && mode === 'pages');
  const why = $derived(ov ? TRUTH_NOTE[ov][component] : 'Real page data: what each page is for and whether it is live.');
  /**
   * The sentence under the scale. Flat and on "Pages", the page legend needs the whole band. In
   * a flat guide the sentence stands beside the scale, so it is this component's to place — also
   * for a part without pages; otherwise ScaleLegend states that part's reason itself.
   */
  const whyText = $derived(fallback ? (flat && reason ? pagesFallbackNote(component) : '') : reason && !(flat && !ov) ? why : '');
</script>

<div class="guide" class:accent class:flat>
  {#if k !== null || sub}
    <div class="head">
      {#if k !== null}<b class="fig">{k}<i>{u}</i></b>{/if}
      {#if sub}<span class="sub">{sub}</span>{/if}
    </div>
  {/if}
  <ScaleLegend {component} {note} {domain} compact={compact && !fallback} explain={fallback && !flat && reason} {noData} />
  {#if whyText}<p class="why">{whyText}</p>{/if}
</div>

<style>
  .guide {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  .fig {
    display: block;
    font: 300 28px/1.15 var(--font-ui);
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .fig i {
    font-style: normal;
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0;
    color: var(--ink3);
    margin-left: 4px;
  }
  .guide.accent .fig {
    color: var(--accent);
    text-shadow: 0 0 18px var(--accent-glow);
  }
  .sub {
    font-size: 11px;
    color: var(--ink3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .head {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .guide.flat {
    flex-direction: row;
    align-items: center;
    gap: 16px;
  }
  .guide.flat > .head {
    flex: 0 1 auto;
  }
  .guide.flat .sub {
    white-space: normal;
    line-height: 1.4;
  }
  /* the scale keeps its own width: it is the part that must stay legible */
  .guide.flat > :global(.scale) {
    flex: 0 0 290px;
  }
  .guide.flat > :global(.legend) {
    flex: 1;
  }
  .guide.flat .why {
    flex: 1;
    min-width: 0;
    margin: 0;
  }
  .why {
    font-size: 10.5px;
    line-height: 1.45;
    color: var(--ink3);
  }

</style>
