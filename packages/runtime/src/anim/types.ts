/**
 * Types of frames, `animate` and transitions (plan E7.3, E7.4). The animation code itself loads on
 * first use (`animation.ts`, a dynamic `import()` from the chart), so these live apart from it.
 */
import type { FigureInput, Registry, SupplyDefaultsResult } from '@mk7s/holochart-core';
import type { FrameScheduler } from '@mk7s/holochart-render';
import type { Chart, Plan } from '../chart.ts';
import type { AxisInfo } from '../contracts.ts';
import type { AttributeUpdate } from '../plan.ts';

/** Plotly's easing names (`layout.transition.easing`, `animate`'s `transition.easing`). */
export type EasingName =
  `${'linear' | 'quad' | 'cubic' | 'sin' | 'exp' | 'circle' | 'elastic' | 'back' | 'bounce'}${'' | '-in' | '-out' | '-in-out'}`;

/** How long a change animates, with which easing (`layout.transition`, `animate` options). */
export interface TransitionOptions {
  /** Milliseconds. Default 500. */
  readonly duration?: number;
  /** Default `'cubic-in-out'`. */
  readonly easing?: EasingName | (string & {});
  /**
   * When a change moves axis ranges and traces at once, which of them animates (Plotly): the other
   * snaps when the transition ends. Default `'layout first'`: the axes animate.
   */
  readonly ordering?: 'layout first' | 'traces first';
}

/** Per-frame timing of `animate`. */
export interface FrameOptions {
  /** Milliseconds from the start of one frame to the start of the next. Default 500. */
  readonly duration?: number;
  /**
   * Plotly redraws the whole plot after a frame's transition when `true` (default), so changes that
   * cannot animate show up. Holochart always draws every change incrementally, so `false` changes
   * nothing; it is accepted for compatibility.
   */
  readonly redraw?: boolean;
}

/** Options of {@link Chart.animate} (Plotly's `animationOpts`). */
export interface AnimationOptions {
  /**
   * What happens to frames still queued by earlier calls: `'afterall'` (default) plays these frames
   * after them, `'next'` drops them and starts once the current frame's duration is over,
   * `'immediate'` drops them and starts now, interrupting the current transition.
   */
  readonly mode?: 'immediate' | 'next' | 'afterall';
  /** `'reverse'` plays the frames backwards. Default `'forward'`. */
  readonly direction?: 'forward' | 'reverse';
  /** Start after the frame shown last (when it is one of the frames asked for). Default false. */
  readonly fromcurrent?: boolean;
  /** Frame timing: one object for every frame, or one per frame (the last repeats). */
  readonly frame?: FrameOptions | readonly FrameOptions[];
  /**
   * Transition into each frame: one object, or one per frame. Its duration is capped at the
   * frame's duration.
   */
  readonly transition?: TransitionOptions | readonly TransitionOptions[];
}

/**
 * An animation frame (`figure.frames[i]`, {@link Chart.addFrames}): trace and layout changes
 * applied as one step, like Plotly's frames.
 */
export interface Frame {
  /** Name to animate to (numbers are converted to strings). Unnamed frames get `'frame N'`. */
  readonly name?: string | number;
  /** Group name: `animate('group')` plays the frames of a group in order. */
  readonly group?: string | number;
  /** Trace changes, merged into the traces listed in `traces` (default: trace `i` for `data[i]`). */
  readonly data?: readonly (Readonly<Record<string, unknown>> | null | undefined)[];
  /** Trace indices `data` applies to. */
  readonly traces?: number | readonly number[];
  /** Layout changes (attribute strings such as `'xaxis.range'` work too). */
  readonly layout?: Readonly<Record<string, unknown>>;
  /** Name of a frame this one extends: its `data` and `layout` apply first. */
  readonly baseframe?: string | number;
  readonly [key: string]: unknown;
}

/**
 * What {@link Chart.animate} plays: `null` / `undefined` for every frame in order, a string or
 * number for the frames of that **group**, a frame object, or a list of frame names and frame
 * objects (`['2007']` plays the frame named `'2007'`; `[null]` plays nothing, which with
 * `mode: 'immediate'` pauses).
 */
export type AnimateTarget =
  | string
  | number
  | null
  | undefined
  | Frame
  | readonly (string | number | Frame | null | undefined)[];

/** A frame with its `baseframe` chain applied (the `frame` of `animatingframe`). */
export interface ComputedFrame {
  readonly data?: readonly Readonly<Record<string, unknown>>[];
  readonly traces?: readonly number[];
  readonly layout?: Readonly<Record<string, unknown>>;
}

/** Payload of `animatingframe`: the frame that starts now. */
export interface AnimatingFrameEvent {
  /** The frame's name (`null` for frame objects passed to `animate` directly). */
  readonly name: string | null;
  readonly frame: ComputedFrame;
  readonly animation: {
    readonly frame: Required<FrameOptions>;
    readonly transition: Required<TransitionOptions>;
  };
}

/** Internal: what the chart hands the lazily loaded animation code. */
export interface AnimationHost {
  readonly chart: Chart;
  readonly core: Registry;
  readonly scheduler: FrameScheduler;
  /** The chart's input figure (live: `data` entries and `layout` are replaced on every edit). */
  figure(): { data: unknown[]; layout: Record<string, unknown>; frames: unknown };
  /** What is drawn now (the last pipeline run). */
  full(): SupplyDefaultsResult | undefined;
  axes(): ReadonlyMap<string, AxisInfo>;
  /** Schedule a pipeline run (batched like every update call). */
  run(mutate: (plan: Plan) => void): Promise<Chart>;
  /** Merge trace and layout edits into the figure (a quiet `update`: no events). */
  patch(plan: Plan, traces: ReadonlyMap<number, AttributeUpdate>, layout: AttributeUpdate): void;
  /** Plan `react(figure)` (`undefined`: nothing changed, the figure is taken as is). */
  react(figure: FigureInput): ((plan: Plan) => void) | undefined;
  /** Record the frame shown (Plotly's `fullLayout._currentFrame`). */
  current(name: string | null): void;
  /** Called with Plotly's order (`order[newIndex] = oldIndex`) when traces are added or moved. */
  remapped(listener: ((order: readonly (number | undefined)[]) => void) | undefined): void;
}
