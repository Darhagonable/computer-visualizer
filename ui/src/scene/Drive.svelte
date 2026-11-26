<script lang="ts" module>
  /**
   * A drive drawn as line art, one drawing per kind, coloured by the overlay — the proper
   * version of the drives the motherboard draws as small doors:
   *
   *   nvme   an M.2 2280 stick — controller, two flash packages, its label, the gold edge
   *          connector — under its heatsink, shown lifted off so the flash stays visible
   *   ssd    a 2.5" SATA SSD with the lid off: the board, controller, four flash packages
   *   hdd    a 3.5" hard disk with the lid off: platter, spindle, actuator arm, breather filter
   *
   * Canvas per kind: DRIVE_CANVAS (SVG user units). What the colour encodes is the drive's
   * reading under the overlay (`driveValue`): its temperature, its busy time, or its estimated
   * watts. Pages are memory data only, so a drive stays on temperature while the mode is
   * "Pages" (`driveOverlay`).
   *
   * What is honest here (mock/telemetry.ts keeps the words):
   *   temperature   MEASURED where the drive has a sensor. A drive without one has no value:
   *                 it takes the theme's no-data colour and its card says "no sensor" — never
   *                 a guess.
   *   activity      per drive MEASURED (busy time, read / write rate). How that is split
   *                 between a drive's partitions is MODELLED (SHARE_TRUTH).
   *   power         ESTIMATED — no drive in this mock exposes its power draw.
   *
   * The drawings are illustrations, not an inventory: how many flash packages, platters or heatsinks
 * one shows is line art — the mock has no such data. Everything it does have is read, never assumed.
 *
 * With `partitions` on, the drive carries its own capacity as a bar along its top edge: one
   * segment per partition, as wide as the partition is large (a reading), the used part filled.
   * A segment too narrow for its name gets a tag above the drive — the host leaves
   * DRIVE_CALLOUT units of room for them. Clicking a segment, or its tag, selects it.
   *
   * This module is the one definition of the drive's canvas, readings, hover cards and capacity
   * formats; the part views import it through levels/drives.live.ts.
   */
  import {
    MODE_META,
    TRUTH,
    TRUTH_LABEL,
    TRUTH_NOTE,
    type DriveKind,
    type DriveLive,
    type Mode,
    type Overlay,
    type Partition,
    type Truth,
  } from '../mock/telemetry';
  import type { HoverCard, HoverRow } from '../mock/store.svelte';

  /** Canvas of each drawing, SVG user units. */
  export const DRIVE_CANVAS: Record<DriveKind, { w: number; h: number }> = {
    nvme: { w: 300, h: 174 }, // the stick under its heatsink, shown lifted off
    ssd: { w: 228, h: 160 },
    hdd: { w: 266, h: 184 },
  };
  /**
   * Room the partition tags can take above the drive's top edge (same units) — the host keeps
   * it clear. On the NVMe the tags sit in the gap under its heatsink, which gives them more.
   */
  export const DRIVE_CALLOUT = 30;
  const TAG_ROOM: Record<DriveKind, number> = { nvme: 61, ssd: DRIVE_CALLOUT - 2, hdd: DRIVE_CALLOUT - 2 };
  /** What is etched on each drive — the mock's own words for them (telemetry.ts: an M.2 NVMe stick, a 2.5" SATA SSD, a 3.5" hard disk). */
  export const FORM_FACTOR: Record<DriveKind, string> = { nvme: 'M.2 · NVMe', ssd: '2.5″ SATA', hdd: '3.5″ SATA' };

  /**
   * The truth of a partition's share of its drive's activity. The honesty table has one word
   * per overlay and component — "measured" for a drive's busy time — and its reason says where
   * that stops: "The split between its partitions is modelled." (TRUTH_NOTE.activity.storage).
   */
  export const SHARE_TRUTH: Truth = 'modelled';

  // ---- formats --------------------------------------------------------------------------

  const round = (v: number, d: number) => v.toLocaleString('en-US', { maximumFractionDigits: d });
  /** Fixed decimals, grouped: the models' `fmt`. */
  export const num = (v: number, d = 0) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  /** A share in %; 0 when the whole is 0. */
  export const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);
  /** A share as text — two decimals under 1 %, so a small one never reads as zero: "0.01 %", "38 %". */
  export const pctText = (v: number) => round(v, v < 1 ? 2 : 1);
  /** Capacity in GiB — in TiB from 1 TiB up — with no more precision than the size deserves. */
  export function cap(v: number): string {
    return v >= 1024 ? `${round(v / 1024, 2)} TiB` : `${round(v, v >= 100 ? 0 : v >= 10 ? 1 : 2)} GiB`;
  }
  /** "772 GiB of 1,000 GiB" — both in the unit of the whole. */
  export function capPair(used: number, total: number): string {
    return `${cap(used)} of ${cap(total)}`;
  }
  /** The same, short enough for a narrow tile: "318 / 1,000 GiB", "0.8 / 2 TiB". */
  export function capShort(used: number, total: number): string {
    return total >= 1024 ? `${round(used / 1024, 1)} / ${round(total / 1024, 1)} TiB` : `${round(used, 0)} / ${round(total, 0)} GiB`;
  }
  /** A rate in decimal MB/s, as the motherboard's cards give it. */
  export const mbs = (bps: number) => `${round(bps / 1e6, bps < 9.5e6 ? 1 : 0)} MB/s`;
  export const hours = (h: number) => `${num(Math.round(h))} h`;
  export const shortModel = (model: string) => model.replace(/^Mock /, '');

  // ---- what the colour means ------------------------------------------------------------

  /** The drive's reading under an overlay; null where the drive has nothing to report. */
  export const driveValue = (ov: Overlay, d: DriveLive): number | null =>
    ov === 'activity' ? d.busyPct : ov === 'power' ? d.power : d.tempC;
  /** The overlay a drive is on under a mode: "Pages" is memory data only. */
  export const driveOverlay = (mode: Mode): Overlay => (mode === 'pages' ? 'temperature' : mode);
  /** The reading as text: "46.1 °C", "22 %", "≈ 6.5 W" (≈ for what is not measured). */
  export function readingText(ov: Overlay, value: number): string {
    if (ov === 'temperature') return `${num(value, 1)} °C`;
    if (ov === 'activity') return `${num(value)} %`;
    return `≈ ${num(value, 1)} W`;
  }
  /** Why a drive has no reading under an overlay. */
  export const NO_DATA_WHY = { temperature: 'no sensor', activity: 'no data', power: 'no data' } as const satisfies Record<Overlay, string>;

  function temperatureRows(d: DriveLive): HoverRow[] {
    if (d.tempC === null) {
      // the word is the table's ("not available"); the drive reports nothing, so nothing is shown in its place
      return [
        { k: 'temperature', v: NO_DATA_WHY.temperature, mono: true, dim: true },
        { k: '', v: `${TRUTH_LABEL.unavailable} — never guessed at`, dim: true },
      ];
    }
    return [
      { k: 'temperature', v: readingText('temperature', d.tempC), mono: true },
      { k: '', v: TRUTH_LABEL[TRUTH.temperature.storage], dim: true },
    ];
  }

  // ---- hover cards ----------------------------------------------------------------------

  /**
   * Everything a drive is, each number under its truth word, and what its colour shows — which,
   * for a drive with nothing to report under the overlay, is the no-data colour.
   */
  export function driveCard(d: DriveLive, ov: Overlay, hint?: string): HoverCard {
    const value = driveValue(ov, d);
    return {
      title: shortModel(d.model),
      sub: `${d.bus} · ${capPair(d.usedGiB, d.totalGiB)} in use`,
      rows: [
        { k: 'activity', v: `${num(d.busyPct)} %`, mono: true },
        { k: '', v: `${TRUTH_LABEL[TRUTH.activity.storage]} · ${mbs(d.readBps)} read · ${mbs(d.writeBps)} write`, dim: true },
        ...temperatureRows(d),
        { k: 'power', v: `≈ ${num(d.power, 1)} W`, mono: true },
        { k: '', v: TRUTH_LABEL[TRUTH.power.storage], dim: true },
      ],
      note:
        value === null
          ? `what the colour shows: no data — ${NO_DATA_WHY[ov]}`
          : `what the colour shows: ${MODE_META[ov].label.toLowerCase()} · ${TRUTH_LABEL[TRUTH[ov].storage]}`,
      hint,
    };
  }

  /** A partition: how full it is (a reading) and its modelled share of the drive's activity. */
  export function partitionCard(d: DriveLive, i: number, hint?: string): HoverCard {
    const p = d.partitions[i];
    if (!p) return { title: 'Partition', sub: 'not in this mock', rows: [] };
    const full = pct(p.usedGiB, p.totalGiB);
    const ofDrive = pct(p.totalGiB, d.totalGiB);
    const rows: HoverRow[] = [
      { k: 'full', v: `${num(full)} %`, mono: true },
      { k: 'of this drive', v: `${pctText(ofDrive)} %`, mono: true },
      { k: 'activity share', v: `≈ ${num(p.share * 100)} %`, mono: true },
      { k: '', v: `${TRUTH_LABEL[SHARE_TRUTH]} — no OS tells which partition is busy`, dim: true },
    ];
    if (p.usedGiB > p.totalGiB) rows.push({ k: '', v: 'more in use than the partition holds — inconsistent mock data', dim: true });
    return { title: p.letter ? `${p.letter} ${p.label}` : p.label, sub: `${p.fs} · ${capPair(p.usedGiB, p.totalGiB)} in use`, rows, note: TRUTH_NOTE.activity.storage, hint };
  }
