<script lang="ts">
  /**
   * The reading guide for whatever the colours mean now. In "pages" mode it is the page
   * legend; in an overlay mode it is the ramp's scale — min, max, the throttle point, and
   * the honesty label for that overlay on that component (measured / estimated / modelled).
   *
   * A component without pages (a processor, a drive) stays on its temperature colours while
   * the mode is "pages", and so does this guide. With `explain` it then also says why, in the
   * sentence from telemetry.ts — once, here, for every view that shows such a scale.
   *
   * `noData`: the thing on stage has no reading for the overlay — a drive without a temperature
   * sensor. The word is then "not available", there is no throttle mark and the ramp gives way to
   * an empty track. A scale badged "measured" above a dash would say two things at once.
   */
  import { app } from '../mock/store.svelte';
  import { MODE_META, THROTTLE, TRUTH, TRUTH_LABEL, pagesFallbackNote, type Component } from '../mock/telemetry';
  import { rampCss, rangeFor } from './paint.svelte';
  import Legend from './Legend.svelte';

  let {
    component = 'memory',
    compact = false,
    note = '',
    domain,
    explain = false,
    noData = false,
  }: {
    component?: Component;
    compact?: boolean;
    note?: string;
    domain?: [number, number];
    explain?: boolean;
    /** Nothing on stage has a reading for this overlay: say "not available", show no mark. */
    noData?: boolean;
  } = $props();

  // On CPU and GPU the primitives fall back to temperature in "pages" mode — show that scale.
  const mode = $derived(app.mode === 'pages' && component !== 'memory' ? 'temperature' : app.mode);
  const onFallback = $derived(app.mode === 'pages' && component !== 'memory');
  const ramp = $derived(mode === 'pages' ? 'activity' : mode);
  const dom = $derived(domain ?? rangeFor(ramp, component));
  const unit = $derived(MODE_META[mode].unit);
  const truth = $derived(mode === 'pages' ? null : noData ? 'unavailable' : TRUTH[mode][component]);
  /** Position of the throttle marker on the bar, in % (-1: none — also when there is no reading). */
  const mark = $derived(mode === 'temperature' && !noData ? ((THROTTLE[component] - dom[0]) / (dom[1] - dom[0])) * 100 : -1);
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
</script>

{#if mode === 'pages'}
  <Legend {compact} />
{:else}
  <div class="scale" class:compact>
    <div class="meta">
      <b>{MODE_META[mode].label}</b>
      <span class="truth" data-truth={truth}>{truth ? TRUTH_LABEL[truth] : ''}</span>
      {#if note}<span class="note">{note}</span>{/if}
    </div>
    {#if noData}
      <div class="bar empty"></div>
    {:else}
      <div class="bar" style="background: {rampCss(ramp)}">
        {#if mark >= 0 && mark <= 100}
          <i style="left: {mark}%" title="Throttling starts at {THROTTLE[component]} {unit}"></i>
        {/if}
      </div>
    {/if}
    <div class="labels">
      <span>{fmt(dom[0])} {unit}</span>
      {#if mode === 'temperature'}<span class="limit" class:offscale={mark < 0 || mark > 100}>throttle {THROTTLE[component]} {unit}</span>{/if}
      <span>{fmt(dom[1])} {unit}</span>
    </div>
    {#if explain && onFallback}
      <p class="why">{pagesFallbackNote(component)}</p>
    {/if}
  </div>
{/if}

<style>
  .scale {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 230px;
    max-width: 460px;
  }
  .meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 7px;
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
    line-height: 1.3;
  }
  .bar {
    position: relative;
    height: 8px;
    border-radius: 4px;
    box-shadow: inset 0 0 0 1px rgba(127, 127, 127, 0.35);
  }
  /* no reading: the track is there, nothing is plotted on it */
  .bar.empty {
    background: color-mix(in srgb, var(--ink) 10%, transparent);
    box-shadow: none;
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
  .labels .limit.offscale {
    color: var(--ink3);
  }
  /* the reason a pages-less part is on this scale: 4 px of the column's gap + 4 px here */
  .why {
    margin: 4px 0 0;
    font-size: 10.5px;
    line-height: 1.45;
    color: var(--ink3);
  }
  .compact {
    min-width: 170px;
  }
  .compact .note {
    display: none;
  }
</style>
