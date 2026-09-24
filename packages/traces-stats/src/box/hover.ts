/**
 * Box hover and selection (plan E10.4, E6.1, E6.3; plotly.js `box/hover.js`, `box/select.js`).
 *
 * - **Boxes** (`hoveron` has `boxes`): the box whose slot holds the pointer (and whose value range
 *   does, in `closest` mode) shows one label per statistic — max, upper fence, q3, median, mean,
 *   q1, lower fence, min — each at its value, as Plotly does. They form one multi-label hover, so
 *   they show together in `closest` mode too; only the median label carries the trace name. When
 *   boxes overlap, the narrowest wins (Plotly's pseudo-distance).
 * - **Points** (`hoveron` has `points`): the drawn point nearest the pointer, labeled with its box
 *   position and value (and `text`); `hovertemplate` applies. In `closest` mode a point under the
 *   pointer wins over the box statistics; in `x` / `y` modes both show.
 *
 * `violin` reuses both (see `violin/hover.ts`).
 */
import { isArrayLike, type FullTrace } from '@mk7s/holochart-core';
import { pointInPolygon } from '@mk7s/holochart-render';
import {
  formatAxisValue,
  type AxisInfo,
  type HoverContext,
  type HoverPoint,
  type HoverQuery,
  type SelectionQuery,
} from '@mk7s/holochart-runtime';
import { boxAxes, calcToLinear, type BoxCalc } from './calc.ts';
import { isOpaque } from './style.ts';

/** A box statistic hover labels show. */
export type StatKey = 'max' | 'uf' | 'q3' | 'med' | 'mean' | 'q1' | 'lf' | 'min';

/** Plotly's label of each statistic. */
export const STAT_LABELS: Readonly<Record<StatKey, string>> = {
  max: 'max:',
  uf: 'upper fence:',
  q3: 'q3:',
  med: 'median:',
  mean: 'mean:',
  q1: 'q1:',
  lf: 'lower fence:',
  min: 'min:',
};

/** The linear → viewport px mapping of each axis of a calc, as (position, value). */
interface Axes {
  readonly pm: number;
  readonly pb: number;
  readonly vm: number;
  readonly vb: number;
  readonly pa: AxisInfo | undefined;
  readonly va: AxisInfo | undefined;
}

function axesOf(calc: BoxCalc, ctx: HoverContext): Axes {
  const t = ctx.transform;
  const [pa, va] = boxAxes(calc.orientation, ctx.xaxis, ctx.yaxis);
  return calc.orientation === 'h'
    ? { pm: t.scaleY, pb: t.offsetY, vm: t.scaleX, vb: t.offsetX, pa, va }
    : { pm: t.scaleX, pb: t.offsetX, vm: t.scaleY, vb: t.offsetY, pa, va };
}

/** A data value for event points and labels: linear → data on the axis (numbers without one). */
function dataOf(axis: AxisInfo | undefined, l: number): unknown {
  if (!axis || !Number.isFinite(l)) return l;
  return axis.scale.l2d(l);
}

function has(flags: unknown, flag: string): boolean {
  return typeof flags === 'string' && (flags === 'all' || flags.split('+').includes(flag));
}

/** The label color (Plotly: the line color when drawn, else the markers', else the fill). */
export function hoverColor(trace: FullTrace, calc: BoxCalc): string {
  const line = (trace['line'] ?? {}) as { color?: unknown; width?: unknown };
  const marker = (trace['marker'] ?? {}) as { color?: unknown };
  if (isOpaque(line.color) && Number(line.width) > 0) return String(line.color);
  if (isOpaque(marker.color) && calc.mode) return String(marker.color);
  return String(trace['fillcolor'] ?? '#444');
}

