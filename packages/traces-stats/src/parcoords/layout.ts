/**
 * `parcoords` layout math (plan E10.10), after plotly.js' `parcoords/parcoords.js` and its
 * constants: axis positions in the trace's domain, value ↔ pixel mapping, ticks (core's tick
 * functions, or `tickvals` / `ticktext` on ordinal axes), the range labels at both ends of each axis
 * and the axis labels (`labelside`, `labelangle`). Pure: everything is in container px (top-left
 * origin), computed from the calc, the defaulted trace and the domain rect.
 */
import {
  computeTicks,
  createScale,
  createTickFormatter,
  isArrayLike,
  tickSpec,
  type FullAxis,
} from '@mk7s/holochart-core';
import type { ParcoordsCalc, ParcoordsDimension } from './calc.ts';

/** Plotly's parcoords constants (`constants.ts`) and d3 axis sizes. */
export const PARCOORDS = {
  /** How far (px) a dragged axis may leave the domain on either side. */
  overdrag: 45,
  /** Space between the axis ends and the lines' extremes. */
  pad: 2,
  /** Axis label offset from the axis end (`axisTitleOffset`). */
  labelOffset: 28,
  /** Range label offset from the axis end (`axisExtentOffset`). */
  rangeOffset: 10,
  /** Tick length (d3 inner tick size) and the axis' end ticks (outer size). */
  tickLength: 4,
  outerTick: 2,
  /** Gap between the tick labels and the axis (d3: 3 px after the 4 px tick). */
  tickLabelGap: 7,
  /** Brush bar: visible width, capture width and edge-grab distance. */
  barWidth: 4,
  captureWidth: 10,
  handle: 8,
  /** Target tick spacing (d3 `ticks(height / 50)`). */
  tickSpacing: 50,
} as const;

/** A rect in container px. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Container x of axis `slot` (0 = left) of `count` axes: the first and last on the domain edges. */
export function axisX(rect: Rect, count: number, slot: number): number {
  return rect.x + (count > 1 ? (rect.width * slot) / (count - 1) : 0);
}

/** Px between neighboring axes. */
export function axisSpacing(rect: Rect, count: number): number {
  return count > 1 ? rect.width / (count - 1) : rect.width;
}

/** Container y of an axis position `u` (0 = bottom, 1 = top), 2 px inside the domain's ends. */
export function unitToY(rect: Rect, u: number): number {
  return rect.y + rect.height - PARCOORDS.pad - u * (rect.height - 2 * PARCOORDS.pad);
}

/** Inverse of {@link unitToY}. */
export function yToUnit(rect: Rect, y: number): number {
  const span = rect.height - 2 * PARCOORDS.pad;
  return span > 0 ? (rect.y + rect.height - PARCOORDS.pad - y) / span : 0;
}

/** Axis position of a value on an axis with range `[bottom, top]`. */
export function valueToUnit(range: readonly [number, number], v: number): number {
  return (v - range[0]) / (range[1] - range[0]);
}

/** Value at an axis position. */
export function unitToValue(range: readonly [number, number], u: number): number {
  return range[0] + u * (range[1] - range[0]);
}

/** A tick: its axis position (0 = bottom) and label. */
export interface AxisTick {
  readonly u: number;
  readonly text: string;
}

/** The defaulted `dimensions[i]` container of a dimension. */
export function dimensionContainer(
  trace: Record<string, unknown>,
  dim: ParcoordsDimension,
): Record<string, unknown> {
  const dims = trace['dimensions'];
  return (Array.isArray(dims) ? (dims[dim.index] as Record<string, unknown>) : undefined) ?? {};
}

/** A linear axis for core's tick functions, carrying the dimension's tick attributes. */
function tickAxis(
  container: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): FullAxis {
  const tickvals = container['tickvals'];
  const ticktext = container['ticktext'];
  let vals = isArrayLike(tickvals) ? Array.from(tickvals) : undefined;
  let text = isArrayLike(ticktext) ? Array.from(ticktext) : undefined;
  if (vals && text) {
    // Plotly truncates both to the shorter one.
    const n = Math.min(vals.length, text.length);
    vals = vals.slice(0, n);
    text = text.slice(0, n);
  }
  return {
    _id: 'y',
    _name: 'yaxis',
    type: 'linear',
    tickmode: vals ? 'array' : 'auto',
    ...(vals ? { tickvals: vals } : {}),
    ...(text ? { ticktext: text } : {}),
    tickformat: typeof container['tickformat'] === 'string' ? container['tickformat'] : '',
    exponentformat: 'B',
    showexponent: 'all',
    ...extra,
  } as unknown as FullAxis;
}

