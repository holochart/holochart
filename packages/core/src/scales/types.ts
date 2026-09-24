/**
 * Scale contract (plan E3.1) between the scales workstream (implementations, autorange, ticks) and
 * the runtime (which maps data to GPU buffers and axis ranges to `DataTransform`s).
 *
 * ## Spaces
 *
 * - **Data**: what users pass (numbers, dates as ms/ISO strings/`Date`, category names).
 * - **Linear (`l`)**: where GPU buffers live — identity for `linear`, log10 for `log`, ms since the
 *   epoch (UTC) for `date`, category index for `category` / `multicategory`. Every M1 axis type is
 *   affine from linear space to pixels, so a pan/zoom is just a new `DataTransform` (no re-upload).
 *   On rangebreaks axes (`date` / `linear` with `ScaleOptions.breaks`), linear space is the
 *   compressed space: raw value (ms or number) minus the length of the breaks between raw 0 and
 *   it (see `breaks.ts`), so it stays affine to pixels. There `d2l` gives NaN inside a break,
 *   `r2l` compresses without masking, and `l2d` / `l2r` expand back to raw values.
 * - **Raw**: on rangebreaks axes only, the uncompressed values (ms, numbers) — what ticks and
 *   labels are computed from (`rawScale`).
 * - **Pixel (`p`)**: CSS px along the axis, 0 at `range[0]`, `length` at `range[1]`.
 *
 * Keep this interface stable: the runtime and every trace build on it. Additions are fine.
 */
import type { FullAxis } from '../defaults/types.ts';
import type { BreakMap } from './breaks.ts';

export type AxisType = 'linear' | 'log' | 'date' | 'category' | 'multicategory';

export interface ScaleOptions {
  type: AxisType;
  /** Initial range in linear space. Default [0, 1]. */
  range?: readonly [number, number];
  /** Axis length in CSS px. Default 1. */
  length?: number;
  /** Category order for `category` / `multicategory` axes (index = linear coordinate). */
  categories?: readonly string[];
  /**
   * Category order for `multicategory` axes as `[group, item]` pairs (index = linear coordinate).
   * Takes precedence over `categories` on multicategory axes. See `axisCategories`.
   */
  multicategories?: readonly (readonly [string, string])[];
  /**
   * Receives data warnings (e.g. non-positive values on a log axis), at most once per message
   * per scale. Defaults to a process-wide warn-once `console.warn`.
   */
  onWarning?: (message: string) => void;
  /**
   * Range breaks (`createBreakMap`) of a `date` or `linear` axis: linear space becomes the
   * compressed space (see above). Ignored on other types.
   */
  breaks?: BreakMap;
}

export interface Scale {
  readonly type: AxisType;
  /** Data value → linear coordinate; NaN when not representable (≤ 0 on log, unknown category). */
  d2l(value: unknown): number;
  /** Fast path for whole data arrays (typed arrays stay allocation-free when `out` is given). */
  d2lArray(values: ArrayLike<unknown>, out?: Float64Array): Float64Array;
  /** Linear coordinate → data value for display (number, ms, or category name). */
  l2d(l: number): number | string;
  /** Visible range in linear space; `range[0] > range[1]` means reversed. */
  readonly range: readonly [number, number];
  setRange(r0: number, r1: number): void;
  /** Axis length in CSS px. */
  readonly length: number;
  setLength(px: number): void;
  l2p(l: number): number;
  p2l(p: number): number;
  /** `l2p` in affine form: `p = l * m + b`. */
  affine(): { m: number; b: number };

  // --- Additions (scales workstream) ---------------------------------------------------------
  /** Data value → pixel (`l2p(d2l(v))`). */
  d2p(value: unknown): number;
  /** Pixel → data value (`l2d(p2l(p))`). */
  p2d(p: number): number | string;
  /**
   * Range value (as in `axis.range`, `tick0`, `tickvals` bounds) → linear. Like `d2l`, except that
   * log ranges are already exponents (Plotly semantics) and category ranges may be fractional
   * indices as well as category names.
   */
  r2l(value: unknown): number;
  /**
   * Linear → range value: a number, except on date axes, which give the shortest ISO string
   * (`2024-03-01 12:30`), matching what users write in `axis.range`.
   */
  l2r(l: number): number | string;
  /** Categories of a `category` axis (index = linear coordinate); empty for other types. */
  readonly categories: readonly string[];
  /** `[group, item]` categories of a `multicategory` axis; empty for other types. */
  readonly multicategories: readonly (readonly [string, string])[];
  /** Range breaks of a `date` / `linear` axis (linear space is compressed); else undefined. */
  readonly breaks: BreakMap | undefined;
}

/** A data extreme a trace contributes to autorange, with the pixel padding it needs (marker size). */
export interface ExtremePoint {
  /** Linear coordinate. */
  l: number;
  /** CSS px of room to leave beyond this value (e.g. marker radius + line width). */
  padPx: number;
  /**
   * Also leave Plotly's "5% padding": 5% of the axis length in px on top of `padPx`. Set for
   * points of traces whose extent should not touch the axis ends (markers, text); lines-only
   * traces leave it off.
   */
  extrapad?: boolean;
}

/** What one trace contributes to one axis' autorange. */
export interface AxisExtremes {
  min: ExtremePoint[];
  max: ExtremePoint[];
  /** The trace wants the range to include zero (bars, `rangemode: 'tozero'`). */
  tozero?: boolean;
}

/** One tick mark (plan E3.3). */
export interface Tick {
  /** Linear coordinate. */
  l: number;
  /** Formatted label (may contain Plotly pseudo-HTML for multi-level date labels). */
  text: string;
  minor?: boolean;

  // --- Additions (scales workstream) ---------------------------------------------------------
  /** Multicategory axes: the group label drawn on the second row (see `multicategoryLevels`). */
  text2?: string;
  /**
   * Where to draw the label, in linear space, when it differs from the tick position
   * (`ticklabelmode: 'period'` centers labels in their period).
   */
  labelL?: number;
  /** Draw the label only: no tick mark or grid line (the extra leading tick of period mode). */
  noTick?: boolean;
  /**
   * Label font size relative to `tickfont.size` (log axes: 0.75 for the small "2, 5" digit
   * labels, 1.25 for `10<sup>n</sup>` power labels).
   */
  fontScale?: number;
}

/** Signatures the scales workstream implements (see `index.ts`). */
export type CreateScale = (options: ScaleOptions) => Scale;
export type Autorange = (
  extremes: readonly AxisExtremes[],
  scale: Scale,
  axis: FullAxis,
) => [number, number];
export type ComputeTicks = (scale: Scale, axis: FullAxis) => Tick[];
