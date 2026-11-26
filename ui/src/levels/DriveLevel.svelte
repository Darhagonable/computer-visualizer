<script lang="ts">
  /**
   * Storage chain · level 2 — one drive. The drive is the hero, larger, with its partitions as a
   * capacity bar along its top edge: one segment per partition, as wide as the partition is.
   * A KPI band above it carries the drive's numbers — capacity, activity, temperature, power,
   * health — each with its truth word where it has one; the partitions are listed on the left;
   * the reading guide is on the right. Clicking a partition, on the drive or in the list,
   * selects it and shows its details: a partition is the end of this chain.
   *
   * What is honest (the words are mock/telemetry.ts's):
   *   temperature   the NVMe drive's sensor: measured. The SATA drives have none: "—", "no
   *                 sensor", and the no-data colour — never a guess.
   *   activity      busy time and read / write rate: measured. The split between the drive's
   *                 partitions: modelled.
   *   power         estimated — no drive exposes its draw.
   *   capacity      how full each partition is: a reading.
   */
  import { untrack } from 'svelte';
  import { app, hoverCard, hoverOut } from '../mock/store.svelte';
  import { MODE_META, TRUTH, TRUTH_LABEL, TRUTH_NOTE, type Overlay } from '../mock/telemetry';
  import Drive from '../scene/Drive.svelte';
  import Icon from '../scene/Icon.svelte';
  import { DRIVE_VIEW, HERO_COL, MINI, driveLayout, heroCols, levelWheel, type Level } from './nav';
  import Guide from './Guide.svelte';
  import { overlayOf, fmt } from './live';
  import {
    DRIVE_CALLOUT,
    DRIVE_CANVAS,
    NO_DATA_WHY,
    SHARE_TRUTH,
    cap,
    capPair,
    capShort,
    hours,
    mbs,
    partitionCard,
    pct,
    pctText,
    shortModel,
  } from './drives.live';

  interface Props {
    drive: number;
    w: number;
    h: number;
    go: (l: Level) => void;
  }
  let { drive, w, h, go }: Props = $props();
  // the component is re-created for every location on the chain, so identity is read once
  const index = untrack(() => drive);

  const isShort = $derived(h > 0 && h < 620);
  /** Pages are memory data only: the drive stays on its temperature colours. */
  const ov = $derived<Overlay>(overlayOf(app.mode, 'storage') ?? 'temperature');
  /** The selected partition: framed on the drive, lit in the list, detailed under the drive. */
  let sel = $state<number | null>(null);

  /**
   * Everything the level shows of this drive. The mock mutates the readings in place every
   * tick and `app.tele` keeps its identity, so the tick is read here and a fresh object comes
   * out of it. (The drive's own colour is the scene's: the Drive reads the tick itself.) Null
   * for a drive this mock does not have.
   */
  const view = $derived.by(() => {
    void app.version;
    const d = app.tele?.storage[index] ?? null;
    if (!d) return null;
    return {
      kind: d.kind,
      model: d.model,
      name: shortModel(d.model),
      bus: d.bus,
      used: d.usedGiB,
      total: d.totalGiB,
      usedPct: pct(d.usedGiB, d.totalGiB),
      busy: d.busyPct,
      read: d.readBps,
      write: d.writeBps,
      temp: d.tempC,
      power: d.power,
      wear: d.wearPct,
      hours: d.powerOnHours,
      parts: d.partitions.map((p, i) => ({
        i,
        letter: p.letter,
        label: p.label,
        fs: p.fs,
        used: p.usedGiB,
        total: p.totalGiB,
        full: pct(p.usedGiB, p.totalGiB),
        ofDrive: pct(p.totalGiB, d.totalGiB),
        share: p.share,
        over: p.usedGiB > p.totalGiB,
      })),
    };
  });

  /**
   * The reading guide's figure: this drive's own value under the mode. `noData` is true when this
   * drive has no reading for the overlay — then the guide's word is "not available", not the
   * overlay's word for drives that have one.
   */
  const guide = $derived.by(() => {
    const v = view;
    if (!v) return { k: '—', u: '', sub: '', note: 'per drive', noData: true };
    if (ov === 'temperature') {
      return v.temp !== null
        ? { k: fmt(v.temp, 1), u: '°C', sub: "this drive's own sensor", note: 'per drive', noData: false }
        : { k: '—', u: '', sub: 'no sensor on this drive — the no-data colour, never a guess', note: 'per drive · where it has a sensor', noData: true };
    }
    if (ov === 'activity') return { k: fmt(v.busy), u: '%', sub: `busy time · ${mbs(v.read)} read · ${mbs(v.write)} write`, note: 'per drive', noData: false };
    return { k: `≈ ${fmt(v.power, 1)}`, u: 'W', sub: `${TRUTH_LABEL[TRUTH.power.storage]} from activity · no drive exposes its draw`, note: 'per drive', noData: false };
  });

  // ---- layout ------------------------------------------------------------------------------

  const lay = $derived(driveLayout(w, h));
  const cols = $derived(heroCols(lay, w, h));
  /** The KPI band runs from the left column to the mini-map, above the column and the hero. */
  const band = $derived.by(() => {
    const W = w || 1200;
    const right = Math.min(W - 24, W - 12 - MINI.w - 12);
    return { x: cols.leftX, w: Math.max(0, right - cols.leftX) };
  });
  /** Where the drawing sits in the hero's viewBox: centred, with room above for the partition tags. */
  const heroAt = $derived.by(() => {
    const c = DRIVE_CANVAS[view?.kind ?? 'nvme'];
    const k = Math.min((DRIVE_VIEW.w - 80) / c.w, (DRIVE_VIEW.h - 4) / (c.h + DRIVE_CALLOUT));
    return { k, x: (DRIVE_VIEW.w - c.w * k) / 2, y: (DRIVE_VIEW.h - (c.h + DRIVE_CALLOUT) * k) / 2 + DRIVE_CALLOUT * k };
  });

  /** One canvas unit of the drawing, in px: below ~1.4 the names on the bar would be too small to read. */
  const textScale = $derived(Math.max(1, Math.min(2, 11.5 / (8 * heroAt.k * lay.s))));

  const picked = $derived(sel !== null ? (view?.parts.find((p) => p.i === sel) ?? null) : null);

  // ---- interactions --------------------------------------------------------------------------

  /** Select a partition — or select none, when it is the one already selected. A leaf: nothing lies below it. */
  function pick(i: number) {
    hoverOut(); // the card should not linger over what the selection changes
    sel = sel === i ? null : i;
  }
  function enterPart(i: number, e: PointerEvent) {
    const d = app.tele?.storage[index];
    if (d) hoverCard(partitionCard(d, i, 'click to select this partition'), e);
  }

  let root: HTMLDivElement;
  $effect(() => {
    // the end of the chain: the wheel only goes up
    const onWheel = levelWheel((dir) => {
      if (dir < 0) go({ kind: 'drives' });
    });
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  });
</script>

