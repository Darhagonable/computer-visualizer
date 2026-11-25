<script lang="ts">
  import { app } from '../../mock/store.svelte';
  import CpuDie from '../../scene/CpuDie.svelte';
  import AreaGraph from '../../scene/AreaGraph.svelte';
  import { CPU_DIE } from '../../scene/geometry';

  const cpu = $derived(app.cpu);
  const cores = $derived(cpu?.cores ?? []);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const ccd = (i: number) => {
    const cs = cores.filter((c) => c.ccd === i);
    return {
      load: avg(cs.map((c) => c.load)),
      temp: cs.length ? Math.max(...cs.map((c) => c.temp)) : 0,
      freq: avg(cs.map((c) => c.freq)),
    };
  };
  const hot = $derived(cores.length ? cores.reduce((a, c) => (c.temp > a.temp ? c : a)) : null);
  const busy = $derived(cores.filter((c) => c.load > 50).length);
</script>

<div class="cpu">
  <div class="panel art">
    <svg viewBox="0 0 {CPU_DIE.width} {CPU_DIE.height}" preserveAspectRatio="xMidYMid meet">
      <CpuDie />
    </svg>
    <div class="ramp"><span>35 °C</span><i></i><span>87 °C</span></div>
  </div>
  <div class="side">
    <section class="panel graph">
      <AreaGraph values={app.hist.cpu} label="processor utility · 60 s" unit="%" />
    </section>
    <section class="panel stats">
      <div class="stat"><em>hottest core</em><b>{hot ? `Core ${hot.index + 1}` : '–'}</b><span>{hot ? hot.temp.toFixed(1) : '–'} °C · CCD{hot?.ccd}</span></div>
      <div class="stat"><em>average clock</em><b>{avg(cores.map((c) => c.freq)).toFixed(2)}<i> GHz</i></b><span>{busy} of {cores.length} cores above 50%</span></div>
      <div class="stat"><em>package power</em><b>{cpu ? cpu.power.toFixed(0) : '–'}<i> W</i></b><span>mock model</span></div>
    </section>
    <section class="panel table">
      <table>
        <thead><tr><th>chiplet</th><th>cores</th><th>load</th><th>max temp</th><th>clock</th></tr></thead>
        <tbody>
          {#each [0, 1] as i (i)}
            <tr><td>CCD{i}</td><td>8 / 16T</td><td class="num">{ccd(i).load.toFixed(0)}%</td><td class="num">{ccd(i).temp.toFixed(0)} °C</td><td class="num">{ccd(i).freq.toFixed(2)} GHz</td></tr>
          {/each}
          <tr class="io"><td>I/O die</td><td>–</td><td class="num">{cpu ? cpu.power.toFixed(0) : '–'} W</td><td class="num">–</td><td class="num">–</td></tr>
        </tbody>
      </table>
    </section>
  </div>
</div>

<style>
  .cpu {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(300px, 1fr);
    gap: 12px;
  }
  .panel {
    border-radius: var(--radius);
    border: 1px solid var(--line);
    background: var(--panel);
    min-height: 0;
    overflow: hidden;
  }
  .art {
    position: relative;
    display: grid;
    place-items: center;
    padding: 16px;
  }
  .art svg {
    width: 100%;
    height: 100%;
    max-height: 100%;
  }
  .ramp {
    position: absolute;
    left: 18px;
    bottom: 14px;
    display: flex;
    align-items: center;
    gap: 6px;
    font: 400 10px var(--font-mono);
    color: var(--ink3);
  }
  .ramp i {
    width: 110px;
    height: 6px;
    border-radius: 3px;
    background: linear-gradient(90deg, rgb(62, 224, 160), rgb(255, 194, 51), rgb(255, 77, 109));
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
  }
  .graph {
    flex: 1.1;
    min-height: 120px;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    padding: 12px 14px;
    gap: 12px;
  }
  .stat em {
    display: block;
    font: 600 9.5px var(--font-mono);
    font-style: normal;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--ink3);
  }
  .stat b {
    display: block;
    font: 300 21px / 1.3 var(--font-ui);
    color: var(--ink);
    white-space: nowrap;
  }
  .stat b i {
    font-style: normal;
    font-size: 12px;
    color: var(--ink3);
  }
  .stat span {
    color: var(--ink3);
    font-size: 10.5px;
    white-space: nowrap;
  }
  .table {
    overflow: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  th,
  td {
    padding: 6px 12px;
    text-align: right;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
  }
  th:first-child,
  td:first-child {
    text-align: left;
  }
  th {
    font: 600 9.5px var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--ink3);
  }
  td {
    color: var(--ink2);
  }
  tr:last-child td {
    border-bottom: 0;
  }
  tr.io td {
    color: var(--ink3);
  }
  @media (max-width: 1180px) {
    .cpu {
      grid-template-columns: 1fr;
    }
    .art {
      min-height: 300px;
    }
  }
</style>
