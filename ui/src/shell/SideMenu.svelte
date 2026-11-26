<script lang="ts">
  /**
   * The side menu every UX shares: the six sections, each with a live figure, the truth of that
   * figure, and — where there is a history — a sparkline. Built once; a UX places it, and it
   * takes on the UX's theme (tokens only).
   *
   *   <SideMenu section={sectionOf(nav.level)} onselect={(s) => open(sectionLevel(s))} />
   *
   * What a row shows follows the global mode, because everything on screen does. The word beside
   * a figure is the truth of THAT figure (shell/sections.ts): a module's sensor reads "measured"
   * while its scene is labelled estimated — the sensor is real, the spread across its dies is
   * not. A drive without a temperature sensor reads "—", never a guess.
   *
   * Three forms, for three amounts of room (measured, six rows):
   *   list   256 × 310   icon · label · the word beside the figure, over a sparkline and the
   *                       caption                                             (a side menu)
   *   rail    64 × 448   icon over figure over word                          (a collapsed pane)
   *   stack   88 × 556   icon over label over figure over word               (a rail with names)
   * A narrower form may drop the label, the caption and the sparkline — all of it is in the
   * tooltip. It never drops the word. Too short for its rows, the menu scrolls.
   *
   * `children` is a place for whatever a UX keeps at the foot of its menu (a pause button).
   * Restyle it from the host with the custom properties — no :global needed.
   */
  import type { Snippet } from 'svelte';
  import { TRUTH_LABEL } from '../mock/telemetry';
  import Icon from '../scene/Icon.svelte';
  import Sparkline from '../scene/Sparkline.svelte';
  import TruthChip from '../levels/TruthChip.svelte';
  import type { Section } from '../levels/nav';
  import { SECTIONS, sectionLive } from './sections';

  let {
    section = null,
    onselect,
    variant = 'list',
    label = 'Sections',
    children,
  }: {
    /** The section on stage; its row is marked current. */
    section?: Section | null;
    onselect: (s: Section) => void;
    variant?: 'list' | 'stack' | 'rail';
    /** The landmark's name, for assistive technology. */
    label?: string;
    children?: Snippet;
  } = $props();

  /** Everything a row knows, for its tooltip — the only place a narrow form still says it all. */
  function tip(s: (typeof SECTIONS)[number], live: ReturnType<typeof sectionLive>): string {
    const figure = live.truth === null ? live.caption : `${live.value}${live.unit ? ' ' + live.unit : ''} · ${live.caption} · ${TRUTH_LABEL[live.truth]}`;
    return `${s.label} — ${s.sub} · ${figure}${live.why ? `\n${live.why}` : ''}${live.more ? ` ${live.more}` : ''}`;
  }
</script>

<nav class="sm {variant}" aria-label={label}>
  {#each SECTIONS as s (s.id)}
    {@const live = sectionLive(s.id)}
    <button
      class="row"
      class:on={section === s.id}
      onclick={() => onselect(s.id)}
      aria-current={section === s.id ? 'page' : undefined}
      title={tip(s, live)}
    >
      <span class="ic"><Icon name={s.icon} size={18} /></span>
      <span class="lbl">{s.label}</span>
      <span class="fig" class:na={live.truth === null}>
        <b>{live.value}</b>{#if live.unit}<i>{live.unit}</i>{/if}
      </span>
      <span class="under">
        {#if live.ring}
          <span class="spark"><Sparkline values={live.ring.values} max={live.ring.max} color={s.color} width={56} height={16} /></span>
        {/if}
        <span class="cap">{live.caption}</span>
      </span>
      <span class="chip"><TruthChip truth={live.truth} /></span>
    </button>
  {/each}
  {#if children}
    <div class="extra">{@render children()}</div>
  {/if}
</nav>

<style>
  .sm {
    /* the host may restyle any of these */
    /* wide enough for the widest label beside the word and the figure (Applications) */
    --sm-list-width: 256px;
    --sm-stack-width: 88px;
    --sm-rail-width: 64px;
    --sm-hover: color-mix(in srgb, var(--ink) 6%, transparent);
    --sm-active: color-mix(in srgb, var(--accent) 11%, transparent);

    display: flex;
    flex-direction: column;
    gap: 2px;
    min-height: 0;
    /* too short for its rows (see the heights in the header): they scroll, none is lost */
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
    color: var(--ink);
  }
  .sm.list {
    width: var(--sm-list-width);
  }
  .sm.stack {
    width: var(--sm-stack-width);
  }
  .sm.rail {
    width: var(--sm-rail-width);
  }

  .row {
    position: relative;
    display: grid;
    flex: none;
    align-items: center;
    column-gap: 10px;
    row-gap: 3px;
    padding: 7px 10px 7px 14px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--ink2);
    font: 500 12.5px var(--font-ui);
    text-align: left;
    cursor: pointer;
  }
  .row:hover {
    background: var(--sm-hover);
    color: var(--ink);
  }
  .row:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .row.on {
    background: var(--sm-active);
    color: var(--ink);
  }
  /* the accent bar at the left of the current row */
  .row::before {
    content: '';
    position: absolute;
    left: 2px;
    top: 9px;
    bottom: 9px;
    width: 3px;
    border-radius: 2px;
    background: transparent;
  }
  .row.on::before {
    background: var(--accent);
  }

  .ic {
    display: flex;
    color: var(--ink3);
  }
  .row.on .ic {
    color: var(--accent);
  }
  .lbl {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }
  .fig {
    display: flex;
    align-items: baseline;
    gap: 2px;
    white-space: nowrap;
    color: var(--ink);
    font: 300 15px/1 var(--font-ui);
    font-variant-numeric: tabular-nums;
  }
  .fig.na {
    color: var(--ink3);
  }
  .fig i {
    font: 500 9.5px var(--font-mono);
    font-style: normal;
    color: var(--ink3);
  }
  .under {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    /* as tall as a sparkline, so a row is the same height with or without one */
    min-height: 16px;
    font: 400 10.5px var(--font-ui);
    color: var(--ink3);
  }
  .spark {
    display: flex;
    flex: none;
  }
  .cap {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chip {
    display: flex;
    align-items: center;
  }
  .extra {
    margin-top: auto;
    padding-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  /* ---- the three forms: the same children, laid out in other grid areas ---- */
  /* the word sits beside the figure it qualifies; the caption gets the whole second line */
  .list .row {
    grid-template-areas:
      'ic lbl chip fig'
      'ic under under under';
    grid-template-columns: 22px minmax(0, 1fr) auto auto;
    grid-template-rows: auto auto;
  }
  .stack .row,
  .rail .row {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto;
    justify-items: center;
    row-gap: 4px;
    padding: 8px 4px;
    text-align: center;
  }
  .stack .row {
    grid-template-areas:
      'ic'
      'lbl'
      'fig'
      'chip';
  }
  .rail .row {
    grid-template-areas:
      'ic'
      'fig'
      'chip';
  }
  .ic {
    grid-area: ic;
  }
  .lbl {
    grid-area: lbl;
  }
  .fig {
    grid-area: fig;
  }
  .under {
    grid-area: under;
  }
  .chip {
    grid-area: chip;
  }
  .list .fig,
  .list .chip {
    justify-self: end;
  }
  .stack .fig,
  .rail .fig {
    justify-self: center;
    font-size: 14px;
  }
  .stack .lbl {
    max-width: 100%;
    font-size: 10.5px;
  }
  .rail .lbl,
  .stack .under,
  .rail .under {
    display: none;
  }
</style>
