<script lang="ts">
  /**
   * Part-view workbench, reachable with `?dev=levels`. Not a UX: one part view in a plain box,
   * so a level can be looked at on its own — under each UX's theme (`&ux=`), at each window size,
   * in each mode — and driven: click, wheel and Esc go through the real LevelNav.
   *
   *   ?dev=levels&level=drive&drive=1&mode=temperature&ux=ionic
   *
   * `&own=package,ccd` stands in for a UX's own view of those levels (a host passes its own as
   * `own` to PartView), to see how going down from one enters the shared views and coming up
   * returns to it.
   */
  import { untrack } from 'svelte';
  import type { Snippet } from 'svelte';
  import { app, getMachine } from '../mock/store.svelte';
  import { PART, levelFromUrl, type Kind, type Level } from '../levels/nav';
  import { LevelNav } from '../levels/nav.svelte';
  import PartView from '../levels/PartView.svelte';
  import ModeSwitch from '../scene/ModeSwitch.svelte';

  const m = getMachine();
  const nav = untrack(() => new LevelNav(levelFromUrl(m)));

  /** The levels this page stands in for as "the UX's own view" (`&own=<kind>,<kind>`). */
  const OWN_KINDS = (new URLSearchParams(location.search).get('own') ?? '').split(',').filter(Boolean) as Kind[];
  /** A snippet declared in the markup is only in scope there: it is handed in from the tag. */
  const ownFor = (view: Snippet): Partial<Record<Kind, Snippet>> => Object.fromEntries(OWN_KINDS.map((k) => [k, view]));

  // the keys a UX registers for it; here just the two that move
  $effect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (nav.handleKey(e)) e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  /** One representative of every level, for the jump row. */
  const JUMP: [Kind, Level][] = [
    ['machine', { kind: 'machine' }],
    ['memory', { kind: 'memory' }],
    ['stick', { kind: 'stick', dimm: 0 }],
    ['die', { kind: 'die', chip: 0 }],
    ['block', { kind: 'block', chip: 0, cell: 37 }],
    ['package', { kind: 'package' }],
    ['ccd', { kind: 'ccd', ccd: 1 }],
    ['core', { kind: 'core', core: 5 }],
    ['card', { kind: 'card' }],
    ['gdie', { kind: 'gdie' }],
    ['vram', { kind: 'vram' }],
    ['drives', { kind: 'drives' }],
    ['drive', { kind: 'drive', drive: 0 }],
    ['apps', { kind: 'apps' }],
  ];
</script>

<div class="dev">
  <header>
    <b>Part views</b>
    <ModeSwitch component={PART[nav.level.kind]} />
    <span class="where">{nav.key} · {nav.w}×{nav.h} · theme {app.ux}</span>
    <span class="jump">
      {#each JUMP as [kind, level] (kind)}
        <button class:on={nav.level.kind === kind} onclick={() => nav.go(level)}>{kind}</button>
      {/each}
    </span>
    <span class="keys">click a part · scroll on it zooms in · Esc goes up</span>
  </header>
  {#snippet standIn()}
      <!-- a host's own view of a level: whatever that UX draws. It can open parts itself. -->
      <div class="lv lv-scope standin" data-short="0">
        <div class="io-tile">
          <em>A UX's own view of this level</em>
          <b class="plain">{nav.key}</b>
          <span>passed to PartView as own.{nav.level.kind} — Esc goes up, this goes down</span>
        </div>
        <button class="io-tile part" onclick={() => nav.down()}>Go one level deeper</button>
      </div>
  {/snippet}

  <div class="box">
    <PartView {nav} own={ownFor(standIn)} />
  </div>
</div>

<style>
  .dev {
    position: fixed;
    inset: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    color: var(--ink);
    background: var(--bg);
  }
  header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 14px;
    padding: 8px 12px 6px 16px;
    /* the top-right stays clear for the floating dev controls */
    padding-right: calc(var(--chrome-safe, 220px) + 12px);
    font: 400 11px var(--font-mono);
    color: var(--ink3);
  }
  header b {
    font: 600 13px var(--font-mono);
    color: var(--ink2);
  }
  .jump {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
  }
  .jump button {
    font: 500 10.5px var(--font-mono);
    color: var(--ink2);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 1px 6px;
    cursor: pointer;
  }
  .jump button:hover {
    border-color: var(--line2);
  }
  .jump button.on {
    color: var(--accent);
    border-color: var(--accent);
  }
  .box {
    position: relative;
    min-height: 0;
    margin: 4px 12px 12px;
  }
  .standin {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }
</style>
