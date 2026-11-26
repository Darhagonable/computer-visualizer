<script lang="ts">
  /**
   * The reading guide for a level's colours: the shared ScaleLegend — the page legend in
   * "Pages", otherwise the ramp with its throttle mark and its truth label — under the
   * overlay's own figure for this level, and with the one-line reason behind the label.
   * Wherever a level colours by an overlay, one of these is on stage.
   *
   * Workaround (shared ScaleLegend): CPU and GPU scenes fall back to *temperature* colours
   * while the global mode is "Pages" — they have no pages — but ScaleLegend draws the page
   * legend whenever the mode is "Pages". For exactly that case this component draws the
   * equivalent temperature scale itself: same markup, and the same truth word, read from
   * mock/telemetry.ts like the shared one does.
   */
  import { app } from '../mock/store.svelte';
  import { DOMAIN, MODE_META, THROTTLE, TRUTH, TRUTH_LABEL, TRUTH_NOTE, type Component } from '../mock/telemetry';
  import { rampCss } from '../scene/paint.svelte';
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
  } = $props();

  const mode = $derived(app.mode);
  const ov = $derived(overlayOf(mode, component));
  const fallback = $derived(component !== 'memory' && mode === 'pages');
  const dom = $derived(domain ?? DOMAIN.temperature[component]);
  const truth = $derived(TRUTH.temperature[component]);
  const mark = $derived(((THROTTLE[component] - dom[0]) / (dom[1] - dom[0])) * 100);
  /** Plain names for the sentence that explains why a component without pages is on a temperature scale. */
  const PART_NAME: Record<Component, string> = { memory: 'memory module', cpu: 'processor', gpu: 'graphics card', storage: 'drive' };
  const why = $derived(
    fallback
      ? `Pages are system-memory data — a ${PART_NAME[component]} has none, so it is coloured by temperature. ${TRUTH_NOTE.temperature[component]}`
      : ov
        ? TRUTH_NOTE[ov][component]
        : 'Real page data: what each page is for and whether it is live.',
  );
  /** Flat and on "Pages": the page legend needs the whole band. */
  const whyText = $derived(reason && !(flat && !ov) ? why : '');
</script>

<div class="guide" class:accent class:flat>
  {#if k !== null || sub}
    <div class="head">
      {#if k !== null}<b class="fig">{k}<i>{u}</i></b>{/if}
      {#if sub}<span class="sub">{sub}</span>{/if}
    </div>
  {/if}
  {#if fallback}
    <!-- the same scale ScaleLegend draws for Temperature, for a component that is not on "Pages" -->
    <div class="scale">
      <div class="meta">
        <b>{MODE_META.temperature.label}</b>
        <span class="truth" data-truth={truth}>{TRUTH_LABEL[truth]}</span>
        {#if note}<span class="note">{note}</span>{/if}
      </div>
      <div class="bar" style="background: {rampCss('temperature')}">
        {#if mark >= 0 && mark <= 100}
          <i style="left: {mark}%" title="Throttling starts at {THROTTLE[component]} °C"></i>
        {/if}
      </div>
      <div class="labels">
        <span>{dom[0]} °C</span>
        {#if mark >= 0 && mark <= 100}<span class="limit">throttle {THROTTLE[component]} °C</span>{/if}
        <span>{dom[1]} °C</span>
      </div>
    </div>
  {:else}
    <ScaleLegend {component} {note} {domain} {compact} />
  {/if}
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

  /* the fallback scale — ScaleLegend's own look, so the two read as one component */
  .scale {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 230px;
    max-width: 360px;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 7px;
    font: 500 11px var(--font-ui);
    color: var(--ink2);
  }
  .meta b {
    font-weight: 650;
    color: var(--ink);
  }
  .truth {
    padding: 0 6px;
    border-radius: 7px;
    border: 1px solid currentColor;
    font: 600 9px var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    line-height: 15px;
    white-space: nowrap;
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
  .note {
    color: var(--ink3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bar {
    position: relative;
    height: 8px;
    border-radius: 4px;
    box-shadow: inset 0 0 0 1px rgba(127, 127, 127, 0.35);
  }
  .bar i {
    position: absolute;
    top: -3px;
    width: 2px;
    height: 14px;
    background: var(--ink);
    border-radius: 1px;
  }
  .labels {
    display: flex;
    justify-content: space-between;
    font: 400 10.5px var(--font-mono);
    color: var(--ink3);
  }
  .labels .limit {
    color: var(--ink2);
  }
</style>
