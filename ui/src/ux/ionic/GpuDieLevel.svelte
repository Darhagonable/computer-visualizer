<script lang="ts">
  /**
   * Graphics chain · level 2 — GPU die. The die as the hero: 6 shader engines × 16 units,
   * laid out 3 × 2 like the blocks on the card's die. Each unit is coloured by the mode —
   * the same value it has on the card — and explains itself on hover: load, ≈ temperature,
   * ≈ power, each with its truth word. Click an engine, on the die or in its tile, to pin it.
   */
  import { untrack } from 'svelte';
  import { app, hoverCard, hoverOut } from '../../mock/store.svelte';
  import { MODE_META, TRUTH, TRUTH_LABEL, GPU_ENGINES, GPU_UNITS, type Overlay } from '../../mock/telemetry';
  import Icon from '../../scene/Icon.svelte';
  import { gdieLayout, heroCols, levelWheel, HERO_COL, GDIE, ENGINE_SIZE, enginePos, unitPos, UNIT, urlNum, type Level } from './nav';
  import Guide from './Guide.svelte';
  import TruthChip from './TruthChip.svelte';
  import { overlayColor, unitValue, unitSum, unitDomain, unitLoadPct, unitTemp, unitPower, engineOf, unitInEngine, GPU_WHY, truthRow, fmt, overlayOf } from './live';

  interface Props {
    w: number;
    h: number;
    go: (l: Level) => void;
  }
  let { w, h, go }: Props = $props();

  const g = $derived(app.tele?.gpu ?? null);
  const ov = $derived<Overlay>(overlayOf(app.mode, 'gpu') ?? 'temperature');
  const lay = $derived(gdieLayout(w, h));
  const cols = $derived(heroCols(lay, w, h));
  const domain = $derived(unitDomain(ov));
  const sum = $derived(g ? unitSum(g) : 0);
  const truth = $derived(TRUTH_LABEL[TRUTH[ov].gpu]);

  /** The pinned engine (`?engine=`): framed on the die, lit in the tiles. −1: none. */
  let pinned = $state(untrack(() => Math.min(urlNum('engine') ?? -1, GPU_ENGINES - 1)));

  const UNITS = Array.from({ length: GPU_UNITS }, (_, i) => i);
  const ENGINES = Array.from({ length: GPU_ENGINES }, (_, e) => e);
  const val = (i: number) => (g ? unitValue(ov, g, i, sum) : 0);
  const fill = (i: number) => overlayColor(ov, 'gpu', val(i), domain);

  /** Per engine: mean load, mean ≈ temperature and summed ≈ power of its 16 units. */
  const perEngine = $derived.by(() =>
    ENGINES.map((e) => {
      let load = 0;
      let temp = 0;
      let power = 0;
      if (g) {
        for (let u = 0; u < 16; u++) {
          const i = e * 16 + u;
          load += unitLoadPct(g, i);
          temp += unitTemp(g, i);
          power += unitPower(g, i, sum);
        }
      }
      return { e, load: load / 16, temp: temp / 16, power };
    }),
  );

  /** The figure over the scale: the mean of the 96 units under the mode. */
  const guide = $derived.by(() => {
    const mean = (f: (en: (typeof perEngine)[number]) => number) => perEngine.reduce((s, en) => s + f(en), 0) / GPU_ENGINES;
    if (ov === 'temperature') return { k: `≈ ${fmt(mean((en) => en.temp), 1)}`, u: '°C', sub: `mean of the 96 units · the GPU sensor reads ${fmt(g?.temp ?? 0, 1)} °C` };
    if (ov === 'activity') return { k: fmt(mean((en) => en.load)), u: '%', sub: 'mean of the 96 units · the engines trail the 3D load' };
    return { k: `≈ ${fmt(mean((en) => en.power), 2)}`, u: 'W', sub: 'per unit on average · the board draws ' + fmt(g?.power ?? 0) + ' W' };
  });

  /** Everything a unit is, each number with its own truth word. */
  function unitCard(i: number) {
    if (!g) return null;
    return {
      title: `Shader engine ${engineOf(i) + 1} · unit ${unitInEngine(i) + 1}`,
      sub: `GPU die · ${GPU_UNITS} units in ${GPU_ENGINES} engines`,
      rows: [
        ...truthRow('activity', 'gpu', unitLoadPct(g, i), GPU_WHY.activity),
        ...truthRow('temperature', 'gpu', unitTemp(g, i), GPU_WHY.temperature),
        ...truthRow('power', 'gpu', unitPower(g, i, sum), GPU_WHY.power, domain),
      ],
      hint: 'click to pin its engine',
    };
  }
  const toggle = (e: number) => (pinned = pinned === e ? -1 : e);

  let root: HTMLDivElement;
  $effect(() => {
    const onWheel = levelWheel((dir) => {
      if (dir < 0) go({ kind: 'card' });
    });
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  });
</script>

