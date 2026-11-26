<script lang="ts">
  /**
   * Performance — "how is the hardware doing?". Master (the resource list) → detail, and the
   * detail never changes shape: header + graph → memory composition → device view → stats grid.
   * CPU, Memory and GPU come from the mock machine (and take the global overlay modes);
   * disk / Ethernet are local mock sensors without a scene.
   */
  import { tick } from 'svelte';
  import { app, getMachine } from '../../mock/store.svelte';
  import { MIB_PER_BLOCK, State, Use, fmtInt } from '../../mock/model';
  import AreaGraph from '../../scene/AreaGraph.svelte';
  import ModeSwitch from '../../scene/ModeSwitch.svelte';
  import Sparkline from '../../scene/Sparkline.svelte';
  import Glyph from './Glyph.svelte';
  import DeviceView from './DeviceView.svelte';
  import {
    RESOURCES,
    OVERLAY,
    bytesParts,
    dash,
    EMPTY_CELL,
    fmtUptime,
    mockHandles,
    isResId,
    mockSeries,
    niceMax,
    split,
    windowSize,
    type ResId,
    type StatCell,
  } from './resources';

  let { res, onselect }: { res: ResId; onselect: (r: ResId) => void } = $props();
  const m = getMachine();
  let listEl: HTMLUListElement;
  let detailEl = $state<HTMLElement>();

  const meta = $derived(RESOURCES.find((r) => r.id === res) ?? RESOURCES[0]);
  const st = $derived(app.stats);
  const cores = $derived(app.cpu?.cores ?? []);
  const totalMiB = m.total * MIB_PER_BLOCK;
  /** The component whose ramp this resource's scene paints with — null: no scene, no overlay. */
  const overlay = $derived(OVERLAY[res] ?? null);
  /**
   * "Pages" is memory-only. CpuDie and GpuCard fall back to temperature when it is on, so
   * the control here must say so too (the shared switch only compares against `app.mode`).
   */
  const fallback = $derived(overlay !== null && overlay !== 'memory' && app.mode === 'pages');

  /** Below this detail-pane width the full mode switch no longer fits above the graph: dots only. */
  const COMPACT_BELOW = 600;
  let paneW = $state(Infinity);
  $effect(() => {
    const el = detailEl;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => (paneW = e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  });
  const compactSwitch = $derived(paneW < COMPACT_BELOW);

  const last = (v: number[]) => v[v.length - 1] ?? 0;
  const fmtMiB = (v: number) => bytesParts(v).join(' ');
  const ymaxOf = (id: ResId, v: number[]) => (id === 'ethernet' ? niceMax(v, 100) : 100);

  /** One series per resource, all cut to the same 60 s window so the graphs line up. */
  const live = $derived.by(() => {
    const n = Math.min(windowSize(), app.tick + 1);
    const cut = (v: number[]) => v.slice(-n);
    return {
      cpu: cut(app.hist.cpu),
      memory: cut(app.hist.mem),
      disk: mockSeries('disk', app.tick, n),
      ethernet: mockSeries('ethernet', app.tick, n),
      // the mock GPU's 3D load and temperature rings
      gpu: cut(app.hist.gpu),
      gpuTemp: cut(app.hist.gpuTemp),
    };
  });

  const series = $derived(live[res]);
  const ymax = $derived(ymaxOf(res, series));
  const yUnit = $derived(res === 'ethernet' ? 'Mbps' : '%');
  const cur = $derived(Math.round(last(series)));
  /** Seconds of history actually on screen (the rings start empty). */
  const spanS = $derived(Math.round(((series.length - 1) * app.tickMs) / 1000));
  const lo = $derived(Math.round(Math.min(...series)));
  const hi = $derived(Math.round(Math.max(...series)));
  /** Active + Modified — the store's definition of "in use", shared by every UX. */
  const inUseBlocks = $derived(st?.inUse ?? 0);
  /** The mock GPU (new object every tick). */
  const gpu = $derived(app.tele?.gpu ?? null);

  /** What the mock sensors imply right now (rates in MB/s and Mbps). */
  const io = $derived.by(() => {
    const t = app.tick;
    const diskRate = last(live.disk) * 2.4; // transfer rate while 100 % active
    const net = last(live.ethernet);
    const [rd, wr] = split(diskRate, t, 0.4, 1.7);
    const [send, recv] = split(net, t, 1.1, 2.9);
    return { rd, wr, net, send, recv };
  });

  const caption = $derived.by(() => {
    switch (res) {
      case 'cpu':
        return `utilization · ${cores.length} logical processors`;
      case 'memory':
        return st ? `in use · ${fmtMiB(inUseBlocks * MIB_PER_BLOCK)} of ${fmtMiB(totalMiB)}` : '';
      case 'disk':
        return `active time · reading ${io.rd.toFixed(1)} MB/s · writing ${io.wr.toFixed(1)} MB/s`;
      case 'ethernet':
        return `throughput · sending ${Math.round(io.send)} Mbps · receiving ${Math.round(io.recv)} Mbps`;
      case 'gpu':
        return gpu ? `utilization · 3D engine · ${gpu.temp.toFixed(1)} °C` : 'utilization · 3D engine';
    }
  });

  function subOf(id: ResId): string {
    if (id === 'cpu') return `${cores.length} logical processors`;
    if (id === 'memory') {
      const [an] = bytesParts(inUseBlocks * MIB_PER_BLOCK);
      const [tn, tu] = bytesParts(totalMiB);
      return `${an} of ${tn} ${tu} in use`;
    }
    if (id === 'gpu' && gpu) {
      const [un] = bytesParts(gpu.vramUsedMiB);
      const [tn, tu] = bytesParts(gpu.vramTotalMiB);
      return `${un} of ${tn} ${tu} VRAM`;
    }
    return 'generated locally';
  }

  /**
   * Fixed cells in columns — two for every resource (live numbers left, slower facts right);
   * the GPU has three, so its thirteen figures fit the same five rows.
   */
  const stats = $derived.by((): StatCell[][] => {
    const t = app.tick;
    const gb = (blocks: number): [string, string] => bytesParts(blocks * MIB_PER_BLOCK);
    const cell = (label: string, value: string | number, unit?: string, extra: Partial<StatCell> = {}): StatCell => ({ label, value: String(value), unit, ...extra });
    const peak = (v: number[]) => Math.round(Math.max(0, ...v));

    if (res === 'memory' && st) {
      // Resident commit-backed pages: the mock has no commit charge or limit.
      const commit =
        st.byUse[Use.ProcessPrivate] + st.byUse[Use.PagefileMapped] + st.byUse[Use.SessionPrivate] + st.byUse[Use.AWE] + st.byUse[Use.PagedPool];
      return [
        [
          cell('In use', ...gb(st.inUse), { note: 'Active + modified pages — the same definition in every UX' }),
          cell('Committed', ...gb(commit), { note: 'Resident commit-backed pages — the mock has no commit limit' }),
          cell('Cached', ...gb(st.byState[State.Standby]), { note: 'Standby list: cached file data, reclaimable at any time' }),
          cell('Paged pool', ...gb(st.byUse[Use.PagedPool])),
          cell('Non-paged pool', ...gb(st.byUse[Use.NonPagedPool])),
        ],
        [cell('Speed', m.dimms[0].speedMts, 'MT/s'), cell('Slots used', `${m.dimms.length} of ${m.slots.length}`), cell('Form factor', 'UDIMM'), dash('Hardware reserved'), EMPTY_CELL],
      ];
    }
    if (res === 'cpu' && st) {
      const alive = m.processes.filter((p) => p.alive);
      const threads = alive.reduce((s, p) => s + p.threads, 0);
      const ghz = cores.length ? cores.reduce((s, c) => s + c.freq, 0) / cores.length : 0;
      return [
        [
          cell('Utilization', Math.round(last(live.cpu)), '%'),
          cell('Speed', ghz.toFixed(2), 'GHz'),
          cell('Processes', fmtInt(alive.length)),
          cell('Threads', fmtInt(threads)),
          cell('Handles', fmtInt(mockHandles(threads, m.seed, t)), undefined, { mock: true, note: 'The mock has no handle table — a stable stand-in' }),
        ],
        [cell('Up time', fmtUptime(t * app.tickMs)), cell('Cores', cores.length), cell('Logical processors', cores.length), cell('Sockets', 1), EMPTY_CELL],
      ];
    }
    // ---- GPU: a mock component — engines, VRAM, sensors, power and clocks ----
    // Three columns of five cells (the same height as every other resource's grid).
    if (res === 'gpu' && gpu) {
      const pc = (v: number) => String(Math.round(v));
      const gb = (mib: number) => bytesParts(mib)[0];
      return [
        [
          cell('Utilization', Math.round(last(live.gpu)), '%', { note: '3D engine load — the graph above' }),
          cell('3D', pc(gpu.engines['3d']), '%'),
          cell('Copy', pc(gpu.engines.copy), '%'),
          cell('Video decode', pc(gpu.engines.decode), '%'),
          cell('Video encode', pc(gpu.engines.encode), '%'),
        ],
        [
          cell('Dedicated memory', `${gb(gpu.vramUsedMiB)} / ${gb(gpu.vramTotalMiB)}`, 'GB', {
            note: 'Per-process GPU memory plus driver and desktop composition overhead',
          }),
          cell('GPU temperature', gpu.temp.toFixed(1), '°C', {
            note: 'Sensor reading. How it spreads across the die — the colour of the units — is modelled.',
          }),
          cell('Hotspot', pc(gpu.hotspot), '°C', { note: 'Sensor reading' }),
          cell('VRAM temperature', pc(gpu.vramTemp), '°C', { note: 'Sensor reading' }),
          cell('Fan', pc(gpu.fanPct), '%', { note: `${fmtInt(gpu.fanRpm)} rpm` }),
        ],
        [
          cell('Power', `${pc(gpu.power)} / ${gpu.powerLimit}`, 'W', { note: 'Board power, of the power limit. The split per die unit is estimated.' }),
          cell('Core clock', fmtInt(gpu.clockMhz), 'MHz'),
          cell('Memory clock', fmtInt(gpu.memClockMhz), 'MHz'),
          // 14 cells in all: 5 + 5 + 4 here, or 7 + 7 in a narrow pane
          EMPTY_CELL,
        ],
      ];
    }
    // ---- mock sensors: live numbers only; device facts are honestly absent ----
    if (res === 'disk') {
      return [
        [
          cell('Active time', Math.round(last(live.disk)), '%'),
          cell('Read', io.rd.toFixed(1), 'MB/s'),
          cell('Write', io.wr.toFixed(1), 'MB/s'),
          cell('Idle time', 100 - Math.round(last(live.disk)), '%'),
          cell('Peak active (60 s)', peak(live.disk), '%'),
        ],
        [dash('Capacity'), dash('Media type'), dash('File system'), EMPTY_CELL, EMPTY_CELL],
      ];
    }
    if (res === 'ethernet') {
      return [
        [
          cell('Throughput', Math.round(io.net), 'Mbps'),
          cell('Send', Math.round(io.send), 'Mbps'),
          cell('Receive', Math.round(io.recv), 'Mbps'),
          cell('Idle time', idlePct(live.ethernet, 1), '%'),
          cell('Peak (60 s)', peak(live.ethernet), 'Mbps'),
        ],
        [dash('Link speed'), dash('Adapter'), dash('IPv4 address'), EMPTY_CELL, EMPTY_CELL],
      ];
    }
    return [];
  });

  function idlePct(v: number[], below: number): number {
    return v.length ? Math.round((v.filter((x) => x < below).length / v.length) * 100) : 0;
  }

  /** Live bars for the illustrative device view of a mock sensor. */
  const bars = $derived.by(() => {
    const b = (label: string, pct: number, text: string) => ({ label, pct: Math.max(1, Math.min(100, pct)), text });
    if (res === 'disk') return [b('Read', (io.rd / 240) * 100, `${io.rd.toFixed(1)} MB/s`), b('Write', (io.wr / 240) * 100, `${io.wr.toFixed(1)} MB/s`)];
    if (res === 'ethernet') return [b('Send', (io.send / ymax) * 100, `${Math.round(io.send)} Mbps`), b('Receive', (io.recv / ymax) * 100, `${Math.round(io.recv)} Mbps`)];
    return [];
  });
  const busy = $derived(res === 'disk' ? last(live.disk) > 12 : res === 'ethernet' ? last(live.ethernet) > 120 : false);

  /** Memory composition — four disjoint page lists that add up to the whole board. */
  const comp = $derived.by(() => {
    if (!st) return [];
    const seg = (label: string, blocks: number, c: string) => {
      const [n, unit] = bytesParts(blocks * MIB_PER_BLOCK);
      return { label, n, unit, c, pct: (blocks / st.total) * 100 };
    };
    return [
      seg('Active', st.byState[State.Active], 'var(--c-private)'),
      seg('Modified', st.byState[State.Modified], 'var(--c-modified)'),
      seg('Standby', st.byState[State.Standby], 'color-mix(in srgb, var(--c-private) 36%, var(--panel))'),
      seg('Free', st.byState[State.Free] + st.byState[State.Zeroed], 'var(--c-free)'),
    ];
  });

  // Arrow keys walk the master list, starting from the item that has focus.
  function onListKey(e: KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const from = (e.currentTarget as HTMLElement).dataset.res;
    const i = Math.max(0, RESOURCES.findIndex((r) => r.id === (isResId(from) ? from : res)));
    const next = RESOURCES[(i + (e.key === 'ArrowDown' ? 1 : -1) + RESOURCES.length) % RESOURCES.length];
    onselect(next.id);
    tick().then(() => listEl?.querySelector<HTMLElement>(`[data-res="${next.id}"]`)?.focus());
  }
</script>

<div class="perf">
  <ul class="list" aria-label="Resources" bind:this={listEl}>
    {#each RESOURCES as r (r.id)}
      {@const v = live[r.id]}
      <li>
        <button
          class="res"
          class:on={res === r.id}
          data-res={r.id}
          onclick={() => onselect(r.id)}
          onkeydown={onListKey}
          aria-current={res === r.id ? 'true' : undefined}
          title="{r.label} — {r.mock ? 'mock sensor' : 'from the mock machine'}"
        >
          <span class="tm-tile tile" class:mock={r.mock} style:--rc={r.color}><Glyph name={r.icon} size={17} /></span>
          <span class="rname">{r.label}</span>
          <span class="rval">{Math.round(last(v))}<i>{r.unit}</i></span>
          {#if r.mock}
            <span class="rsub"><span class="tm-tag mock">mock sensor</span></span>
          {:else}
            <span class="rsub">{subOf(r.id)}</span>
          {/if}
          <span class="spark"><Sparkline values={v} max={ymaxOf(r.id, v)} color={r.color} width={176} height={26} /></span>
        </button>
      </li>
    {/each}
  </ul>

  <section class="detail" bind:this={detailEl}>
    <!-- 1 · header: icon + name + big number + live graph -->
    <header class="head">
      <div class="who">
        <div class="ident">
          <span class="tm-tile tile" class:mock={meta.mock} style:--rc={meta.color}><Glyph name={meta.icon} size={22} /></span>
          <h2>{meta.label}</h2>
          {#if meta.mock}<span class="tm-tag mock">mock sensor</span>{/if}
        </div>
        <div class="big"><b>{cur}</b><i>{meta.unit}</i></div>
        <p class="cap">{caption}</p>
        <p class="range"><span>{spanS} s range</span><b>{lo}</b><span class="dash">–</span><b>{hi}</b><i>{yUnit}</i></p>
      </div>
      <div class="plot" class:mbps={res === 'ethernet'}>
        <!-- what the colours of the scene below mean — global, so one control for the whole app -->
        <div class="modes">
          {#if overlay}
            <span class="modes-h">Colours</span>
            <span class="switch" class:fb={fallback}><ModeSwitch component={overlay} compact={compactSwitch} /></span>
          {:else}
            <span
              class="noscene"
              title="Disk and Ethernet are mock sensors: the mock has no scene for them, so there is nothing to colour by temperature, activity or power"
            >
              No colour overlay — the mock has no scene for this device
            </span>
          {/if}
        </div>
        <div class="plotarea"><AreaGraph values={series} max={ymax} min={0} color={meta.color} readout="none" /></div>
        <div class="y" aria-hidden="true"><span>{ymax} {yUnit}</span><span>0</span></div>
        <div class="x" aria-hidden="true"><span>{spanS} s ago</span><span>now</span></div>
      </div>
    </header>

    <!-- 2 · memory only: what the physical pages are doing -->
    {#if res === 'memory' && comp.length}
      <section class="comp" aria-label="Memory composition">
        <span class="comp-h">Memory composition</span>
        <div class="compbody">
          <div class="cbar">
            {#each comp as s, i (s.label)}<i style="width: {s.pct}%; background: {s.c}" class:tail={i === comp.length - 1}></i>{/each}
          </div>
          <ul class="clegend">
            {#each comp as s (s.label)}
              <li><i style="background: {s.c}"></i><span>{s.label}</span><b>{s.n}</b><em>{s.unit}</em><em class="pct">{Math.round(s.pct)}%</em></li>
            {/each}
          </ul>
        </div>
      </section>
    {/if}

    <!-- 3 · the device -->
    <DeviceView {res} {bars} {busy} gpuTemp={live.gpuTemp} />

    <!-- 4 · numbers, always in the same cells -->
    <section class="stats" class:flat={stats.length > 2} aria-label="Statistics">
      {#each stats as col, ci (ci)}
        <dl class="col">
          {#each col as s, i (i)}
            <div class="cell" class:dash={s.value === '—'} class:blank={!s.label} title={s.note}>
              <dt>{s.label}</dt>
              <dd>
                {s.value}{#if s.unit}<i>{s.unit}</i>{/if}{#if s.mock}<i class="mocknote">mock</i>{/if}
              </dd>
            </div>
          {/each}
        </dl>
      {/each}
    </section>
  </section>
</div>

<style>
  .perf {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 236px minmax(0, 1fr);
  }

  /* ---- master: the resource list ---- */
  .list {
    list-style: none;
    margin: 0;
    padding: 10px 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 0;
    overflow-y: auto;
    border-right: 1px solid var(--line);
  }
  .res {
    position: relative;
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) auto;
    grid-template-areas:
      'tile name val'
      'tile sub val'
      'spark spark spark';
    align-items: center;
    column-gap: 10px;
    row-gap: 0;
    width: 100%;
    padding: 9px 10px 8px 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--ink);
    text-align: left;
    transition: background 100ms ease;
  }
  .res:hover {
    background: color-mix(in srgb, var(--ink) 5%, transparent);
  }
  .res.on {
    background: color-mix(in srgb, var(--accent) 11%, transparent);
  }
  .res.on::before {
    content: '';
    position: absolute;
    left: 0;
    top: 10px;
    bottom: 10px;
    width: 3px;
    border-radius: 2px;
    background: var(--accent);
  }
  .res:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .tile {
    grid-area: tile;
    width: 28px;
    height: 28px;
  }
  .rname {
    grid-area: name;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rsub {
    grid-area: sub;
    min-height: 18px;
    min-width: 0;
    overflow: hidden;
    font-size: 11px;
    color: var(--ink3);
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .rval {
    grid-area: val;
    align-self: end;
    font-size: 13px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .rval i {
    margin-left: 2px;
    font-style: normal;
    font-size: 10.5px;
    font-weight: 500;
    color: var(--ink3);
  }
  .spark {
    grid-area: spark;
    display: block;
    margin-top: 5px;
  }
  .spark :global(svg) {
    width: 100%;
    height: 26px;
  }

  /* ---- detail: one skeleton for every resource ---- */
  .detail {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 8px 16px 12px 20px;
    overflow: hidden;
    container-type: inline-size;
  }
  .head {
    flex: none;
    display: grid;
    grid-template-columns: 296px minmax(0, 1fr);
    column-gap: 24px;
    align-items: stretch;
  }
  .who {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding-top: 8px;
  }
  .ident {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .ident .tile {
    width: 32px;
    height: 32px;
  }
  h2 {
    font-size: 15px;
    font-weight: 600;
    white-space: nowrap;
  }
  .big {
    display: flex;
    align-items: baseline;
    gap: 4px;
    margin-top: 4px;
    line-height: 1;
  }
  .big b {
    font-size: 40px;
    font-weight: 600;
    line-height: 1.05;
    letter-spacing: -0.01em;
    font-variant-numeric: tabular-nums;
  }
  .big i {
    font-style: normal;
    font-size: 18px;
    font-weight: 600;
    color: var(--ink2);
  }
  .cap {
    margin-top: 6px;
    font-size: 12px;
    color: var(--ink2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* Sits on the graph's baseline: the band the window actually covered. */
  .range {
    display: flex;
    align-items: baseline;
    gap: 5px;
    margin-top: auto;
    padding-top: 4px;
    color: var(--ink3);
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .range span {
    margin-right: 4px;
  }
  .range b {
    color: var(--ink);
    font-weight: 600;
    font-size: 12px;
  }
  .range i {
    font-style: normal;
    margin-left: 1px;
  }
  .plot {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 46px;
    /* what-the-colours-mean control · the graph · its time axis */
    grid-template-rows: 42px minmax(78px, 1fr) 18px;
    column-gap: 8px;
  }
  /* Throughput labels ("1000 Mbps") are wider than "100 %". */
  .plot.mbps {
    grid-template-columns: minmax(0, 1fr) 60px;
  }
  .plotarea {
    position: relative;
    min-height: 0;
  }
  /* The mode switch (36 px tall) sits at the header's top-right — below the floating controls,
     which own the top-right `--chrome-safe` × 42 px of the window. The 6 px under it keep the
     graph's "100 %" label clear of the switch. */
  .modes {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 14px;
    min-width: 0;
    height: 42px;
    padding-bottom: 6px;
  }
  .modes-h,
  .noscene {
    color: var(--ink3);
    font-size: 11.5px;
    white-space: nowrap;
  }
  .noscene {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .switch {
    display: inline-flex;
    flex: none;
  }
  /* "Pages" is memory-only: CpuDie and GpuCard paint temperature while it is on, so point at
     Temperature. The shared switch only compares with `app.mode`, hence the nudge. */
  .switch.fb :global(button.on:disabled) {
    background: transparent;
    box-shadow: none;
  }
  .switch.fb :global(button[title^='Temperature']) {
    color: var(--ink);
    background: var(--panel2);
    box-shadow: inset 0 0 0 1px var(--line2);
  }
  .y {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    font-size: 10.5px;
    font-variant-numeric: tabular-nums;
    color: var(--ink3);
    white-space: nowrap;
  }
  /* Both labels sit just inside the graph's top and bottom lines: the top one used to straddle
     the line, where the mode switch now is. */
  .y span:first-child {
    margin-top: 1px;
  }
  .y span:last-child {
    margin-bottom: 1px;
  }
  .x {
    grid-column: 1 / -1;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    font-size: 10.5px;
    font-variant-numeric: tabular-nums;
    color: var(--ink3);
  }

  /* ---- 2 · memory composition ---- */
  .comp {
    flex: none;
    display: grid;
    grid-template-columns: 296px minmax(0, 1fr);
    column-gap: 24px;
    align-items: center;
    padding: 8px 0 10px;
    border-bottom: 1px solid var(--line);
  }
  .comp-h {
    font-size: 12px;
    font-weight: 600;
  }
  .compbody {
    display: grid;
    gap: 7px;
    min-width: 0;
  }
  .cbar {
    display: flex;
    height: 10px;
    border-radius: 5px;
    overflow: hidden;
    background: var(--line);
  }
  .cbar i {
    display: block;
    height: 100%;
    transition: width 400ms ease;
  }
  .cbar i.tail {
    border-radius: 0 5px 5px 0;
  }
  .clegend {
    /* spread along the bar, wrapping to a second row when the pane is too narrow */
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 3px 20px;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .clegend li {
    display: grid;
    /* swatch · label · value · unit · share */
    grid-template-columns: 10px auto auto auto auto;
    align-items: baseline;
    column-gap: 6px;
    font-size: 12px;
    color: var(--ink2);
    white-space: nowrap;
  }
  .clegend i {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    align-self: center;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 12%, transparent);
  }
  .clegend b {
    color: var(--ink);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .clegend em {
    font-style: normal;
    font-size: 11px;
    color: var(--ink3);
  }
  .clegend em.pct {
    min-width: 26px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  /* ---- 4 · stats grid ---- */
  .stats {
    flex: none;
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 32px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
  }
  .col {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 132px;
    column-gap: 12px;
    row-gap: 3px;
    margin: 0;
    min-width: 0;
  }
  .cell {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
    align-items: baseline;
  }
  dt {
    color: var(--ink2);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  dd {
    margin: 0;
    text-align: right;
    color: var(--ink);
    font-size: 12.5px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  dd i {
    margin-left: 3px;
    font-style: normal;
    font-weight: 400;
    font-size: 11.5px;
    color: var(--ink3);
  }
  .cell.dash dd {
    color: var(--ink3);
    font-weight: 400;
  }
  .mocknote {
    margin-left: 5px;
    font-style: normal;
    font-weight: 400;
    font-size: 10.5px;
    color: var(--ink3);
  }
  /* The GPU has three columns of cells — the same five rows as every other resource. The `dl`s
     dissolve so the cells can flow column by column through one grid; the subgrid gap inside a
     cell (label ↔ value) is narrower than the gap between two columns of cells. */
  .stats.flat {
    grid-template-columns: repeat(3, minmax(0, 1fr) 132px);
    grid-template-rows: repeat(5, auto);
    grid-auto-flow: column;
  }
  .stats.flat .col {
    display: contents;
  }
  .stats.flat .cell {
    grid-column: span 2;
    column-gap: 12px;
  }
  /* Below this the 132 px value column would clip labels such as "Dedicated memory". */
  @container (max-width: 840px) {
    .stats.flat {
      grid-template-columns: repeat(3, minmax(0, 1fr) 96px);
      column-gap: 16px;
    }
  }

  @media (max-width: 1100px) {
    .perf {
      grid-template-columns: 208px minmax(0, 1fr);
    }
  }
  /* Short viewports (720p class): trade the range line for device-view height. */
  @media (max-height: 780px) {
    .range {
      display: none;
    }
    .who {
      padding-top: 4px;
    }
    .plot {
      grid-template-rows: 42px minmax(64px, 1fr) 16px;
    }
    .detail {
      gap: 8px;
      padding-top: 4px;
    }
    .comp {
      padding: 6px 0 8px;
    }
    .stats {
      padding-top: 8px;
    }
    .col {
      row-gap: 2px;
    }
  }
  /* Very short viewports (600 px-tall window): the header hands back what the device view needs. */
  @media (max-height: 640px) {
    .detail {
      gap: 6px;
    }
    .plot {
      /* the axis row keeps the label's line height: under it, a stretched graph would touch it */
      grid-template-rows: 36px minmax(58px, 1fr) 16px;
    }
    .modes {
      height: 36px;
      padding-bottom: 0;
    }
  }

  /* Too narrow for the four composition parts on one line: a tidy 2 × 2 instead of a ragged wrap. */
  @container (max-width: 939px) {
    .clegend {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px 20px;
    }
    .clegend li {
      grid-template-columns: 10px auto 1fr auto auto;
    }
    .clegend b {
      justify-self: end;
    }
    .clegend em.pct {
      min-width: 30px;
    }
  }
  /* A narrow detail pane: a slimmer identity column. */
  @container (max-width: 720px) {
    .head,
    .comp {
      grid-template-columns: 208px minmax(0, 1fr);
      column-gap: 16px;
    }
    .cap {
      white-space: normal;
    }
    .big b {
      font-size: 34px;
    }
    .stats {
      column-gap: 20px;
    }
    .col {
      grid-template-columns: minmax(0, 1fr) 104px;
    }
  }
  /* Too narrow for three columns of GPU cells with readable labels: two columns of seven. */
  @container (max-width: 664px) {
    .stats.flat {
      grid-template-columns: repeat(2, minmax(0, 1fr) 104px);
      grid-template-rows: repeat(7, auto);
    }
  }
  /* No room for the caption beside the full mode switch (dots-only below `COMPACT_BELOW`, in JS). */
  @container (max-width: 759px) {
    .modes-h {
      display: none;
    }
  }
  /* Very narrow: the legend takes one item per row rather than clipping. */
  @container (max-width: 560px) {
    .clegend {
      grid-template-columns: 1fr;
    }
  }
</style>
