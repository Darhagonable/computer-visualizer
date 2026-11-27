<script lang="ts">
  /**
   * Performance — "how is the hardware doing?": the device page of one resource, and its shape
   * never changes: header + graph → memory composition → device view → statistics. It is Task
   * Manager's own view of a section (its `own` page in the part views): a part clicked in its
   * device view opens the shared part view below it, and Esc climbs back to this page.
   *
   * The processor, the memory and the GPU come from the mock machine; the drives from its
   * storage model (`app.tele.storage`). The reading guide of what the page colours is the mode
   * row above it, so nothing here states it again.
   */
  import { app, getMachine } from '../../mock/store.svelte';
  import { MIB_PER_BLOCK, State, Use, fmtInt } from '../../mock/model';
  import { TRUTH, TRUTH_NOTE, type DriveLive } from '../../mock/telemetry';
  import type { Level } from '../../levels/nav';
  import TruthChip from '../../levels/TruthChip.svelte';
  import AreaGraph from '../../scene/AreaGraph.svelte';
  import { capPair, capShort, mbs, shortModel } from '../../scene/Drive.svelte';
  import Glyph from './Glyph.svelte';
  import DeviceView from './DeviceView.svelte';
  import { EMPTY_CELL, RESOURCES, bytesParts, dash, fmtUptime, windowSize, type ResId, type StatCell } from './resources';

  let { res, onnavigate }: { res: ResId; onnavigate: (l: Level) => void } = $props();

  const m = getMachine();
  const meta = $derived(RESOURCES.find((r) => r.id === res) ?? RESOURCES[0]);
  const st = $derived(app.stats);
  const cores = $derived(app.cpu?.cores ?? []);
  const totalMiB = m.total * MIB_PER_BLOCK;
  /** The mock GPU. */
  const gpu = $derived(app.tele?.gpu ?? null);
  /** The drives, fresh every tick: the readings are mutated in place and `app.tele` keeps its identity. */
  const drives = $derived.by(() => {
    void app.version;
    return app.tele?.storage ?? [];
  });

  const last = (v: number[]) => v[v.length - 1] ?? 0;
  const fmtMiB = (v: number) => bytesParts(v).join(' ');

  /** One series per resource, all cut to the same 60 s window. */
  const live = $derived.by(() => {
    const n = Math.min(windowSize(), app.tick + 1);
    const cut = (v: number[]) => v.slice(-n);
    return {
      cpu: cut(app.hist.cpu),
      memory: cut(app.hist.mem),
      // the store's ring is the busiest drive's busy time
      disk: cut(app.hist.storage),
      // the mock GPU's 3D load and temperature rings
      gpu: cut(app.hist.gpu),
      gpuTemp: cut(app.hist.gpuTemp),
    };
  });

  const series = $derived(live[res]);
  /** The busiest drive: its active time is the page's figure and its ring the graph. */
  const busiest = $derived(drives.reduce<DriveLive | null>((a, d) => (!a || d.busyPct > a.busyPct ? d : a), null));

  const yMax = 100;
  const cur = $derived(res === 'disk' ? Math.round(busiest?.busyPct ?? 0) : Math.round(last(series)));
  /** Seconds of history actually on screen (the rings start empty). */
  const spanS = $derived(Math.round(((series.length - 1) * app.tickMs) / 1000));
  const lo = $derived(Math.round(Math.min(...series)));
  const hi = $derived(Math.round(Math.max(...series)));
  /** Active + Modified — the store's definition of "in use", shared by every UX. */
  const inUseBlocks = $derived(st?.inUse ?? 0);

  const caption = $derived.by(() => {
    switch (res) {
      case 'cpu':
        return `utilization · ${cores.length} logical processors`;
      case 'memory':
        return st ? `in use · ${fmtMiB(inUseBlocks * MIB_PER_BLOCK)} of ${fmtMiB(totalMiB)}` : '';
      case 'disk': {
        const n = drives.length;
        return busiest ? `active time · ${n > 1 ? `the busiest of ${n} drives: ${shortModel(busiest.model)}` : shortModel(busiest.model)}` : '';
      }
      case 'gpu':
        return 'utilization · 3D engine';
    }
  });

  /**
   * Fixed cells in columns — two for every resource (live numbers left, slower facts right).
   * The GPU has three, so its thirteen figures fit the same five rows; the drives have one each:
   * the first cell of a column names the drive and says how full it is.
   */
  const stats = $derived.by((): StatCell[][] => {
    const t = app.tick;
    const gb = (blocks: number): [string, string] => bytesParts(blocks * MIB_PER_BLOCK);
    const cell = (label: string, value: string | number, unit?: string, extra: Partial<StatCell> = {}): StatCell => ({ label, value: String(value), unit, ...extra });

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
          // the mock has processes and threads, but no handle table: nothing is shown in its place
          dash('Handles'),
        ],
        [cell('Up time', fmtUptime(t * app.tickMs)), cell('Cores', cores.length), cell('Logical processors', cores.length), cell('Sockets', 1), EMPTY_CELL],
      ];
    }
    // ---- GPU: engines, VRAM, sensors, power and clocks ----
    if (res === 'gpu' && gpu) {
      const pc = (v: number) => String(Math.round(v));
      const gbMiB = (mib: number) => bytesParts(mib)[0];
      return [
        [
          cell('Utilization', Math.round(last(live.gpu)), '%', { note: '3D engine load — the graph above' }),
          cell('3D', pc(gpu.engines['3d']), '%'),
          cell('Copy', pc(gpu.engines.copy), '%'),
          cell('Video decode', pc(gpu.engines.decode), '%'),
          cell('Video encode', pc(gpu.engines.encode), '%'),
        ],
        [
          cell('Dedicated memory', `${gbMiB(gpu.vramUsedMiB)} / ${gbMiB(gpu.vramTotalMiB)}`, 'GB', {
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
          cell('Power', `${pc(gpu.power)} / ${gpu.powerLimit}`, 'W', { note: 'Board power, of the power limit — measured. The split per die unit is estimated.' }),
          cell('Core clock', fmtInt(gpu.clockMhz), 'MHz'),
          cell('Memory clock', fmtInt(gpu.memClockMhz), 'MHz'),
          // 14 cells in all: 5 + 5 + 4 here
          EMPTY_CELL,
        ],
      ];
    }
    // ---- drives: a column each. Busy time, rates and an NVMe drive's temperature are measured,
    //      the watts estimated, a drive without a sensor "no data" — the words are telemetry.ts's ----
    if (res === 'disk') {
      return drives.map((d) => [
        cell(shortModel(d.model), capShort(d.usedGiB, d.totalGiB), undefined, {
          note: `${d.model} · ${d.bus} · ${capPair(d.usedGiB, d.totalGiB)} in use · ${d.partitions.length} ${d.partitions.length === 1 ? 'partition' : 'partitions'}`,
        }),
        cell('Active time', Math.round(d.busyPct), '%', { truth: TRUTH.activity.storage, note: 'Share of time the drive had a request outstanding' }),
        cell('Read / write', `${mbs(d.readBps)} / ${mbs(d.writeBps)}`.replaceAll(' MB/s', ''), 'MB/s', { truth: TRUTH.activity.storage }),
        d.tempC !== null
          ? cell('Temperature', d.tempC.toFixed(1), '°C', { truth: TRUTH.temperature.storage, note: "this drive's own sensor" })
          : { label: 'Temperature', value: '—', unit: 'no sensor', note: 'This drive has no temperature sensor — no data, never a guess' },
        cell('Power', `≈ ${d.power.toFixed(1)}`, 'W', { truth: TRUTH.power.storage, note: TRUTH_NOTE.power.storage }),
      ]);
    }
    return [];
  });

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
</script>

