<script lang="ts">
  /** Wheel-zoom / drag-pan SVG viewport. `{@render children()}` is drawn in a fixed canvas space. */
  import type { Snippet } from 'svelte';

  interface Props {
    width: number;
    height: number;
    min?: number;
    max?: number;
    initial?: number;
    children: Snippet;
    class?: string;
  }
  let { width, height, min = 0.2, max = 12, initial = 1, children, class: cls = '' }: Props = $props();

  let svg: SVGSVGElement;
  const iw = width / initial;
  const ih = height / initial;
  let vb = $state({ x: (width - iw) / 2, y: (height - ih) / 2, w: iw, h: ih });
  let scale = $derived(width / vb.w);

  function clampScale(s: number) {
    return Math.max(min, Math.min(max, s));
  }
  function toCanvas(e: { clientX: number; clientY: number }) {
    const r = svg.getBoundingClientRect();
    return { x: vb.x + ((e.clientX - r.left) / r.width) * vb.w, y: vb.y + ((e.clientY - r.top) / r.height) * vb.h };
  }
  function zoomAt(factor: number, pt: { x: number; y: number }) {
    const s = clampScale(scale * factor);
    const k = scale / s;
    vb = { x: pt.x - (pt.x - vb.x) * k, y: pt.y - (pt.y - vb.y) * k, w: width / s, h: height / s };
  }
  export function reset() {
    vb = { x: (width - iw) / 2, y: (height - ih) / 2, w: iw, h: ih };
  }
  export function zoomBy(factor: number) {
    zoomAt(factor, { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 });
  }

  // wheel must be non-passive so we can preventDefault (Svelte's delegated handler is passive)
  $effect(() => {
    const el = svg;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(Math.exp(-e.deltaY * 0.0016), toCanvas(e));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  let drag: { x: number; y: number; moved: boolean } | null = null;
  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, moved: false };
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved) {
      drag.moved = true;
      svg.setPointerCapture(e.pointerId);
      svg.classList.add('panning');
    }
    const r = svg.getBoundingClientRect();
    vb.x -= (dx / r.width) * vb.w;
    vb.y -= (dy / r.height) * vb.h;
    drag.x = e.clientX;
    drag.y = e.clientY;
  }
  function up(e: PointerEvent) {
    if (drag?.moved && svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
    drag = null;
    svg.classList.remove('panning');
  }
</script>

<div class="pz {cls}">
  <svg
    bind:this={svg}
    viewBox="{vb.x} {vb.y} {vb.w} {vb.h}"
    preserveAspectRatio="xMidYMid meet"
    role="application"
    aria-label="Zoomable board: scroll to zoom, drag to pan"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
  >
    {@render children()}
  </svg>
  <div class="pz-hint">scroll to zoom · drag to pan</div>
  <div class="pz-ctl">
    <button onclick={() => zoomBy(1.5)} title="Zoom in" aria-label="Zoom in">+</button>
    <button onclick={() => zoomBy(1 / 1.5)} title="Zoom out" aria-label="Zoom out">−</button>
    <button onclick={reset} title="Fit" aria-label="Fit to view">⤢</button>
  </div>
</div>

<style>
  .pz {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }
  svg {
    width: 100%;
    height: 100%;
    display: block;
    cursor: grab;
    touch-action: none;
    user-select: none;
  }
  svg:global(.panning) {
    cursor: grabbing;
  }
  .pz-hint,
  .pz-ctl {
    position: absolute;
    z-index: 2;
  }
  .pz-hint {
    right: 12px;
    bottom: 10px;
    font: 400 10.5px var(--font-ui);
    color: var(--ink3);
    pointer-events: none;
    opacity: 0;
    transition: opacity 200ms ease;
  }
  .pz:hover .pz-hint {
    opacity: 1;
  }
  .pz-ctl {
    left: 10px;
    bottom: 10px;
    display: flex;
    gap: 4px;
  }
  button {
    width: 26px;
    height: 26px;
    border-radius: 6px;
    border: 1px solid var(--line2);
    background: var(--panel);
    color: var(--ink2);
    font: 500 14px var(--font-mono);
    cursor: pointer;
    display: grid;
    place-items: center;
  }
  button:hover {
    color: var(--ink);
    border-color: var(--ink3);
  }
</style>
