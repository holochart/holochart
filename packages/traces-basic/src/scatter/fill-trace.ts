/**
 * A scatter trace's fill (plan E9.4) from its calc: the drawn path (and the linked previous
 * trace's, see `cross-trace.ts`) → polygon rings (`fill.ts`), plus the fill's colors, for the view
 * and for hover on fills. Memoized per calc, so a redraw that changes nothing the fill depends on
 * (another trace's restyle, a streaming frame of a sibling trace) does not re-triangulate.
 */
import { toRGBA, type FullTrace } from '@mk7s/holochart-core';
import type { FillPaint, RGBA } from '@mk7s/holochart-render';
import type { AxisInfo } from '@mk7s/holochart-runtime';
import { resolveColorscale } from '../shared/colorscale.ts';
import { drawnSeries, type ScatterCalc } from './calc.ts';
import { buildFill, type FillGeometry, type FillMode } from './fill.ts';
import { buildLinePath, needsRebuild, type LineShape } from './line-path.ts';
import { traceOpacity } from './style.ts';

/** |px per linear unit| of the transform the fill was built for (splines depend on it). */
export interface FillScales {
  readonly scaleX: number;
  readonly scaleY: number;
}

/** A trace's fill geometry and whether it has to be rebuilt when the zoom changes a lot. */
export interface TraceFill {
  readonly geometry: FillGeometry | undefined;
  /** The path is a spline (own or previous): its shape in linear space depends on the scales. */
  readonly dependsOnScale: boolean;
  readonly scales: FillScales;
}

interface PathOptions {
  shape: LineShape;
  smoothing: number;
  connectgaps: boolean;
}

function pathOptions(trace: FullTrace): PathOptions {
  const line = (trace['line'] ?? {}) as { shape?: unknown; smoothing?: unknown };
  return {
    shape: (typeof line.shape === 'string' ? line.shape : 'linear') as LineShape,
    smoothing: typeof line.smoothing === 'number' ? line.smoothing : 1,
    connectgaps: trace['connectgaps'] === true,
  };
}

function isSpline(o: PathOptions): boolean {
  return o.shape === 'spline' && o.smoothing > 0;
}

/** The fill mode of a trace (`'none'` when unset). */
export function fillMode(trace: FullTrace): FillMode {
  const fill = trace['fill'];
  return typeof fill === 'string' ? (fill as FillMode) : 'none';
}

/**
 * The drawn path a fill follows: the line path with the trace's shape, at full resolution (the
 * line's `simplify` decimation is for strokes; a decimated fill edge would depend on the zoom).
 */
function drawnPath(
  calc: ScatterCalc,
  o: PathOptions,
  scales: FillScales,
): { x: Float64Array; y: Float64Array } {
  const s = drawnSeries(calc);
  const path = buildLinePath(s.x, s.y, { ...o, ...scales, simplify: false });
  return { x: path.x, y: path.y };
}

/**
 * Linear coordinate of the `tozero*` baseline. Zero on linear, date (the epoch) and category
 * (the first category) axes. A log axis has no zero: Plotly clips it to far below the visible
 * range; here it is a fixed depth below the data, so zooming never moves it (it only needs to
 * stay out of view).
 */
function zeroOf(axis: AxisInfo | undefined, values: ArrayLike<number>): number {
  if (axis?.type !== 'log') return 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i] as number;
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!Number.isFinite(lo)) return 0;
  return lo - Math.max(30, 10 * (hi - lo));
}

interface Memo {
  key: string;
  own: object;
  previous: object | undefined;
  fill: TraceFill;
}

const MEMO = new WeakMap<ScatterCalc, Memo>();

/**
 * The fill of `trace` at the given scales, memoized per calc: rebuilt only when the fill mode,
 * the path options (own or previous), the series (own or previous) change, or — for splines —
 * when {@link needsRebuild} says the scales changed enough.
 */
