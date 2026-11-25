<script lang="ts">
  /** Live area graph (most recent sample at the right edge). Stretches to the data it has. */
  interface Props {
    values: number[];
    max?: number;
    min?: number;
    color?: string;
    unit?: string;
    label?: string;
    decimals?: number;
    grid?: number;
    /** Where the big number goes. `above` keeps it out of short plots, `none` when the caller shows it. */
    readout?: 'overlay' | 'above' | 'none';
  }
  let { values, max = 100, min = 0, color = 'var(--accent)', unit = '', label = '', decimals = 0, grid = 4, readout = 'overlay' }: Props = $props();

  const W = 600;
  const H = 160;
  const geo = $derived.by(() => {
    const n = values.length;
    if (n < 2) return { line: '', area: '', last: 0 };
    const pts: string[] = [];
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * W;
      const y = H - ((values[i] - min) / (max - min)) * H;
      pts.push(`${x.toFixed(1)},${Math.max(0, Math.min(H, y)).toFixed(1)}`);
    }
    const line = 'M' + pts.join(' L');
    return { line, area: `${line} L${W},${H} L0,${H} Z`, last: values[n - 1] };
  });
  const lines = Array.from({ length: grid + 1 }, (_, i) => (H / grid) * i);
</script>

<div class="graph" class:stacked={readout === 'above'}>
  {#if readout === 'above'}
    <div class="readout out">
      <b>{geo.last.toFixed(decimals)}</b><span>{unit}</span><em>{label}</em>
    </div>
  {/if}
  <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" aria-hidden="true">
    {#each lines as y (y)}
      <line x1="0" x2={W} y1={y} y2={y} class="gl" />
    {/each}
    <path d={geo.area} fill={color} class="area" />
    <path d={geo.line} fill="none" stroke={color} class="line" vector-effect="non-scaling-stroke" />
  </svg>
  {#if readout === 'overlay'}
    <div class="readout">
      <b>{geo.last.toFixed(decimals)}</b><span>{unit}</span><em>{label}</em>
    </div>
  {/if}
</div>

<style>
  .graph {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 60px;
  }
  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .graph.stacked {
    display: flex;
    flex-direction: column;
  }
  .graph.stacked svg {
    position: relative;
    inset: auto;
    flex: 1;
    min-height: 0;
  }
  .gl {
    stroke: var(--line);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  .area {
    opacity: 0.16;
  }
  .line {
    stroke-width: 1.8;
    stroke-linejoin: round;
  }
  .readout {
    position: absolute;
    left: 10px;
    top: 6px;
    display: flex;
    align-items: baseline;
    gap: 3px;
    pointer-events: none;
  }
  .readout.out {
    position: static;
    flex: none;
    padding: 0 0 4px;
  }
  .readout b {
    font: 300 30px / 1 var(--font-ui);
    letter-spacing: -0.02em;
  }
  .readout span {
    font: 500 13px var(--font-ui);
  }
  .readout em {
    margin-left: 8px;
    font: 400 11px var(--font-ui);
    font-style: normal;
    color: var(--ink3);
  }
</style>
