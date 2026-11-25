<script lang="ts">
  /**
   * The reading guide for one component of a scene. It is the shared ScaleLegend — except
   * when the global mode is "pages" and the component is the processor or the GPU. Those have
   * no pages, so their primitives fall back to temperature, and so does this legend: same
   * scale, same truth label, plus a line saying why. (ScaleLegend itself shows the page
   * legend in that case and offers no override.)
   */
  import { app } from '../../mock/store.svelte';
  import { DOMAIN, MODE_META, THROTTLE, TRUTH, TRUTH_LABEL, modeApplies, type Component } from '../../mock/telemetry';
  import { rampCss } from '../../scene/paint.svelte';
  import ScaleLegend from '../../scene/ScaleLegend.svelte';

  let {
    component = 'memory',
    note = '',
    compact = false,
    domain,
  }: { component?: Component; note?: string; compact?: boolean; domain?: [number, number] } = $props();

  const applies = $derived(modeApplies(app.mode, component));

  // the fallback: temperature, read from the same tables the shared legend uses
  const ov = 'temperature';
  const truth = $derived(TRUTH[ov][component]);
  const dom = $derived(DOMAIN[ov][component]);
  const unit = MODE_META[ov].unit;
  const mark = $derived(((THROTTLE[component] - dom[0]) / (dom[1] - dom[0])) * 100);
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
</script>

{#if applies}
  <ScaleLegend {component} {note} {compact} {domain} />
{:else}
  <div class="scale" class:compact>
    <div class="meta">
      <b>{MODE_META[ov].label}</b>
      <span class="truth" data-truth={truth}>{TRUTH_LABEL[truth]}</span>
      {#if note && !compact}<span class="note">{note}</span>{/if}
    </div>
    <div class="bar" style="background: {rampCss(ov)}">
      {#if mark >= 0 && mark <= 100}
        <i style="left: {mark}%" title="Throttling starts at {THROTTLE[component]} {unit}"></i>
      {/if}
    </div>
    <div class="labels">
      <span>{fmt(dom[0])} {unit}</span>
      {#if mark >= 0 && mark <= 100}<span class="limit">throttle {THROTTLE[component]} {unit}</span>{/if}
      <span>{fmt(dom[1])} {unit}</span>
    </div>
    <div class="why">no pages on this component — it is coloured by temperature until you pick another view</div>
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
  .why {
    font-size: 10.5px;
    line-height: 1.4;
    color: var(--ink3);
  }
  .compact {
    min-width: 170px;
  }
  .compact .why {
    display: none;
  }
</style>
