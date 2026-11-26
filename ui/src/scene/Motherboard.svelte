<script lang="ts">
  /**
   * The whole machine as one drawn object: a mock ATX board with the processor socket,
   * the memory slots and a graphics card in its PCIe slot. Line art + live data.
   * Canvas: 960 × 1000.
   *
   * Every component is the real scene primitive, so it carries its own live data, hover
   * cards and mode-aware colouring. Callbacks let a UX open a component (`oncpu`, `ongpu`,
   * `ondimm`, `onstorage`). Things this mock does not instrument (the chipset, the spare
   * M.2 slot) say so when hovered.
   *
   * The drives are drawn here rather than as scenes of their own: at board scale a drive is
   * a door, not a picture. Its colour follows the overlay — an NVMe drive's temperature is a
   * sensor reading; a drive without a sensor is "no data", never a guess.
   */
  import { app, getMachine, hoverCard, hoverOut } from '../mock/store.svelte';
  import { GPU_ENGINES, GPU_UNITS, VRAM_CHIPS, TRUTH, TRUTH_LABEL, type DriveLive, type Overlay } from '../mock/telemetry';
  import { metricColor } from './paint.svelte';
  import DimmStick from './DimmStick.svelte';
  import CpuDie from './CpuDie.svelte';
  import GpuCard from './GpuCard.svelte';

  interface Props {
    interactive?: boolean;
    /** The board's own labels. The parts never draw theirs here — at board scale they are specks. */
    labels?: boolean;
    oncpu?: () => void;
    ongpu?: () => void;
    ondimm?: (dimm: number) => void;
    /** Optional finer doors into the graphics card; they fall back to `ongpu`. */
    ongpudie?: () => void;
    ongpuvram?: (chip: number) => void;
    /** A drive was clicked (by index; -1 for the bay itself). */
    onstorage?: (drive: number) => void;
  }
  let { interactive = true, labels = true, oncpu, ongpu, ondimm, ongpudie, ongpuvram, onstorage }: Props = $props();

  const m = getMachine();
  const cpu = $derived(app.cpu);
  const g = $derived(app.tele?.gpu);
  const st = $derived(app.stats);
  const drives = $derived(app.tele?.storage ?? []);
  /** Pages are memory data only: on the drives (as on the CPU and GPU) the fallback is temperature. */
  const ov = $derived<Overlay>(app.mode === 'pages' ? 'temperature' : app.mode);
  const truth = $derived(TRUTH[ov].storage);
  const gib = (v: number) => Math.round(v).toLocaleString('en-US');
  const short = (model: string) => model.replace(/^Mock /, '');
  const driveValue = (d: DriveLive): number | null => (ov === 'activity' ? d.busyPct : ov === 'power' ? d.power : d.tempC);
  /** The drive's readings are mutated in place each tick, so the dependency on the tick is stated. */
  const driveFill = (d: DriveLive) => {
    void app.version;
    return metricColor(ov, 'storage', driveValue(d));
  };

  // ---- geometry -----------------------------------------------------------------------
  const SOCKET = { x: 140, y: 124, w: 224, h: 224 };
  const SLOT = { x0: 376, pitch: 88, w: 81, y: 70, h: 280 };
  const slotX = (i: number) => SLOT.x0 + i * SLOT.pitch;
  const fins = Array.from({ length: 12 }, (_, i) => i);
  const vrmFins = Array.from({ length: 9 }, (_, i) => i);
  const nand = Array.from({ length: 4 }, (_, i) => i);
  const DRIVE_FINGERS = Array.from({ length: 5 }, (_, i) => i);
  const sata = Array.from({ length: 4 }, (_, i) => i);
  const holes: [number, number][] = [
    [52, 52],
    [888, 52],
    [52, 928],
    [888, 928],
    [895, 548],
  ];

  // ---- hover cards for the parts that are not scenes of their own ----------------------
  function cpuCard() {
    return {
      title: 'Processor',
      sub: 'mock 16 cores / 32 threads · 2 CCDs + I/O die',
      rows: [
        { k: 'load', v: `${(cpu?.avgLoad ?? 0).toFixed(0)} %`, mono: true },
        { k: 'hottest', v: cpu ? `${cpu.maxTemp.toFixed(0)} °C` : '—', mono: true },
        { k: 'package', v: `${(cpu?.power ?? 0).toFixed(0)} W`, mono: true },
      ],
      hint: oncpu ? 'click to open the processor' : undefined,
    };
  }
  function gpuCard() {
    return {
      title: g?.name ?? 'Graphics card',
      sub: `PCIe 5.0 ×16 · ${VRAM_CHIPS} × 2 GB GDDR6X`,
      rows: [
        { k: 'temperature', v: `${(g?.temp ?? 0).toFixed(0)} °C · hotspot ${(g?.hotspot ?? 0).toFixed(0)} °C`, mono: true },
        { k: 'load', v: `3D ${(g?.engines['3d'] ?? 0).toFixed(0)} %`, mono: true },
        { k: 'power', v: `${(g?.power ?? 0).toFixed(0)} W`, mono: true },
      ],
      hint: ongpu ? 'click to open the graphics card' : undefined,
    };
  }
  const staticCard = (title: string, sub: string) => ({ title, sub, rows: [], note: 'Not instrumented in this mock.' });
  function driveCard(d: DriveLive) {
    return {
      title: short(d.model),
      sub: `${d.bus} · ${gib(d.usedGiB)} of ${gib(d.totalGiB)} GiB in use`,
      rows: [
        { k: 'activity', v: `${d.busyPct.toFixed(0)} % busy · ${(d.readBps / 1e6).toFixed(0)} / ${(d.writeBps / 1e6).toFixed(0)} MB/s`, mono: true },
        { k: 'temperature', v: d.tempC !== null ? `${d.tempC.toFixed(1)} °C` : 'no sensor', mono: true, dim: d.tempC === null },
        { k: 'power', v: `≈ ${d.power.toFixed(1)} W`, mono: true },
      ],
      note: `what the colour shows: ${ov} · ${TRUTH_LABEL[truth]}`,
      hint: interactive && onstorage ? 'click to open this drive' : undefined,
    };
  }
  function bayCard() {
    const used = drives.reduce((s, d) => s + d.usedGiB, 0);
    const total = drives.reduce((s, d) => s + d.totalGiB, 0);
    return {
      title: 'Storage',
      sub: `${drives.length} drives · ${gib(used)} of ${gib(total)} GiB in use`,
      rows: [],
      hint: interactive && onstorage ? 'click a drive to open it' : undefined,
    };
  }
