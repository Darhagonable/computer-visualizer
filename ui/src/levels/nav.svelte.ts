/**
 * Navigation of the part views — the one place that knows how to move along the chains of
 * physical containment (levels/nav.ts draws the map; this is the driver).
 *
 * A UX owns exactly one `LevelNav` and hands it to <PartView>. It holds where the user is, how
 * the level on stage arrived (the zoom-through transition turns around the part being opened),
 * and where the user last was at each depth, so re-entering a level returns there.
 *
 *   const nav = new LevelNav({ kind: 'machine' });
 *   <PartView {nav} />                     // Ionic: the board is the root
 *   nav.go({ kind: 'package' });           // a menu section, a part clicked in a scene
 *   nav.down({ dimm: 2 });                 // "one level deeper", at a thing when there is one
 *   nav.handleKey(e)                       // Esc / Backspace: one level up
 */
import { getMachine, selectDimm } from '../mock/store.svelte';
import { DEPTH, anchorOf, dimmOf, keyOf, orderOf, upOf, type Level, type Target, type Whence } from './nav';

export class LevelNav {
  level = $state<Level>({ kind: 'machine' });
  /** Which way the level now on stage arrived — drives the zoom-through transition. */
  whence = $state<Whence>('below');
  /** Stage point the last zoom turned around (px); -1 until the first move. */
  zoomX = $state(-1);
  zoomY = $state(-1);
  /** Size of the part view's box. <PartView> measures it; the zoom anchors need it. */
  w = $state(0);
  h = $state(0);
  /** Where the user last was at each depth — re-entering a level returns there. */
  last = {
    stick: 0,
    chip: -1,
    cell: 0,
    ccd: 0,
    core: 2,
    drive: 0,
    /** The part of the machine opened last — where "zoom in" lands with nothing under the pointer. */
    part: 'stick' as 'stick' | 'package' | 'card' | 'storage',
  };

  constructor(start: Level) {
    this.level = start;
    // seed `last` from where we start, read once
    const l = start;
    if (l.kind === 'die' || l.kind === 'block') this.last.chip = l.chip;
    if (l.kind === 'block') this.last.cell = l.cell;
    if (l.kind === 'core') this.last.core = l.core;
    this.remember();
  }

  get key(): string {
    return keyOf(this.level);
  }
  get atMachine(): boolean {
    return this.level.kind === 'machine';
  }

  /* The actions are arrow members on purpose: a UX hands them to other components as callbacks
     (a crumb, a dock, a scene), and a plain method would arrive without its `this`. */

  /** Open a level. The zoom turns around the thing being opened — or closed, on the way up. */
  go = (next: Level): void => {
    if (keyOf(next) === this.key) return; // already there: a shared scene and this UX may both report one click
    const deeper = DEPTH[next.kind] > DEPTH[this.level.kind];
    const shallower = DEPTH[next.kind] < DEPTH[this.level.kind];
    // zooming in, the new level comes up from below; zooming out, down from above;
    // a sibling swap slides toward the direction the sibling lies in
    this.whence = deeper ? 'below' : shallower ? 'above' : orderOf(next) >= orderOf(this.level) ? 'left' : 'right';
    const W = this.w || 1200;
    const H = this.h || 640;
    const a = deeper ? anchorOf(next, W, H) : shallower ? anchorOf(this.level, W, H) : null;
    this.zoomX = a?.x ?? W / 2;
    this.zoomY = a?.y ?? H / 2;
    this.level = next;
    this.remember();
  };

  /** One level up. False at the root, where there is nowhere to go. */
  up = (): boolean => {
    const u = upOf(this.level, getMachine());
    if (!u) return false;
    this.go(u);
    return true;
  };

  /** True from a `down` that ran until the task it ran in is over — see `down`. */
  private moving = false;

