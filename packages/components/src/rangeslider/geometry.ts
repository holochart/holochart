/**
 * Range slider geometry and drag math (plan E5.9; plotly.js `components/rangeslider/draw.js`,
 * `helpers.js`), pure: where the slider goes, how much bottom margin it needs (`margins.ts`,
 * re-exported), where its window is, and what a drag or click does to the window. All positions
 * are container px (top-left origin); ranges are the axis' linear coordinates (compressed on axes
 * with range breaks, so the slider skips breaks like the axis does). Only the view uses this
 * module: it loads on first use (`shared/lazy-view.ts`).
 */
import { RANGESLIDER_PAD, type FullRangeslider } from './margins.ts';

// The margin math, which layout needs synchronously (the rest of this module loads with the view).
export {
  axisDepth,
  RANGESLIDER_PAD,
  rangesliderOf,
  sliderHeight,
  sliderMarginPush,
  type FullRangeslider,
} from './margins.ts';

/** Width of the grab area around each end of the window, px (Plotly's `grabAreaWidth`). */
export const RANGESLIDER_GRAB = 10;
/** Width of the drawn handles, px (Plotly's `handleWidth`). */
export const RANGESLIDER_HANDLE = 4;
/** Narrowest window a drag may leave, px. */
const MIN_WINDOW = 1;

/** A thumbnail's y range settings (`rangeslider.yaxis<N>`). */
export interface RangesliderYaxis {
  readonly rangemode: 'auto' | 'fixed' | 'match';
  readonly range?: readonly unknown[];
}

/** A y axis' thumbnail settings (default `match`). */
export function rangesliderYaxis(rs: FullRangeslider, yName: string): RangesliderYaxis {
  const v = rs[yName] as Partial<RangesliderYaxis> | undefined;
  const mode = v?.rangemode;
  return {
    rangemode: mode === 'auto' || mode === 'fixed' ? mode : 'match',
    ...(Array.isArray(v?.range) ? { range: v.range } : {}),
  };
}

/** Plotly's `_offsetShift`: half the border, so the border sits outside the slider. */
export function offsetShift(rs: Pick<FullRangeslider, 'borderwidth'>): number {
  return Math.floor(Math.max(0, rs.borderwidth) / 2);
}

/** The slider's rect (without its border), container px. */
export function sliderRect(opts: {
  /** Container px of the axis' start and end (`AxisInfo.start` / `end`). */
  readonly start: number;
  readonly end: number;
  /** Container px of the lowest subplot edge on the axis. */
  readonly bottom: number;
  /** Axis depth below that edge (0 for top axes). */
  readonly depth: number;
  readonly height: number;
  readonly borderwidth: number;
}): { x: number; y: number; width: number; height: number } {
  const x = Math.round(Math.min(opts.start, opts.end));
  const width = Math.round(Math.abs(opts.end - opts.start));
  const shift = Math.floor(Math.max(0, opts.borderwidth) / 2);
  const y = Math.round(opts.bottom + opts.depth + shift + RANGESLIDER_PAD);
  return { x, y, width, height: Math.round(opts.height) };
}

/**
 * The slider's linear range (Plotly's `rangeslider.range` handling): its own range (the axis'
 * full-data autorange with `autorange`, else the given `range`), widened to cover the axis range
 * in view, in the axis' direction.
 */
export function sliderRange(
  base: readonly [number, number] | undefined,
  axisRange: readonly [number, number],
): [number, number] {
  const [a0, a1] = axisRange;
  if (!base || !Number.isFinite(base[0]) || !Number.isFinite(base[1]) || base[0] === base[1]) {
    return [a0, a1];
  }
  const lo = Math.min(base[0], base[1]);
  const hi = Math.max(base[0], base[1]);
  return a0 <= a1
    ? [Math.min(lo, a0, a1), Math.max(hi, a0, a1)]
    : [Math.max(hi, a0, a1), Math.min(lo, a0, a1)];
}

