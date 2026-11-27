<script lang="ts">
  /**
   * The machine's headline numbers, side by side in the dock while the board is on stage:
   * the hottest core, the warmest module, the GPU — each following the mode (in Temperature a
   * temperature, in Power the package / board watts, otherwise a load), its ring taking the
   * mode's ramp at its own fill.
   *
   * They stand under the Overview, whose tiles carry the same readings with their words. A
   * deeper level states its numbers on stage, in its tiles and its reading guide, and the
   * dock's middle there belongs to the part's siblings — so these are the machine's.
   */
  import { app, getMachine } from '../../mock/store.svelte';
  import type { Component } from '../../mock/telemetry';
  import { vitalOf, type Vital } from '../../levels/live';

  const m = getMachine();
  const RING = 2 * Math.PI * 17;

  // `app.cpu` and `app.tele` keep their identity from tick to tick: reading `app.version` is what keeps this live
  const list = $derived.by((): Vital[] => {
    void app.version;
    const of = (c: Component) => vitalOf(c, app.mode, app.cpu, app.tele, app.stats, m);
    return [of('cpu'), of('memory'), of('gpu')];
  });
</script>

<div class="vitals" class:paused={!app.running} role="group" aria-label="The machine's headline readings">
  {#each list as v (v.id)}
    <div class="v" title={v.title}>
      <svg viewBox="0 0 40 40" class="ring" aria-hidden="true">
        <circle cx="20" cy="20" r="17" class="tr" />
        <circle
          cx="20"
          cy="20"
          r="17"
          class="ar"
          style="stroke: {v.color}; stroke-dasharray:{RING.toFixed(2)}; stroke-dashoffset:{(RING * (1 - v.pct / 100)).toFixed(2)}"
        />
      </svg>
      <div class="txt">
        <b>{v.big}<i>{v.unit}</i></b>
        <span>{v.cap}</span>
      </div>
    </div>
  {/each}
</div>

<style>
  .vitals {
    display: flex;
    align-items: center;
    gap: 14px;
    height: 50px;
    padding: 0 18px 0 7px;
    border-radius: 999px;
    background: var(--panel);
    border: 1px solid var(--line);
    box-shadow: inset 0 1px 0 var(--glass-hi);
    backdrop-filter: blur(16px);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .v {
    display: flex;
    align-items: center;
    gap: 11px;
    min-width: 0;
  }
  .ring {
    width: 38px;
    height: 38px;
    flex: none;
    transform: rotate(-90deg);
  }
  .ring circle {
    fill: none;
    stroke-width: 3.4;
  }
  .ring .tr {
    stroke: var(--line2);
  }
  .ring .ar {
    stroke-linecap: round;
    filter: drop-shadow(0 0 4px var(--accent-glow));
    transition: stroke-dashoffset 620ms cubic-bezier(0.2, 0.75, 0.25, 1);
  }
  .txt b {
    display: block;
    font: 300 24px/1.05 var(--font-ui);
    letter-spacing: -0.02em;
  }
  .txt b i {
    font-style: normal;
    font-size: 13px;
    color: var(--ink3);
    margin-left: 1px;
  }
  .txt span {
    display: block;
    margin-top: -1px;
    font: 600 9.5px var(--font-mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    line-height: 1.3;
    color: var(--ink3);
  }
  .vitals.paused .txt b {
    color: var(--ink3);
  }
</style>
