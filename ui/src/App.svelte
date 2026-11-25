<script lang="ts">
  import { app, setUx, toggleRunning, UX_ORDER } from './mock/store.svelte';
  import { refreshPaint } from './scene/paint.svelte';
  import PageTooltip from './scene/PageTooltip.svelte';
  import FloatingControls from './controls/FloatingControls.svelte';
  import InstrumentUx from './ux/instrument/InstrumentUx.svelte';
  import IonicUx from './ux/ionic/IonicUx.svelte';
  import TaskmgrUx from './ux/taskmgr/TaskmgrUx.svelte';

  // One component per UX paradigm. All three read the same store and reuse the same
  // scene primitives — they differ only in navigation, structure and visualisation.
  const uis = { instrument: InstrumentUx, ionic: IonicUx, taskmgr: TaskmgrUx };
  const Current = $derived(uis[app.ux]);

  // Theme first (so CSS variables are current), then recolour every grid.
  $effect(() => {
    document.documentElement.dataset.ux = app.ux;
    refreshPaint();
  });

  function onKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && (e.key === '1' || e.key === '2' || e.key === '3')) {
      e.preventDefault();
      setUx(UX_ORDER[+e.key - 1]);
      return;
    }
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.key === 'Escape') app.highlight = null;
    else if (e.key === ' ') {
      e.preventDefault();
      toggleRunning();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="app" data-ready={app.ready}>
  {#if app.ready}
    <Current />
  {:else}
    <div class="boot">building mock machine…</div>
  {/if}
  <FloatingControls />
  <PageTooltip />
</div>

<style>
  .app {
    height: 100%;
  }
  .boot {
    height: 100%;
    display: grid;
    place-items: center;
    color: var(--ink3);
    font: 400 13px var(--font-mono);
  }
</style>
