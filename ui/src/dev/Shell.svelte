<script lang="ts">
  /**
   * Shell workbench, reachable with `?dev=shell`. Not a UX: the pieces every UX composes — the
   * side menu in its three forms and the mode row — on their own, under the current theme
   * (`&ux=`), so they can be looked at before they are placed anywhere.
   *
   *   ?dev=shell&mode=activity&ux=taskmgr
   */
  import { app, getMachine } from '../mock/store.svelte';
  import { PART, type Level } from '../levels/nav';
  import { LevelNav } from '../levels/nav.svelte';
  import { sectionLevel } from '../shell/sections';
  import SideMenu from '../shell/SideMenu.svelte';
  import ModeRow from '../shell/ModeRow.svelte';
  import { untrack } from 'svelte';
  import { sectionOf, type Section } from '../levels/nav';

  const nav = untrack(() => new LevelNav({ kind: 'machine' }));

  function pick(s: Section): void {
    nav.go(sectionLevel(s));
  }
  /** The section on stage — what a host marks current in its menu. */
  const section = $derived(sectionOf(nav.level));
  const m = getMachine();
</script>

<svelte:window onkeydown={(e) => nav.handleKey(e)} />

<div class="dev">
  <header>
    <b>Shell pieces</b>
    <span>theme {app.ux} · mode {app.mode} · section: {nav.key}</span>
  </header>
  <div class="row">
    <section>
      <h3>SideMenu · list</h3>
      <SideMenu {section} onselect={pick} variant="list" />
    </section>
    <section>
      <h3>SideMenu · stack</h3>
      <SideMenu {section} onselect={pick} variant="stack" />
    </section>
    <section>
      <h3>SideMenu · rail</h3>
      <SideMenu {section} onselect={pick} variant="rail" />
    </section>
    <section class="modes">
      <h3>ModeRow · processor</h3>
      <ModeRow component="cpu" note="per core" />
      <h3>ModeRow · memory</h3>
      <ModeRow component="memory" note="per die · estimated" />
      <h3>ModeRow · storage</h3>
      <ModeRow component="storage" note="per drive" />
      <h3>ModeRow · graphics, compact</h3>
      <ModeRow component="gpu" note="per unit" compact />
      <h3>ModeRow · an overview (page legend in Pages)</h3>
      <ModeRow component="memory" scale="pages" />
      <p class="note">
        {nav.key} · {PART[nav.level.kind]} · machine: {m.dimms.length} modules
      </p>
    </section>
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
    gap: 16px;
    align-items: center;
    padding: 8px 12px 6px 16px;
    padding-right: calc(var(--chrome-safe, 220px) + 12px);
    font: 400 11px var(--font-mono);
    color: var(--ink3);
  }
  header b {
    font: 600 13px var(--font-mono);
    color: var(--ink2);
  }
  .row {
    display: flex;
    align-items: flex-start;
    gap: 28px;
    padding: 10px 16px 16px;
    min-height: 0;
    overflow: auto;
  }
  section {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--panel);
    min-height: 0;
  }
  .modes {
    flex: 1 1 auto;
    min-width: 320px;
    max-width: 760px;
  }
  h3 {
    margin: 8px 0 2px;
    font: 600 11px var(--font-mono);
    color: var(--ink3);
  }
  .note {
    font: 400 11px var(--font-mono);
    color: var(--ink3);
  }
</style>