</script>

<svg viewBox="0 0 960 1000" class="mobo" class:passive={!interactive} role="group" aria-label="Motherboard (mock)">
  <rect x="20" y="20" width="920" height="960" rx="14" class="board" />
  {#each holes as [x, y] (x + ':' + y)}
    <circle cx={x} cy={y} r="7" class="hole" />
  {/each}

  <!-- rear I/O and the processor's power stages -->
  <g onpointerenter={(e) => hoverCard(staticCard('Rear I/O', 'USB, Ethernet, audio · mock'), e)} onpointerleave={hoverOut}>
    <rect x="36" y="72" width="30" height="190" rx="3" class="io" />
    {#each [0, 1, 2, 3] as p (p)}
      <rect x="42" y={84 + p * 44} width="18" height="30" rx="1.5" class="port" />
    {/each}
  </g>
  <g onpointerenter={(e) => hoverCard(staticCard('Power stages', 'VRM · mock'), e)} onpointerleave={hoverOut}>
    <rect x="84" y="66" width="250" height="40" rx="4" class="hs" />
    {#each fins as i (i)}
      <line x1={96 + i * 19} y1="72" x2={96 + i * 19} y2="100" class="fin" />
    {/each}
    <rect x="84" y="122" width="40" height="180" rx="4" class="hs" />
    {#each vrmFins as i (i)}
      <line x1="90" y1={132 + i * 19} x2="118" y2={132 + i * 19} class="fin" />
    {/each}
  </g>

  <!-- processor socket -->
  <g class="socket">
    <rect
      x={SOCKET.x}
      y={SOCKET.y}
      width={SOCKET.w}
      height={SOCKET.h}
      rx="6"
      class="socket-frame"
      onpointermove={(e) => hoverCard(cpuCard(), e)}
      onpointerleave={hoverOut}
      onclick={() => oncpu?.()}
    />
    <path d="M{SOCKET.x + 10} {SOCKET.y + 22} L{SOCKET.x + 10} {SOCKET.y + 10} L{SOCKET.x + 22} {SOCKET.y + 10} Z" class="pin1" />
    <!-- the whole socket is the processor's door; cores and chiplets explain themselves first -->
    <g
      onpointermove={(e) => {
        if (!(e.target as Element).closest?.('.core, .ccd')) hoverCard(cpuCard(), e);
      }}
      onpointerleave={hoverOut}
      onclick={() => oncpu?.()}
    >
      <g transform="translate({SOCKET.x + 11},{SOCKET.y + 26}) scale(0.44)">
        <CpuDie {interactive} labels={false} onccd={() => oncpu?.()} oncore={() => oncpu?.()} />
      </g>
    </g>
    {#if labels}
      <text x={SOCKET.x} y={SOCKET.y - 8} class="lbl">CPU</text>
    {/if}
  </g>

  <!-- memory slots -->
  {#each m.slots as slot, i (slot.index)}
    <g class="slot">
      {#if slot.dimm}
        <g transform="translate({slotX(i) + SLOT.w},{SLOT.y}) rotate(90) scale(0.5)">
          <DimmStick dimm={slot.dimm} {interactive} labels={false} onstick={(d) => ondimm?.(d.index)} onchip={(d) => ondimm?.(d.index)} />
        </g>
      {:else}
        <g
          onpointerenter={(e) => hoverCard({ title: slot.label, sub: 'empty slot', rows: [{ k: 'channel', v: slot.channel }] }, e)}
          onpointerleave={hoverOut}
        >
          <rect x={slotX(i)} y={SLOT.y} width={SLOT.w} height={SLOT.h} rx="4" class="slot-empty" />
          {#if labels}
            <text x={slotX(i) + SLOT.w / 2} y={SLOT.y + SLOT.h / 2} text-anchor="middle" class="lbl2" transform="rotate(-90 {slotX(i) + SLOT.w / 2} {SLOT.y + SLOT.h / 2})">empty</text>
          {/if}
        </g>
      {/if}
      {#if labels}
        <text x={slotX(i) + SLOT.w / 2} y="60" text-anchor="middle" class="lbl2" class:warm={st && slot.dimm && (st.dimmUsed[slot.dimm.index] ?? 0) > 0.66}>
          {slot.label.replace('DIMM_', '')}
        </text>
      {/if}
    </g>
  {/each}

  <!-- things this mock does not instrument -->
  <g onpointerenter={(e) => hoverCard(staticCard('M.2 slots', 'NVMe storage · mock'), e)} onpointerleave={hoverOut}>
    <rect x="600" y="384" width="230" height="24" rx="4" class="hs" />
    <rect x="600" y="418" width="230" height="24" rx="4" class="hs" />
    {#if labels}
      <text x="822" y="400" text-anchor="end" class="lbl2">M.2</text>
      <text x="822" y="434" text-anchor="end" class="lbl2">M.2</text>
    {/if}
  </g>
  <g onpointerenter={(e) => hoverCard(staticCard('Chipset', 'I/O hub · mock'), e)} onpointerleave={hoverOut}>
    <rect x="640" y="700" width="190" height="150" rx="12" class="hs" />
    {#each vrmFins as i (i)}
      <line x1={656 + i * 20} y1="714" x2={656 + i * 20} y2="836" class="fin" />
    {/each}
    {#if labels}
      <text x="735" y="872" text-anchor="middle" class="lbl2">CHIPSET</text>
    {/if}
  </g>
  <g onpointerenter={(e) => hoverCard(staticCard('SATA', '4 ports · mock'), e)} onpointerleave={hoverOut}>
    {#each sata as i (i)}
      <rect x="862" y={600 + i * 26} width="30" height="18" rx="2" class="port" />
    {/each}
  </g>
  <g onpointerenter={(e) => hoverCard(staticCard('ATX 24-pin', 'Board power input · mock'), e)} onpointerleave={hoverOut}>
    <rect x="894" y="380" width="28" height="110" rx="3" class="port" />
  </g>
  <!-- PCIe slot: the graphics card sits in it -->
  <rect x="100" y="638" width="470" height="12" rx="2" class="slot-body" />
  <g transform="translate(70,425) scale(0.6)">
    <GpuCard
      {interactive}
      labels={false}
      ondie={() => (ongpudie ?? ongpu)?.()}
      onvram={(chip) => (ongpuvram ? ongpuvram(chip) : ongpu?.())}
      oncard={() => ongpu?.()}
    />
  </g>

  <!-- storage bays: each drive is a door; the spare M.2 slot is honestly empty -->
  <g
    class="bay"
    onpointermove={(e) => {
      if (!(e.target as Element).closest?.('.drive')) hoverCard(interactive ? bayCard() : null, e);
    }}
    onpointerleave={hoverOut}
    onclick={() => onstorage?.(-1)}
  >
    <rect x="76" y="686" width="548" height="216" rx="10" class="bay-frame" />
    <g
      class="spare"
      onpointerenter={(e) => hoverCard(staticCard('M.2 slot', 'empty · mock board'), e)}
      onpointermove={(e) => hoverCard(staticCard('M.2 slot', 'empty · mock board'), e)}
      onpointerleave={hoverOut}
    >
      <rect x="340" y="712" width="218" height="44" rx="3" class="slot-empty" />
      {#if labels}
        <text x="449" y="738" text-anchor="middle" class="lbl2">M.2 · empty</text>
      {/if}
    </g>

    <!-- NVMe stick in its M.2 slot (the same box as MOBO.drives[0] in levels/nav.ts) -->
    <g
      class="drive"
      data-drive="0"
      onpointerenter={(e) => hoverCard(interactive ? driveCard(drives[0]) : null, e)}
      onpointermove={(e) => hoverCard(interactive ? driveCard(drives[0]) : null, e)}
      onpointerleave={hoverOut}
      onclick={(e) => {
        e.stopPropagation();
        onstorage?.(0);
      }}
    >
      <rect x="96" y="704" width="218" height="60" rx="5" class="drive-body" />
      <rect x="96" y="704" width="218" height="60" rx="5" fill={driveFill(drives[0])} class="tint" />
      <rect x="105" y="717" width="34" height="34" rx="3" class="silicon" />
      {#each [0, 1] as k (k)}
        <rect x={147 + k * 48} y="717" width="40" height="34" rx="3" fill={driveFill(drives[0])} class="flash" />
      {/each}
      <rect x="240" y="712" width="56" height="44" rx="2" class="sticker" />
      {#each DRIVE_FINGERS as i (i)}
        <rect x={298 + i * 3.2} y={714 + (i % 2) * 24} width="1.8" height="16" class="pin" />
      {/each}
    </g>

    <!-- 2.5" SATA SSD -->
    <g
      class="drive"
      data-drive="1"
      onpointerenter={(e) => hoverCard(interactive ? driveCard(drives[1]) : null, e)}
      onpointermove={(e) => hoverCard(interactive ? driveCard(drives[1]) : null, e)}
      onpointerleave={hoverOut}
      onclick={(e) => {
        e.stopPropagation();
        onstorage?.(1);
      }}
    >
      <rect x="96" y="772" width="87" height="125" rx="6" class="drive-body" />
      <rect x="96" y="772" width="87" height="125" rx="6" fill={driveFill(drives[1])} class="tint" />
      <rect x="104" y="780" width="71" height="58" rx="3" class="drive-pcb" />
      {#each nand as k (k)}
        <rect x={110 + (k & 1) * 33} y={786 + (k >> 1) * 25} width="26" height="19" rx="2" fill={driveFill(drives[1])} class="flash" />
      {/each}
      <rect x="104" y="846" width="22" height="14" rx="2" class="port" />
      <rect x="132" y="846" width="12" height="14" rx="2" class="port" />
      {#if labels}
        <text x="139.5" y="886" text-anchor="middle" class="lbl2">2.5"</text>
      {/if}
    </g>

    <!-- 3.5" hard disk -->
    <g
      class="drive"
      data-drive="2"
      onpointerenter={(e) => hoverCard(interactive ? driveCard(drives[2]) : null, e)}
      onpointermove={(e) => hoverCard(interactive ? driveCard(drives[2]) : null, e)}
      onpointerleave={hoverOut}
      onclick={(e) => {
        e.stopPropagation();
        onstorage?.(2);
      }}
    >
      <rect x="340" y="770" width="182" height="127" rx="5" class="drive-body" />
      <rect x="340" y="770" width="182" height="127" rx="5" fill={driveFill(drives[2])} class="tint" />
      <circle cx="404" cy="833" r="46" class="platter" />
      <circle cx="404" cy="833" r="46" fill={driveFill(drives[2])} class="tint" />
      <circle cx="404" cy="833" r="5" class="spindle" />
      <path d="M506 790 L418 826 M506 790 L508 800" class="arm" />
      <rect x="496" y="802" width="16" height="84" rx="2" class="drive-pcb" />
      {#if labels}
        <text x="431" y="890" text-anchor="middle" class="lbl2">3.5"</text>
      {/if}
    </g>
    {#if labels}
      <text x="92" y="680" class="lbl">STORAGE</text>
    {/if}
  </g>

  {#if labels}
    <text x="40" y="968" class="lbl2">MOCK ATX BOARD · {GPU_UNITS} GPU units · {GPU_ENGINES} shader engines</text>
  {/if}
</svg>

<style>
  .mobo {
    overflow: visible;
  }
  .board {
    fill: var(--mobo-pcb);
    stroke: var(--mobo-line);
    stroke-width: 1.6;
  }
  .hole {
    fill: var(--bg);
    stroke: var(--mobo-line);
    stroke-width: 1.4;
  }
  .io {
    fill: var(--panel2);
    stroke: var(--line2);
    stroke-width: 1.2;
  }
  .port {
    fill: var(--panel2);
    stroke: var(--line2);
    stroke-width: 1;
  }
  .hs {
    fill: var(--panel);
    stroke: var(--line2);
    stroke-width: 1.2;
  }
  .fin {
    stroke: var(--line2);
    stroke-width: 1;
  }
  .socket-frame {
    fill: var(--panel2);
    stroke: var(--line2);
    stroke-width: 1.4;
    transition: stroke 120ms ease;
  }
  .mobo:not(.passive) .socket-frame {
    cursor: pointer;
  }
  .socket:hover .socket-frame {
    stroke: var(--ink3);
  }
  .pin1 {
    fill: var(--ink3);
    pointer-events: none;
  }
  .bay-frame {
    fill: var(--panel);
    stroke: var(--line2);
    stroke-width: 1.2;
  }
  .mobo:not(.passive) .drive {
    cursor: pointer;
  }
  .drive-body {
    fill: var(--panel2);
    stroke: var(--line2);
    stroke-width: 1.2;
  }
  .drive .tint {
    opacity: 0.3;
    pointer-events: none;
  }
  /* bare silicon (a controller) and the board chips sit on: not a reading, so not coloured */
  .silicon {
    fill: var(--dimm-chip);
    stroke: var(--dimm-chip-line);
    stroke-width: 1;
  }
  .drive-pcb {
    fill: var(--panel);
    stroke: var(--line2);
    stroke-width: 1;
  }
  .drive .flash {
    stroke: var(--dimm-chip-line);
    stroke-width: 1;
  }
  .sticker {
    fill: var(--dimm-sticker);
    stroke: var(--line2);
    stroke-width: 0.6;
    pointer-events: none;
  }
  .pin {
    fill: var(--dimm-gold);
  }
  .platter {
    fill: var(--dimm-chip);
    stroke: var(--dimm-chip-line);
    stroke-width: 1;
  }
  .spindle {
    fill: var(--ink3);
    pointer-events: none;
  }
  .arm {
    fill: none;
    stroke: var(--ink3);
    stroke-width: 2;
    stroke-linecap: round;
    pointer-events: none;
  }
  .slot-empty {
    fill: transparent;
    stroke: var(--slot-line);
    stroke-width: 1.2;
    stroke-dasharray: 7 5;
  }
  .slot-body {
    fill: var(--slot-body);
    stroke: var(--slot-line);
    stroke-width: 1;
  }
  .lbl {
    font: 600 10px var(--font-mono);
    letter-spacing: 0.14em;
    fill: var(--ink2);
    pointer-events: none;
  }
  .lbl2 {
    font: 400 9.5px var(--font-ui);
    fill: var(--ink3);
    pointer-events: none;
  }
  .lbl2.warm {
    fill: var(--ink2);
  }
</style>
