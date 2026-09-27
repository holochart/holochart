/**
 * The polar traces' shared `crossTraceLayout` (plan E11.4, E11.5): once per layout pass, with every
 * visible `scatterpolar` and `barpolar` trace, it stacks and sizes the bars of each subplot
 * (`polar.barmode`, `polar.bargap`; plotly.js `barpolar/calc.js` `crossTraceCalc` with the bar
 * `setGroupPositions`), links `fill: 'tonext'` traces to the previous scatterpolar trace of their
 * subplot, autoranges each subplot's radial axis over its traces and lays the subplot out
 * ({@link PolarSubplot}), handing it to every member (`calc.subplot`) and to the polar axes.
 */
import {
  findExtremes,
  createScale,
  type AxisExtremes,
  type FullLayout,
  type FullTrace,
  type Scale,
} from '@mk7s/holochart-core';
import type { DomainLayoutContext, DomainTraceEntry } from '@mk7s/holochart-runtime';
import type { PolarCoordinates } from './coordinates.ts';
import { subplotOf } from './layout-defaults.ts';
import { PolarSubplot } from './subplot.ts';

/** What every polar trace's calc carries. */
export interface PolarCalc {
  readonly coords: PolarCoordinates;
  /** Radial autorange contribution (bars: set by the stacking step). */
  extremes: AxisExtremes | undefined;
  /** The subplot the trace is drawn on, set by {@link polarCrossTraceLayout}. */
  subplot: PolarSubplot | undefined;
  /** `fill: 'tonext'`: the previous scatterpolar trace on the subplot. */
  previous?: { readonly calc: PolarCalc; readonly trace: FullTrace; readonly index: number };
  /** Bars (`barpolar`): the stacked geometry, set by {@link polarCrossTraceLayout}. */
  bars?: BarGeometry;
}

/** Stacked bar geometry of one `barpolar` trace, in calc units (see `stackBars`). */
export interface BarGeometry {
  /** Angular extent of each bar (angular calc values). */
  readonly p0: Float64Array;
  readonly p1: Float64Array;
  /** Radial extent, in calc values (data numbers: not log10 on log axes). */
  readonly s0: Float64Array;
  readonly s1: Float64Array;
}

/** Subplots laid out in the latest pass, by the layout they were built for. */
const LAID_OUT = new WeakMap<FullLayout, Map<string, PolarSubplot>>();

/** The subplots {@link polarCrossTraceLayout} built for `fullLayout`, if it ran for it. */
export function laidOutSubplots(
  fullLayout: FullLayout,
): ReadonlyMap<string, PolarSubplot> | undefined {
  return LAID_OUT.get(fullLayout);
}

/** Radial calc value (data number) → linear coordinate. */
export function radialC2l(scale: Scale, c: number): number {
  return scale.type === 'log' ? (c > 0 ? Math.log10(c) : NaN) : c;
}

/** Radial linear coordinate → calc value. */
export function radialL2c(scale: Scale, l: number): number {
  return scale.type === 'log' ? 10 ** l : l;
}

function numberAt(v: unknown, i: number): number | undefined {
  const x = ArrayBuffer.isView(v) || Array.isArray(v) ? (v as ArrayLike<unknown>)[i] : v;
  return typeof x === 'number' && Number.isFinite(x) ? x : undefined;
}

/** Plotly's `distinctVals(...).minDiff` over positions (1 when there is a single value). */
function minDiff(values: number[]): number {
  const vals = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (vals.length === 0) return 1;
  const last = vals.length - 1;
  let min = vals[last]! - vals[0]! || 1;
  const err = min / (last || 1) / 10000;
  let prev = vals[0]!;
  for (let i = 1; i <= last; i++) {
    const v = vals[i]!;
    if (v - prev > err) {
      min = Math.min(min, v - prev);
      prev = v;
    }
  }
  return min;
}

/** Angular width / offset attribute value in calc units (radians on linear axes). */
function angularValue(
  v: number | undefined,
  entry: DomainTraceEntry<PolarCalc>,
): number | undefined {
  if (v === undefined) return undefined;
  if (entry.calc.coords.angular.type === 'category') return v;
  const unit = entry.trace['thetaunit'];
  return unit === 'degrees' ? (v / 180) * Math.PI : unit === 'gradians' ? (v / 200) * Math.PI : v;
}