<div class="lv" bind:this={root}>
  <div class="col l" style="left:{cols.leftX}px; width:{HERO_COL}px">
    <div class="io-tile">
      <em><Icon name="overview" size={13} />GPU die</em>
      <b>{GPU_UNITS}<i>units</i></b>
      <span>{GPU_ENGINES} shader engines × 16 · 3D {fmt(g?.engines['3d'] ?? 0)} %</span>
    </div>
    <div class="eng">
      {#each perEngine as en (en.e)}
        <button
          class="io-tile"
          class:on={pinned === en.e}
          class:off={pinned >= 0 && pinned !== en.e}
          onclick={() => toggle(en.e)}
          title="Engine {en.e + 1}: mean load {fmt(en.load)} % · ≈ {fmt(en.temp, 1)} °C · ≈ {fmt(en.power, 2)} W"
        >
          <em>Engine {en.e + 1}</em>
          <b>{fmt(en.load)}<i>%</i></b>
          <span>≈ {fmt(en.temp)} °C · ≈ {fmt(en.power, 1)} W</span>
        </button>
      {/each}
    </div>
    <div class="truths">
      <TruthChip component="gpu" ov="activity" name="load" />
      <TruthChip component="gpu" ov="temperature" name="≈ °C" />
      <TruthChip component="gpu" ov="power" name="≈ W" />
    </div>
    <span class="foot">per engine: mean of its 16 units · click an engine to pin it</span>
  </div>

  <div class="hero io-package" style="left:{lay.x}px; top:{lay.y}px; width:{lay.w}px; height:{lay.h}px">
    <svg viewBox="0 0 {GDIE.w} {GDIE.h}" class="die-svg" role="application" aria-label="GPU die, 96 units in 6 shader engines — hover a unit to read it, click an engine to pin it">
      <rect x="4" y="4" width={GDIE.w - 8} height={GDIE.h - 8} rx="40" class="pkg" />
      <circle cx="24" cy="24" r="4.5" class="pin" />
      <text x="56" y="29" class="etch">GPU DIE · {GPU_UNITS} UNITS · {GPU_ENGINES} SHADER ENGINES</text>
      <text x={GDIE.w - 56} y="29" text-anchor="end" class="etch">MOCK LAYOUT · NOT TO SCALE</text>
      <rect x="32" y="40" width={GDIE.w - 64} height={GDIE.h - 76} rx="26" class="rim" />

      {#each ENGINES as e (e)}
        {@const p = enginePos(e)}
        {@const en = perEngine[e]}
        <!-- svelte-ignore a11y_click_events_have_key_events (the engine tiles are the keyboard way to pin) -->
        <g class="engine" class:pinned={pinned === e} class:off={pinned >= 0 && pinned !== e} onclick={() => toggle(e)}>
          <text x={p.x} y={p.y - 14} class="et">ENGINE {e + 1}</text>
          <text x={p.x + ENGINE_SIZE} y={p.y - 14} text-anchor="end" class="et2">{fmt(en.load)} %</text>
          <rect x={p.x - 9} y={p.y - 9} width={ENGINE_SIZE + 18} height={ENGINE_SIZE + 18} rx="18" class="ebody" />
          {#each UNITS.slice(e * 16, e * 16 + 16) as i (i)}
            {@const q = unitPos(i)}
            <rect
              x={q.x}
              y={q.y}
              width={UNIT}
              height={UNIT}
              rx="7"
              fill={fill(i)}
              class="unit"
              onpointerenter={(ev) => hoverCard(unitCard(i), ev)}
              onpointerleave={hoverOut}
            />
          {/each}
        </g>
      {/each}
    </svg>
    <span class="io-badge" title={MODE_META[ov].hint}>{truth} · {GPU_WHY[ov]}</span>
  </div>

  <div class="col r" style="left:{cols.rightX}px; top:{cols.rightTop}px; width:{cols.rightW}px">
    <Guide component="gpu" {domain} note="per unit" k={guide.k} u={guide.u} accent sub={guide.sub} compact />
    <div class="io-tile">
      <em>Whole GPU</em>
      <div class="io-list">
        <div class="io-row static wide">
          <span class="n">temperature</span>
          <span class="v">{fmt(g?.temp ?? 0)} °C · hotspot {fmt(g?.hotspot ?? 0)}</span>
        </div>
        <div class="io-row static wide">
          <span class="n">VRAM</span>
          <span class="v">{fmt(g?.vramTemp ?? 0)} °C</span>
        </div>
        <div class="io-row static wide">
          <span class="n">power</span>
          <span class="v">{fmt(g?.power ?? 0)} W of {fmt(g?.powerLimit ?? 0)}</span>
        </div>
        <div class="io-row static wide">
          <span class="n">clocks</span>
          <span class="v">{fmt(g?.clockMhz ?? 0)} · {fmt(g?.memClockMhz ?? 0)} MHz</span>
        </div>
      </div>
      <span class="io-foot extra">temperature, hotspot, VRAM, power: sensors</span>
    </div>
  </div>
</div>

<style>
  .lv {
    position: absolute;
    inset: 0;
  }
  .col {
    position: absolute;
    bottom: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .col.l {
    top: 16px;
    justify-content: center;
  }
  .col.r {
    justify-content: flex-start;
  }
  .col > :global(.guide) {
    padding: 0 2px;
  }
  /* label · value rows rather than label · bar · value */
  .col .io-row.wide {
    grid-template-columns: 84px minmax(0, 1fr);
    gap: 8px;
  }
  .col .io-row.wide .v {
    min-width: 0;
    font: 500 11.5px var(--font-mono);
    color: var(--ink);
    text-align: right;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-variant-numeric: tabular-nums;
  }
  /* six engine tiles, two abreast */
  .eng {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .eng .io-tile {
    min-width: 0;
    padding: 9px 13px 9px;
    text-align: left;
    color: var(--ink);
    cursor: pointer;
    transition: border-color 160ms ease, transform 200ms cubic-bezier(0.2, 0.75, 0.25, 1), opacity 200ms ease;
  }
  .eng .io-tile:hover {
    border-color: var(--accent);
    transform: translateY(-2px);
  }
  .eng .io-tile.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent), 0 0 20px color-mix(in srgb, var(--accent) 30%, transparent);
  }
  .eng .io-tile.off {
    opacity: 0.55;
  }
  .col.l .eng .io-tile > b:not(.plain):not(.io-name) {
    font-size: 24px;
  }
  .truths {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 12px;
    padding: 0 2px;
  }
  .foot {
    font-size: 10.5px;
    color: var(--ink3);
    padding: 0 2px;
  }

  .hero {
    position: absolute;
  }
  .die-svg {
    display: block;
    overflow: visible;
  }
  .engine {
    cursor: pointer;
  }
  .ebody {
    fill: none;
    stroke: var(--cpu-line);
    stroke-width: 1.4;
    transition: stroke 120ms ease, opacity 200ms ease;
  }
  .engine:hover .ebody {
    stroke: var(--ink3);
  }
  .engine.pinned .ebody {
    stroke: var(--accent);
    stroke-width: 2.6;
    filter: drop-shadow(0 0 8px var(--accent-glow));
  }
  .engine.off {
    opacity: 0.5;
  }
  .unit {
    outline: none;
  }
  .unit:hover {
    stroke: var(--ink);
    stroke-width: 1.5;
  }
  .et {
    font: 600 11.5px var(--font-mono);
    fill: var(--ink2);
    letter-spacing: 0.1em;
    pointer-events: none;
  }
  .engine.pinned .et {
    fill: var(--accent);
  }
  .et2 {
    font: 500 11px var(--font-mono);
    fill: var(--ink3);
    pointer-events: none;
  }
</style>
