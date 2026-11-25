<script lang="ts">
  /**
   * The reading guide for whatever the colours mean now. In "pages" mode it is the page
   * legend; in an overlay mode it is the ramp's scale — min, max, the throttle point, and
   * the honesty label for that overlay on that component (measured / estimated / modelled).
   */
  import { app } from '../mock/store.svelte';
  import { DOMAIN, MODE_META, THROTTLE, TRUTH, TRUTH_LABEL, type Component } from '../mock/telemetry';
  import { rampCss } from './paint.svelte';
  import Legend from './Legend.svelte';

  let {
    component = 'memory',
    compact = false,
    note = '',
    domain,
  }: { component?: Component; compact?: boolean; note?: string; domain?: [number, number] } = $props();

  const mode = $derived(app.mode);
  const ramp = $derived(mode === 'pages' ? 'activity' : mode);
  const dom = $derived(domain ?? DOMAIN[ramp][component]);
  const unit = $derived(MODE_META[mode].unit);
  const truth = $derived(mode === 'pages' ? null : TRUTH[mode][component]);
  /** Position of the throttle marker on the bar, in % (-1: none). */
  const mark = $derived(mode === 'temperature' ? ((THROTTLE[component] - dom[0]) / (dom[1] - dom[0])) * 100 : -1);
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
    <div class="bar" style="background: {rampCss(ramp)}">
      {#if mark >= 0 && mark <= 100}
        <i style="left: {mark}%" title="Throttling starts at {THROTTLE[component]} {unit}"></i>
      {/if}
    </div>
    <div class="labels">
      <span>{fmt(dom[0])} {unit}</span>
      {#if mark >= 0 && mark <= 100}<span class="limit">throttle {THROTTLE[component]} {unit}</span>{/if}
      <span>{fmt(dom[1])} {unit}</span>
    </div>
  </div>
{/if}

<style>
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
  .compact {
    min-width: 170px;
  }
  .compact .note {
    display: none;
  }
</style>
