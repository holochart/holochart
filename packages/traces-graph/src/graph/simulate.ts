/**
 * `force.simulate` (backlog G2): the force layout of a `graph` trace shown while it settles. Pure
 * of drawing: the view hands in how to draw a frame and how to ask for the next one
 * ({@link AnimationHost}), so the whole run is tested without a renderer.
 *
 * Calc has already run the layout to rest: the axes are sized for the settled picture and `calc.x`
 * / `calc.y` are it. The animation runs **the same simulation again**, from the same start, a few
 * ticks per frame, and draws its positions centered the way the finished layout is
 * (`ForceRun.frame`). When the simulation is at rest it draws the calc itself, so the last picture
 * is the static one exactly, to the last overlap removed.
 *
 * ## When it runs
 *
 * {@link ForceAnimation.sync} is called with every new calc and decides by the calc's
 * `layoutKey`, the fingerprint of what the layout read:
 *
 * - a key it has not shown yet: the run starts (from the start positions, whatever was on screen);
 * - the same key: nothing restarts. A run in progress goes on, bound to the new calc; a finished
 *   one stays finished. So a change of labels, hover data, colors or widths never replays it;
 * - `force.simulate` off, a graph too large to step on the main thread (`calc.force.simulate` is
 *   then `false`), or no motion allowed: a run in progress stops, and the settled layout shows.
 *
 * It stops by itself when the simulation is at rest, and {@link ForceAnimation.stop} cancels the
 * frame it asked for (the view calls it when the trace is removed).
 *
 * A calc with `force.start` (`warm.ts`) is run from those positions, not from the spiral.
 *
 * ## For dragging (G5)
 *
 * A drag does not go on with the run in progress: the view builds a run of its own from the
 * picture on screen, with the dragged node held (`warm.ts`), and hands it over with
 * {@link ForceAnimation.adopt}. `simulation` is then that run's `LayoutSimulation`: `pin(i, x, y)`
 * moves the node, `reheat()` keeps the layout warm, and {@link ForceAnimation.resume} asks for
 * frames again when it had come to rest. When the drag ends the view restyles the pin, and the
 * calc that comes back has another `layoutKey`; {@link ForceAnimation.carry} says beforehand that
 * it is the layout the run is settling into, so that the run goes on instead of starting over.
 */
import type { ForceRun } from '../layout/force/index.ts';
import type { LayoutSimulation } from '../layout/types.ts';
import type { GraphCalc } from './calc.ts';
import { forceRunOf } from './warm.ts';

/** What an animation needs from its view. */
export interface AnimationHost {
  /**
   * Draw the nodes at `positions` (linear coordinates, one per node), or with `undefined` the
   * calc as it is: the animation is over, and `ended` is where its simulation came to rest (for
   * a run from the spiral, the calc before its last overlaps were removed).
   */
  show(
    positions: { readonly x: Float64Array; readonly y: Float64Array } | undefined,
    ended?: { readonly x: Float64Array; readonly y: Float64Array },
  ): void;
  /** Ask for `callback` on the next animation frame; the id cancels it. */
  requestFrame(callback: () => void): number;
  cancelFrame(id: number): void;
}

/** An animation shows its whole run in about this many frames (three seconds at 60 a second). */
const FRAMES = 180;

/** Ticks per frame for a run of `ticks` ticks: at least one, and no more than {@link FRAMES} frames. */
export function ticksPerFrame(ticks: number): number {
  return Math.max(1, Math.ceil(ticks / FRAMES));
}

export class ForceAnimation {
  readonly #host: AnimationHost;
  #calc: GraphCalc | undefined;
  #run: ForceRun | undefined;
  /** The `layoutKey` of the run in progress or of the last one shown. */
  #key: string | undefined;
  #ticks = 0;
  #frame = 0;
  /** The next calc is taken as the layout already on screen (see {@link carry}). */
  #carry = false;
  #x = new Float64Array(0);
  #y = new Float64Array(0);

