<script lang="ts">
  /**
   * Graphics chain · level 2 — VRAM. The 12 chips as the hero, each with its usage bar, and
   * the per-process list beside them. How much each process has is a reading; WHICH chip it
   * sits on is modelled — no OS exposes VRAM placement — and the level says so: badge, hover
   * cards, the list's foot. Hover or pin a process to see where it is modelled to sit, pin a
   * chip to see what is modelled to sit on it. The chips' tint follows the mode.
   */
  import { app, hoverCard, hoverOut } from '../mock/store.svelte';
  import { VRAM_CHIPS, VRAM_CHIP_MIB, type Overlay } from '../mock/telemetry';
  import { vramLayout, levelWheel, colTop, type Level } from './nav';
  import Guide from './Guide.svelte';
  import { chipValue, chipBusy, chipDomain, chipSlices, chipTemp, chipPower, GPU_OVERHEAD, CHIP_WHY, truthRow, overlayOf, overlayColor, fmt, mib } from './live';

  interface Props {
    w: number;
    h: number;
    go: (l: Level) => void;
  }
  let { w, h, go }: Props = $props();

  const g = $derived(app.tele?.gpu ?? null);
  const ov = $derived<Overlay>(overlayOf(app.mode, 'gpu') ?? 'temperature');
  const domain = $derived(chipDomain(ov));
  const lay = $derived(vramLayout(w, h));
  const top = $derived(colTop(h));
  const CHIPS = Array.from({ length: VRAM_CHIPS }, (_, c) => c);

  /** −1: nothing pinned. A pinned process is an index into `gpu.procs`, or −1 for the driver overhead. */
  const NONE = -2;
  let chip = $state(-1);
  let proc = $state(NONE);
  let over = $state(NONE);

  const slices = $derived.by(() => (g ? CHIPS.map((c) => chipSlices(g, c)) : []));
  const overhead = $derived(g ? GPU_OVERHEAD(g) : 0);
  const usedPct = $derived(g ? (g.vramUsedMiB / g.vramTotalMiB) * 100 : 0);
  const usage = (c: number) => Math.min(1, g?.chipUsage[c] ?? 0);
  const fullest = $derived.by(() => CHIPS.reduce((a, c) => (usage(c) > usage(a) ? c : a), 0));
  const emptiest = $derived.by(() => CHIPS.reduce((a, c) => (usage(c) < usage(a) ? c : a), 0));
  /** The process whose slices are lit on every chip: the hovered one, else the pinned one. */
  const lit = $derived(over !== NONE ? over : proc);

  interface Row {
    pi: number;
    name: string;
    mib: number;
    max: number;
    dim: boolean;
  }
  /** The list: every process by MiB, or — with a chip pinned — what is modelled to sit on that chip. */
  const rows = $derived.by((): Row[] => {
    if (!g) return [];
    if (chip >= 0) {
      return slices[chip].map((s) => ({ pi: s.proc, name: s.proc < 0 ? 'driver + desktop' : g.procs[s.proc].name, mib: s.mib, max: VRAM_CHIP_MIB, dim: false }));
    }
    const ps = g.procs.map((p, pi) => ({ pi, name: p.name, mib: p.mib, max: 0, dim: false })).sort((a, b) => b.mib - a.mib);
    const max = Math.max(1, ps[0]?.mib ?? 1);
    for (const p of ps) p.max = max;
    ps.push({ pi: -1, name: 'driver + desktop', mib: overhead, max, dim: true });
    return ps;
  });
  const listFoot = $derived(
    chip >= 0
      ? `modelled placement on VRAM ${chip + 1} · ${mib(slices[chip].reduce((s, x) => s + x.mib, 0))} of 2,048 MiB`
      : 'per-process usage is a reading · which chip it sits on is modelled',
  );

  const guide = $derived.by(() => {
    if (!g) return { k: '—', u: '', sub: '' };
    if (ov === 'temperature') return { k: `≈ ${fmt(chipTemp(g, fullest), 1)}`, u: '°C', sub: `fullest chip, VRAM ${fullest + 1} · the VRAM sensor reads ${fmt(g.vramTemp, 1)} °C` };
    if (ov === 'activity') return { k: fmt(chipBusy(g, fullest)), u: '%', sub: 'memory-bus busy estimate for the fullest chip' };
    return { k: `≈ ${fmt(chipPower(g, fullest), 2)}`, u: 'W', sub: 'fullest chip · a share of the board power' };
  });

  const tint = (c: number) => (g ? overlayColor(ov, 'gpu', chipValue(ov, g, c), domain) : 'transparent');

  /** Everything a chip is — and what it is modelled to hold. */
  function chipCard(c: number) {
    if (!g) return null;
    const on = slices[c]
      .slice(0, 4)
      .map((s) => (s.proc < 0 ? 'driver + desktop' : g.procs[s.proc].name))
      .join(', ');
    return {
      title: `VRAM chip ${c + 1} · 2 GB GDDR6X`,
      sub: `${Math.round(usage(c) * 100)} % in use · ${mib(usage(c) * VRAM_CHIP_MIB)} of ${fmt(VRAM_CHIP_MIB)} MiB`,
      rows: [
        ...truthRow('temperature', 'gpu', chipTemp(g, c), CHIP_WHY.temperature),
        ...truthRow('power', 'gpu', chipPower(g, c), CHIP_WHY.power, domain),
      ],
      note: `Modelled to hold: ${on}. Which chip holds which process is modelled — no OS exposes VRAM placement.`,
      hint: 'click to pin this chip',
    };
  }
  const nameOf = (pi: number) => (pi < 0 ? 'driver + desktop' : (g?.procs[pi]?.name ?? '?'));

  let root: HTMLDivElement;
  $effect(() => {
    const onWheel = levelWheel((dir) => {
      if (dir < 0) go({ kind: 'card' });
    });
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  });
</script>

