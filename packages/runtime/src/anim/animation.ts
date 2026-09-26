/**
 * Transitions and frame animation (plan E7.3, E7.4), loaded with a dynamic `import()` the first
 * time a chart animates (`chart.animate`, `addFrames`, `deleteFrames`, or `react` with a
 * `layout.transition`), so charts that never animate don't download it.
 *
 * ## Transitions
 *
 * A transition goes from what is drawn now to a new figure. The new figure is applied to the
 * chart's input at once, like any update; then the attributes that can animate are written back to
 * their in-between values on every animation frame, each write an ordinary incremental pipeline
 * run (validation off). So views keep their primitives and re-upload buffers in place, axes and
 * components follow, and the last frame is exactly the update without a transition.
 *
 * What animates: the attributes a trace module lists as `animatable` (or flags in its schema) —
 * numbers linearly, colors in OKLab, per-point arrays point by point (by `ids` when both states have
 * them, with entering and exiting points fading and growing, see `interpolate.ts`) — and axis
 * ranges the new figure sets. Everything else snaps at the start. Axes left to autorange follow
 * the in-between data. When axis ranges and traces both animate, `ordering` picks which one
 * animates (Plotly): the other holds its old state and snaps at the end.
 *
 * Another update of an animating attribute wins: the transition stops writing that attribute. A
 * new transition interrupts the running one (which jumps to its end in the input) and starts from
 * what is drawn. With `prefers-reduced-motion: reduce`, transitions snap (frames still advance).
 *
 * ## Frames
 *
 * `animate` follows plotly.js: a queue of frames; each frame starts `frame.duration` after the
 * previous one and transitions into its state over `transition.duration` (capped at the frame's);
 * `mode`, `direction` and `fromcurrent` change the queue as in Plotly. The promise resolves once the
 * last frame asked for has had its duration and finished its transition, and rejects when that frame
 * is dropped by a later `'next'` / `'immediate'` call (or its transition is interrupted).
 */
import {
  getIn,
  supplyDefaults,
  type FigureInput,
  type FullAxis,
  type Scale,
  type SupplyDefaultsResult,
} from '@mk7s/holochart-core';
import type { Chart, Plan } from '../chart.ts';
import { easing, type Easing } from './easing.ts';
import {
  animationOptions,
  frameEdits,
  frameList,
  fromCurrent,
  insertFrames,
  removeFrames,
  resolveTarget,
  transitionOptions,
  type TargetFrame,
} from './frames.ts';
import {
  animatablePaths,
  interpolator,
  isArrayLike,
  matchPoints,
  pointArrayPaths,
  pointCount,
  perPoint,
  pointKind,
  pointTween,
  sameValue,
  type Tween,
} from './interpolate.ts';
import type {
  AnimateTarget,
  AnimationHost,
  AnimationOptions,
  FrameOptions,
  TransitionOptions,
} from './types.ts';

/** One animating attribute of a trace (`trace ≥ 0`) or of the layout (`trace = -1`). */
interface Track {
  trace: number;
  readonly path: string;
  readonly tween: Tween;
  /** Its value doesn't change during the transition (snapped, or held): written once. */
  readonly constant: boolean;
  /** Animates in the phase `ordering` puts second: holds its old value, then snaps at the end. */
  held: boolean;
  /** The input value restored at the end (`null`: unset). */
  readonly end: unknown;
  /** The value written last; anything else there means another update replaced it. */
  last: unknown;
  dropped: boolean;
}

interface Running {
  readonly tracks: Track[];
  readonly ease: Easing;
  readonly duration: number;
  start: number;
  started: boolean;
  settle(completed: boolean): void;
}

/** What is drawn when a transition starts. */
interface Snapshot {
  readonly full: SupplyDefaultsResult;
  readonly axes: readonly {
    readonly id: string;
    readonly name: string;
    readonly type: string;
    readonly scale: Scale;
    readonly range: readonly [number, number];
  }[];
}

/** A frame in the queue (Plotly's `_frameQueue` entries). */
interface Entry extends TargetFrame {
  readonly frameOpts: Required<FrameOptions>;
  readonly transitionOpts: Required<TransitionOptions>;
  /** The last frame of an `animate` call: settles its promise. */
  complete?: () => void;
  interrupt?: (error: Error) => void;
}

