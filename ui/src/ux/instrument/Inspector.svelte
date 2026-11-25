<script lang="ts">
  /**
   * Context panel. It follows the selection, most specific first:
   * hovered page → selected process → selected file → selected DIMM → the whole machine.
   */
  import {
    app,
    getMachine,
    stateName,
    useName,
    selectProcess,
    selectFile,
    selectDimm,
    setHighlight,
    trigger,
  } from '../../mock/store.svelte';
  import { fmtMiB, fmtInt, useFamilyIndex } from '../../mock/model';
  import Sparkline from '../../scene/Sparkline.svelte';

  const m = getMachine();
  const FAM_VAR = ['--c-private', '--c-file', '--c-pagefile', '--c-kernel'];
  const STATE_ROWS = [4, 3, 2, 1, 0];

  const st = $derived(app.stats);
  const h = $derived(app.hover?.d ?? null);
  const dimm = $derived(app.selectedDimm !== null ? (m.dimms[app.selectedDimm] ?? null) : null);
  const proc = $derived(app.selectedProcess !== null ? (st?.procs.find((p) => p.id === app.selectedProcess) ?? null) : null);
  const procDef = $derived(proc ? (m.processes.find((p) => p.id === proc.id) ?? null) : null);
  const file = $derived(app.selectedFile !== null ? (m.files.find((f) => f.id === app.selectedFile) ?? null) : null);
  const fileStat = $derived(file && st ? (st.byOwner[String(file.id)] ?? null) : null);
  const title = $derived(h ? 'page' : proc ? 'process' : file ? 'file' : dimm ? 'module' : 'machine');

  const top = $derived(st ? [...st.procs].sort((a, b) => b.blocks - a.blocks).slice(0, 5) : []);
  const topFiles = $derived(
    st
      ? m.files.map((f) => ({ f, s: st.byOwner[String(f.id)] })).filter((x) => x.s).sort((a, b) => (b.s?.blocks ?? 0) - (a.s?.blocks ?? 0)).slice(0, 4)
      : [],
  );
  const procName = (id: number) => m.processes.find((p) => p.id === id)?.name ?? '?';
  const base = (p: string) => p.split('\\').pop() ?? p;
  const pct = (n: number) => (st ? ((n / st.total) * 100).toFixed(n / st.total < 0.095 ? 1 : 0) : '0');
  const mib = (v: number) => (v >= 1024 ? `${(v / 1024).toFixed(2)} GiB` : `${v.toFixed(0)} MiB`);
  const histMax = $derived(Math.max(1, ...app.procHist));

  function swatch(d: { state: number; use: number }): string {
    const fam = `var(${FAM_VAR[useFamilyIndex(d.use)]})`;
    switch (d.state) {
      case 0:
        return 'background: var(--c-zeroed)';
      case 1:
        return 'background: var(--c-free)';
      case 2:
        return `background: color-mix(in srgb, ${fam} 34%, transparent); box-shadow: inset 0 0 0 1px ${fam}`;
      case 3:
        return 'background: var(--c-modified)';
      case 5:
        return 'background: var(--c-bad)';
      default:
        return `background: ${fam}`;
    }
  }
  const stateSwatch = (s: number) => swatch({ state: s, use: 0 });
</script>

