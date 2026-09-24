/**
 * `violin` calc and cross-trace calc (plan E10.5; plotly.js `violin/calc.js`,
 * `violin/cross_trace_calc.js`). Pure, over typed arrays (worker-friendly, E16.5).
 *
 * - `calc` runs the box sample calc, then per violin the KDE bandwidth (Silverman's rule by
 *   default), its span (`spanmode`) and the density on Plotly's grid.
 * - `crossTraceCalc` lays violins out like boxes (widths, group offsets, points) and scales the
 *   densities to their slots: per scale group (`scalemode: 'width'` or `'count'`), or per trace
 *   with a fixed `width`. Plotly's scale groups span the figure; here they span a subplot.
 */
import type { AxisType, FullLayout, FullTrace } from '@mk7s/holochart-core';
import type {
  CalcContext,
  CrossTraceContext,
  CrossTraceEntry,
  TraceExtremes,
} from '@mk7s/holochart-runtime';
import {
  boxAxes,
  calcBoxSamples,
  layoutBoxes,
  valueExtremes,
  valueToCalc,
  type BoxCalc,
} from '../box/calc.ts';
import { kdeBandwidth, kdeGrid, kdeSpan, type SpanMode } from '../shared/stats.ts';

/** Violin calcdata: box calcdata plus the density of each violin. */
export interface ViolinCalc extends BoxCalc {
  /** KDE bandwidth per violin (calc space). */
  readonly bandwidth: Float64Array;
  /** Density span per violin (calc space). */
  readonly span0: Float64Array;
  readonly span1: Float64Array;
  /** Violin `b` owns grid points `[density.start[b], density.start[b + 1])`. */
  readonly density: {
    readonly start: Int32Array;
    /** Grid positions (calc space of the value axis). */
    readonly t: Float64Array;
    /** Density. */
    readonly v: Float64Array;
  };
  /** Largest density and largest sample count over the trace's violins. */
  readonly maxKDE: number;
  readonly maxCount: number;
  /**
   * Density → position-axis units, per violin: a density `v` is drawn `v / scale[b]` from the
   * center (Plotly's `scale`; set by the layout).
   */
  scale: Float64Array;
}

function num(v: unknown, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
}

/** The KDE of every violin of a box calc. */
function densities(
  calc: BoxCalc,
  trace: FullTrace,
  spanData: readonly [number, number] | undefined,
): Omit<ViolinCalc, keyof BoxCalc> {
  const { stats, samples, count } = calc;
  const bandwidth = new Float64Array(count);
  const span0 = new Float64Array(count);
  const span1 = new Float64Array(count);
  const start = new Int32Array(count + 1);
  const ts: Float64Array[] = [];
  const vs: Float64Array[] = [];
  const mode = (trace['spanmode'] as SpanMode | undefined) ?? 'soft';
  const userBandwidth = num(trace['bandwidth'], 0) || undefined;
  let maxKDE = 0;
  let maxCount = 0;
  for (let b = 0; b < count; b++) {
    const from = samples.start[b]!;
    const to = samples.start[b + 1]!;
    const s = {
      min: stats.min[b]!,
      max: stats.max[b]!,
      q1: stats.q1[b]!,
      q3: stats.q3[b]!,
      mean: stats.mean[b]!,
    };
    const h = kdeBandwidth(samples.value, s, userBandwidth, from, to);
    let span = kdeSpan(mode, s.min, s.max, h, spanData);
    let grid = s.min === s.max && h === 0 ? undefined : kdeGrid(samples.value, h, span, from, to);
    if (!grid) {
      // All samples equal and no bandwidth (or an unusable span): one point of density 1.
      span = [s.min, s.max];
      grid = { t: Float64Array.of(s.min), v: Float64Array.of(1), max: 1 };
    }
    bandwidth[b] = h;
    span0[b] = span[0];
    span1[b] = span[1];
    ts.push(grid.t);
    vs.push(grid.v);
    start[b + 1] = start[b]! + grid.t.length;
    maxKDE = Math.max(maxKDE, grid.max);
    maxCount = Math.max(maxCount, to - from);
  }
  const t = new Float64Array(start[count]!);
  const v = new Float64Array(start[count]!);
  for (let b = 0; b < count; b++) {
    t.set(ts[b]!, start[b]!);
    v.set(vs[b]!, start[b]!);
  }
  return {
    bandwidth,
    span0,
    span1,
    density: { start, t, v },
    maxKDE,
    maxCount,
    scale: new Float64Array(count).fill(1),
  };
}

