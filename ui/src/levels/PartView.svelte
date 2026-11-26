<script lang="ts">
  /**
   * The part views on stage: whichever level the navigation is on, mounted with the right
   * props, and changed with the zoom-through transition. This is all a UX needs to show the
   * parts — it owns a `LevelNav` and places this component in a box.
   *
   *   const nav = new LevelNav({ kind: 'machine' });
   *   <PartView {nav} />
   *
   * The root level is the shared Overview (the board). A UX whose Overview is its own scene
   * passes it as the `overview` snippet instead; every level below is shared.
   *
   *   <PartView {nav}>
   *     {#snippet overview()}
   *       <MyOverview onnavigate={(l) => nav.go(l)} />
   *     {/snippet}
   *   </PartView>
   *
   * The box must have a size of its own (a grid or flex cell, or an absolutely positioned
   * element): this fills it, and measures it, so each level can lay itself out.
   */
  import type { Snippet } from 'svelte';
  import { zoom } from './nav';
  import type { LevelNav } from './nav.svelte';
  import MachineLevel from './MachineLevel.svelte';
  import MemoryLevel from './MemoryLevel.svelte';
  import StickLevel from './StickLevel.svelte';
  import DieLevel from './DieLevel.svelte';
  import BlockLevel from './BlockLevel.svelte';
  import PackageLevel from './PackageLevel.svelte';
  import CcdLevel from './CcdLevel.svelte';
  import CoreLevel from './CoreLevel.svelte';
  import CardLevel from './CardLevel.svelte';
  import GpuDieLevel from './GpuDieLevel.svelte';
  import VramLevel from './VramLevel.svelte';
  import DrivesLevel from './DrivesLevel.svelte';
  import DriveLevel from './DriveLevel.svelte';
  import AppsLevel from './AppsLevel.svelte';

  let {
    nav,
    overview = null,
    motion = true,
  }: {
    nav: LevelNav;
    /** What the root level looks like in this UX; the shared board when omitted. */
    overview?: Snippet | null;
    /** False changes levels without the zoom (a UX that animates its pages its own way). */
    motion?: boolean;
  } = $props();

  /** Users who ask for less motion get level changes without the zoom. */
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dur = $derived(motion && !still ? 540 : 0);
</script>

<div
  class="pv"
  bind:clientWidth={nav.w}
  bind:clientHeight={nav.h}
  style={nav.zoomX < 0 ? null : `--zoom-x:${nav.zoomX}px; --zoom-y:${nav.zoomY}px`}
>
  {#key nav.key}
    <div class="slot lv" in:zoom={{ whence: nav.whence, dur }} out:zoom={{ whence: nav.whence, out: true, dur }}>
      {#if nav.level.kind === 'machine' && overview}
        {@render overview()}
      {:else if nav.level.kind === 'machine'}
        <MachineLevel w={nav.w} h={nav.h} go={nav.go} down={nav.down} />
      {:else if nav.level.kind === 'memory'}
        <MemoryLevel w={nav.w} h={nav.h} go={nav.go} down={nav.down} />
      {:else if nav.level.kind === 'stick'}
        <StickLevel dimm={nav.level.dimm} w={nav.w} h={nav.h} go={nav.go} down={nav.down} />
      {:else if nav.level.kind === 'die'}
        <DieLevel chip={nav.level.chip} w={nav.w} h={nav.h} go={nav.go} down={nav.down} />
      {:else if nav.level.kind === 'block'}
        <BlockLevel chip={nav.level.chip} cell={nav.level.cell} w={nav.w} h={nav.h} go={nav.go} />
      {:else if nav.level.kind === 'package'}
        <PackageLevel w={nav.w} h={nav.h} go={nav.go} down={nav.down} />
      {:else if nav.level.kind === 'ccd'}
        <CcdLevel ccd={nav.level.ccd} w={nav.w} h={nav.h} go={nav.go} down={nav.down} />
      {:else if nav.level.kind === 'core'}
        <CoreLevel core={nav.level.core} w={nav.w} h={nav.h} go={nav.go} />
      {:else if nav.level.kind === 'card'}
        <CardLevel w={nav.w} h={nav.h} go={nav.go} down={nav.down} />
      {:else if nav.level.kind === 'gdie'}
        <GpuDieLevel w={nav.w} h={nav.h} go={nav.go} />
      {:else if nav.level.kind === 'vram'}
        <VramLevel w={nav.w} h={nav.h} go={nav.go} />
      {:else if nav.level.kind === 'drives'}
        <DrivesLevel w={nav.w} h={nav.h} go={nav.go} down={nav.down} />
      {:else if nav.level.kind === 'drive'}
        <DriveLevel drive={nav.level.drive} w={nav.w} h={nav.h} go={nav.go} />
      {:else}
        <AppsLevel w={nav.w} h={nav.h} go={nav.go} down={nav.down} />
      {/if}
    </div>
  {/key}
</div>

<style>
  .pv {
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  /* the slot and every level in it fill the box; a zoom turns around the part it opens */
  .pv :global(.lv) {
    position: absolute;
    inset: 0;
    z-index: 1;
    transform-origin: var(--zoom-x, 50%) var(--zoom-y, 50%);
  }
</style>
