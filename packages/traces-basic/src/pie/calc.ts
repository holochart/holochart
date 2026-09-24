/**
 * `pie` calc (plan E9.11), ported from plotly.js' `traces/pie/calc.js` and the angle part of
 * `plot.js` (`setCoords`): one {@link PieSlice} per distinct label, with its value, data indices,
 * explicit color, hidden flag and angles. Center, radius and default colors depend on the layout
 * and on the other pies; `crossTraceLayout` (`layout.ts`) fills them in.
 *
 * ## Angles
 *
 * Slice angles follow Plotly: radians from 12 o'clock, **clockwise on screen** (`a`); a point at
 * angle `a` and radius `r` from the center is at container px `(cx + r·sin a, cy − r·cos a)`. The
 * arc primitive's angle (0 = +x, counter-clockwise, y up) is `π/2 − a`.
 */
import { isArrayLike, type FullTrace } from '@mk7s/holochart-core';
import type { CalcContext } from '@mk7s/holochart-runtime';
import { castOption, isNumeric, rgbaString } from './helpers.ts';

/** One slice: every data point with the same label (Plotly's calcdata point). */
export interface PieSlice {
  /** The label (string). */
  readonly label: string;
  /** Sum of the values of the slice's points (their count without `values`). */
  readonly v: number;
  /** First data index (Plotly `pt.i`). */
  readonly i: number;
  /** Every data index merged into the slice (Plotly `pt.pts`), in data order. */
  readonly pts: readonly number[];
  /** The label is in `layout.hiddenlabels`: not drawn, not part of the total. */
  readonly hidden: boolean;
  /** Color from `marker.colors` (first valid one of `pts`) as `rgb()` / `rgba()`, else `null`. */
  readonly explicitColor: string | null;
  /**
   * CSS fill color: `explicitColor`, or the label's color in the colormap shared by all pies (set by
   * `crossTraceLayout`; `''` until then).
   */
  color: string;
  /** Fraction of the radius the slice is pulled out (`pull`). */
  readonly pull: number;
  /**
   * Angles (Plotly convention, see the module comment). `start` is where the slice begins in
   * `direction`, `stop` where it ends; `mid` is the bisector; `half` is half the angular span,
   * capped at π/2 (Plotly's `halfangle`). NaN for hidden slices and when nothing is visible.
   */
  readonly startAngle: number;
  readonly stopAngle: number;
  readonly midAngle: number;
  readonly halfAngle: number;
  /**
   * Radius fraction of the largest circle inscribed in the slice (Plotly's `rInscribed`), used for
   * horizontal inside text and the hover anchor.
   */
  readonly rInscribed: number;
}