<div class="perf">
  <!-- 1 · header: icon + name + big number + live graph -->
  <header class="head">
    <div class="who">
      <div class="ident">
        <span class="tm-tile tile" style:--rc={meta.color}><Glyph name={meta.icon} size={22} /></span>
        <h2>{meta.label}</h2>
      </div>
      <div class="big">
        <b>{cur}</b><i>{meta.unit}</i>
        <!-- utilization, memory in use, active time, an engine's load: counters and lists, read from the system -->
        <TruthChip truth="measured" />
      </div>
      <p class="cap">{caption}</p>
      <p class="range"><span>{spanS} s range</span><b>{lo}</b><span class="dash">–</span><b>{hi}</b><i>%</i></p>
    </div>
    <div class="plot">
      <div class="plotarea"><AreaGraph values={series} max={yMax} min={0} color={meta.color} readout="none" /></div>
      <div class="y" aria-hidden="true"><span>{yMax} %</span><span>0</span></div>
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

  <!-- 3 · the device: its drawing is a door into its part views -->
  <DeviceView {res} {onnavigate} gpuTemp={live.gpuTemp} />

  <!-- 4 · numbers, always in the same cells -->
  <section class="stats" class:flat={stats.length > 2} class:truths={res === 'disk'} aria-label="Statistics">
    {#each stats as col, ci (ci)}
      <dl class="col">
        {#each col as s, i (i)}
          <div class="cell" class:dash={s.value === '—'} class:blank={!s.label} title={s.note}>
            <dt>{s.label}</dt>
            <dd>
              {s.value}{#if s.unit}<i>{s.unit}</i>{/if}{#if s.truth}<TruthChip truth={s.truth} />{/if}
            </dd>
          </div>
        {/each}
      </dl>
    {/each}
  </section>
</div>

<style>
  /* The device page: one skeleton for every resource, laid out from its own width and height. */
  .perf {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 8px 16px 12px 20px;
    overflow: hidden;
    container-type: inline-size;
    color: var(--ink);
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
    gap: 6px;
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
  /* the word that belongs to the figure, as the side menu shows it beside its own */
  .big :global(.tc) {
    align-self: center;
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
    /* the graph · its time axis */
    grid-template-columns: minmax(0, 1fr) 46px;
    grid-template-rows: minmax(78px, 1fr) 18px;
    column-gap: 8px;
  }
  .plotarea {
    position: relative;
    min-height: 0;
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

  /* ---- 4 · statistics grid ---- */
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
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 5px;
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
  /* The GPU and the drives have three columns of cells — the same five rows as every other
     resource. The `dl`s dissolve so the cells flow column by column through one grid; the subgrid
     gap inside a cell (label ↔ value) is narrower than the gap between two columns of cells. */
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
  /* A drive's column carries its truth words beside the values: a wider value column for them. */
  .stats.truths {
    column-gap: 20px;
    grid-template-columns: repeat(3, minmax(0, 1fr) 176px);
  }
  /* Below this the 132 px value column would clip labels such as "Dedicated memory". */
  @container (max-width: 840px) {
    .stats.flat {
      grid-template-columns: repeat(3, minmax(0, 1fr) 96px);
      column-gap: 16px;
    }
  }
  @container (max-width: 1040px) {
    .stats.truths {
      grid-template-columns: repeat(3, minmax(0, 1fr) 164px);
    }
  }

  /* ---- heights: what gives way as the window gets shorter ---- */
  /* Short viewports (720p class): trade the range line for device-view height, and the
     composition strip becomes one line — its label, its bar and its four parts side by side —
     where the mode row above the page takes a share of the card. It comes last, so that it wins
     over the width rules above, which set the legend out two by two. */
  @media (max-height: 780px) {
    .range {
      display: none;
    }
    .who {
      padding-top: 4px;
    }
    .plot {
      grid-template-rows: minmax(64px, 1fr) 16px;
    }
    .perf {
      gap: 8px;
      padding-top: 4px;
    }
    .comp {
      grid-template-columns: auto minmax(0, 1fr);
      column-gap: 20px;
      padding: 6px 0 8px;
    }
    .compbody {
      display: grid;
      grid-template-columns: minmax(120px, 0.7fr) minmax(0, 2.3fr);
      gap: 18px;
      align-items: center;
    }
    .clegend {
      display: flex;
      flex-wrap: nowrap;
      justify-content: flex-start;
      gap: 3px 16px;
    }
    .clegend li {
      grid-template-columns: 10px auto auto auto auto;
    }
    .clegend b {
      justify-self: start;
    }
    .clegend em.pct {
      min-width: 0;
      text-align: left;
    }
    .stats {
      padding-top: 8px;
    }
    .col {
      row-gap: 2px;
    }
  }
  /* Very short viewports (a 600 px-tall window, where the mode row above is compact too): the
     header hands back what the device view needs — no caption. */
  @media (max-height: 640px) {
    .perf {
      gap: 6px;
    }
    .cap {
      display: none;
    }
    .comp {
      padding: 5px 0 7px;
    }
  }

  /* ---- widths below what this layout now has (a window narrower than 1024 px) ---- */
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
  /* A narrow page: a slimmer identity column. */
  @container (max-width: 720px) {
    .head,
    .comp {
      grid-template-columns: 208px minmax(0, 1fr);
      column-gap: 16px;
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
  /* Very narrow: the legend takes one item per row rather than clipping. */
  @container (max-width: 560px) {
    .clegend {
      grid-template-columns: 1fr;
    }
  }

</style>
