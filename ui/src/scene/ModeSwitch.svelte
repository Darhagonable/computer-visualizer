<script lang="ts">
  /**
   * What the colours mean right now. Global: switching it recolours every grid and every
   * heat map in every scene. "Pages" only exists for system memory, so it is disabled
   * elsewhere — with the reason in the tooltip.
   */
  import { app, setMode } from '../mock/store.svelte';
  import { MODES, MODE_META, modeApplies, type Component } from '../mock/telemetry';

  let { component = 'memory', compact = false }: { component?: Component; compact?: boolean } = $props();
</script>

<div class="ms" class:compact role="radiogroup" aria-label="What the colours mean">
  {#each MODES as m (m)}
    {@const ok = modeApplies(m, component)}
    <button
      role="radio"
      aria-checked={app.mode === m}
      class:on={app.mode === m}
      class:off={!ok}
      disabled={!ok}
      onclick={() => setMode(m)}
      title={ok ? `${MODE_META[m].label} — ${MODE_META[m].hint}` : 'Pages are system-memory data — this component has none'}
    >
      <i class="dot {m}"></i>
      {#if !compact}<span>{MODE_META[m].label}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .ms {
    display: inline-flex;
    padding: 3px;
    gap: 2px;
    border-radius: 10px;
    border: 1px solid var(--line2);
    background: var(--panel);
    backdrop-filter: blur(14px);
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 26px;
    padding: 0 10px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--ink3);
    font: 500 12px var(--font-ui);
    transition: color 120ms ease, background 120ms ease;
  }
  button:hover:not(:disabled) {
    color: var(--ink2);
    background: var(--panel2);
  }
  button.on {
    color: var(--ink);
    background: var(--panel2);
    box-shadow: inset 0 0 0 1px var(--line2);
  }
  button.off {
    opacity: 0.38;
  }
  .dot {
    width: 16px;
    height: 10px;
    border-radius: 3px;
    box-shadow: inset 0 0 0 1px rgba(127, 127, 127, 0.4);
    flex: none;
  }
  .dot.pages {
    background: linear-gradient(90deg, var(--c-private) 0 25%, var(--c-file) 25% 50%, var(--c-pagefile) 50% 75%, var(--c-kernel) 75% 100%);
  }
  .dot.temperature {
    background: linear-gradient(90deg, var(--ramp-thermal));
  }
  .dot.activity {
    background: linear-gradient(90deg, var(--ramp-activity));
  }
  .dot.power {
    background: linear-gradient(90deg, var(--ramp-power));
  }
  .compact button {
    width: 30px;
    padding: 0;
    justify-content: center;
  }
</style>