/** Options of {@link hoverOnBoxes}: violins test their KDE span and one-sided slots. */
export interface BoxHoverOptions {
  /** Value range a box / violin hovers over, in calc space (default: its min–max). */
  readonly range?: (b: number) => readonly [number, number];
  /** Violin `side`. */
  readonly side?: 'both' | 'positive' | 'negative';
  /** Whether the mean is a hover statistic (box: `boxmean` or sd mode; violin: `meanline`). */
  readonly hasMean: boolean;
}

/** The box under the pointer, or -1 (Plotly's `hoverOnBoxes` + `Fx.getClosest`). */
export function boxUnderPointer(
  calc: BoxCalc,
  query: HoverQuery,
  axes: Axes,
  options: BoxHoverOptions,
): number {
  const { bPos, wHover } = calc.offsets;
  const horizontal = calc.orientation === 'h';
  const pVal = horizontal ? query.yl : query.xl;
  const vVal = horizontal ? query.xl : query.yl;
  const posMode = query.mode === (horizontal ? 'y' : 'x');
  const valMode = query.mode === (horizontal ? 'x' : 'y');
  const side = options.side ?? 'both';
  let best = -1;
  let bestDistance = Infinity;
  for (let b = 0; b < calc.count; b++) {
    const shift = calc.pos[b]! + bPos - pVal;
    const inPos =
      side === 'positive'
        ? shift <= 0 && shift + wHover >= 0
        : side === 'negative'
          ? shift >= 0 && shift - wHover <= 0
          : Math.abs(shift) <= wHover;
    const [c0, c1] = options.range ? options.range(b) : [calc.stats.min[b]!, calc.stats.max[b]!];
    const v0 = calcToLinear(calc.valType, c0);
    const v1 = calcToLinear(calc.valType, c1);
    const inVal = vVal >= Math.min(v0, v1) && vVal <= Math.max(v0, v1);
    const hit = posMode ? inPos : valMode ? inVal : inPos && inVal;
    if (!hit) continue;
    // Ties: the first box wins (Plotly's strict `<`); along the value axis, the nearest position.
    const d = valMode ? Math.abs(shift * axes.pm) : 0;
    if (d < bestDistance) {
      bestDistance = d;
      best = b;
    }
  }
  return best;
}

/** The statistics shown for a box, in label order (Plotly's `attrs`). */
export function statKeys(hasFences: boolean, hasMean: boolean): StatKey[] {
  if (hasFences && hasMean) return ['max', 'uf', 'q3', 'med', 'mean', 'q1', 'lf', 'min'];
  if (hasFences) return ['max', 'uf', 'q3', 'med', 'q1', 'lf', 'min'];
  if (hasMean) return ['max', 'q3', 'med', 'mean', 'q1', 'min'];
  return ['max', 'q3', 'med', 'q1', 'min'];
}