<div class="lv lv-scope" bind:this={root} data-short={isShort ? '1' : '0'}>
  {#if view}
    {@const v = view}
    <!-- the KPI band, and under it the left column: one flow, so the column always starts below the band -->
    <div class="west" style="left:{band.x}px; width:{band.w}px">
      <div class="kpi">
        <div class="io-tile" title="{capPair(v.used, v.total)} in use · {v.parts.length} {v.parts.length === 1 ? 'partition' : 'partitions'}">
          <em>Capacity</em>
          <b>{fmt(v.usedPct)}<i>%</i></b>
          <span>{isShort ? capShort(v.used, v.total) : `${capPair(v.used, v.total)} in use`}</span>
          <div class="io-bar extra"><i style="flex-basis: {Math.min(100, v.usedPct).toFixed(1)}%; background: var(--c-private)"></i></div>
        </div>
        <div
          class="io-tile"
          class:accent={ov === 'activity'}
          title="{TRUTH_LABEL[TRUTH.activity.storage]} · {mbs(v.read)} read · {mbs(v.write)} write"
        >
          <em>Activity</em>
          <b>{fmt(v.busy)}<i>%</i></b>
          <span>{isShort
            ? `${TRUTH_LABEL[TRUTH.activity.storage]} · ${fmt(v.read / 1e6)}/${fmt(v.write / 1e6)} MB/s`
            : `${TRUTH_LABEL[TRUTH.activity.storage]} · ${mbs(v.read)} read · ${mbs(v.write)} write`}</span>
        </div>
        <div
          class="io-tile"
          class:accent={ov === 'temperature' && v.temp !== null}
          title={v.temp !== null ? "this drive's own sensor" : NO_DATA_WHY.temperature}
        >
          <em>Temperature</em>
          {#if v.temp !== null}
            <b>{fmt(v.temp, 1)}<i>°C</i></b>
            <span>{isShort ? TRUTH_LABEL[TRUTH.temperature.storage] : `${TRUTH_LABEL[TRUTH.temperature.storage]} · this drive's own sensor`}</span>
          {:else}
            <b class="nodata">—</b>
            <span>{isShort ? NO_DATA_WHY.temperature : 'no sensor on this drive'}</span>
          {/if}
        </div>
        <div
          class="io-tile"
          class:accent={ov === 'power'}
          title={TRUTH_NOTE.power.storage}
        >
          <em>Power</em>
          <b>≈ {fmt(v.power, 1)}<i>W</i></b>
          <span>{isShort ? TRUTH_LABEL[TRUTH.power.storage] : `${TRUTH_LABEL[TRUTH.power.storage]} · no drive exposes its draw`}</span>
        </div>
        <div class="io-tile" title="wear and power-on hours, as the drive reports them">
          <em>Health</em>
          {#if v.wear !== null}
            <b>{fmt(v.wear)}<i>% worn</i></b>
            <span>{isShort ? `${hours(v.hours)} on` : `the drive's own estimate · ${hours(v.hours)} powered on`}</span>
          {:else}
            <b class="nodata">—</b>
            <span>{isShort ? `wear — · ${hours(v.hours)}` : `wear not reported · ${hours(v.hours)} powered on`}</span>
          {/if}
        </div>
      </div>

      <div class="col l" style="width:{HERO_COL}px">
        <div class="stack">
          <div class="io-tile extra">
            <em><Icon name="storage" size={13} />Drive {index + 1}</em>
            <b class="io-name">{v.model}</b>
            <span>{v.bus} · {v.parts.length} {v.parts.length === 1 ? 'partition' : 'partitions'}</span>
          </div>
          <div class="io-tile">
            <em>Partitions</em>
            <div class="plist">
              {#each v.parts as p (p.i)}
                <button
                  class="prow"
                  class:on={sel === p.i}
                  aria-pressed={sel === p.i}
                  title="{p.letter ? `${p.letter} ` : ''}{p.label} · {p.fs} · {capPair(p.used, p.total)} in use ({fmt(p.full)} % full) · share of this drive's activity ≈ {fmt(p.share * 100)} % · {TRUTH_LABEL[SHARE_TRUTH]}"
                  onpointerenter={(e) => enterPart(p.i, e)}
                  onpointermove={(e) => enterPart(p.i, e)}
                  onpointerleave={hoverOut}
                  onclick={() => pick(p.i)}
                >
                  <span class="l1">
                    <b>{p.letter ? `${p.letter} ` : ''}{p.label}</b>
                    <i>{p.fs}</i>
                    <span class="pct">{fmt(p.full)}<i>%</i></span>
                  </span>
                  <span class="track"><i style="transform: scaleX({(Math.min(100, p.full) / 100).toFixed(3)})"></i></span>
                  <span class="l3">
                    <span>{capPair(p.used, p.total)}{isShort ? '' : ' in use'}{p.over ? ' — more than it holds' : ''}</span>
                    <span>activity ≈ {fmt(p.share * 100)} % <i class="truth" data-truth={SHARE_TRUTH}>{TRUTH_LABEL[SHARE_TRUTH]}</i></span>
                  </span>
                </button>
              {/each}
            </div>
            <span class="io-foot extra">{TRUTH_NOTE.activity.storage}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- the hero: the drive, its partitions along its top edge -->
    <div class="hero" style="left:{lay.x}px; top:{lay.y}px; width:{lay.w}px; height:{lay.h}px">
      <svg
        viewBox="0 0 {DRIVE_VIEW.w} {DRIVE_VIEW.h}"
        class="hero-svg"
        role="application"
        aria-label="{v.name}, {v.bus} — its partitions as a capacity bar along its top edge; click one to select it"
      >
        <g transform="translate({heroAt.x},{heroAt.y}) scale({heroAt.k})">
          <Drive drive={index} labels partitions selected={sel} labelScale={textScale} onpartition={(_, pi) => pick(pi)} />
        </g>
      </svg>
    </div>

    <!-- under the drive: what is selected, or how to select it -->
    <div class="under" style="left:{lay.x}px; top:{lay.y + lay.h + 14}px; width:{lay.w}px">
      {#if picked}
        {@const p = picked}
        <div class="io-tile detail">
          <em>
            {#if !isShort}Partition{/if}
            <i class="pname">{p.letter ? `${p.letter} ` : ''}{p.label} · {p.fs}</i>
            <button class="x" onclick={() => pick(p.i)} title="Clear the selection">clear</button>
          </em>
          <div class="facts">
            <span>
              <b>{capPair(p.used, p.total)}</b> in use · {fmt(p.full)} % full
              <span class="extra">· {p.over ? 'more than it holds' : `${cap(p.total - p.used)} free`} · {pctText(p.ofDrive)} % of this drive</span>
            </span>
            <span class="share">share of this drive's activity <b>≈ {fmt(p.share * 100)} %</b> <i class="truth" data-truth={SHARE_TRUTH}>{TRUTH_LABEL[SHARE_TRUTH]}</i></span>
          </div>
        </div>
      {:else}
        <p class="cap-line" title="{v.model} · {v.bus}">
          {v.model} · {v.bus} · {v.parts.length}
          {v.parts.length === 1 ? 'partition' : 'partitions'} · click one — on the drive or in the list — to see its details. A partition is the end of this chain. Mock.
        </p>
      {/if}
    </div>

    <div class="col r" style="left:{cols.rightX}px; top:{cols.rightTop}px; width:{cols.rightW}px">
      <Guide component="storage" note={guide.note} k={guide.k} u={guide.u} accent sub={guide.sub} compact noData={guide.noData} />
      <div class="io-tile">
        <em>On this drive</em>
        {#if guide.noData}
          <span>colour: no data — no sensor on this drive</span>
        {:else}
          <span>colour: the {MODE_META[ov].label.toLowerCase()} overlay ({TRUTH_LABEL[TRUTH[ov].storage]})</span>
        {/if}
        <span>partitions: capacity is a reading</span>
        <span>activity split: <i class="truth" data-truth={SHARE_TRUTH}>{TRUTH_LABEL[SHARE_TRUTH]}</i></span>
      </div>
    </div>
  {:else}
    <div class="io-tile none">
      <em><Icon name="storage" size={13} />Drive</em>
      <b>—</b>
      <span>this mock has no drive {index}</span>
    </div>
  {/if}
</div>

<style>
  .lv {
    position: absolute;
    inset: 0;
  }
  .truth {
    font: 600 9px var(--font-mono);
    font-style: normal;
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
  .nodata {
    color: var(--ink3);
  }

  /* ---- the KPI band and, under it, the left column ---- */
  .west {
    position: absolute;
    top: 16px;
    bottom: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    /* the band is as wide as the hero's room; only its own tiles take the pointer */
    pointer-events: none;
  }
  .kpi {
    flex: none;
    display: flex;
    gap: 12px;
    pointer-events: auto;
  }
  .kpi .io-tile {
    flex: 1 1 0;
    min-width: 0;
  }
  .kpi .io-tile > span {
    line-height: 1.35;
    white-space: normal;
  }
  .col.l {
    flex: 0 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    pointer-events: auto;
    /* a stage too short for the column scrolls it instead of losing its tail under the chrome */
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
  }
  /* centred in the room under the band where there is some; from the top, scrollable, where there is not */
  .stack {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-block: auto;
  }

  /* ---- the partitions: a row each, and a door ---- */
  /* the table's reason runs to two sentences: it wraps rather than runs past the tile */
  .col.l :global(.io-foot) {
    white-space: normal;
    line-height: 1.45;
  }
  .plist {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 6px;
  }
  .prow {
    display: flex;
    flex-direction: column;
    gap: 5px;
    width: 100%;
    padding: 6px 9px 7px;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: transparent;
    color: var(--ink2);
    text-align: left;
    transition: border-color 140ms ease, background 140ms ease, box-shadow 140ms ease;
  }
  .prow:hover {
    border-color: var(--line2);
    background: var(--panel2);
    color: var(--ink);
  }
  .prow:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .prow.on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    box-shadow: inset 3px 0 0 var(--accent);
  }
  .l1 {
    display: flex;
    align-items: baseline;
    gap: 7px;
    min-width: 0;
    font-size: 12px;
  }
  .l1 b {
    min-width: 0;
    font-weight: 600;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .l1 i {
    font: 500 10px var(--font-mono);
    font-style: normal;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--ink3);
  }
  .l1 .pct {
    margin-left: auto;
    font: 500 11px var(--font-mono);
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .prow .track {
    display: block;
    height: 5px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--ink) 9%, transparent);
    overflow: hidden;
  }
  .prow .track i {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: var(--c-private);
    transform-origin: 0 50%;
  }
  .l3 {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 12px;
    font-size: 11px;
    color: var(--ink3);
    line-height: 1.4;
  }
  .l3 .truth {
    margin-left: 2px;
  }

  /* ---- the hero ---- */
  .hero {
    position: absolute;
  }
  /* ambient light under the drive — a static blur, nothing animates here */
  .hero::before {
    content: '';
    position: absolute;
    inset: 12%;
    border-radius: 44px;
    background: radial-gradient(closest-side, color-mix(in srgb, var(--accent) 16%, transparent), transparent);
    filter: blur(46px);
  }
  .hero-svg {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
  }

  /* ---- under the drive ---- */
  .under {
    position: absolute;
  }
  .cap-line {
    padding: 0 8px;
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--ink3);
    text-align: center;
  }
  .detail {
    padding: 9px 16px 10px;
  }
  .detail em .pname {
    min-width: 0;
    color: var(--ink2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .detail em .x {
    flex: none;
    height: 20px;
    margin-left: auto;
    padding: 0 9px;
    border: 1px solid var(--line2);
    border-radius: 999px;
    background: var(--panel2);
    color: var(--ink2);
    font: 600 10px var(--font-ui);
    text-transform: none;
    letter-spacing: 0;
    line-height: 18px;
    transition: border-color 140ms ease, color 140ms ease;
  }
  .detail em .x:hover {
    border-color: var(--accent);
    color: var(--ink);
  }
  .facts {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 6px;
    font-size: 11.5px;
    line-height: 1.4;
    color: var(--ink3);
  }
  .facts b {
    font-weight: 650;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .facts .extra {
    margin-left: 4px;
  }
  .facts .truth {
    margin-left: 2px;
  }

  /* ---- the right-hand column ---- */
  .col.r {
    position: absolute;
    bottom: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
  }
  .col.r > :global(.guide) {
    padding: 0 2px;
  }
  .col.r .truth {
    margin-left: 2px;
  }

  .none {
    position: absolute;
    left: 24px;
    top: 16px;
  }

  /* ---- short stages: one line under each numeral, and the tiles sized to what they have to say ---- */
  .lv[data-short='1'] .kpi .io-tile > span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* the five share about 600–660 px: each as wide as what it has to say — a stage 960 px wide leaves no more */
  .lv[data-short='1'] .kpi .io-tile {
    padding: 7px 10px 8px;
  }
  .lv[data-short='1'] .kpi .io-tile > em {
    letter-spacing: 0.12em;
  }
  .lv[data-short='1'] .kpi .io-tile:nth-child(1) {
    flex-grow: 1.15;
  }
  .lv[data-short='1'] .kpi .io-tile:nth-child(2) {
    flex-grow: 1.65;
  }
  .lv[data-short='1'] .kpi .io-tile:nth-child(3),
  .lv[data-short='1'] .kpi .io-tile:nth-child(4) {
    flex-grow: 0.95;
  }
  .lv[data-short='1'] .kpi .io-tile:nth-child(4) {
    flex-grow: 0.85;
  }
  .lv[data-short='1'] .kpi .io-tile:nth-child(5) {
    flex-grow: 1.3;
  }
  .lv[data-short='1'] .prow {
    padding: 5px 8px 6px;
  }
  .lv[data-short='1'] .detail {
    padding: 7px 12px 8px;
  }
</style>