  constructor(host: AnimationHost) {
    this.#host = host;
  }

  /** Whether a run is in progress (frames are being asked for). */
  get running(): boolean {
    return this.#run !== undefined;
  }

  /** Ticks done in the run in progress (of the last run, once it is over). */
  get ticks(): number {
    return this.#ticks;
  }

  /** The live simulation of the run in progress. */
  get simulation(): LayoutSimulation | undefined {
    return this.#run?.simulation;
  }

  /**
   * Bring the animation in line with a new calc (see the module comment). `motion`: whether
   * motion is allowed. Returns whether a run is in progress afterwards.
   */
  sync(calc: GraphCalc, motion: boolean): boolean {
    const force = calc.force;
    const carry = this.#carry;
    this.#carry = false;
    if (!force?.simulate || !motion) {
      this.#end();
      this.#key = undefined;
      this.#calc = calc;
      return false;
    }
    const key = calc.layoutKey ?? '';
    const same = key === this.#key || carry;
    this.#calc = calc;
    this.#key = key;
    if (same) return this.running;
    this.#end();
    this.#run = forceRunOf(force.graph, force.options, force.start);
    this.#ticks = 0;
    this.#x = new Float64Array(calc.length);
    this.#y = new Float64Array(calc.length);
    this.#schedule();
    return true;
  }

  /**
   * The positions of the run in progress, to draw now (`undefined` when none is). The view calls
   * it when it redraws for another reason than a frame of the animation.
   */
  positions(): { readonly x: Float64Array; readonly y: Float64Array } | undefined {
    const run = this.#run;
    const calc = this.#calc;
    if (!run || !calc) return undefined;
    run.frame(this.#x, this.#y);
    // A timeline's nodes are held along its real axis, where the calc has the values themselves.
    if (calc.real?.kind === 'position')
      (calc.real.axis === 'x' ? this.#x : this.#y).set(calc.real.axis === 'x' ? calc.x : calc.y);
    return { x: this.#x, y: this.#y };
  }

  /** Ask for frames again after the simulation was reheated (a drag). */
  resume(): void {
    if (this.#run && this.#frame === 0) this.#schedule();
  }

  /**
   * Go on with `run` in place of the run in progress, if any: a run the view built from the
   * picture on screen (a drag). It is shown under the calc and the key of the last {@link sync}.
   */
  adopt(run: ForceRun): void {
    const calc = this.#calc;
    if (!calc) return;
    this.#end();
    this.#run = run;
    this.#ticks = 0;
    if (this.#x.length !== calc.length) {
      this.#x = new Float64Array(calc.length);
      this.#y = new Float64Array(calc.length);
    }
    this.#schedule();
  }

  /**
   * The calc the next {@link sync} brings is the layout that is on screen or that the run in
   * progress is settling into, whatever its key: nothing starts over for it.
   */
  carry(): void {
    this.#carry = true;
  }

  /** Stop without drawing: the trace is going away. */
  stop(): void {
    this.#end();
    this.#key = undefined;
    this.#calc = undefined;
    this.#carry = false;
  }

  #end(): void {
    if (this.#frame !== 0) this.#host.cancelFrame(this.#frame);
    this.#frame = 0;
    this.#run = undefined;
  }

  #schedule(): void {
    this.#frame = this.#host.requestFrame(this.#step);
  }

  readonly #step = (): void => {
    this.#frame = 0;
    const run = this.#run;
    if (!run) return;
    const steps = ticksPerFrame(run.ticks);
    const more = run.simulation.tick(steps);
    this.#ticks += steps;
    if (!more) {
      // At rest: the calc is this very layout, finished.
      const ended = this.positions();
      this.#run = undefined;
      this.#host.show(undefined, ended);
      return;
    }
    this.#host.show(this.positions());
    this.#schedule();
  };
}