</script>

<script lang="ts">
  import { app, hoverCard, hoverOut } from '../mock/store.svelte';
  import { metricColor } from './paint.svelte';

  interface Props {
    /** Index into the mock's storage list (`app.tele.storage`). */
    drive: number;
    /** Hover cards and doors. Off for a passive drawing (a thumbnail). */
    interactive?: boolean;
    /** The small etched labels: the form factor, what is written on the drive. */
    labels?: boolean;
    /** Draw the partitions as a capacity bar along the drive's top edge. */
    partitions?: boolean;
    /** The partition framed on that bar (its index), or null. */
    selected?: number | null;
    /**
     * Enlarges the names on the capacity bar — a small hero keeps legible tags. 1: the
     * drawing's own size. Clamped to the room the tags have above the drive.
     */
    labelScale?: number;
    /** The drive itself was clicked. */
    ondrive?: (drive: number) => void;
    /** A partition — its segment on the bar, or its tag — was chosen: a click, or Enter on it. */
    onpartition?: (drive: number, partition: number) => void;
  }
  let { drive, interactive = true, labels = true, partitions = false, selected = null, labelScale = 1, ondrive, onpartition }: Props = $props();

  /** The mock mutates the drive's readings in place every tick, and `app.tele` keeps its identity. */
  const live = $derived(app.tele?.storage[drive] ?? null);
  const kind = $derived<DriveKind>(live?.kind ?? 'nvme');
  const ov = $derived<Overlay>(driveOverlay(app.mode));
  /** The drive's fill on the overlay's ramp — the theme's no-data colour where it has no reading. Reads the tick. */
  const fill = $derived.by(() => {
    void app.version;
    return metricColor(ov, 'storage', live ? driveValue(ov, live) : null);
  });

  // ---- the capacity bar: where it sits on each drive --------------------------------------

  const BAR: Record<DriveKind, { x: number; y: number; w: number; h: number }> = {
    nvme: { x: 6, y: 96, w: 286, h: 10 }, // along the top edge of the board
    ssd: { x: 8, y: 5, w: 200, h: 10 }, // along the top edge of the case
    hdd: { x: 16, y: 5, w: 246, h: 10 },
  };
  const TAG_FONT = 8;
  /** Slivers stay visible: a partition is never drawn thinner than this (taken from the widest one). */
  const MIN_SEG = 2.5;

  interface Tag {
    text: string;
    x: number;
    anchor: 'start' | 'end';
    baseline: number;
    /** The tag's text box — its door. */
    box: { x: number; y: number; w: number; h: number };
    lead: { x1: number; y1: number; x2: number; y2: number };
  }
  interface Seg {
    i: number;
    x: number;
    w: number;
    /** Used fraction of the segment, 0–1. */
    used: number;
    text: string;
    tag: Tag | null;
  }

  /** Mono text is about 0.62 em per character: enough to keep tags from overlapping. */
  const textWidth = (text: string, font: number) => text.length * font * 0.62 + 1;
  /** How far above the bar a stack of tag rows reaches: 0.75 em to the lowest baseline, 1.5 em per row, a glyph 1.06 em tall. */
  const tagStack = (font: number, rows: number) => (0.75 + 1.5 * (rows - 1) + 1.06) * font;

  const bar = $derived.by(() => {
    const d = live;
    if (!d || !partitions || d.partitions.length === 0) return null;
    const B = BAR[d.kind];
    const total = d.partitions.reduce((s, p) => s + p.totalGiB, 0);
    if (!(total > 0)) return null;
    const nameOf = (p: Partition) => p.letter || p.label;
    // segments by partition size — proportional, except that slivers keep MIN_SEG (taken from the widest one)
    const ws = d.partitions.map((p) => (B.w * p.totalGiB) / total);
    // The names on the bar are as large as asked for — but no larger than the tags' room allows
    // once every segment that would need a tag at that size has one.
    const taggedAt = (font: number) => ws.filter((w, i) => w < textWidth(nameOf(d.partitions[i]), font) + 12).length;
    const rows = Math.max(1, taggedAt(TAG_FONT * labelScale));
    const font = Math.max(TAG_FONT, Math.min(TAG_FONT * labelScale, (TAG_ROOM[d.kind] - 2) / tagStack(1, rows)));
    const height = B.h * Math.min(1.4, font / TAG_FONT);
    let widest = 0;
    let borrowed = 0;
    ws.forEach((w, i) => {
      if (w > ws[widest]) widest = i;
      if (w < MIN_SEG) {
        borrowed += MIN_SEG - w;
        ws[i] = MIN_SEG;
      }
    });
    ws[widest] = Math.max(MIN_SEG, ws[widest] - borrowed);
    const segs: Seg[] = [];
    let x = B.x;
    d.partitions.forEach((p, i) => {
      segs.push({ i, x, w: ws[i], used: p.totalGiB > 0 ? Math.min(1, p.usedGiB / p.totalGiB) : 0, text: nameOf(p), tag: null });
      x += ws[i];
    });
    // the ones too narrow for their name are tagged above the drive, stacked towards the end they lie at
    const small = segs.filter((s) => s.w < textWidth(s.text, font) + 12);
    if (small.length) {
      const mid = small.reduce((a, s) => a + s.x + s.w / 2, 0) / small.length;
      const toEnd = mid > B.x + B.w / 2; // tags hug the right end, else the left
      const order = [...small].sort((a, b) => (toEnd ? 1 : -1) * (b.x + b.w / 2 - (a.x + a.w / 2)));
      const n = order.length;
      order.forEach((s, j) => {
        const row = n - 1 - j; // the one nearest the end takes the top row
        const tw = textWidth(s.text, font);
        const baseline = B.y - 0.75 * font - row * 1.5 * font;
        const edge = toEnd ? B.x + B.w - 0.75 * font * (n - 1 - row) : B.x + 0.75 * font * (n - 1 - row);
        const cx = s.x + s.w / 2;
        s.tag = {
          text: s.text,
          x: toEnd ? edge - 0.12 * font : edge + 0.12 * font,
          anchor: toEnd ? 'end' : 'start',
          baseline,
          box: { x: toEnd ? edge - tw : edge, y: baseline - 1.06 * font, w: tw, h: 1.4 * font },
          // a lower tag points at its segment; an upper one drops a leader past the tags below it
          lead:
            row === 0
              ? { x1: toEnd ? edge - 0.5 * font : edge + 0.5 * font, y1: baseline + 0.3 * font, x2: cx, y2: B.y - 0.5 }
              : { x1: cx, y1: baseline + 0.4 * font, x2: cx, y2: B.y - 0.5 },
        };
      });
    }
    return { x: B.x, y: B.y, w: B.w, h: height, font, segs };
  });

  // ---- line-art details -------------------------------------------------------------------

  /** The gold edge connector: twenty fingers, long and short alternately. */
  const FINGERS = Array.from({ length: 20 }, (_, i) => ({ y: 95.4 + i * 3.8, w: i % 2 ? 6.4 : 7.4 }));
  /** Heatsink fins: clear of the middle while its label is shown, edge to edge otherwise. */
  const FINS = Array.from({ length: 18 }, (_, i) => 16 + i * 15.8);
  const finsOf = (withLabel: boolean) => (withLabel ? FINS.filter((x) => x < 82 || x > 218) : FINS);
  /** Small parts on the NVMe board (not storage, so not coloured). */
  const NVME_PARTS = [
    { x: 48, y: 118, w: 3.5, h: 5 },
    { x: 48, y: 127, w: 3.5, h: 5 },
    { x: 48, y: 136, w: 3.5, h: 5 },
    ...Array.from({ length: 9 }, (_, i) => ({ x: 62 + i * 10, y: 159, w: 4, h: 3.2 })),
  ];
  const SSD_NAND = [
    { x: 62, y: 28 },
    { x: 104, y: 28 },
    { x: 62, y: 82 },
    { x: 104, y: 82 },
  ];
  const SSD_PARTS = [0, 1, 2, 3].flatMap((i) => [{ x: 20 + i * 8, y: 106 }, { x: 20 + i * 8, y: 116 }]);
  const SSD_VENTS = [104, 116, 128, 140];
  const HDD_FILTER = [0, 1, 2, 3, 4];
  const HDD_HATCH = [0, 1, 2, 3, 4, 5];
  const HDD_RINGS = [24, 40, 54, 66];
  /** Sector marks on the platter — what turns. */
  const HDD_TICKS = Array.from({ length: 24 }, (_, i) => (i * 15 * Math.PI) / 180);
  const SPINDLE = { x: 112, y: 100 };

  const labelLines = $derived.by(() => {
    const words = shortModel(live?.model ?? '').split(' ');
    return [words.slice(0, 2).join(' '), words.slice(2).join(' ')];
  });
  const busShort = $derived((live?.bus ?? '').split('·').slice(1).join('·').trim());

  // ---- hover cards and doors ----------------------------------------------------------------

  const hint = $derived(ondrive ? 'click to open this drive' : undefined);
  const partHint = $derived(onpartition ? 'click to select this partition' : undefined);

  /** The drive explains itself — unless the pointer is on a partition, which explains itself first. */
  function onMove(e: PointerEvent) {
    if (!interactive || (e.target as Element).closest?.('[data-part]')) return;
    const d = live;
    if (d) hoverCard(driveCard(d, ov, hint), e);
  }
  function onClick(e: MouseEvent) {
    if (!interactive || (e.target as Element).closest?.('[data-part]')) return;
    ondrive?.(drive);
  }
  function partMove(i: number, e: PointerEvent) {
    if (!interactive) return;
    const d = live;
    if (d) hoverCard(partitionCard(d, i, partHint), e);
  }
  function partClick(e: MouseEvent, i: number) {
    e.stopPropagation(); // the drive's own door must not report this click too
    if (interactive) onpartition?.(drive, i);
  }
  /** Each segment is a button of its own where partitions can be chosen: focus it, press Enter. */
  function partKey(e: KeyboardEvent, i: number) {
    if (!interactive || !onpartition || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    e.stopPropagation(); // Space is "pause" everywhere else
    onpartition(drive, i);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<g
  class="drive"
  class:passive={!interactive}
  class:door={!!ondrive}
  data-drive={drive}
  role="group"
  aria-label={live ? `${shortModel(live.model)} · ${FORM_FACTOR[live.kind]} (mock)` : 'Drive'}
  onpointerenter={onMove}
  onpointermove={onMove}
  onpointerleave={() => interactive && hoverOut()}
  onclick={onClick}
>
  <!-- the whole canvas is the drive's door, gaps included -->
  <rect x="-2" y="-2" width={DRIVE_CANVAS[kind].w + 4} height={DRIVE_CANVAS[kind].h + 4} rx="5" class="hit" />

  {#if kind === 'nvme'}
    <g class="g-nvme">
      <!-- heatsink, shown lifted off the stick so the flash stays visible -->
      <rect x="6" y="1" width="288" height="30" rx="4" class="sink" />
      {#each finsOf(labels) as x (x)}
        <line x1={x} y1="7" x2={x} y2="25" class="fin" />
      {/each}
      {#if labels}
        <text x="150" y="20" text-anchor="middle" class="etch">heatsink · shown lifted off</text>
      {/if}
      <line x1="22" y1="31" x2="22" y2="91.6" class="lift" />
      <line x1="180" y1="31" x2="180" y2="91.6" class="lift" />

      <!-- the stick: an M.2 2280 board -->
      <rect x="0.6" y="91.6" width="298.8" height="81.8" rx="3" class="pcb" />
      <rect x="0.6" y="91.6" width="298.8" height="81.8" rx="3" fill={fill} class="tint" />
      {#each FINGERS as f (f.y)}
        <rect x={299.4 - f.w} y={f.y} width={f.w} height="1.7" rx="0.8" class="gold" />
      {/each}
      <circle cx="292.6" cy="132.5" r="2.8" class="notch" />
      <circle cx="262" cy="132.5" r="5.2" class="hole" />
      <!-- controller: bare silicon, not storage — not coloured -->
      <rect x="10" y="115" width="34" height="35" rx="2" class="silicon" />
      <circle cx="14.5" cy="119.5" r="1.2" class="dot" />
      <!-- flash packages: what the reading is spread over -->
      <rect x="56" y="112" width="40" height="41" rx="2" class="flash" />
      <rect x="56" y="112" width="40" height="41" rx="2" fill={fill} class="tint chip" />
      <circle cx="60" cy="116" r="1.2" class="dot" />
      <rect x="106" y="112" width="40" height="41" rx="2" class="flash" />
      <rect x="106" y="112" width="40" height="41" rx="2" fill={fill} class="tint chip" />
      <circle cx="110" cy="116" r="1.2" class="dot" />
      {#each NVME_PARTS as p (p.x + ':' + p.y)}
        <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="0.5" class="smd" />
      {/each}
      <rect x="158" y="110" width="74" height="45" rx="2" class="sticker" />
      {#if labels}
        <text x="165" y="126" class="s-label">{labelLines[0]}</text>
        {#if labelLines[1]}<text x="165" y="136" class="s-label">{labelLines[1]}</text>{/if}
        {#if busShort}<text x="165" y="148" class="s-sub">{busShort}</text>{/if}
        <text x="10" y="168.5" class="etch small">{FORM_FACTOR.nvme}</text>
      {/if}
    </g>
  {:else if kind === 'ssd'}
    <g class="g-ssd">
      <!-- the lid is off: the case, the board inside, the SATA plugs at the end -->
      <rect x="0.6" y="0.6" width="214.8" height="158.8" rx="6" class="case" />
      <rect x="0.6" y="0.6" width="214.8" height="158.8" rx="6" fill={fill} class="tint" />
      <rect x="215.4" y="60" width="12" height="26" rx="1.5" class="slot" />
      <rect x="215.4" y="92" width="12" height="50" rx="1.5" class="slot" />
      <rect x="215.4" y="86" width="12" height="6" class="case" />
      <rect x="10" y="22" width="140" height="128" rx="4" class="pcb" />
      <rect x="18" y="30" width="32" height="32" rx="2" class="silicon" />
      <circle cx="22" cy="34" r="1.2" class="dot" />
      <rect x="18" y="72" width="32" height="26" rx="2" class="silicon" />
      <circle cx="22" cy="76" r="1.2" class="dot" />
      {#each SSD_NAND as n (n.x + ':' + n.y)}
        <rect x={n.x} y={n.y} width="36" height="46" rx="2" class="flash" />
        <rect x={n.x} y={n.y} width="36" height="46" rx="2" fill={fill} class="tint chip" />
        <circle cx={n.x + 4} cy={n.y + 4} r="1.2" class="dot" />
      {/each}
      {#each SSD_PARTS as p (p.x + ':' + p.y)}
        <rect x={p.x} y={p.y} width="4" height="4" rx="0.5" class="smd" />
      {/each}
      {#each SSD_VENTS as y (y)}
        <rect x="158" y={y} width="48" height="4" rx="2" class="vent" />
      {/each}
      {#if labels}
        <text x="158" y="40" class="etch">{FORM_FACTOR.ssd}</text>
      {/if}
    </g>
  {:else}
    <g class="g-hdd">
      <!-- the lid is off: platter, spindle, actuator, the SATA plugs at the end -->
      <rect x="0.6" y="62" width="12" height="28" rx="1.5" class="slot" />
      <rect x="0.6" y="96" width="12" height="50" rx="1.5" class="slot" />
      <rect x="7" y="90" width="6" height="6" class="case" />
      <rect x="12.6" y="0.6" width="252.8" height="182.8" rx="6" class="case" />
      <rect x="12.6" y="0.6" width="252.8" height="182.8" rx="6" fill={fill} class="tint" />
      <rect x="18" y="22" width="242" height="156" rx="4" class="inner" />
      <!-- breather filter -->
      <rect x="24" y="26" width="34" height="20" rx="2" class="block" />
      {#each HDD_FILTER as i (i)}
        <line x1={29 + i * 6} y1="30" x2={29 + i * 6} y2="42" class="hatch" />
      {/each}
      <!-- platter: the whole drive is one reading, so the platter carries the colour -->
      <circle cx={SPINDLE.x} cy={SPINDLE.y} r="74" class="platter" />
      <circle cx={SPINDLE.x} cy={SPINDLE.y} r="74" fill={fill} class="tint strong" />
      {#each HDD_RINGS as r (r)}
        <circle cx={SPINDLE.x} cy={SPINDLE.y} r={r} class="ring" />
      {/each}
      <g class="spin">
        {#each HDD_TICKS as a (a)}
          <line x1={SPINDLE.x + 67 * Math.cos(a)} y1={SPINDLE.y + 67 * Math.sin(a)} x2={SPINDLE.x + 72.5 * Math.cos(a)} y2={SPINDLE.y + 72.5 * Math.sin(a)} class="tick" />
        {/each}
      </g>
      <circle cx={SPINDLE.x} cy={SPINDLE.y} r="11" class="hub" />
      <circle cx={SPINDLE.x} cy={SPINDLE.y} r="4.5" class="screw" />
      <!-- voice-coil magnet, the pivot, the arm reaching over the platter -->
      <rect x="204" y="146" width="54" height="28" rx="3" class="block" />
      {#each HDD_HATCH as i (i)}
        <line x1={210 + i * 8} y1="151" x2={210 + i * 8} y2="169" class="hatch" />
      {/each}
      <polygon points="242,122.8 72.8,54.9 69.2,63.1 234,141.2" class="arm" />
      <rect x="-5" y="-3.5" width="10" height="7" rx="1" transform="translate(71,59) rotate(23.6)" class="slider" />
      <circle cx="238" cy="132" r="12" class="hub" />
      <circle cx="238" cy="132" r="4.5" class="screw" />
      {#if labels}
        <text x="24" y="172" class="etch">{FORM_FACTOR.hdd}</text>
      {/if}
    </g>
  {/if}

  <!-- the drive's capacity, split into its partitions -->
  {#if bar}
    {@const B = bar}
    <g class="pbar" style="--tag-fs: {B.font}px">
      <rect x={B.x - 1} y={B.y - 1} width={B.w + 2} height={B.h + 2} rx="2.5" class="track" />
      {#each B.segs as s (s.i)}
        <g
          class="part"
          class:sel={selected === s.i}
          data-part={s.i}
          role="button"
          tabindex={interactive && onpartition ? 0 : -1}
          aria-label="partition {s.text}"
          onkeydown={(e) => partKey(e, s.i)}
          onpointerenter={(e) => partMove(s.i, e)}
          onpointermove={(e) => partMove(s.i, e)}
          onpointerleave={() => interactive && hoverOut()}
          onclick={(e) => partClick(e, s.i)}
        >
          <rect x={s.x} y={B.y} width={s.w * s.used} height={B.h} class="used" />
          <rect x={s.x} y={B.y} width={s.w} height={B.h} class="seg" />
          {#if s.tag}
            {@const t = s.tag}
            <rect x={t.box.x - 2} y={t.box.y - 1.5} width={t.box.w + 4} height={t.box.h + 3} rx="3" class="hit" />
            <line x1={t.lead.x1} y1={t.lead.y1} x2={t.lead.x2} y2={t.lead.y2} class="lead" />
            <text x={t.x} y={t.baseline} text-anchor={t.anchor} class="tag">{t.text}</text>
          {:else}
            <text x={s.x + s.w / 2} y={B.y + B.h / 2 + 0.36 * B.font} text-anchor="middle" class="tag">{s.text}</text>
          {/if}
          {#if selected === s.i}
            <rect x={s.x - 1.6} y={B.y - 1.6} width={s.w + 3.2} height={B.h + 3.2} rx="3" class="frame" />
          {/if}
        </g>
      {/each}
    </g>
  {/if}
</g>

<style>
  .drive {
    outline: none;
  }
  .drive.door {
    cursor: pointer;
  }
  .drive:not(.passive) .part {
    cursor: pointer;
  }
  .hit {
    fill: transparent;
    pointer-events: all;
  }

  /* a reading's colour, laid over what it belongs to */
  .tint {
    opacity: 0.3;
    pointer-events: none;
  }
  .tint.strong {
    opacity: 0.5;
  }
  /* flash packages: silicon underneath, so with no reading they are still chips, never sockets */
  .flash {
    fill: var(--dimm-chip);
    stroke: var(--dimm-chip-line);
    stroke-width: 1;
  }
  .tint.chip {
    opacity: 0.68;
  }

  /* the NVMe stick */
  .sink {
    fill: var(--panel);
    stroke: var(--line2);
    stroke-width: 1.2;
  }
  .fin {
    stroke: var(--line2);
    stroke-width: 1;
  }
  .lift {
    stroke: var(--line2);
    stroke-width: 0.8;
    stroke-dasharray: 2.5 4;
  }
  .pcb {
    fill: var(--dimm-pcb);
    stroke: var(--dimm-line);
    stroke-width: 1.2;
  }
  .gold {
    fill: var(--dimm-gold);
  }
  .notch {
    fill: var(--bg);
    stroke: var(--dimm-line);
    stroke-width: 0.6;
  }
  .hole {
    fill: var(--bg);
    stroke: var(--dimm-line);
    stroke-width: 1;
  }
  .sticker {
    fill: var(--dimm-sticker);
    stroke: var(--line2);
    stroke-width: 0.6;
  }
  .s-label {
    font: 600 7px var(--font-mono);
    fill: var(--dimm-sticker-ink);
    pointer-events: none;
  }
  .s-sub {
    font: 500 6px var(--font-mono);
    fill: var(--dimm-sticker-ink);
    opacity: 0.72;
    pointer-events: none;
  }

  /* bare silicon (a controller, a cache) and small parts: not a reading, so not coloured */
  .silicon {
    fill: var(--dimm-chip);
    stroke: var(--dimm-chip-line);
    stroke-width: 1;
  }
  .smd {
    fill: var(--dimm-chip-line);
  }
  .dot {
    fill: var(--dimm-sticker);
    opacity: 0.7;
    pointer-events: none;
  }

  /* the cases of the SATA drives, lid off */
  .case {
    fill: var(--panel2);
    stroke: var(--line2);
    stroke-width: 1.2;
  }
  .inner {
    fill: var(--panel);
    stroke: var(--line);
    stroke-width: 1;
  }
  .slot {
    fill: var(--bg);
    stroke: var(--line2);
    stroke-width: 1;
  }
  .vent {
    fill: var(--bg);
    stroke: var(--line2);
    stroke-width: 0.6;
  }
  .block {
    fill: var(--panel2);
    stroke: var(--line2);
    stroke-width: 1;
  }
  .hatch {
    stroke: var(--line2);
    stroke-width: 0.8;
  }

  /* the hard disk */
  .platter {
    fill: var(--dimm-chip);
    stroke: var(--dimm-chip-line);
    stroke-width: 1;
  }
  .ring {
    fill: none;
    stroke: var(--dimm-chip-line);
    stroke-width: 0.6;
    opacity: 0.75;
    pointer-events: none;
  }
  .spin {
    transform-box: fill-box;
    transform-origin: center;
    animation: drive-spin 9s linear infinite;
    pointer-events: none;
  }
  /* an illustration, not a reading: a platter turns, whatever the telemetry says */
  @keyframes drive-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .spin {
      animation: none;
    }
  }
  .tick {
    stroke: var(--ink3);
    stroke-width: 0.9;
    opacity: 0.6;
  }
  .hub {
    fill: var(--panel2);
    stroke: var(--ink2);
    stroke-width: 1;
  }
  .screw {
    fill: var(--ink3);
    pointer-events: none;
  }
  .arm {
    fill: var(--panel2);
    stroke: var(--ink2);
    stroke-width: 1.3;
    stroke-linejoin: round;
  }
  .slider {
    fill: var(--ink);
  }

  .etch {
    font: 600 7px var(--font-mono);
    letter-spacing: 0.08em;
    fill: var(--ink3);
    pointer-events: none;
  }
  .etch.small {
    font-size: 5.5px;
  }

  /* the capacity bar: the track is the drive, each segment a partition, the ink its used part */
  .track {
    fill: var(--bg);
    stroke: var(--line2);
    stroke-width: 0.8;
  }
  .used {
    fill: var(--ink);
    opacity: 0.88;
  }
  .seg {
    fill: none;
    stroke: var(--ink3);
    stroke-width: 0.7;
    transition: stroke 120ms ease;
  }
  .part {
    outline: none;
  }
  .part:hover .seg,
  .part:focus-visible .seg,
  .part.sel .seg {
    stroke: var(--ink);
  }
  .part:focus-visible .tag {
    text-decoration: underline;
  }
  .frame {
    fill: color-mix(in srgb, var(--accent) 18%, transparent);
    stroke: var(--accent);
    stroke-width: 1.6;
    filter: drop-shadow(0 0 4px var(--accent-glow));
    pointer-events: none;
  }
  .lead {
    stroke: var(--ink3);
    stroke-width: 0.8;
    pointer-events: none;
  }
  .tag {
    font: 600 8px var(--font-mono);
    font-size: var(--tag-fs, 8px);
    fill: var(--ink);
    paint-order: stroke;
    stroke: var(--bg);
    stroke-width: 0.32em;
    stroke-linejoin: round;
    pointer-events: none;
  }
  .part.sel .tag {
    fill: var(--accent);
  }
</style>