/** Hover labels of box `b`: one per statistic, as a multi-label group. */
export function statPoints(
  calc: BoxCalc,
  trace: FullTrace,
  b: number,
  query: HoverQuery,
  axes: Axes,
  options: BoxHoverOptions,
): HoverPoint[] {
  const { bPos, bdPos } = calc.offsets;
  const horizontal = calc.orientation === 'h';
  const side = options.side ?? 'both';
  const { stats } = calc;
  const hasFences = Boolean(calc.mode);
  const keys = statKeys(hasFences, options.hasMean);
  // Plotly lists the labels from the top (or left): reversed for horizontal boxes and reversed
  // value axes.
  if (horizontal !== axes.vm < 0) keys.reverse();
  const withSd = trace['boxmean'] === 'sd' || trace['sizemode'] === 'sd';
  const sdmultiple = typeof trace['sdmultiple'] === 'number' ? trace['sdmultiple'] : 1;
  const meanLabel = withSd
    ? `mean ± ${sdmultiple === 1 ? 'σ' : `${sdmultiple}σ`}:`
    : STAT_LABELS.mean;
  const center = calc.pos[b]! + bPos;
  const edge = center + (side === 'negative' ? 0 : bdPos);
  const edgePx = edge * axes.pm + axes.pb;
  const posLabel = formatAxisValue(axes.pa, calc.pos[b]!);
  const posMode = query.mode === (horizontal ? 'y' : 'x');
  const closest = query.mode === 'closest';
  // Narrower boxes win over wider ones they overlap (Plotly's pseudo-distance).
  const range = axes.pa?.scale.range;
  const span = range ? Math.abs(range[1] - range[0]) : 0;
  const pseudo = span > 0 ? Math.min(1, bdPos / span) : 0;
  const max = Number.isFinite(query.distance) ? query.distance : 1e6;
  const distance = posMode
    ? Math.abs((center - (horizontal ? query.yl : query.xl)) * axes.pm)
    : max - pseudo;
  const from = calc.samples.start[b]!;
  const to = calc.samples.start[b + 1]!;
  const indices = calc.precomputed
    ? [calc.samples.index[from] ?? b]
    : Array.from(calc.samples.index.subarray(from, to));
  const color = hoverColor(trace, calc);
  const out: HoverPoint[] = [];
  for (const key of keys) {
    const c = stats[key][b]!;
    const l = calcToLinear(calc.valType, c);
    if (!Number.isFinite(l)) continue;
    let valueText = formatAxisValue(axes.va, l);
    if (key === 'mean' && withSd) {
      const sd = stats.sd[b]!;
      valueText += ` ± ${calc.valType === 'date' ? String(Math.round(sd)) : formatAxisValue(undefined, sd)}`;
    }
    const label = `${key === 'mean' ? meanLabel : STAT_LABELS[key]} ${valueText}`;
    const vPx = l * axes.vm + axes.vb;
    const posData = dataOf(axes.pa, calc.pos[b]!);
    const valData = dataOf(axes.va, l);
    out.push({
      pointIndex: -1 - b,
      pointIndices: indices,
      distance,
      px: horizontal ? vPx : edgePx,
      py: horizontal ? edgePx : vPx,
      x: horizontal ? valData : posData,
      y: horizontal ? posData : valData,
      color,
      hoverText: closest ? `(${posLabel}, ${label})` : label,
      fields: { stat: key, [key]: valData },
      multi: true,
      showName: key === 'med',
      ...(key === 'med' ? {} : { spikeDistance: Infinity }),
    });
  }
  return out;
}

/** Text of sample `k` (per data point, or per box row for precomputed samples). */
function sampleText(trace: FullTrace, calc: BoxCalc, k: number): string | undefined {
  const i = calc.samples.index[k]!;
  const j = calc.samples.sub[k]!;
  for (const key of ['hovertext', 'text']) {
    const v = trace[key];
    let t: unknown = v;
    if (isArrayLike(v)) {
      t = v[i];
      if (j >= 0) t = isArrayLike(t) ? t[j] : undefined;
    }
    if (typeof t === 'string' && t !== '') return t;
    if (typeof t === 'number') return String(t);
  }
  return undefined;
}

