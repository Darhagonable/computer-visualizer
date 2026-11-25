<script lang="ts">
  /**
   * Scene-primitive workbench, reachable with `?dev=primitives`. Not a UX — a place to look
   * at the shared pieces on their own, flip the mode, and check hover cards and callbacks.
   */
  import { app } from '../mock/store.svelte';
  import Motherboard from '../scene/Motherboard.svelte';
  import CpuDie from '../scene/CpuDie.svelte';
  import GpuCard from '../scene/GpuCard.svelte';
  import ModeSwitch from '../scene/ModeSwitch.svelte';
  import ScaleLegend from '../scene/ScaleLegend.svelte';

  let log = $state<string[]>([]);
  function say(s: string) {
    log = [`t=${app.tick}  ${s}`, ...log].slice(0, 6);
  }
</script>

<div class="dev">
  <header>
    <b>Scene primitives</b>
    <ModeSwitch component="memory" />
    <ScaleLegend component="memory" note="per die · estimated" />
    <ScaleLegend component="cpu" />
    <ScaleLegend component="gpu" domain={[0, 6]} note="per unit" />
  </header>
  <div class="grid">
    <section>
      <h3>Motherboard · 960 × 1000</h3>
      <svg viewBox="0 0 960 1000">
        <Motherboard oncpu={() => say('open cpu')} ongpu={() => say('open gpu')} ondimm={(d) => say(`open dimm ${d}`)} />
      </svg>
    </section>
    <section>
      <h3>CPU package · 460 × 390</h3>
      <svg viewBox="0 0 460 390">
        <CpuDie onccd={(c) => say(`open ccd ${c}`)} oncore={(c) => say(`open core ${c}`)} />
      </svg>
      <h3>GPU card · 780 × 420</h3>
      <svg viewBox="0 0 780 420">
        <GpuCard ondie={() => say('open gpu die')} onvram={(c) => say(`open vram ${c}`)} oncard={() => say('open gpu card')} />
      </svg>
    </section>
  </div>
  <pre>{log.join('\n')}</pre>
</div>

<style>
  .dev {
    height: 100%;
    overflow: auto;
    padding: 12px 12px 12px 268px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    color: var(--ink);
  }
  header {
    display: flex;
    align-items: center;
    gap: 18px;
    flex-wrap: wrap;
    position: sticky;
    top: 0;
    z-index: 5;
    padding: 8px 0;
    background: var(--bg);
  }
  header b {
    font: 600 13px var(--font-mono);
    color: var(--ink2);
  }
  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 18px;
    align-items: start;
  }
  section {
    padding: 10px;
    border-radius: var(--radius);
    border: 1px solid var(--line);
    background: var(--panel);
  }
  section svg {
    width: 100%;
    display: block;
  }
  h3 {
    margin: 0 0 6px;
    font: 500 10.5px var(--font-mono);
    color: var(--ink3);
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }
  h3 + svg + h3 {
    margin-top: 12px;
  }
  pre {
    margin: 0;
    font: 400 11px var(--font-mono);
    color: var(--ink2);
  }
</style>