  /** One level deeper — at the thing under the pointer when there is one. */
  down = (target?: Target): void => {
    // One gesture moves one level. A click on a part reaches its host by more than one road
    // (the scene's own door, the level's catch-all), and this method reads the level it is
    // called at: a second report would be read at the level the first one just opened, and go
    // one deeper still. The rest of the task is ignored.
    if (this.moving) return;
    this.moving = true;
    queueMicrotask(() => {
      this.moving = false;
    });
    const l = this.level;
    const m = getMachine();
    if (l.kind === 'machine') {
      if (target?.dimm !== undefined) return this.go({ kind: 'stick', dimm: target.dimm });
      if (target?.gpu) return this.go(target.vram ? { kind: 'vram' } : { kind: 'card' });
      if (target?.cpu) return this.go({ kind: 'package' });
      // a drive by index; the bay frame itself (or -1) opens all the drives
      if (target?.storage || target?.drive !== undefined) {
        return this.go(target.drive !== undefined && target.drive >= 0 ? { kind: 'drive', drive: target.drive } : { kind: 'drives' });
      }
      return this.go(this.lastPart());
    }
    if (l.kind === 'memory') return this.go({ kind: 'stick', dimm: this.last.stick });
    if (l.kind === 'stick') {
      const local = this.last.stick === l.dimm && this.last.chip >= 0 ? this.last.chip & 15 : 0;
      return this.go({ kind: 'die', chip: target?.chip ?? m.dimms[l.dimm].chips[local].index });
    }
    if (l.kind === 'die') return this.go({ kind: 'block', chip: l.chip, cell: target?.cell ?? this.last.cell });
    if (l.kind === 'drives') return this.go({ kind: 'drive', drive: target?.drive ?? this.last.drive });
    if (l.kind === 'package') return this.go({ kind: 'ccd', ccd: target?.ccd ?? this.last.ccd });
    if (l.kind === 'ccd') {
      const local = this.last.ccd === l.ccd && this.last.core >= 0 ? this.last.core : l.ccd * 8;
      return this.go({ kind: 'core', core: target?.core ?? local });
    }
    if (l.kind === 'card') return this.go(target?.vram ? { kind: 'vram' } : { kind: 'gdie' });
    // block, core, GPU die, VRAM, a single drive, applications: the end of a chain
  };

  /**
   * Esc or Backspace go up one level. Returns whether the key was consumed — at the root it is
   * not, so the key goes on to whatever else listens (the app clears the highlight on Esc).
   * Register it in the capture phase and stop the event when this returns true.
   */
  handleKey = (e: KeyboardEvent, typing = false): boolean => {
    if (typing || this.atMachine) return false;
    if (e.key === 'Escape') {
      this.up();
      return true;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      this.up();
      return true;
    }
    return false;
  };

  /** Where "zoom in" lands when nothing is under the pointer: the part of the machine opened last. */
  private lastPart(): Level {
    if (this.last.part === 'package') return { kind: 'package' };
    if (this.last.part === 'card') return { kind: 'card' };
    if (this.last.part === 'storage') return { kind: 'drives' };
    return { kind: 'stick', dimm: this.last.stick };
  }

  /** Keep "where the user last was", and the store's module selection, in step with the level. */
  private remember(): void {
    const l = this.level;
    const m = getMachine();
    if (l.kind === 'stick') {
      this.last.stick = l.dimm;
      this.last.part = 'stick';
    }
    if (l.kind === 'die' || l.kind === 'block') {
      this.last.chip = l.chip;
      if (l.kind === 'block') this.last.cell = l.cell;
      this.last.stick = m.chips[l.chip].dimm;
      this.last.part = 'stick';
    }
    if (l.kind === 'package') this.last.part = 'package';
    if (l.kind === 'ccd') this.last.ccd = l.ccd;
    if (l.kind === 'core') {
      this.last.core = l.core;
      this.last.ccd = l.core >> 3;
    }
    if (l.kind === 'card' || l.kind === 'gdie' || l.kind === 'vram') this.last.part = 'card';
    if (l.kind === 'drive') {
      this.last.drive = l.drive;
      this.last.part = 'storage';
    }
    selectDimm(dimmOf(l, m));
  }
}