/** The drawn point nearest the pointer (Plotly's `hoverOnPoints`), or undefined. */
export function pointUnderPointer(
  calc: BoxCalc,
  trace: FullTrace,
  query: HoverQuery,
  axes: Axes,
): HoverPoint | undefined {
  if (!calc.mode) return undefined;
  const horizontal = calc.orientation === 'h';
  const marker = (trace['marker'] ?? {}) as { size?: unknown; color?: unknown };
  const size = typeof marker.size === 'number' ? marker.size : 6;
  const rad = Math.max(3, size / 2);
  const floor = 1 - 3 / rad;
  const { samples } = calc;
  let best = -1;
  let bestDistance = query.distance;
  let bestB = -1;
  let b = 0;
  for (let k = 0; k < samples.value.length; k++) {
    while (k >= samples.start[b + 1]!) b++;
    if (!samples.shown[k]) continue;
    const p = calc.pointPos[k]!;
    const v = calcToLinear(calc.valType, samples.value[k]!);
    if (!Number.isFinite(p) || !Number.isFinite(v)) continue;
    const pPx = p * axes.pm + axes.pb;
    const vPx = v * axes.vm + axes.vb;
    const [xPx, yPx] = horizontal ? [vPx, pPx] : [pPx, vPx];
    const dx = Math.max(Math.abs(xPx - query.px) - rad, floor);
    const dy = Math.max(Math.abs(yPx - query.py) - rad, floor);
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= bestDistance) {
      bestDistance = d;
      best = k;
      bestB = b;
    }
  }
  if (best < 0) return undefined;
  const p = calc.pointPos[best]!;
  const v = calcToLinear(calc.valType, samples.value[best]!);
  const posData = dataOf(axes.pa, calc.pos[bestB]!);
  const valData = dataOf(axes.va, v);
  const pPx = p * axes.pm + axes.pb;
  const vPx = v * axes.vm + axes.vb;
  const text = sampleText(trace, calc, best);
  return {
    pointIndex: calc.samples.index[best]!,
    distance: bestDistance,
    px: horizontal ? vPx : pPx,
    py: horizontal ? pPx : vPx,
    x: horizontal ? valData : posData,
    y: horizontal ? posData : valData,
    ...(text !== undefined ? { text } : {}),
    color: String(marker.color ?? hoverColor(trace, calc)),
    spikeDistance: bestDistance,
  };
}

/** Plotly's combination of box and point labels per `hovermode`. */
export function combineHover(
  boxes: HoverPoint[],
  point: HoverPoint | undefined,
  mode: HoverQuery['mode'],
): HoverPoint[] {
  if (mode === 'closest') return point ? [point] : boxes;
  return point ? [...boxes, point] : boxes;
}

/** Hover points of a box trace (see the module comment). */
export function boxHoverPoints(
  calc: BoxCalc,
  trace: FullTrace,
  query: HoverQuery,
  ctx: HoverContext,
): HoverPoint[] {
  if (calc.count === 0) return [];
  const axes = axesOf(calc, ctx);
  const hoveron = trace['hoveron'] ?? 'boxes+points';
  const options: BoxHoverOptions = {
    hasMean: Boolean(trace['boxmean']) || trace['sizemode'] === 'sd',
  };
  let boxes: HoverPoint[] = [];
  if (has(hoveron, 'boxes')) {
    const b = boxUnderPointer(calc, query, axes, options);
    if (b >= 0) boxes = statPoints(calc, trace, b, query, axes, options);
  }
  const point = has(hoveron, 'points') ? pointUnderPointer(calc, trace, query, axes) : undefined;
  return combineHover(boxes, point, query.mode);
}

export { axesOf as hoverAxes };

/**
 * Data indices of the drawn points inside a box or lasso selection (Plotly's box `selectPoints`:
 * points only, at their drawn, jittered positions).
 */
export function boxSelectPoints(calc: BoxCalc, _trace: FullTrace, query: SelectionQuery): number[] {
  if (!calc.mode) return [];
  const [x0, x1] = [Math.min(...query.x), Math.max(...query.x)];
  const [y0, y1] = [Math.min(...query.y), Math.max(...query.y)];
  const polygon = query.kind === 'lasso' && query.polygon ? query.polygon.flat() : undefined;
  const horizontal = calc.orientation === 'h';
  const out: number[] = [];
  const { samples } = calc;
  for (let k = 0; k < samples.value.length; k++) {
    if (!samples.shown[k]) continue;
    const p = calc.pointPos[k]!;
    const v = calcToLinear(calc.valType, samples.value[k]!);
    const [x, y] = horizontal ? [v, p] : [p, v];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    if (polygon && !pointInPolygon(x, y, polygon)) continue;
    out.push(samples.index[k]!);
  }
  return out;
}
