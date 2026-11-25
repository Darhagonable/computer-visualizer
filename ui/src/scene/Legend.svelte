<script lang="ts">
  /**
   * How to read the board. Two rows:
   *   page state  → click to hide/show (Shift-click: show only that state)
   *   used for    → click to highlight every page of that colour family
   * Swatches are pure CSS variables, so the legend restyles with each UX theme.
   */
  import { app, setHighlight } from '../mock/store.svelte';
  import { STATE_NAMES, USE_FAMILY_NAMES, useFamilyIndex } from '../mock/model';

  let { compact = false }: { compact?: boolean } = $props();

  const st = $derived(app.stats);
  const pct = (n: number) => {
    if (!st || !st.total) return '0';
    const f = n / st.total;
    return (f * 100).toFixed(f < 0.095 ? 1 : 0);
  };
  const FAM_VAR = ['--c-private', '--c-file', '--c-pagefile', '--c-kernel'];
  const famCount = (f: number) => {
    if (!st) return 0;
    let s = 0;
    for (let u = 0; u < 12; u++) if (useFamilyIndex(u) === f) s += st.byUse[u];
    return s;
  };
  function toggleState(s: number, solo: boolean) {
    app.visible = app.visible.map((v, i) => (solo ? i === s : i === s ? !v : v));
  }
  function toggleFamily(f: number) {
    const h = app.highlight;
    setHighlight(h?.kind === 'family' && h.family === f ? null : { kind: 'family', family: f });
  }
  function swatch(s: number): string {
    switch (s) {
      case 0:
        return 'background: var(--c-zeroed)';
      case 1:
        return 'background: var(--c-free)';
      case 2:
        return 'background: color-mix(in srgb, var(--c-private) 34%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c-private) 60%, transparent)';
      case 3:
        return 'background: var(--c-modified)';
      case 4:
        return 'background: linear-gradient(90deg, var(--c-private) 0 25%, var(--c-file) 25% 50%, var(--c-pagefile) 50% 75%, var(--c-kernel) 75% 100%)';
      default:
        return 'background: var(--c-bad)';
    }
  }
</script>

<div class="legend" class:compact>
  <span class="lg-h">page state</span>
  <div class="lg-row">
    {#each STATE_NAMES as name, s (name)}
      <button
        class="pill"
        class:off={!app.visible[s]}
        onclick={(e) => toggleState(s, e.shiftKey)}
        title="{name} — click to hide/show · Shift-click shows only this state"
      >
        <i class="sw" style={swatch(s)}></i>{name}{#if !compact && st}<b>{pct(st.byState[s] ?? 0)}%</b>{/if}
      </button>
    {/each}
  </div>
  <span class="lg-h">used for</span>
  <div class="lg-row">
    {#each USE_FAMILY_NAMES as name, f (name)}
      <button
        class="pill fam"
        class:on={app.highlight?.kind === 'family' && app.highlight.family === f}
        onclick={() => toggleFamily(f)}
        title="Highlight every page of this kind"
      >
        <i class="sw" style="background: var({FAM_VAR[f]})"></i>{name}{#if !compact && st}<b>{pct(famCount(f))}%</b>{/if}
      </button>
    {/each}
  </div>
</div>

<style>
  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
  }
  .lg-h {
    font: 600 9.5px var(--font-mono);
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink3);
    white-space: nowrap;
  }
  .lg-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 24px;
    padding: 0 9px 0 7px;
    border-radius: 12px;
    border: 1px solid var(--line2);
    background: var(--panel);
    color: var(--ink2);
    font: 500 11.5px var(--font-ui);
    cursor: pointer;
    transition: opacity 120ms ease, border-color 120ms ease, color 120ms ease;
  }
  .pill:hover {
    color: var(--ink);
    border-color: var(--ink3);
  }
  .pill b {
    font: 600 10.5px var(--font-mono);
    color: var(--ink3);
    margin-left: 2px;
  }
  .pill.off {
    opacity: 0.4;
  }
  .pill.fam.on {
    border-color: var(--accent);
    color: var(--ink);
  }
  .sw {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    box-shadow: inset 0 0 0 1px rgba(127, 127, 127, 0.45);
    flex: none;
  }
  .compact {
    gap: 4px 8px;
  }
  .compact .pill {
    height: 20px;
    font-size: 10.5px;
    padding: 0 8px 0 5px;
    gap: 5px;
  }
  .compact .sw {
    width: 10px;
    height: 10px;
  }
</style>