<div class="lv lv-scope" bind:this={root} data-short={h > 0 && h < 620 ? '1' : '0'}>
  <div class="chips" style="left:{lay.x}px; top:{lay.top}px; grid-template-columns: repeat(6, {lay.chipW}px); gap: {lay.gap}px">
    {#each CHIPS as c (c)}
      {@const sl = slices[c] ?? []}
      <button
        class="vchip"
        class:on={chip === c}
        class:dim={chip >= 0 && chip !== c}
        style="width:{lay.chipW}px; height:{lay.chipH}px"
        aria-pressed={chip === c}
        onclick={() => (chip = chip === c ? -1 : c)}
        onpointerenter={(e) => hoverCard(chipCard(c), e)}
        onpointerleave={hoverOut}
      >
        <span class="hd"><b>VRAM {c + 1}</b><i>2 GB</i></span>
        <span class="body" style="background: linear-gradient(180deg, rgba(4, 6, 18, 0) 20%, rgba(4, 6, 18, 0.74) 78%), {tint(c)}">
          <b class="pct">{Math.round(usage(c) * 100)}<i>%</i></b>
          <span class="bar">
            {#each sl as s, k (k)}
              <i style="flex: 0 0 {((s.mib / VRAM_CHIP_MIB) * 100).toFixed(2)}%" class:lit={chip === c || lit === s.proc}></i>
            {/each}
          </span>
          <span class="mib">{mib(usage(c) * VRAM_CHIP_MIB)}</span>
        </span>
      </button>
    {/each}
  </div>

  <span class="io-badge where" style="left:{lay.x + lay.bandW / 2}px; top:{lay.badgeY}px" title="The stripes on each chip follow the mock's fixed placement model.">
    modelled placement · no OS exposes which VRAM chip holds which process
  </span>

  <div class="tiles" style="left:{lay.x}px; top:{lay.tilesY}px; width:{lay.bandW}px">
    <div class="io-tile">
      <em>VRAM in use</em>
      <b class="accent">{fmt(usedPct)}<i>%</i></b>
      <span>{mib(g?.vramUsedMiB ?? 0)} of {mib(g?.vramTotalMiB ?? 0)}</span>
    </div>
    <div class="io-tile">
      <em>Fullest chip</em>
      <b>VRAM {fullest + 1}</b>
      <span>{Math.round(usage(fullest) * 100)} % · {mib(usage(fullest) * VRAM_CHIP_MIB)} (emptiest: VRAM {emptiest + 1}, {Math.round(usage(emptiest) * 100)} %)</span>
    </div>
    <div class="io-tile">
      <em>VRAM temperature</em>
      <b>{fmt(g?.vramTemp ?? 0)}<i>°C</i></b>
      <span>one sensor for all 12 chips</span>
    </div>
  </div>

  <div class="gwrap" style="left:{lay.x}px; top:{lay.guideY}px; width:{lay.bandW}px">
    <Guide component="gpu" {domain} note="per chip" k={guide.k} u={guide.u} accent sub={guide.sub} flat compact />
  </div>

  <div class="col" style="left:{lay.rightX}px; top:{top}px; width:{lay.rightW}px">
    <div class="io-tile">
      <em>{chip >= 0 ? `Modelled on VRAM ${chip + 1}` : 'VRAM by process'}</em>
      <div class="io-list">
        {#each rows as r (r.pi)}
          <button
            class="io-row"
            class:on={proc === r.pi}
            class:quiet={r.dim}
            onpointerenter={() => (over = r.pi)}
            onpointerleave={() => (over = NONE)}
            onclick={() => (proc = proc === r.pi ? NONE : r.pi)}
            title="{r.mib >= 1000 ? mib(r.mib) : `${fmt(Math.round(r.mib))} MiB`}{chip >= 0 ? ' on this chip' : ''} · click to light up its share on every chip"
          >
            <span class="n">{r.name}</span>
            <span class="track"><i style="transform: scaleX({(r.mib / r.max).toFixed(3)})"></i></span>
            <b>{r.mib >= 1000 ? mib(r.mib) : `${fmt(Math.round(r.mib))} MiB`}</b>
          </button>
        {/each}
      </div>
      <p class="io-foot">{listFoot}</p>
      {#if chip >= 0}
        <button class="clear" onclick={() => (chip = -1)}>show every process again</button>
      {/if}
    </div>
  </div>
</div>

<style>
  .lv {
    position: absolute;
    inset: 0;
  }

  /* ---- the 12 chips ---- */
  .chips {
    position: absolute;
    display: grid;
  }
  .vchip {
    display: flex;
    flex-direction: column;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: var(--r-tile);
    background: var(--panel);
    box-shadow: inset 0 1px 0 var(--glass-hi), var(--shadow);
    backdrop-filter: blur(18px) saturate(1.25);
    color: var(--ink);
    text-align: left;
    overflow: hidden;
    transition: border-color 160ms ease, transform 200ms cubic-bezier(0.2, 0.75, 0.25, 1), opacity 200ms ease, box-shadow 200ms ease;
  }
  .vchip:hover {
    border-color: var(--accent);
    transform: translateY(-2px);
  }
  .vchip.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent), 0 0 22px color-mix(in srgb, var(--accent) 30%, transparent);
  }
  .vchip.dim {
    opacity: 0.6;
  }
  .hd {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 28px;
    padding: 0 12px;
    font: 600 10.5px var(--font-mono);
    letter-spacing: 0.1em;
  }
  .hd b {
    color: var(--ink2);
  }
  .hd i {
    font-style: normal;
    color: var(--ink3);
  }
  .body {
    display: flex;
    flex: 1;
    flex-direction: column;
    justify-content: flex-end;
    gap: 6px;
    padding: 10px 12px 11px;
    min-height: 0;
  }
  .pct {
    font: 300 30px/1 var(--font-ui);
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    color: #fff;
    text-shadow: 0 1px 6px rgba(0, 0, 0, 0.6);
  }
  .pct i {
    font-style: normal;
    font-size: 14px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.72);
    margin-left: 3px;
  }
  .bar {
    display: flex;
    height: 10px;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.14);
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: background 140ms ease;
  }
  /* the hovered or pinned process lights up on every chip */
  .bar i.lit {
    background: #fff;
    box-shadow: 0 0 8px rgba(255, 255, 255, 0.8);
  }
  .mib {
    font: 500 10.5px var(--font-mono);
    color: rgba(255, 255, 255, 0.82);
    white-space: nowrap;
  }

  .where {
    position: absolute;
    transform: translateX(-50%);
    white-space: nowrap;
  }
  .tiles {
    position: absolute;
    display: flex;
    gap: 12px;
  }
  .tiles .io-tile {
    flex: 1 1 0;
    min-width: 0;
  }
  .accent {
    color: var(--accent);
    text-shadow: 0 0 18px var(--accent-glow);
  }
  .gwrap {
    position: absolute;
  }

  .col {
    position: absolute;
    bottom: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .col > :global(.io-list) {
    margin-top: 4px;
  }
  .col :global(.io-row.quiet) {
    color: var(--ink3);
  }
  .col .io-tile > .io-foot {
    margin-top: 8px;
    font-size: 10.5px;
    line-height: 1.45;
    color: var(--ink3);
  }
  .clear {
    margin-top: 8px;
    height: 28px;
    padding: 0 11px;
    border-radius: 999px;
    border: 1px solid var(--line2);
    background: var(--panel2);
    color: var(--ink2);
    font-size: 11.5px;
    font-weight: 600;
    white-space: nowrap;
    transition: border-color 140ms ease, color 140ms ease, transform 160ms ease;
  }
  .clear:hover {
    border-color: var(--accent);
    color: var(--ink);
  }
</style>