<div class="insp">
  <header><span>inspector</span><em>{title}</em></header>
  <div class="body">
    {#if h}
      <!-- hovered page -->
      <div class="where mono">{h.where}</div>
      <div class="big"><i class="sw" style={swatch(h)}></i>{stateName(h.state)}</div>
      <dl>
        <dt>used for</dt><dd>{useName(h.use)}</dd>
        <dt>owner</dt><dd class:kernel={h.owner.kind === 'kernel'}>{h.owner.name}{#if h.owner.shared}<span class="tag">shared</span>{/if}</dd>
        <dt>frame</dt><dd class="mono small">{h.pfn}</dd>
        <dt>covers</dt><dd>{h.size}</dd>
        {#if h.state === 2}<dt>priority</dt><dd>{h.priority} of 7</dd>{/if}
      </dl>
      <div class="acts">
        <button class:on={app.highlight?.kind === 'owner' && app.highlight.id === h.owner.id} onclick={() => setHighlight({ kind: 'owner', id: h.owner.id })}>
          highlight owner
        </button>
      </div>
    {:else if proc && procDef}
      <!-- selected process -->
      <div class="big">{procDef.name}</div>
      <div class="sub mono">pid {procDef.pid} · {procDef.threads} threads{proc.alive ? '' : ' · exited'}</div>
      <div class="tiles">
        <div><em>private</em><b>{fmtMiB(proc.blocks)}</b></div>
        <div><em>working set</em><b>{mib(proc.wsMiB)}</b></div>
        <div><em>cpu</em><b>{proc.cpuPct.toFixed(1)}%</b></div>
        <div><em>shared</em><b>{mib(proc.sharedMiB)}</b></div>
      </div>
      <div class="spark">
        <Sparkline values={app.procHist} max={histMax} color="var(--c-private)" width={292} height={38} />
        <em>owned pages · last {app.procHist.length} ticks</em>
      </div>
      <div class="stack">
        {#each [{ n: proc.active, l: 'active', c: 'var(--c-private)' }, { n: proc.modified, l: 'modified', c: 'var(--c-modified)' }, { n: proc.standby, l: 'standby', c: 'color-mix(in srgb, var(--c-private) 34%, transparent)' }] as s (s.l)}
          <div class="srow"><i style="background: {s.c}"></i><span>{s.l}</span><div class="bar"><i style="width:{(s.n / Math.max(1, proc.blocks)) * 100}%; background: {s.c}"></i></div><b class="num">{fmtMiB(s.n)}</b></div>
        {/each}
      </div>
      <div class="acts">
        <button class:on={app.highlight?.kind === 'owner' && app.highlight.id === proc.id} onclick={() => setHighlight(app.highlight?.kind === 'owner' && app.highlight.id === proc.id ? null : { kind: 'owner', id: proc.id })}>
          highlight pages
        </button>
        {#if proc.alive}
          <button class="danger" onclick={() => trigger('closeApp', procDef.name)}>close app · mock</button>
        {:else}
          <span class="note">exited — reset the mock to relaunch</span>
        {/if}
      </div>
    {:else if file && fileStat}
      <!-- selected file -->
      <div class="big break">{base(file.path)}</div>
      <div class="sub mono break">{file.path}</div>
      <div class="tiles">
        <div><em>in memory</em><b>{fmtMiB(fileStat.blocks)}</b></div>
        <div><em>active</em><b>{fmtMiB(fileStat.active)}</b></div>
        <div><em>standby</em><b>{fmtMiB(fileStat.standby)}</b></div>
        <div><em>modified</em><b>{fmtMiB(fileStat.modified)}</b></div>
      </div>
      <p class="note">
        {#if fileStat.standby > fileStat.active}Mostly standby: cached file data that is reclaimable at any time.{:else}Actively mapped — pages are in one or more working sets.{/if}
        {#if m.owners[file.id].shared} Mapped by several processes (shared).{/if}
      </p>
      <div class="acts">
        <button class:on={app.highlight?.kind === 'owner' && app.highlight.id === file.id} onclick={() => setHighlight(app.highlight?.kind === 'owner' && app.highlight.id === file.id ? null : { kind: 'owner', id: file.id })}>
          highlight pages
        </button>
      </div>
    {:else if dimm}
      <!-- selected DIMM -->
      <div class="big">{m.slots[dimm.slot].label}</div>
      <div class="sub">{dimm.manufacturer} · {dimm.type} · {dimm.speedMts} MT/s</div>
      <dl>
        <dt>capacity</dt><dd>{dimm.capacityGiB} GB</dd>
        <dt>part number</dt><dd class="mono small">{dimm.partNumber}</dd>
        <dt>serial</dt><dd class="mono small">{dimm.serial}</dd>
        <dt>organization</dt><dd>2 ranks × 8 dies</dd>
      </dl>
      <h4>die occupancy</h4>
      <div class="chips">
        {#each [...dimm.chips.slice(8), ...dimm.chips.slice(0, 8)] as c (c.index)}
          <i style="opacity:{0.1 + 0.9 * (st?.chipHot[c.index] ?? 0)}" title={`rank ${c.rank} · die ${(c.index & 7) + 1} · ${Math.round((st?.chipHot[c.index] ?? 0) * 100)}% live`}></i>
        {/each}
      </div>
      <em class="cap">rank 1 above, rank 0 below · share of live blocks per die</em>
      <div class="acts">
        <button onclick={() => selectDimm(null)}>deselect</button>
      </div>
    {:else}
      <!-- the whole machine -->
      <div class="big">This machine</div>
      <div class="sub">{m.dimms.length} × 16 GB DDR5-6000 · {m.chips.length} DRAM dies · {fmtInt(m.total)} blocks of 4 MiB</div>
      <h4>Memory by state</h4>
      {#each STATE_ROWS as s (s)}
        <div class="srow"><i style={stateSwatch(s)}></i><span>{stateName(s)}</span><div class="bar"><i style="width:{st ? (st.byState[s] / st.total) * 100 : 0}%; background: var(--line2)"></i></div><b class="num">{pct(st?.byState[s] ?? 0)}%</b></div>
      {/each}
      <h4>Top owners</h4>
      {#each top as p (p.id)}
        <button class="lrow" onclick={() => selectProcess(p.id)}><span>{procName(p.id)}</span><div class="bar"><i style="width:{(p.blocks / (top[0]?.blocks || 1)) * 100}%; background: var(--c-private)"></i></div><b class="num">{fmtMiB(p.blocks)}</b></button>
      {/each}
      <h4>Largest cached files</h4>
      {#each topFiles as { f, s } (f.id)}
        <button class="lrow" onclick={() => selectFile(f.id)} title={f.path}><span>{base(f.path)}</span><div class="bar"><i style="width:{((s?.blocks ?? 0) / (topFiles[0]?.s?.blocks || 1)) * 100}%; background: var(--c-file)"></i></div><b class="num">{fmtMiB(s?.blocks ?? 0)}</b></button>
      {/each}
      <p class="tip">Hover any page for details. Click a page to highlight everything its owner has in memory.</p>
    {/if}
  </div>
</div>

<style>
  .insp {
    height: 100%;
    display: flex;
    flex-direction: column;
    font-size: 12.5px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 54px 16px 10px;
    border-bottom: 1px solid var(--line);
  }
  header span {
    font: 600 9.5px var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--ink3);
  }
  header em {
    margin-left: auto;
    padding: 1px 7px;
    border-radius: 8px;
    border: 1px solid var(--line2);
    font: 500 10px var(--font-mono);
    font-style: normal;
    color: var(--ink2);
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 12px 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .where {
    font-size: 10.5px;
    color: var(--ink3);
    overflow-wrap: anywhere;
  }
  .big {
    display: flex;
    align-items: center;
    gap: 10px;
    font: 300 21px / 1.2 var(--font-ui);
    letter-spacing: -0.01em;
  }
  .big.break {
    overflow-wrap: anywhere;
    font-size: 17px;
  }
  .sub {
    margin-top: -6px;
    color: var(--ink3);
    font-size: 11.5px;
  }
  .sub.break {
    overflow-wrap: anywhere;
  }
  .sw {
    width: 16px;
    height: 16px;
    border-radius: 5px;
    box-shadow: inset 0 0 0 1px rgba(127, 127, 127, 0.5);
    flex: none;
  }
  dl {
    display: grid;
    grid-template-columns: 76px 1fr;
    gap: 4px 10px;
    margin: 0;
  }
  dt {
    color: var(--ink3);
    font: 500 10px var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    padding-top: 2px;
  }
  dd {
    margin: 0;
    color: var(--ink2);
    overflow-wrap: anywhere;
  }
  dd.kernel {
    font-style: italic;
  }
  .small {
    font-size: 11px;
  }
  .tag {
    display: inline-block;
    margin-left: 6px;
    padding: 0 5px;
    border-radius: 6px;
    border: 1px solid var(--accent);
    color: var(--accent);
    font: 600 9px var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .tiles {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .tiles > div {
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--panel);
  }
  .tiles em {
    display: block;
    font: 600 9px var(--font-mono);
    font-style: normal;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--ink3);
  }
  .tiles b {
    font: 400 16px var(--font-ui);
    color: var(--ink);
  }
  .spark em {
    display: block;
    font-style: normal;
    font-size: 10px;
    color: var(--ink3);
  }
  h4 {
    margin: 6px 0 2px;
    font: 600 9.5px var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: var(--ink3);
  }
  .srow,
  .lrow {
    display: grid;
    grid-template-columns: 12px minmax(70px, 110px) minmax(30px, 1fr) 62px;
    align-items: center;
    gap: 8px;
    height: 22px;
  }
  .srow > i {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    box-shadow: inset 0 0 0 1px rgba(127, 127, 127, 0.45);
  }
  .srow span,
  .lrow span {
    color: var(--ink2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
  }
  .bar {
    height: 6px;
    border-radius: 3px;
    background: var(--panel);
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    border-radius: 3px;
  }
  .srow b,
  .lrow b {
    text-align: right;
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 500;
  }
  .lrow {
    grid-template-columns: minmax(90px, 150px) minmax(30px, 1fr) 62px;
    width: 100%;
    padding: 0 4px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    text-align: left;
  }
  .lrow:hover {
    background: var(--panel);
  }
  .chips {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 5px;
  }
  .chips i {
    aspect-ratio: 1.1;
    border-radius: 4px;
    background: var(--accent);
  }
  .cap {
    font-style: normal;
    font-size: 10px;
    color: var(--ink3);
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 4px;
  }
  .acts button {
    height: 28px;
    padding: 0 11px;
    border-radius: 7px;
    border: 1px solid var(--line2);
    background: var(--panel);
    color: var(--ink2);
    font-size: 12px;
  }
  .acts button:hover {
    color: var(--ink);
    border-color: var(--ink3);
  }
  .acts button.on {
    border-color: var(--accent);
    color: var(--ink);
  }
  .acts button.danger {
    color: var(--bad);
    border-color: color-mix(in srgb, var(--bad) 50%, transparent);
  }
  .note,
  .tip {
    color: var(--ink3);
    font-size: 11.5px;
    line-height: 1.5;
  }
  .tip {
    margin-top: auto;
    padding-top: 10px;
    border-top: 1px dashed var(--line);
  }
</style>