function interrupted(): Error {
  const error = new Error('holochart: the animation was interrupted');
  error.name = 'AnimationInterrupted';
  return error;
}

function reducedMotion(el: HTMLElement): boolean {
  try {
    const view = el.ownerDocument.defaultView;
    return view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

/** Position attributes that interpolate only on non-category axes. */
const POSITION = /^([xy])(?:0|$)|^d([xy])$/;

/** Whether a defaulted axis maps positions through categories. */
function categorical(axis: FullAxis | undefined): boolean {
  return axis?.type === 'category' || axis?.type === 'multicategory';
}

/** The layout key of an axis id: `'x'` → `'xaxis'`, `'y2'` → `'yaxis2'`. */
function axisKey(id: string): string {
  return `${id.charAt(0)}axis${id.slice(1)}`;
}

/** The animation state of one chart. */
export class Animation {
  readonly #host: AnimationHost;
  #running: Running | undefined;
  /** Trace order recorded while a transition applies its update (react adding traces). */
  #order: readonly (number | undefined)[] | undefined;
  #queue: Entry[] = [];
  #current: Entry | undefined;
  #currentName: string | null = null;
  #animating = false;
  #lastFrameAt = -Infinity;
  #timeToNext = 0;
  /** The playing frame's transition, until it settles (identity token). */
  #settling: object | undefined;
  /** The queue ran out while the last frame's transition was still running: emit `animated` then. */
  #endPending = false;
  /** An animation frame is requested. */
  #looping = false;
  /** Counter for the names of unnamed frames (`'frame <n>'`). */
  #named = 0;

  constructor(host: AnimationHost) {
    this.#host = host;
    host.remapped((order) => {
      this.#order = order;
      const running = this.#running;
      if (!running) return;
      const to = new Map<number, number>();
      order.forEach((from, i) => {
        if (from !== undefined) to.set(from, i);
      });
      for (const t of running.tracks) {
        if (t.trace < 0) continue;
        const j = to.get(t.trace);
        if (j === undefined) t.dropped = true;
        else t.trace = j;
      }
    });
  }

  get #chart(): Chart {
    return this.#host.chart;
  }

  #now(): number {
    return this.#host.scheduler.now?.() ?? performance.now();
  }

  // ---- frames ----------------------------------------------------------------------------------

  addFrames(list: unknown, indices?: number | readonly (number | null | undefined)[]): void {
    if (list === null || list === undefined) return;
    if (!Array.isArray(list)) {
      throw new TypeError('addFrames failure: frameList must be an Array of frame definitions');
    }
    const figure = this.#host.figure();
    const at = typeof indices === 'number' ? [indices] : indices;
    figure.frames = insertFrames(frameList(figure.frames), list, at, () => this.#named++);
  }

  deleteFrames(indices?: number | readonly number[] | null): void {
    const figure = this.#host.figure();
    const list = typeof indices === 'number' ? [indices] : indices;
    figure.frames = removeFrames(frameList(figure.frames), list);
  }

  // ---- animate -----------------------------------------------------------------------------------

  /** Plotly's `animate` (see the module comment). */
  animate(target: AnimateTarget, options?: AnimationOptions): Promise<Chart> {
    const chart = this.#chart;
    const opts = animationOptions(options);
    let list: TargetFrame[];
    try {
      list = resolveTarget(target, frameList(this.#host.figure().frames));
    } catch (error) {
      console.warn(`[holochart] ${(error as Error).message}`);
      return Promise.reject(error);
    }
    if (opts.mode !== 'afterall') this.#dropQueue();
    if (opts.direction === 'reverse') list.reverse();
    if (opts.fromcurrent) list = fromCurrent(list, this.#currentName);
    if (list.length === 0) {
      chart.emit('animated', undefined);
      return Promise.resolve(chart);
    }
    return new Promise<Chart>((resolve, reject) => {
      list.forEach((frame, i) => {
        const entry: Entry = {
          ...frame,
          frameOpts: opts.frame(i),
          transitionOpts: opts.transition(i),
        };
        if (i === list.length - 1) {
          // Settles once the frame's duration is over and its transition has finished.
          let count = 0;
          entry.complete = () => {
            if (++count === 2) resolve(chart);
          };
          entry.interrupt = reject;
        }
        this.#queue.push(entry);
      });
      if (opts.mode === 'immediate') this.#lastFrameAt = -Infinity;
      if (!this.#animating) this.#begin();
    });
  }

  /** Drop the queued frames (not the one playing); their calls' promises reject. */
  #dropQueue(): void {
    const dropped = this.#queue;
    this.#queue = [];
    for (const entry of dropped) entry.interrupt?.(interrupted());
    if (dropped.length > 0) this.#chart.emit('animationinterrupted', undefined);
  }

  #begin(): void {
    // A new animation replaces one whose last frame is still settling: that one ends here.
    if (this.#endPending) {
      this.#endPending = false;
      this.#chart.emit('animated', undefined);
    }
    this.#settling = undefined;
    this.#chart.emit('animating', undefined);
    this.#animating = true;
    this.#lastFrameAt = -Infinity;
    this.#timeToNext = 0;
    this.#current = undefined;
    this.#nextFrame(this.#now());
    this.#loop();
  }

  /** Start the next queued frame (or end the animation when there is none). */
  #nextFrame(time: number): void {
    this.#current?.complete?.();
    const entry = this.#queue.shift();
    this.#current = entry;
    if (!entry) {
      this.#animating = false;
      // `animated` means the last frame is drawn: wait for its transition when it runs longer
      // than the frame (or its pipeline pass is slow).
      if (this.#settling) this.#endPending = true;
      else this.#chart.emit('animated', undefined);
      return;
    }
    this.#currentName = entry.name;
    this.#host.current(entry.name);
    this.#lastFrameAt = time;
    this.#timeToNext = entry.frameOpts.duration;
    this.#chart.emit('animatingframe', {
      name: entry.name,
      frame: entry.frame,
      animation: { frame: entry.frameOpts, transition: entry.transitionOpts },
    });
    const warn = (message: string): void => console.warn(message);
    const token = {};
    this.#settling = token;
    const settled = (): void => {
      if (this.#settling !== token) return;
      this.#settling = undefined;
      if (!this.#endPending) return;
      this.#endPending = false;
      this.#chart.emit('animated', undefined);
    };
    this.#transition(
      (plan) => {
        const { traces, layout } = frameEdits(entry.frame, this.#host.figure().data.length, warn);
        this.#host.patch(plan, traces, layout);
      },
      () => entry.transitionOpts,
      true,
    ).then(
      (completed) => {
        settled();
        if (completed) entry.complete?.();
        else entry.interrupt?.(interrupted());
      },
      (error: unknown) => {
        settled();
        entry.interrupt?.(error as Error);
      },
    );
  }

  // ---- react with a transition -------------------------------------------------------------------

  /** `chart.react(figure)` with `layout.transition`: the update, animated. */
  react(figure: FigureInput): Promise<Chart> {
    const chart = this.#chart;
    this.#interrupt();
    const apply = this.#host.react(figure);
    if (!apply) return Promise.resolve(chart);
    return this.#transition(
      apply,
      (full) => transitionOptions(full.fullLayout['transition']),
      false,
    ).then(() => chart);
  }

  // ---- transitions -------------------------------------------------------------------------------

  /**
   * Apply an update (`apply` edits the figure and plans the run) as a transition. Resolves `true`
   * once it has finished (and the final state is drawn), `false` when another transition
   * interrupted it. `always`: emit `transitioning` / `transitioned` even when nothing animates
   * (frames); otherwise only when something does (react, like Plotly).
   */
  #transition(
    apply: (plan: Plan) => void,
    optionsOf: (full: SupplyDefaultsResult) => Required<TransitionOptions>,
    always: boolean,
  ): Promise<boolean> {
    const host = this.#host;
    const chart = this.#chart;
    this.#interrupt();
    const drawn = host.full();
    const from: Snapshot | undefined = drawn && {
      full: drawn,
      axes: [...host.axes().values()].map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        scale: a.scale,
        range: [a.scale.range[0], a.scale.range[1]] as const,
      })),
    };
    let running: Running | undefined;
    let events = always;
    const first = host.run((plan) => {
      this.#order = undefined;
      apply(plan);
      if (!from) return;
      const figure = host.figure();
      const target = supplyDefaults(figure as FigureInput, host.core, { validate: false });
      const tracks = this.#tracks(from, figure, target);
      if (tracks.length === 0) return;
      events = true;
      const opts = optionsOf(target);
      if (opts.duration <= 0 || reducedMotion(chart.element)) return;
      running = this.#start(plan, tracks, opts);
    });
    if (events) chart.emit('transitioning', undefined);
    if (!running) {
      return first.then(() => {
        if (events) chart.emit('transitioned', undefined);
        return true;
      });
    }
    const active = running;
    return new Promise<boolean>((resolve, reject) => {
      active.settle = (completed) => {
        if (completed) chart.emit('transitioned', undefined);
        resolve(completed);
      };
      first.catch((error: unknown) => {
        if (this.#running === active) this.#running = undefined;
        reject(error);
      });
    });
  }

  /** The tracks of a transition from `from` to the figure just applied. */
  #tracks(
    from: Snapshot,
    figure: { data: unknown[]; layout: Record<string, unknown> },
    target: SupplyDefaultsResult,
  ): Track[] {
    const tracks: Track[] = [];
    const order = this.#order;
    const add = (trace: number, path: string, tween: Tween, constant: boolean, input: unknown) => {
      const end = getIn(input, path);
      tracks.push({
        trace,
        path,
        tween,
        constant,
        held: false,
        end: end === undefined ? null : end,
        last: end,
        dropped: false,
      });
    };
    target.fullData.forEach((to, i) => {
      const j = order ? order[i] : i;
      const was = j === undefined ? undefined : from.full.fullData[j];
      if (!was || was.type !== to.type || was.visible !== true || to.visible !== true) return;
      const schema = this.#host.core.getTraceSchema(to.type);
      const paths = animatablePaths(to, schema);
      if (paths.length === 0) return;
      const input = figure.data[i];
      const fromIds = was['ids'];
      const toIds = to['ids'];
      const count = pointCount(to);
      const fill = to['fill'];
      const joined =
        String(to['mode'] ?? '').includes('lines') || (fill !== undefined && fill !== 'none');
      const byIds = isArrayLike(fromIds) && isArrayLike(toIds);
      const match = matchPoints(
        pointCount(was),
        count,
        byIds ? fromIds : undefined,
        byIds ? toIds : undefined,
        !joined,
      );
      const onCategories = (letter: string): boolean => {
        const id = to[`${letter}axis`];
        return typeof id === 'string' && categorical(target.fullLayout[axisKey(id)] as FullAxis);
      };
      const done = new Set<string>();
      for (const path of paths) {
        const position = POSITION.exec(path);
        if (position && onCategories((position[1] ?? position[2]) as string)) continue;
        const a = getIn(was, path);
        const b = getIn(to, path);
        const kind = pointKind(path);
        const scalars = !isArrayLike(a) && !isArrayLike(b);
        // Scalars stay scalars, unless entering / exiting points must fade or grow.
        if (!perPoint(schema!, path) || (scalars && (kind === 'value' || !match.changed))) {
          const tween = scalars ? interpolator(a, b, kind) : undefined;
          if (tween) add(i, path, tween, false, input);
          continue;
        }
        if (!match.changed && sameValue(a, b)) continue;
        const { tween, constant } = pointTween(a, b, match, kind);
        if (constant && !match.changed) continue;
        add(i, path, tween, constant, input);
        done.add(path);
      }
      if (match.length > count) {
        // Exiting points need every other per-point array too (their text, symbols, ids…).
        for (const path of pointArrayPaths(input, count)) {
          if (done.has(path)) continue;
          const { tween } = pointTween(getIn(was, path), getIn(input, path), match, 'value');
          add(i, path, tween, true, input);
        }
      }
    });
    const layout = figure.layout;
    for (const axis of from.axes) {
      const full = target.fullLayout[axis.name] as FullAxis | undefined;
      if (!full || full.autorange !== false || !Array.isArray(full.range)) continue;
      if ((full.type === '-' ? 'linear' : full.type) !== axis.type) continue;
      const r0 = axis.scale.r2l(full.range[0]);
      const r1 = axis.scale.r2l(full.range[1]);
      const [a0, a1] = axis.range;
      if (!Number.isFinite(r0) || !Number.isFinite(r1)) continue;
      if (Math.abs(r0 - a0) + Math.abs(r1 - a1) <= 1e-12 * (Math.abs(a1 - a0) || 1)) continue;
      const scale = axis.scale;
      add(
        -1,
        `${axis.name}.range`,
        (e) => [scale.l2r(a0 + (r0 - a0) * e), scale.l2r(a1 + (r1 - a1) * e)],
        false,
        layout,
      );
    }
    return tracks;
  }

  /** Start animating `tracks`: `ordering`, and the first frame (progress 0). */
  #start(plan: Plan, tracks: Track[], opts: Required<TransitionOptions>): Running {
    const layout = tracks.some((t) => t.trace < 0);
    if (layout && tracks.some((t) => t.trace >= 0)) {
      const holdTraces = opts.ordering !== 'traces first';
      for (const t of tracks) t.held = t.trace < 0 ? !holdTraces : holdTraces;
    }
    const running: Running = {
      tracks,
      ease: easing(opts.easing),
      duration: opts.duration,
      start: this.#now(),
      started: false,
      settle: () => undefined,
    };
    this.#write(plan, running, 0, false);
    this.#running = running;
    this.#loop();
    return running;
  }

  /**
   * Write the tracks' values at eased progress `e` into the input (or their end values), as a
   * quiet update (it plans the pipeline stages the attributes need).
   */
  #write(plan: Plan, running: Running, e: number, final: boolean): void {
    const figure = this.#host.figure();
    const traceEdits = new Map<number, Record<string, unknown>>();
    const layoutEdits: Record<string, unknown> = {};
    for (const t of running.tracks) {
      if (t.dropped) continue;
      const container = t.trace < 0 ? figure.layout : figure.data[t.trace];
      if (container === undefined || !Object.is(getIn(container, t.path), t.last)) {
        t.dropped = true;
        continue;
      }
      let value: unknown;
      if (final) value = t.end;
      else if (t.constant || t.held) {
        if (running.started) continue;
        value = t.tween(0);
      } else value = t.tween(e);
      t.last = value === null ? undefined : value;
      if (t.trace < 0) {
        layoutEdits[t.path] = value;
        // An axis range as is: without the `autorange: false` a range relayout implies.
        if (t.path.endsWith('.range')) layoutEdits[`${t.path.slice(0, -6)}.autorange`] = undefined;
      } else {
        let edits = traceEdits.get(t.trace);
        if (!edits) traceEdits.set(t.trace, (edits = {}));
        edits[t.path] = value;
      }
    }
    running.started = true;
    this.#host.patch(plan, traceEdits, layoutEdits);
    plan.tween ||= !final;
  }

  /** Jump the running transition to its end (in the input; drawn by the next run). */
  #interrupt(): void {
    const running = this.#running;
    if (!running) return;
    this.#running = undefined;
    if (!this.#chart.destroyed) {
      this.#host.run((plan) => this.#write(plan, running, 1, true)).catch(() => undefined);
      this.#chart.emit('transitioninterrupted', undefined);
    }
    running.settle(false);
  }

  /** Finish the running transition: end values, drawn, then `transitioned`. */
  #finish(running: Running): void {
    this.#running = undefined;
    this.#host
      .run((plan) => this.#write(plan, running, 1, true))
      .then(
        () => running.settle(true),
        () => running.settle(true),
      );
  }

  // ---- the frame loop ------------------------------------------------------------------------------

  #loop(): void {
    if (this.#looping) return;
    this.#looping = true;
    this.#host.scheduler.request(this.#tick);
  }

  readonly #tick = (time: number): void => {
    this.#looping = false;
    if (this.#chart.destroyed) {
      this.#destroyed();
      return;
    }
    const running = this.#running;
    if (running) {
      const t = running.duration > 0 ? (time - running.start) / running.duration : 1;
      if (t >= 1) this.#finish(running);
      else {
        const e = running.ease(t);
        this.#host.run((plan) => this.#write(plan, running, e, false)).catch(() => undefined);
      }
    }
    if (this.#animating && time - this.#lastFrameAt > this.#timeToNext) this.#nextFrame(time);
    if (this.#running || this.#animating) this.#loop();
  };

  /** The chart was destroyed: settle every pending promise. */
  #destroyed(): void {
    const running = this.#running;
    this.#running = undefined;
    running?.settle(false);
    this.#animating = false;
    this.#settling = undefined;
    this.#endPending = false;
    const pending = [...this.#queue, ...(this.#current ? [this.#current] : [])];
    this.#queue = [];
    this.#current = undefined;
    for (const entry of pending) entry.interrupt?.(interrupted());
  }
}

/** The animation state of a chart (created once per chart, on first use). */
export function createAnimation(host: AnimationHost): Animation {
  return new Animation(host);
}