/** d3's `tickIncrement`: a 1 / 2 / 5 × 10ⁿ step giving about `count` ticks over `span`. */
export function niceStep(span: number, count: number): number {
  const step = span / Math.max(1, count);
  if (!(step > 0) || !Number.isFinite(step)) return 1;
  const power = Math.pow(10, Math.floor(Math.log10(step)));
  const error = step / power;
  return (
    (error >= Math.sqrt(50) ? 10 : error >= Math.sqrt(10) ? 5 : error >= Math.SQRT2 ? 2 : 1) * power
  );
}

/**
 * Ticks of a dimension's axis, `length` px long: `tickvals` / `ticktext` on ordinal axes, else
 * about one per 50 px at d3's round steps (`ticks(height / 50)`), formatted with `tickformat`.
 */
export function axisTicks(
  dim: ParcoordsDimension,
  container: Record<string, unknown>,
  length: number,
): AxisTick[] {
  const scale = createScale({ type: 'linear', range: [dim.range[0], dim.range[1]], length });
  const step = niceStep(Math.abs(dim.range[1] - dim.range[0]), length / PARCOORDS.tickSpacing);
  const auto = dim.tickvals ? {} : { tickmode: 'linear', tick0: 0, dtick: step };
  const ticks = computeTicks(scale, tickAxis(container, auto));
  return ticks
    .filter((t) => !t.minor && !t.noTick)
    .map((t) => ({ u: valueToUnit(dim.range, t.l), text: t.text }));
}

/**
 * The range labels of an axis: its bottom and top values, to 1 % of the span (Plotly's
 * `dtick = 0.01 × span`), with `tickformat`. Empty on ordinal axes.
 */
export function rangeLabels(
  dim: ParcoordsDimension,
  container: Record<string, unknown>,
): { bottom: string; top: string } {
  if (dim.tickvals) return { bottom: '', top: '' };
  const [r0, r1] = dim.range;
  const scale = createScale({ type: 'linear', range: [r0, r1], length: 100 });
  const axis = tickAxis(container, {
    tickmode: 'linear',
    tick0: 0,
    dtick: 0.01 * Math.abs(r1 - r0),
    tickvals: undefined,
    ticktext: undefined,
  });
  const fmt = createTickFormatter(scale, axis, tickSpec(scale, axis));
  return { bottom: fmt.label(r0).text, top: fmt.label(r1).text };
}

/**
 * Where an axis label goes (Plotly: `rotate(angle)` about a point 28 px beyond the axis end): its
 * anchor point relative to the axis x and its end, and its horizontal anchor. `side: 'top'` puts
 * it above the top end, `'bottom'` below the bottom end.
 */
export function labelPlacement(
  angle: number,
  side: 'top' | 'bottom',
): { dy: number; anchorX: 'left' | 'center' | 'right' } {
  const a = (angle * Math.PI) / 180;
  const sin = Math.sin(a);
  const cos = Math.cos(a);
  const dir = side === 'top' ? 1 : -1;
  const anchorX = 2 * Math.abs(sin) > Math.abs(cos) ? (dir * sin < 0 ? 'left' : 'right') : 'center';
  return { dy: side === 'top' ? -PARCOORDS.labelOffset : PARCOORDS.labelOffset, anchorX };
}

/** One axis as drawn. */
export interface AxisLayout {
  readonly dim: ParcoordsDimension;
  /** Container x of the axis. */
  readonly x: number;
}

/**
 * Axis x positions for the dimensions in `order` (indices into `calc.dimensions`, left to right);
 * `drag` places one of them at a free x (container px, clamped to the overdrag).
 */
export function layoutAxes(
  calc: ParcoordsCalc,
  rect: Rect,
  order: readonly number[] = calc.dimensions.map((_, i) => i),
  drag?: { readonly dim: number; readonly x: number },
): AxisLayout[] {
  const n = order.length;
  return order.map((d, slot) => ({
    dim: calc.dimensions[d]!,
    x:
      drag && drag.dim === d
        ? Math.max(
            rect.x - PARCOORDS.overdrag,
            Math.min(rect.x + rect.width + PARCOORDS.overdrag, drag.x),
          )
        : axisX(rect, n, slot),
  }));
}

/**
 * Plotly's axis drag: the dragged axis at `x` (container px) is sorted among the others at their
 * slots, which gives the new order (indices into `calc.dimensions`).
 */
export function dragOrder(
  rect: Rect,
  order: readonly number[],
  dragged: number,
  x: number,
): number[] {
  const n = order.length;
  const pos = new Map(order.map((d, slot) => [d, d === dragged ? x : axisX(rect, n, slot)]));
  return [...order].sort((a, b) => pos.get(a)! - pos.get(b)! || 0);
}
