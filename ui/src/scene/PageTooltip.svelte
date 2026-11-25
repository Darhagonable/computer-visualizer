<script lang="ts">
  /** Details for whatever is under the pointer — a memory page, a CPU core, a VRAM chip… One instance lives in App.svelte. */
  import { app } from '../mock/store.svelte';

  const pos = $derived.by(() => {
    const h = app.hover;
    if (!h) return null;
    const c = h.card;
    const W = 330;
    const H = 30 + (c.sub || c.swatch ? 28 : 0) + c.rows.length * 19 + (c.note ? 36 : 0) + (c.hint ? 30 : 0);
    const pad = 16;
    let x = h.x + pad;
    let y = h.y + pad;
    if (x + W > innerWidth - 8) x = h.x - W - pad;
    if (y + H > innerHeight - 8) y = h.y - H - pad;
    return { x: Math.max(8, x), y: Math.max(8, y) };
  });
</script>

{#if app.hover && pos}
  {@const c = app.hover.card}
  <div class="tip" style="left:{pos.x}px; top:{pos.y}px" role="tooltip">
    <div class="title">{c.title}</div>
    {#if c.swatch || c.sub}
      <div class="row">
        {#if c.swatch}<i class="sw" style="background: {c.swatch}"></i>{/if}
        {#if c.sub}<b>{c.sub}</b>{/if}
      </div>
    {/if}
    {#if c.rows.length}
      <dl>
        {#each c.rows as row, i (i)}
          {#if row.k}
            <dt class:dim={row.dim}>{row.k}</dt>
            <dd class:mono={row.mono} class:dim={row.dim}>{row.v}</dd>
          {:else}
            <dd class="span dim">{row.v}</dd>
          {/if}
        {/each}
      </dl>
    {/if}
    {#if c.note}
      <div class="foot">{c.note}</div>
    {/if}
    {#if c.hint}
      <div class="foot">{c.hint}</div>
    {/if}
  </div>
{/if}

<style>
  .tip {
    position: fixed;
    z-index: 1000;
    width: 330px;
    padding: 10px 12px 9px;
    border-radius: 10px;
    background: var(--tip-bg);
    color: var(--ink);
    border: 1px solid var(--line2);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(14px);
    pointer-events: none;
    font: 400 12px var(--font-ui);
  }
  .title {
    font: 500 10.5px var(--font-mono);
    color: var(--ink3);
    margin-bottom: 6px;
    overflow-wrap: anywhere;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: -2px 0 6px;
  }
  .row b {
    font-size: 14px;
    font-weight: 650;
  }
  .sw {
    width: 14px;
    height: 14px;
    border-radius: 4px;
    box-shadow: inset 0 0 0 1px rgba(127, 127, 127, 0.5);
    flex: none;
  }
  dl {
    display: grid;
    grid-template-columns: 78px 1fr;
    gap: 2px 8px;
    margin: 0;
  }
  dt {
    color: var(--ink3);
    font: 500 10.5px var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding-top: 1px;
  }
  dd {
    margin: 0;
    color: var(--ink2);
    overflow-wrap: anywhere;
  }
  dd.mono {
    font-family: var(--font-mono);
    font-size: 11px;
  }
  dd.span {
    grid-column: 1 / -1;
    margin-top: -2px;
    font-size: 10.5px;
  }
  .dim {
    opacity: 0.72;
  }
  dd.dim {
    font-style: italic;
  }
  .foot {
    margin-top: 7px;
    padding-top: 6px;
    border-top: 1px solid var(--line);
    color: var(--ink3);
    font-size: 10.5px;
    line-height: 1.4;
  }
</style>
