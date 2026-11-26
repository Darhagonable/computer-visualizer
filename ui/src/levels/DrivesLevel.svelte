<script lang="ts">
  /**
   * Storage chain · level 1 — the drives. The three drives side by side as the hero, each the
   * shared Drive drawing and a door into itself: click it, or scroll the wheel over it, to open
   * it. A drive's colour is its reading under the overlay — an NVMe drive reports its
   * temperature, a drive without a sensor is drawn in the no-data colour and says so — and the
   * reading guide on the right states what the colour shows and how honest it is. The tiles
   * either side list the drives and total them.
   */
  import { app, hoverCard, hoverOut } from '../mock/store.svelte';
  import { TRUTH, TRUTH_LABEL, type DriveLive, type Overlay } from '../mock/telemetry';
  import { metricColor } from '../scene/paint.svelte';
  import Drive from '../scene/Drive.svelte';
  import Icon from '../scene/Icon.svelte';
  import { drivesLayout, heroCols, levelWheel, HERO_COL, type Level, type Target } from './nav';
  import Guide from './Guide.svelte';
  import { overlayOf, fmt } from './live';
  import {
    DRIVE_CANVAS,
    NO_DATA_WHY,
    capPair,
    describeKinds,
    driveCard,
    driveValue,
    mbs,
    pct,
    readingText,
    shortModel,
  } from './drives.live';

  interface Props {
    w: number;
    h: number;
    go: (l: Level) => void;
    down: (t?: Target) => void;
  }
  let { w, h, go, down }: Props = $props();

  /** Pages are memory data only: the drives stay on their temperature colours. */
  const ov = $derived<Overlay>(overlayOf(app.mode, 'storage') ?? 'temperature');
  const lay = $derived(drivesLayout(w, h));
  /** drivesLayout gives x0 rather than x: the columns hug the row of boxes. */
  const cols = $derived(heroCols({ x: lay.x0, w: lay.w }, w, h));

  /** Each drive's door is as tall as its box, with its name above and its reading below. */
  const NAME_H = 26;
  const CAP_H = 40;

  /**
   * What the level shows per drive. The mock mutates the readings in place every tick and
   * `app.tele` keeps its identity, so the tick is read here and a fresh list comes out of it.
   */
  const drives = $derived.by(() => {
    void app.version;
    const list = app.tele?.storage ?? [];
    return list.map((d) => {
      const value = driveValue(ov, d);
      return {
        i: d.index,
        model: d.model,
        bus: d.bus,
        name: shortModel(d.model),
        box: lay.at(d.index),
        canvas: DRIVE_CANVAS[d.kind],
        usedPct: pct(d.usedGiB, d.totalGiB),
        busy: d.busyPct,
        value,
        noData: value === null,
        reading: value === null ? null : readingText(ov, value),
        fill: metricColor(ov, 'storage', value),
      };
    });
  });

  const totals = $derived.by(() => {
    void app.version;
    const list: DriveLive[] = app.tele?.storage ?? [];
    const used = list.reduce((s, d) => s + d.usedGiB, 0);
    const total = list.reduce((s, d) => s + d.totalGiB, 0);
    return {
      n: list.length,
      kinds: list.map((d) => d.kind),
      used,
      total,
      pct: pct(used, total),
      power: list.reduce((s, d) => s + d.power, 0),
      busiest: list.reduce<DriveLive | null>((a, d) => (!a || d.busyPct > a.busyPct ? d : a), null),
      sensed: list.filter((d) => d.tempC !== null),
    };
  });

  /** The reading guide's figure: the drives' own value under the mode. */
  const guide = $derived.by(() => {
    const t = totals;
    if (ov === 'temperature') {
      const s = t.sensed[0];
      return s
        ? { k: fmt(s.tempC ?? 0, 1), u: '°C', sub: `${shortModel(s.model)} · ${t.sensed.length} of ${t.n} drives report a temperature` }
        : { k: '—', u: '', sub: 'no drive reports a temperature' };
    }
    if (ov === 'activity') {
      const b = t.busiest;
      return b ? { k: fmt(b.busyPct), u: '%', sub: `busiest: ${shortModel(b.model)} · ${mbs(b.readBps)} read` } : { k: '—', u: '', sub: '' };
    }
    return { k: `≈ ${fmt(t.power, 1)}`, u: 'W', sub: `${t.n} drives together · none exposes its power draw` };
  });

  const live = (i: number): DriveLive | null => app.tele?.storage[i] ?? null;
  const open = (i: number) => {
    hoverOut(); // the door is about to go: its card should not linger over the next level
    down({ drive: i });
  };
  /** The drive's card follows the pointer. */
  function enter(i: number, e: PointerEvent) {
    const d = live(i);
    if (d) hoverCard(driveCard(d, ov, 'click to open this drive'), e);
  }
  /** The wrapper is the keyboard door: focus a drive, press Enter. */
  function unitKey(e: KeyboardEvent, i: number) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation(); // Space is "pause" everywhere else
    open(i);
  }

  let root: HTMLDivElement;
  $effect(() => {
    const onWheel = levelWheel((dir, e) => {
      if (dir < 0) return go({ kind: 'machine' });
      // over a drive: that drive; elsewhere on the stage: the drive opened last
      const hit = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-drive]') : null;
      const i = hit ? Number(hit.dataset.drive) : NaN;
      down(Number.isInteger(i) ? { drive: i } : undefined);
    });
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  });
</script>

