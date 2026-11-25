<script lang="ts">
  /**
   * Floating dev chrome, top-right: the UX switcher and the mock controls.
   * Every UX keeps its top bar clear of the top-right `--chrome-safe` pixels.
   */
  import { fly } from 'svelte/transition';
  import {
    app,
    setUx,
    toggleRunning,
    setSpeed,
    trigger,
    reset,
    getMachine,
    SCENARIO_LABEL,
    UX_ORDER,
    UX_META,
  } from '../mock/store.svelte';
  import type { Scenario } from '../mock/sim';
  import Icon from '../scene/Icon.svelte';

  let open = $state<'ux' | 'mock' | null>(null);
  const speeds = [0.5, 1, 2, 4];
  const SCENARIOS: { kind: Scenario; icon: string; hint: string }[] = [
    { kind: 'fileChurn', icon: 'layers', hint: 'an app reads a big file — standby → active' },
    { kind: 'allocBurst', icon: 'bolt', hint: 'a process commits memory — zeroed → modified → active' },
    { kind: 'closeApp', icon: 'x', hint: 'a process exits — its private pages are freed' },
    { kind: 'purgeStandby', icon: 'broom', hint: 'standby list emptied, then zeroed' },
  ];
  const pick = (name: 'ux' | 'mock') => (open = open === name ? null : name);
  const close = () => (open = null);
  const previewUrl = $derived(`${location.origin}${location.pathname}?ux=${app.ux}`);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && close()} />

