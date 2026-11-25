<script lang="ts">
  /** Tiny inline trend line for table rows and tiles. */
  interface Props {
    values: number[];
    max?: number;
    min?: number;
    color?: string;
    width?: number;
    height?: number;
  }
  let { values, max = 100, min = 0, color = 'var(--accent)', width = 84, height = 22 }: Props = $props();
  const pts = $derived.by(() => {
    const n = values.length;
    if (n < 2) return '';
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * width;
      const y = height - 2 - ((values[i] - min) / (max - min)) * (height - 4);
      out.push(`${x.toFixed(1)},${Math.max(1, Math.min(height - 1, y)).toFixed(1)}`);
    }
    return out.join(' ');
  });
</script>

<svg viewBox="0 0 {width} {height}" width={width} height={height} class="spark" aria-hidden="true">
  {#if pts}
    <polyline points={pts} fill="none" stroke={color} stroke-width="1.4" stroke-linejoin="round" />
  {/if}
</svg>

<style>
  .spark {
    display: block;
    overflow: visible;
    flex: none;
  }
</style>