/** Linear coordinate → px along a slider of `width` px spanning `range`. */
export function sliderD2P(l: number, range: readonly [number, number], width: number): number {
  const d = range[1] - range[0];
  return d === 0 ? 0 : ((l - range[0]) / d) * width;
}

/** Px along the slider → linear coordinate. */
export function sliderP2D(p: number, range: readonly [number, number], width: number): number {
  return width === 0 ? range[0] : range[0] + (p / width) * (range[1] - range[0]);
}

/** The window (the axis range in view) in slider px, clamped to the slider (Plotly). */
export function windowPixels(
  axisRange: readonly [number, number],
  range: readonly [number, number],
  width: number,
): [number, number] {
  const c = (p: number): number => Math.min(Math.max(p, 0), width);
  const a = c(sliderD2P(axisRange[0], range, width));
  const b = c(sliderD2P(axisRange[1], range, width));
  return a <= b ? [a, b] : [b, a];
}

/** What a press on the slider grabs. */
export type SliderTarget = 'min' | 'max' | 'window' | 'background';

/** What is under slider px `p`: an end of the window (±5 px), the window, or the background. */
export function sliderTarget(p: number, window: readonly [number, number]): SliderTarget {
  const half = RANGESLIDER_GRAB / 2;
  const [pmin, pmax] = window;
  const dMin = Math.abs(p - pmin);
  const dMax = Math.abs(p - pmax);
  if (dMin <= half || dMax <= half) {
    // A narrow window: the closer end wins; inside a window narrower than both grab areas, the
    // side of the middle decides.
    if (dMin < dMax) return 'min';
    if (dMax < dMin) return 'max';
    return p <= (pmin + pmax) / 2 ? 'min' : 'max';
  }
  return p > pmin && p < pmax ? 'window' : 'background';
}

/**
 * The window after dragging `delta` px from a press at slider px `start` on `target` (Plotly's
 * `mouseMove`): the window moves (keeping its width, held inside the slider — Plotly lets it run
 * off and shrink), an end moves (the ends swap when they cross), or a press on the background
 * draws a new window from the press point. `undefined` when the result is not a window.
 */
export function dragWindow(
  target: SliderTarget,
  window: readonly [number, number],
  start: number,
  delta: number,
  width: number,
): [number, number] | undefined {
  const [pmin, pmax] = window;
  let a: number;
  let b: number;
  switch (target) {
    case 'window': {
      const d = Math.min(Math.max(delta, -pmin), width - pmax);
      a = pmin + d;
      b = pmax + d;
      break;
    }
    case 'min':
      a = pmin + delta;
      b = pmax;
      break;
    case 'max':
      a = pmin;
      b = pmax + delta;
      break;
    default:
      a = start;
      b = start + delta;
  }
  const lo = Math.min(Math.max(Math.min(a, b), 0), width);
  const hi = Math.min(Math.max(Math.max(a, b), 0), width);
  return hi - lo >= MIN_WINDOW ? [lo, hi] : undefined;
}

/** The window centered on slider px `p`, same width, held inside the slider (click to center). */
export function centerWindow(
  p: number,
  window: readonly [number, number],
  width: number,
): [number, number] {
  const w = Math.min(window[1] - window[0], width);
  const lo = Math.min(Math.max(p - w / 2, 0), width - w);
  return [lo, lo + w];
}

/**
 * The axis range for a window (Plotly's `setDataRange`): slider px → linear, clamped to the
 * slider's range, in the axis' direction (a reversed axis keeps `range[0] > range[1]`).
 */
export function windowRange(
  window: readonly [number, number],
  range: readonly [number, number],
  width: number,
  reversed: boolean,
): [number, number] {
  const lo = Math.min(range[0], range[1]);
  const hi = Math.max(range[0], range[1]);
  const c = (l: number): number => Math.min(Math.max(l, lo), hi);
  const a = c(sliderP2D(window[0], range, width));
  const b = c(sliderP2D(window[1], range, width));
  const [min, max] = a <= b ? [a, b] : [b, a];
  return reversed ? [max, min] : [min, max];
}