<div class="fc">
  <div class="bar">
    <button class="btn" class:on={open === 'ux'} onclick={() => pick('ux')} title="Switch UX paradigm (Ctrl+1 / 2 / 3)">
      <span class="k">ux</span>
      <b>{UX_META[app.ux].name}</b>
      <i class="chev" class:up={open === 'ux'}><Icon name="chevronRight" size={13} /></i>
    </button>
    <button class="btn" class:on={open === 'mock'} onclick={() => pick('mock')} title="Mock controls">
      <Icon name={app.running ? 'pause' : 'play'} size={13} />
      <b>mock</b>
      <i class="chev" class:up={open === 'mock'}><Icon name="chevronRight" size={13} /></i>
    </button>
  </div>

  {#if open === 'ux'}
    <div class="pop" transition:fly={{ y: -6, duration: 140 }}>
      <h3>UX paradigms</h3>
      <p class="sub">Same mock data, same scenes — different ways to navigate, structure and group them.</p>
      {#each UX_ORDER as id (id)}
        <button
          class="ux-card"
          class:active={app.ux === id}
          onclick={() => {
            setUx(id);
            close();
          }}
        >
          <kbd>{UX_META[id].keys}</kbd>
          <b>{UX_META[id].name}</b>
          <span>{UX_META[id].tag}</span>
        </button>
      {/each}
    </div>
  {:else if open === 'mock'}
    <div class="pop wide" transition:fly={{ y: -6, duration: 140 }}>
      <h3>Mock controls</h3>
      <p class="sub">Synthetic machine — nothing here touches the real OS.</p>

      <div class="row">
        <button class="ib" onclick={toggleRunning} title="Pause / resume (Space)">
          <Icon name={app.running ? 'pause' : 'play'} size={14} />
        </button>
        <div class="seg">
          {#each speeds as s (s)}
            <button class:on={app.speed === s} onclick={() => setSpeed(s)}>{s}×</button>
          {/each}
        </div>
        <span class="meta">tick {app.tick} · seed {getMachine().seed}</span>
      </div>

      <div class="scen">
        {#each SCENARIOS as s (s.kind)}
          <button class="sc" onclick={() => trigger(s.kind)}>
            <Icon name={s.icon} size={15} />
            <span><b>{SCENARIO_LABEL[s.kind]}</b><small>{s.hint}</small></span>
          </button>
        {/each}
      </div>

      {#if app.log.length}
        <ul class="log">
          {#each app.log as l (l)}
            <li>{l}</li>
          {/each}
        </ul>
      {/if}

      <div class="row foot">
        {#if app.native}
          <span class="native" title="Reported by the native shell over IPC">native shell · {app.native}</span>
          <a href={previewUrl} target="_blank" rel="noreferrer">open in browser</a>
        {:else}
          <span class="native" title="Running in a browser tab — the native shell reports its platform here">browser preview</span>
        {/if}
        <button class="tb" onclick={() => reset()}>reset machine</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .fc {
    position: fixed;
    top: 10px;
    right: 12px;
    z-index: 900;
    font-family: var(--font-ui);
  }
  .bar {
    display: flex;
    gap: 6px;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 32px;
    padding: 0 8px 0 10px;
    border-radius: 9px;
    border: 1px solid var(--line2);
    background: var(--panel);
    color: var(--ink2);
    backdrop-filter: blur(14px);
    box-shadow: var(--shadow);
    transition: color 120ms ease, border-color 120ms ease;
  }
  .btn:hover,
  .btn.on {
    color: var(--ink);
    border-color: var(--ink3);
  }
  .btn .k {
    font: 600 9.5px var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--accent);
  }
  .btn b {
    font-weight: 600;
    font-size: 12.5px;
  }
  .chev {
    display: grid;
    color: var(--ink3);
    transition: transform 140ms ease;
  }
  .chev :global(svg) {
    transform: rotate(90deg);
  }
  .chev.up :global(svg) {
    transform: rotate(-90deg);
  }
  .pop {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    width: 330px;
    padding: 14px;
    border-radius: 14px;
    border: 1px solid var(--line2);
    background: var(--tip-bg);
    backdrop-filter: blur(18px);
    box-shadow: var(--shadow);
  }
  .pop.wide {
    width: 400px;
  }
  h3 {
    font: 650 13.5px var(--font-ui);
  }
  .sub {
    margin: 3px 0 10px;
    color: var(--ink3);
    font-size: 11.5px;
  }
  .ux-card {
    display: grid;
    width: 100%;
    grid-template-columns: 58px 1fr;
    align-items: center;
    gap: 1px 10px;
    text-align: left;
    padding: 9px 10px;
    margin-top: 6px;
    border-radius: 10px;
    border: 1px solid var(--line2);
    background: var(--panel);
    color: var(--ink);
    transition: border-color 120ms ease;
  }
  .ux-card:hover {
    border-color: var(--ink3);
  }
  .ux-card.active {
    border-color: var(--accent);
  }
  .ux-card kbd {
    grid-row: span 2;
    justify-self: start;
    align-self: center;
    padding: 3px 7px;
    border-radius: 6px;
    border: 1px solid var(--line2);
    background: var(--panel2);
    font: 600 10.5px var(--font-mono);
    color: var(--ink2);
  }
  .ux-card b {
    font-size: 13.5px;
    font-weight: 650;
  }
  .ux-card span {
    color: var(--ink3);
    font-size: 11.5px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .ib {
    display: grid;
    place-items: center;
    width: 30px;
    height: 28px;
    border-radius: 7px;
    border: 1px solid var(--line2);
    background: var(--panel);
    color: var(--ink);
  }
  .seg {
    display: inline-flex;
    border: 1px solid var(--line2);
    border-radius: 7px;
    overflow: hidden;
  }
  .seg button {
    padding: 0 9px;
    height: 26px;
    border: 0;
    background: var(--panel);
    color: var(--ink3);
    font: 500 11.5px var(--font-mono);
  }
  .seg button + button {
    border-left: 1px solid var(--line2);
  }
  .seg button.on {
    background: var(--accent);
    color: #fff;
  }
  .meta {
    margin-left: auto;
    font: 400 11px var(--font-mono);
    color: var(--ink3);
  }
  .scen {
    display: grid;
    gap: 5px;
    margin-top: 10px;
  }
  .sc {
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    padding: 7px 10px;
    border-radius: 9px;
    border: 1px solid var(--line2);
    background: var(--panel);
    color: var(--ink2);
    transition: border-color 120ms ease, color 120ms ease;
  }
  .sc:hover {
    border-color: var(--accent);
    color: var(--ink);
  }
  .sc b {
    display: block;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ink);
  }
  .sc small {
    font-size: 11px;
    color: var(--ink3);
  }
  .log {
    list-style: none;
    margin: 10px 0 0;
    padding: 8px 10px;
    max-height: 96px;
    overflow: hidden;
    border-radius: 9px;
    border: 1px solid var(--line);
    background: var(--panel2);
    font: 400 11px var(--font-mono);
    color: var(--ink2);
  }
  .log li + li {
    margin-top: 1px;
  }
  .foot {
    margin-top: 10px;
    justify-content: space-between;
  }
  .native {
    font: 500 11px var(--font-mono);
    color: var(--ink3);
  }
  .tb,
  .foot a {
    padding: 4px 9px;
    border-radius: 7px;
    border: 1px solid var(--line2);
    background: var(--panel);
    color: var(--ink2);
    font-size: 11.5px;
    text-decoration: none;
  }
  .tb:hover,
  .foot a:hover {
    color: var(--ink);
    border-color: var(--ink3);
  }
</style>