/** Placement of a pie in container px (top-left origin), set by `crossTraceLayout`. */
export interface PieLayout {
  /** Center and outer radius (before pulls). */
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  /** Figure size (the overlay viewport). */
  readonly width: number;
  readonly height: number;
  /** The trace's domain in container px. */
  readonly domain: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

/** Calcdata of a pie trace. */
export interface PieCalc {
  /** Slices in draw order (sorted by value when `sort`). */
  readonly slices: PieSlice[];
  /** Sum of the visible slices' values. */
  readonly vTotal: number;
  /** `1 − hole` (Plotly `ring`). */
  readonly ring: number;
  /** Largest `pull` of the trace (Plotly `getMaxPull`: every entry of an array). */
  readonly maxPull: number;
  /** Title block size (unscaled, px) when the trace has a title; set by `crossTraceLayout`. */
  titleBox: { width: number; height: number } | null;
  /** Set by `crossTraceLayout` (`undefined` before the first layout). */
  layout: PieLayout | undefined;
}

function hiddenSet(value: unknown): Set<string> {
  const out = new Set<string>();
  if (isArrayLike(value)) for (let i = 0; i < value.length; i++) out.add(String(value[i]));
  return out;
}

/** Plotly's `getMaxPull`: the pull, or the largest entry of a pull array. */
export function maxPullOf(pull: unknown): number {
  if (isArrayLike(pull)) {
    let max = 0;
    for (let i = 0; i < pull.length; i++) {
      const p = pull[i];
      if (typeof p === 'number' && p > max) max = p;
    }
    return max;
  }
  return typeof pull === 'number' && pull > 0 ? pull : 0;
}

interface Point {
  label: string;
  v: number;
  i: number;
  pts: number[];
  hidden: boolean;
  explicitColor: string | null;
}

/**
 * Aggregate the data into slices (Plotly's `calc`): skip non-numeric values, count 1 per label
 * without `values`, label points `label0 + i·dlabel` without `labels` (index when a label is
 * empty), merge duplicate labels (sum values, keep all indices, first valid color wins), drop
 * merged slices whose total is negative, sort descending by value when `sort`.
 */
export function aggregateSlices(trace: FullTrace, hiddenlabels: unknown): Point[] {
  const hidden = hiddenSet(hiddenlabels);
  const length = typeof trace['_length'] === 'number' ? trace['_length'] : 0;
  const hasValues = trace['_hasValues'] === true && length > 0;
  const values = trace['values'];
  const colors = (trace['marker'] as { colors?: unknown } | undefined)?.colors;
  let labels: unknown = trace['labels'];
  const dlabel = trace['dlabel'];
  if (typeof dlabel === 'number' && dlabel !== 0) {
    const label0 = typeof trace['label0'] === 'number' ? trace['label0'] : 0;
    labels = Array.from({ length }, (_, i) => String(label0 + i * dlabel));
  }
  const colorAt = (i: number): string | null =>
    isArrayLike(colors) ? rgbaString(colors[i]) : null;

  const byLabel = new Map<string, Point>();
  const points: Point[] = [];
  for (let i = 0; i < length; i++) {
    let v = 1;
    if (hasValues) {
      const raw = (values as ArrayLike<unknown>)[i];
      if (!isNumeric(raw)) continue;
      v = Number(raw);
    }
    const raw = isArrayLike(labels) ? labels[i] : undefined;
    const label = raw === undefined || raw === '' ? String(i) : String(raw);
    const existing = byLabel.get(label);
    if (!existing) {
      const pt: Point = {
        label,
        v,
        i,
        pts: [i],
        hidden: hidden.has(label),
        explicitColor: colorAt(i),
      };
      byLabel.set(label, pt);
      points.push(pt);
    } else {
      existing.v += v;
      existing.pts.push(i);
      existing.explicitColor ??= colorAt(i);
    }
  }
  const kept = points.filter((p) => p.v >= 0);
  if (trace['sort'] !== false) kept.sort((a, b) => b.v - a.v);
  return kept;
}

/** Plotly's `getInscribedRadiusFraction`. */
function inscribedFraction(
  v: number,
  vTotal: number,
  half: number,
  ring: number,
  hole: number,
): number {
  if (v === vTotal && !hole) return 1;
  return Math.min(1 / (1 + 1 / Math.sin(half)), ring / 2);
}

/** Pie calc: aggregated slices with their angles (Plotly's `calc` + `setCoords`). */
export function calcPie(trace: FullTrace, ctx: Pick<CalcContext, 'fullLayout'>): PieCalc {
  const points = aggregateSlices(trace, ctx.fullLayout['hiddenlabels']);
  // Plotly adds every value to the total before dropping negative merged slices; summing the kept
  // slices keeps the angles consistent (a dropped slice would otherwise shrink the circle).
  let vTotal = 0;
  for (const p of points) if (!p.hidden) vTotal += p.v;

  const hole = typeof trace['hole'] === 'number' ? trace['hole'] : 0;
  const ring = 1 - hole;
  const rotation = typeof trace['rotation'] === 'number' ? trace['rotation'] : 0;
  const pull = trace['pull'];

  let angle = (rotation * Math.PI) / 180;
  let factor = vTotal > 0 ? (2 * Math.PI) / vTotal : NaN;
  const firstVisible = points.find((p) => !p.hidden);
  if (trace['direction'] === 'counterclockwise' && firstVisible) {
    // The first slice keeps its edge at the starting angle; later ones go counterclockwise.
    angle += factor * firstVisible.v;
    factor = -factor;
  }

  const slices: PieSlice[] = points.map((p) => {
    const common = {
      label: p.label,
      v: p.v,
      i: p.i,
      pts: p.pts,
      hidden: p.hidden,
      explicitColor: p.explicitColor,
      color: p.explicitColor ?? '',
      pull: Number(castOption(pull, p.pts)) || 0,
    };
    if (p.hidden || !(vTotal > 0)) {
      return {
        ...common,
        startAngle: NaN,
        stopAngle: NaN,
        midAngle: NaN,
        halfAngle: NaN,
        rInscribed: 0,
      };
    }
    const startAngle = angle;
    angle += (factor * p.v) / 2;
    const midAngle = angle;
    angle += (factor * p.v) / 2;
    const halfAngle = Math.PI * Math.min(p.v / vTotal, 0.5);
    return {
      ...common,
      startAngle,
      stopAngle: angle,
      midAngle,
      halfAngle,
      rInscribed: inscribedFraction(p.v, vTotal, halfAngle, ring, hole),
    };
  });

  return {
    slices,
    vTotal,
    ring,
    maxPull: maxPullOf(pull),
    titleBox: null,
    layout: undefined,
  };
}

/** Container px of the point at Plotly angle `a` and radius `r` from `(cx, cy)`. */
export function polar(cx: number, cy: number, r: number, a: number): [number, number] {
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

/** The center a slice is drawn around: the pie center moved out along the bisector by its pull. */
export function sliceCenter(
  slice: PieSlice,
  layout: Pick<PieLayout, 'cx' | 'cy' | 'r'>,
): [number, number] {
  if (!(slice.pull > 0) || !Number.isFinite(slice.midAngle)) return [layout.cx, layout.cy];
  return polar(layout.cx, layout.cy, slice.pull * layout.r, slice.midAngle);
}
