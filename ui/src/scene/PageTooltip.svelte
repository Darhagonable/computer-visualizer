<script lang="ts">
  /** Page details for whatever is under the pointer. One instance lives in App.svelte. */
  import { app, stateName, useName } from '../mock/store.svelte';
  import { useFamilyIndex } from '../mock/model';

  const FAM_VAR = ['--c-private', '--c-file', '--c-pagefile', '--c-kernel'];
  const pos = $derived.by(() => {
    const h = app.hover;
    if (!h) return null;
    const W = 330;
    const H = 168;
    const pad = 16;
    let x = h.x + pad;
    let y = h.y + pad;
    if (x + W > innerWidth - 8) x = h.x - W - pad;
    if (y + H > innerHeight - 8) y = h.y - H - pad;
    return { x: Math.max(8, x), y: Math.max(8, y) };
  });
  function swatch(d: { state: number; use: number }): string {
    const fam = `var(${FAM_VAR[useFamilyIndex(d.use)]})`;
    switch (d.state) {
      case 0:
        return 'background: var(--c-zeroed)';
      case 1:
        return 'background: var(--c-free)';
      case 2:
        return `background: color-mix(in srgb, ${fam} 34%, transparent); box-shadow: inset 0 0 0 1px ${fam}`;
      case 3:
        return 'background: var(--c-modified)';
      case 5:
        return 'background: var(--c-bad)';
      default:
        return `background: ${fam}`;
    }
  }
</script>

{#if app.hover && pos}
  {@const d = app.hover.d}
  <div class="tip" style="left:{pos.x}px; top:{pos.y}px" role="tooltip">
    <div class="where">{d.where}</div>
    <div class="row">
      <i class="sw" style={swatch(d)}></i>
      <b>{stateName(d.state)}</b>
      {#if d.state === 2}<span class="prio">priority {d.priority}</span>{/if}
    </div>
    <dl>
      <dt>used for</dt>
      <dd>{useName(d.use)}</dd>
      <dt>owner</dt>
      <dd class="owner" class:kernel={d.owner.kind === 'kernel'}>
        {d.owner.kind === 'process' ? `${d.owner.name}` : d.owner.name}
        {#if d.owner.shared}<span class="tag">shared</span>{/if}
      </dd>
      <dt>frame</dt>
      <dd class="mono">{d.pfn} · {d.addr}</dd>
      <dt>covers</dt>
      <dd>{d.size}</dd>
    </dl>
    {#if d.note}
      <!-- callers that give a note say what a click does *there* (e.g. Ionic: open the die) -->
      <div class="note">{d.note}</div>
    {:else}
      <div class="hint">click to highlight everything owned by {d.owner.kind === 'file' ? 'this file' : d.owner.kind === 'process' ? 'this process' : 'this component'}</div>
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
  .where {
    font: 500 10.5px var(--font-mono);
    color: var(--ink3);
    margin-bottom: 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }
  .row b {
    font-size: 14px;
    font-weight: 650;
  }
  .prio {
    font: 500 10.5px var(--font-mono);
    color: var(--ink3);
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
    grid-template-columns: 68px 1fr;
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
  .owner.kernel {
    font-style: italic;
  }
  .mono {
    font-family: var(--font-mono);
    font-size: 11px;
  }
  .tag {
    display: inline-block;
    margin-left: 6px;
    padding: 0 5px;
    border-radius: 6px;
    font: 600 9.5px var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--accent);
    border: 1px solid var(--accent);
    opacity: 0.9;
  }
  .note {
    margin-top: 5px;
    color: var(--ink3);
    font-size: 11px;
  }
  .hint {
    margin-top: 7px;
    padding-top: 6px;
    border-top: 1px solid var(--line);
    color: var(--ink3);
    font-size: 10.5px;
  }
</style>
