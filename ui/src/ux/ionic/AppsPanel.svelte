<script lang="ts">
  /**
   * Summoned overlay — processes are not a page in this UX. Lists the top processes by
   * memory; picking one lights its pages up on the hero and dims everything else.
   */
  import { fly } from 'svelte/transition';
  import { app, getMachine, selectProcess } from '../../mock/store.svelte';
  import { fmtMiB } from '../../mock/model';
  import Icon from '../../scene/Icon.svelte';

  let { onclose }: { onclose: () => void } = $props();

  const m = getMachine();
  const name = (id: number) => m.processes.find((p) => p.id === id)?.name ?? '?';
  const rows = $derived.by(() => (app.stats ? [...app.stats.procs].sort((a, b) => b.blocks - a.blocks).slice(0, 9) : []));
  const max = $derived(rows[0]?.blocks || 1);
  /** The process whose pages are lit up (null when none). */
  const lit = $derived(app.highlight?.kind === 'owner' ? app.highlight.id : null);
</script>

<div class="apps" transition:fly={{ y: 18, duration: 240 }}>
  <header>
    <b>Apps</b>
    <span>top processes by memory</span>
    <button class="x" onclick={onclose} title="Close (Esc)" aria-label="Close"><Icon name="x" size={15} /></button>
  </header>
  <div class="io-list">
    {#each rows as r (r.id)}
      <button
        class="io-row"
        class:on={lit === r.id}
        class:dead={!r.alive}
        onclick={() => {
          selectProcess(lit === r.id ? null : r.id);
          onclose(); // step aside so the hero and its lit-up pages are in view
        }}
        title="Show this process's pages on the hero"
      >
        <span class="n">{name(r.id)}</span>
        <span class="track"><i style="transform: scaleX({(r.blocks / max).toFixed(3)})"></i></span>
        <b>{fmtMiB(r.blocks)}</b>
        <span class="cpu">{r.alive ? `${r.cpuPct.toFixed(1)}% cpu` : 'exited'}</span>
      </button>
    {/each}
  </div>
  <footer>pick a process to light up its pages · kernel components and files live in the search field</footer>
</div>

<style>
  .apps {
    position: absolute;
    z-index: 40;
    left: 16px;
    bottom: 140px;
    width: 440px;
    padding: 14px 14px 12px;
    border-radius: var(--radius);
    background: var(--tip-bg);
    border: 1px solid var(--line2);
    box-shadow: inset 0 1px 0 var(--glass-hi), var(--shadow);
    backdrop-filter: blur(22px) saturate(1.3);
    -webkit-backdrop-filter: blur(22px) saturate(1.3);
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 4px;
  }
  header b {
    font: 650 15px var(--font-ui);
  }
  header span {
    color: var(--ink3);
    font-size: 11.5px;
  }
  header .x {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    margin-left: auto;
    border-radius: 999px;
    border: 1px solid var(--line2);
    background: transparent;
    color: var(--ink3);
  }
  header .x:hover {
    color: var(--ink);
    border-color: var(--ink3);
  }
  .apps .io-list :global(.io-row) {
    grid-template-columns: minmax(0, 1.25fr) minmax(50px, 1fr) 66px 62px;
  }
  .apps .io-list :global(.io-row.dead) {
    opacity: 0.45;
  }
  .apps .io-list :global(.io-row .cpu) {
    font: 500 10.5px var(--font-mono);
    color: var(--ink3);
    text-align: right;
    white-space: nowrap;
  }
  footer {
    margin-top: 10px;
    padding-top: 9px;
    border-top: 1px solid var(--line);
    color: var(--ink3);
    font-size: 11px;
    line-height: 1.5;
  }
</style>
