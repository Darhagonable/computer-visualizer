<script lang="ts">
  /**
   * One chip's page grid. Rects are created imperatively and only *changed* cells are
   * re-filled per tick (a full board is 16k rects — don't rebuild them). A full
   * recolour happens only when the paint state changes (highlight / legend / theme).
   */
  import { app, hoverPage, boardPage, getSim, getMachine, type PageDetails } from '../mock/store.svelte';
  import { paint, ps, colorOf } from './paint.svelte';

  interface Props {
    /** Chip index (board grids): routes tick changes and builds hover details. */
    chip: number;
    x: number;
    y: number;
    w: number;
    h: number;
    cols?: number;
    rows?: number;
    /** Gap and corner radius as a fraction of the cell size. */
    gap?: number;
    rx?: number;
    /** Override for derived (zoomed) grids. */
    cells?: Uint8Array;
    owners?: Uint16Array;
    /** Details provider for derived grids (implies: recolour fully every tick). */
    details?: (cell: number) => PageDetails | null;
    interactive?: boolean;
    oncellclick?: (cell: number) => void;
  }

  let {
    chip,
    x,
    y,
    w,
    h,
    cols = 16,
    rows = 16,
    gap = 0.22,
    rx = 0.3,
    cells,
    owners,
    details,
    interactive = true,
    oncellclick,
  }: Props = $props();

  const board = getMachine().chips[chip];
  const derived = !!details;
  const cur = () => ({ c: cells ?? board.cells, o: owners ?? board.owners });

  const n = cols * rows;
  const cw = (w - (cols - 1) * gap) / cols;
  const chh = (h - (rows - 1) * gap) / rows;
  const corner = cw < 3 ? 0 : Math.min(cw, chh) * rx;

  let g: SVGGElement;
  const rects: SVGRectElement[] = [];
  let built = false;
  let lastVersion = -1;
  let lastPaint = -1;

  function fill(i: number, r: SVGRectElement) {
    const { c, o } = cur();
    r.setAttribute('fill', colorOf(c, o, i));
  }

  function decorate(i: number, r: SVGRectElement) {
    const { c, o } = cur();
    const s = c[i] & 15;
    const shared = cw >= 5 && s >= 2 && s <= 4 && getMachine().owners[o[i]]?.shared === true;
    if (shared && ps.pal.shared) {
      r.setAttribute('stroke', ps.pal.shared);
      r.setAttribute('stroke-width', '0.6');
    } else if (r.hasAttribute('stroke')) {
      r.removeAttribute('stroke');
    }
  }

  function paintCell(i: number) {
    const r = rects[i];
    if (!r) return;
    fill(i, r);
    decorate(i, r);
  }

  function build() {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('x', ((i % cols) * (cw + gap)).toFixed(3));
      r.setAttribute('y', (((i / cols) | 0) * (chh + gap)).toFixed(3));
      r.setAttribute('width', cw.toFixed(3));
      r.setAttribute('height', chh.toFixed(3));
      if (corner > 0.05) r.setAttribute('rx', corner.toFixed(3));
      r.setAttribute('data-c', String(i));
      rects.push(r);
      frag.appendChild(r);
    }
    g.appendChild(frag);
    for (let i = 0; i < n; i++) paintCell(i);
  }

  $effect(() => {
    const v = app.version;
    const pr = paint.rev;
    if (!built) {
      build();
      built = true;
    } else if (pr !== lastPaint || derived || v !== lastVersion + 1) {
      // paint changed, zoomed grid, or we missed a tick → recolour everything
      for (let i = 0; i < n; i++) paintCell(i);
    } else {
      for (const p of getSim().changes) {
        if ((p >> 8) === chip) paintCell(p & 255);
      }
    }
    lastVersion = v;
    lastPaint = pr;
  });

  function cellFrom(e: Event): number | null {
    const c = (e.target as Element).getAttribute?.('data-c');
    return c === null || c === undefined ? null : +c;
  }
  function onMove(e: PointerEvent) {
    if (!interactive) return;
    const c = cellFrom(e);
    if (c === null) return;
    hoverPage(details ? details(c) : boardPage(chip, c), e);
  }
  function onLeave() {
    if (interactive) hoverPage(null);
  }
  function onClick(e: MouseEvent) {
    if (!interactive) return;
    const c = cellFrom(e);
    if (c === null) return;
    oncellclick?.(c);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
<g
  bind:this={g}
  class="chip-grid"
  role="presentation"
  class:passive={!interactive}
  data-chip
  transform="translate({x},{y})"
  shape-rendering={cw < 3 ? 'crispEdges' : 'geometricPrecision'}
  onpointermove={onMove}
  onpointerleave={onLeave}
  onclick={onClick}
></g>

<style>
  .chip-grid {
    pointer-events: all;
    cursor: crosshair;
  }
  .chip-grid.passive {
    pointer-events: none;
  }
</style>