/**
 * Density scales of violins laid out together (Plotly's violin `plot`): per scale group, the
 * group's peak density fills the half-width (`scalemode: 'width'`), times the group's largest count
 * over each violin's (`'count'`); with a fixed `width`, per trace.
 */
export function scaleViolins(entries: readonly { calc: ViolinCalc; trace: FullTrace }[]): void {
  const groups = new Map<string, { maxKDE: number; maxCount: number }>();
  for (const { calc, trace } of entries) {
    if (num(trace['width'], 0)) continue;
    const key = String(trace['scalegroup'] ?? '');
    const g = groups.get(key) ?? { maxKDE: 0, maxCount: 0 };
    g.maxKDE = Math.max(g.maxKDE, calc.maxKDE);
    g.maxCount = Math.max(g.maxCount, calc.maxCount);
    groups.set(key, g);
  }
  for (const { calc, trace } of entries) {
    const bdPos = calc.offsets.bdPos;
    const scale = new Float64Array(calc.count);
    const g = groups.get(String(trace['scalegroup'] ?? ''));
    for (let b = 0; b < calc.count; b++) {
      let s: number;
      if (num(trace['width'], 0) || !g) s = calc.maxKDE / bdPos;
      else if (trace['scalemode'] === 'count') {
        const n = calc.stats.n[b]!;
        s = (g.maxKDE / bdPos) * (g.maxCount / (n || 1));
      } else s = g.maxKDE / bdPos;
      scale[b] = s > 0 && Number.isFinite(s) ? s : 1;
    }
    calc.scale = scale;
  }
}

/** Violin calc: box statistics and densities, laid out and scaled as if the trace were alone. */
export function calcViolin(trace: FullTrace, ctx: CalcContext): ViolinCalc {
  const box = calcBoxSamples(trace, ctx, 'violin');
  const va = boxAxes(box.orientation, ctx.xaxis, ctx.yaxis)[1];
  const spanIn = trace['span'];
  const spanData: [number, number] | undefined = Array.isArray(spanIn)
    ? [valueToCalc(va?.scale, spanIn[0]), valueToCalc(va?.scale, spanIn[1])]
    : undefined;
  const calc: ViolinCalc = Object.assign(box, densities(box, trace, spanData));
  layoutViolins([{ calc, trace }], ctx.fullLayout);
  return calc;
}

/** Lay out and scale violins sharing a subplot and orientation. */
export function layoutViolins(
  entries: readonly { calc: ViolinCalc; trace: FullTrace }[],
  fullLayout: FullLayout,
): void {
  layoutBoxes(entries, fullLayout);
  scaleViolins(entries);
}

/** Cross-trace calc: every violin trace of one subplot together, per orientation. */
export function crossTraceCalcViolin(
  entries: readonly CrossTraceEntry<ViolinCalc>[],
  ctx: CrossTraceContext,
): void {
  for (const orientation of ['v', 'h'] as const) {
    const group = entries.filter(
      (e) => e.calc && e.calc.orientation === orientation && e.calc.count > 0,
    );
    if (group.length > 0) layoutViolins(group, ctx.fullLayout);
  }
}

/** Autorange extremes: the density spans on the value axis, the violins on the position axis. */
export function violinExtremes(
  calc: ViolinCalc,
  _trace: FullTrace,
  ctx: CalcContext,
): TraceExtremes {
  const va = boxAxes(calc.orientation, ctx.xaxis, ctx.yaxis)[1];
  let lo = Infinity;
  let hi = -Infinity;
  for (let b = 0; b < calc.count; b++) {
    lo = Math.min(lo, calc.span0[b]!);
    hi = Math.max(hi, calc.span1[b]!);
  }
  const value = valueExtremes(lo, hi, va?.scale, calc.valType as AxisType | undefined);
  const pos = calc.offsets.extremes;
  return calc.orientation === 'h' ? { x: value, y: pos } : { x: pos, y: value };
}