export function traceFill(
  calc: ScatterCalc,
  trace: FullTrace,
  axes: { x?: AxisInfo | undefined; y?: AxisInfo | undefined },
  scales: FillScales,
): TraceFill {
  const mode = fillMode(trace);
  const own = pathOptions(trace);
  const link = calc.link?.previous;
  const prevOpts = link ? pathOptions(link.trace) : undefined;
  const key = JSON.stringify([mode, own, prevOpts, axes.x?.type, axes.y?.type]);
  const series = drawnSeries(calc);
  const prevSeries = link ? drawnSeries(link.calc) : undefined;
  const memo = MEMO.get(calc);
  const spline = isSpline(own) || (prevOpts !== undefined && isSpline(prevOpts));
  if (
    memo &&
    memo.key === key &&
    memo.own === series.y &&
    memo.previous === prevSeries?.y &&
    (!memo.fill.dependsOnScale || !needsRebuild(memo.fill.scales, scales, { spline: true }))
  ) {
    return memo.fill;
  }
  let geometry: FillGeometry | undefined;
  if (mode !== 'none' && calc.length > 0) {
    const path = drawnPath(calc, own, scales);
    const previous = link && prevOpts ? drawnPath(link.calc, prevOpts, scales) : undefined;
    geometry = buildFill({
      mode,
      path,
      previous,
      zeroX: zeroOf(axes.x, path.x),
      zeroY: zeroOf(axes.y, path.y),
    });
  }
  const fill: TraceFill = {
    geometry,
    dependsOnScale: spline,
    scales: { scaleX: scales.scaleX, scaleY: scales.scaleY },
  };
  MEMO.set(calc, { key, own: series.y, previous: prevSeries?.y, fill });
  return fill;
}

/** The fill color (`fillcolor`, or the line color at half opacity as a fallback). */
export function fillColor(trace: FullTrace): RGBA {
  const c = trace['fillcolor'];
  const rgba = typeof c === 'string' ? toRGBA(c) : null;
  if (rgba) return rgba;
  const line = (trace['line'] as { color?: unknown } | undefined)?.color;
  const l = typeof line === 'string' ? toRGBA(line) : null;
  return l ? [l[0], l[1], l[2], 0.5] : [0.5, 0.5, 0.5, 0.5];
}

interface FullFillGradient {
  type?: unknown;
  colorscale?: unknown;
  start?: unknown;
  stop?: unknown;
}

/**
 * The fill paint: a `fillgradient` (with `start` / `stop` converted to linear coordinates of the
 * gradient's axis) when it has a type and a valid colorscale, else solid.
 */
export function fillPaint(
  trace: FullTrace,
  axes: { x?: AxisInfo | undefined; y?: AxisInfo | undefined },
): FillPaint {
  const g = trace['fillgradient'] as FullFillGradient | undefined;
  const type = g?.type;
  if (type !== 'horizontal' && type !== 'vertical' && type !== 'radial') return { kind: 'solid' };
  const colorscale = resolveColorscale(g?.colorscale);
  if (!colorscale || colorscale.length === 0) return { kind: 'solid' };
  const axis = type === 'horizontal' ? axes.x : axes.y;
  const linear = (v: unknown): number | undefined => {
    if (typeof v !== 'number' || type === 'radial') return undefined;
    const l = axis ? axis.scale.d2l(v) : v;
    return Number.isFinite(l) ? l : undefined;
  };
  return {
    kind: 'gradient',
    direction: type,
    colorscale,
    start: linear(g?.start),
    stop: linear(g?.stop),
  };
}

/** Fill style for the primitive: color, paint and the trace opacity. */
export function fillStyle(
  trace: FullTrace,
  axes: { x?: AxisInfo | undefined; y?: AxisInfo | undefined },
): { color: RGBA; paint: FillPaint; opacity: number } {
  return { color: fillColor(trace), paint: fillPaint(trace, axes), opacity: traceOpacity(trace) };
}