/**
 * Bar extents on one subplot (plotly.js `setGroupPositions` in `stack` / `overlay` mode): each bar
 * is `(1 - bargap)` × the smallest distance between bar positions wide (over every trace in
 * `stack` mode, per trace in `overlay` mode), unless the trace sets `width`, centered unless it
 * sets `offset`; in `stack` mode bars at one position stack outwards in trace order, except those
 * of traces that set `base`, which are drawn from their base as in `overlay` mode.
 */
export function stackBars(
  entries: readonly DomainTraceEntry<PolarCalc>[],
  polar: Readonly<Record<string, unknown>>,
): void {
  const mode = polar['barmode'] === 'overlay' ? 'overlay' : 'stack';
  const gap = typeof polar['bargap'] === 'number' ? polar['bargap'] : 0.1;
  const all: number[] = [];
  if (mode === 'stack') for (const e of entries) all.push(...e.calc.coords.theta);
  const sharedDiff = mode === 'stack' ? minDiff(all) : 0;
  // Running totals per position (stack mode).
  const sums = new Map<number, number>();
  const key = (p: number): number => Math.round(p * 1e9) / 1e9;
  for (const e of entries) {
    const { coords } = e.calc;
    const n = coords.length;
    const trace = e.trace;
    const diff = mode === 'stack' ? sharedDiff : minDiff([...coords.theta]);
    const p0 = new Float64Array(n);
    const p1 = new Float64Array(n);
    const s0 = new Float64Array(n);
    const s1 = new Float64Array(n);
    const base = trace['base'];
    const hasBase = base !== undefined && base !== null;
    const scale = coords.radialScale;
    const extremeValues: number[] = [];
    for (let i = 0; i < n; i++) {
      const p = coords.theta[i]!;
      const s = radialL2c(scale, coords.r[i]!);
      const width = angularValue(numberAt(trace['width'], i), e) ?? diff * (1 - gap);
      const offset = angularValue(numberAt(trace['offset'], i), e) ?? -width / 2;
      p0[i] = p + offset;
      p1[i] = p + offset + width;
      if (!Number.isFinite(p) || !Number.isFinite(s)) {
        s0[i] = s1[i] = NaN;
        continue;
      }
      let b: number;
      if (hasBase) {
        const bv = numberAt(base, i);
        b = bv === undefined ? 0 : scale.type === 'log' ? bv : bv;
      } else if (mode === 'stack') {
        const k = key(p);
        b = sums.get(k) ?? 0;
        sums.set(k, b + s);
      } else {
        b = 0;
      }
      s0[i] = b;
      s1[i] = b + s;
      extremeValues.push(b, b + s);
    }
    e.calc.bars = { p0, p1, s0, s1 };
    // Radial autorange: both ends of every bar, padded like Plotly's bars.
    const proxy: Scale =
      scale.type === 'category' ? createScale({ type: 'linear', range: scale.range }) : scale;
    e.calc.extremes = findExtremes(proxy, extremeValues, { padded: true, tozero: !hasBase });
  }
}

/** The shared `crossTraceLayout` of `scatterpolar` and `barpolar` (see the module comment). */
export function polarCrossTraceLayout(
  entries: readonly DomainTraceEntry<PolarCalc>[],
  ctx: DomainLayoutContext,
): void {
  const bySubplot = new Map<string, DomainTraceEntry<PolarCalc>[]>();
  for (const e of entries) {
    const id = subplotOf(e.trace);
    const list = bySubplot.get(id);
    if (list) list.push(e);
    else bySubplot.set(id, [e]);
  }
  const built = new Map<string, PolarSubplot>();
  for (const [id, list] of bySubplot) {
    const polar = (ctx.fullLayout[id] ?? {}) as Record<string, unknown>;
    const bars = list.filter((e) => e.trace.type === 'barpolar');
    if (bars.length > 0) stackBars(bars, polar);
    let previous: PolarCalc['previous'];
    for (const e of list) {
      if (e.trace.type !== 'scatterpolar') continue;
      if (e.trace['fill'] === 'tonext' && previous) e.calc.previous = previous;
      else delete e.calc.previous;
      previous = { calc: e.calc, trace: e.trace, index: e.index };
    }
    const extremes: AxisExtremes[] = [];
    for (const e of list) if (e.calc.extremes) extremes.push(e.calc.extremes);
    const subplot = new PolarSubplot({
      fullLayout: ctx.fullLayout,
      id,
      plotArea: ctx.plotArea,
      extremes,
    });
    built.set(id, subplot);
    for (const e of list) e.calc.subplot = subplot;
  }
  LAID_OUT.set(ctx.fullLayout, built);
}