<div class="lv lv-scope" bind:this={root} data-short={h > 0 && h < 620 ? '1' : '0'}>
  <!-- the hero: three doors -->
  {#each drives as d (d.i)}
    {@const b = d.box}
    <div
      class="unit"
      role="button"
      tabindex="0"
      data-drive={d.i}
      style="left:{b.x}px; top:{b.y - NAME_H}px; width:{b.w}px; height:{b.h + NAME_H + CAP_H}px"
      aria-label="{d.name} · open this drive"
      onpointerenter={(e) => enter(d.i, e)}
      onpointermove={(e) => enter(d.i, e)}
      onpointerleave={hoverOut}
      onclick={() => open(d.i)}
      onkeydown={(e) => unitKey(e, d.i)}
    >
      <span class="name" title="{d.model} · {d.bus}">{d.name}</span>
      <svg viewBox="0 0 {d.canvas.w} {d.canvas.h}" style="height:{b.h}px" class="dsvg">
        <Drive drive={d.i} interactive={false} labels={false} />
      </svg>
      <span class="cap">
        {#if d.noData}
          <b class="reading nodata">—</b>
          <span class="why">{NO_DATA_WHY[ov]}</span>
        {:else}
          <b class="reading">{d.reading}</b>
          <span class="truth" data-truth={TRUTH[ov].storage}>{TRUTH_LABEL[TRUTH[ov].storage]}</span>
        {/if}
      </span>
    </div>
  {/each}

  <div class="col l" style="left:{cols.leftX}px; width:{HERO_COL}px">
    <div class="stack">
      <div class="io-tile">
        <em><Icon name="storage" size={13} />Storage</em>
        <b>{totals.n}<i>drives</i></b>
        <span>{describeKinds(totals.kinds)}</span>
        <span>mock · click a drive to open it</span>
      </div>
      <div class="io-tile">
        <em>Drives</em>
        <div class="io-list">
          {#each drives as d (d.i)}
            <button
              class="io-row"
              title="Open {d.name} · {d.bus}"
              onpointerenter={(e) => enter(d.i, e)}
              onpointermove={(e) => enter(d.i, e)}
              onpointerleave={hoverOut}
              onclick={() => open(d.i)}
            >
              <span class="n"><i class="sw" style="background:{d.fill}" class:nodata={d.noData}></i>{d.name}</span>
              <span class="track"><i style="transform: scaleX({(Math.min(100, d.usedPct) / 100).toFixed(3)})"></i></span>
              <b>{fmt(d.busy)} %</b>
            </button>
          {/each}
        </div>
        <span class="io-foot">capacity in use · {TRUTH_LABEL[TRUTH.activity.storage]}: busy time</span>
      </div>
    </div>
  </div>

  <div class="col r" style="left:{cols.rightX}px; top:{cols.rightTop}px; width:{cols.rightW}px">
    <Guide component="storage" note="per drive" k={guide.k} u={guide.u} accent sub={guide.sub} compact />
    <div class="io-tile">
      <em>All drives</em>
      <b>{fmt(totals.pct)}<i>%</i></b>
      <span>{totals.n} drives · {capPair(totals.used, totals.total)} in use</span>
      <div class="io-bar extra">
        <i style="flex-basis: {Math.min(100, totals.pct).toFixed(1)}%; background: var(--c-private)"></i>
      </div>
      {#if totals.busiest}
        <span class="extra">busiest: {shortModel(totals.busiest.model)} · ≈ {fmt(totals.power, 1)} W together, {TRUTH_LABEL[TRUTH.power.storage]}</span>
      {/if}
    </div>
    <div class="io-tile extra">
      <em>On these drives</em>
      <span>colour: the {ov} overlay ({TRUTH_LABEL[TRUTH[ov].storage]})</span>
      <span>no sensor: drawn in the no-data colour</span>
    </div>
  </div>
</div>

<style>
  .lv {
    position: absolute;
    inset: 0;
  }

  /* ---- the hero: one door per drive ---- */
  .unit {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    border-radius: 14px;
    outline: none;
    cursor: pointer;
  }
  .unit:focus-visible {
    box-shadow: 0 0 0 2px var(--accent), 0 0 22px var(--accent-glow);
  }
  .name {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    height: 26px;
    padding-bottom: 5px;
    font: 600 12.5px var(--font-ui);
    color: var(--ink2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: color 140ms ease;
  }
  .unit:hover .name,
  .unit:focus-visible .name {
    color: var(--ink);
  }
  .dsvg {
    display: block;
    width: 100%;
    flex: none;
  }
  /* the drive's reading under the mode, and its truth word */
  .cap {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: center;
    gap: 0 7px;
    height: 40px;
    padding-top: 6px;
  }
  .reading {
    font: 600 14px var(--font-ui);
    color: var(--ink);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .reading.nodata {
    color: var(--ink3);
  }
  .why {
    font-size: 11px;
    color: var(--ink3);
    white-space: nowrap;
  }
  .truth {
    font: 600 9px var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    line-height: 15px;
    white-space: nowrap;
  }
  .truth[data-truth='measured'] {
    color: var(--good);
  }
  .truth[data-truth='estimated'] {
    color: var(--warn);
  }
  .truth[data-truth='modelled'] {
    color: var(--accent);
  }
  .truth[data-truth='unavailable'] {
    color: var(--ink3);
  }
  /* the doors light up in this UX's accent */
  .unit:hover :global(.drive .pcb),
  .unit:hover :global(.drive .case),
  .unit:focus-visible :global(.drive .pcb),
  .unit:focus-visible :global(.drive .case) {
    stroke: var(--accent);
    filter: drop-shadow(0 0 5px var(--accent-glow));
  }

  /* ---- the tile columns ---- */
  .col {
    position: absolute;
    bottom: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    /* a stage too short for a column scrolls it instead of losing its tail under the chrome */
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
  }
  .col.l {
    top: 16px;
  }
  /* centred beside the hero where there is room; from the top, scrollable, where there is not */
  .stack {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-block: auto;
  }
  .col > :global(.guide) {
    padding: 0 2px;
  }
  /* each row's drive, in the colour the drive is drawn in */
  .sw {
    display: inline-block;
    width: 9px;
    height: 9px;
    margin-right: 7px;
    border-radius: 2.5px;
    vertical-align: -1px;
    box-shadow: inset 0 0 0 1px var(--line2);
  }
  .sw.nodata {
    opacity: 0.9;
  }

  /* ---- short stages: the names and readings step closer to the (small) drives ---- */
  .lv[data-short='1'] .name {
    font-size: 11.5px;
  }
  .lv[data-short='1'] .reading {
    font-size: 13px;
  }
</style>
