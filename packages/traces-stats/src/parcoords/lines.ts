/**
 * The lines of a `parcoords` trace (plan E10.10): every row is one polyline across the axes, and
 * all of them go into ONE line primitive (one instanced draw call, plan §3 principle 6).
 *
 * Geometry is in "axis space": x is the axis slot (0 = leftmost axis) and y the position on the
 * axis (0 = bottom, 1 = top), so the view maps it to pixels with a transform (resizes move no
 * vertex). Colors are per vertex: the colorscale color of each line, or the unselected style for
 * lines outside a constraint range. Brushing only rewrites the colors (plus the alpha of the
 * unselected lines), never the geometry.
 *
 * Plotly draws the unselected lines on a layer below the selected ones; here both are one draw call
 * in one order (ascending color value, so higher values are on top, as in Plotly), so an unselected
 * line can cross over a selected one. Its low default opacity keeps that faint.
 */
import type { RGBA } from '@mk7s/holochart-render';
import type { ParcoordsCalc } from './calc.ts';
import { colorUnit, type LineColorMapping } from './common.ts';
import { inRanges, type Range } from './ranges.ts';

/** Line vertices in axis space, one polyline per row, rows in `calc.order`. */
export interface LineGeometry {
  readonly x: Float32Array;
  readonly y: Float32Array;
  /** Start vertex of every polyline after the first. */
  readonly starts: Uint32Array;
}

/**
 * The polylines through the axes `order` (indices into `calc.dimensions`, left to right) at axis
 * slots `slots` (one per entry of `order`; fractional while an axis is dragged).
 */
export function lineGeometry(
  calc: ParcoordsCalc,
  order: readonly number[],
  slots: readonly number[],
): LineGeometry {
  const n = calc.length;
  const d = order.length;
  const x = new Float32Array(n * d);
  const y = new Float32Array(n * d);
  const starts = new Uint32Array(Math.max(0, n - 1));
  const units = order.map((i) => calc.dimensions[i]!.unit);
  for (let k = 0; k < n; k++) {
    const row = calc.order[k]!;
    const base = k * d;
    if (k > 0) starts[k - 1] = base;
    for (let s = 0; s < d; s++) {
      x[base + s] = slots[s]!;
      y[base + s] = units[s]![row]!;
    }
  }
  return { x, y, starts };
}

function toNumber(v: unknown): number {
  return typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
}

/**
 * Which lines are selected: 1 for lines inside a constraint range of every constrained axis, 0
 * otherwise (ranges are closed). `undefined` when no axis is constrained (every line selected).
 * `constraints` maps indices into `calc.dimensions` to their ranges.
 */
export function selectionMask(
  calc: ParcoordsCalc,
  constraints: ReadonlyMap<number, readonly Range[]>,
): Uint8Array | undefined {
  let mask: Uint8Array | undefined;
  for (const [d, ranges] of constraints) {
    const dim = calc.dimensions[d];
    if (!dim || ranges.length === 0) continue;
    mask ??= new Uint8Array(calc.length).fill(1);
    const values = dim.values;
    for (let row = 0; row < calc.length; row++) {
      if (mask[row] && !inRanges(toNumber(values[row]), ranges)) mask[row] = 0;
    }
  }
  return mask;
}

/** Line colors: a colorscale (a lookup table and its mapping) or one color, and the unselected style. */
export interface LineColorStyle {
  readonly mapping?: LineColorMapping | undefined;
  /** {@link colorLUT} of `mapping.colorscale`. */
  readonly lut?: Float32Array | undefined;
  /** The plain `line.color` (when there is no colorscale). */
  readonly flat: RGBA;
  /** Unselected lines, alpha included. */
  readonly unselected: RGBA;
}

/**
 * Plotly's unselected line color: `unselected.line.color` with `opacity`, where `'auto'` is
 * `max(1/255, (1/N)^(1/3))` for N lines.
 */
export function unselectedColor(color: RGBA, opacity: unknown, lines: number): RGBA {
  const alpha =
    typeof opacity === 'number'
      ? color[3] * opacity
      : Math.max(1 / 255, Math.pow(1 / Math.max(1, lines), 1 / 3));
  return [color[0], color[1], color[2], alpha];
}

/**
 * Per-vertex colors (4 floats per vertex, rows in `calc.order`, `dims` vertices per row), written
 * into `out` when it has the right length.
 */
export function lineColors(
  calc: ParcoordsCalc,
  dims: number,
  style: LineColorStyle,
  mask: Uint8Array | undefined,
  out?: Float32Array,
): Float32Array {
  const n = calc.length;
  const colors = out && out.length === n * dims * 4 ? out : new Float32Array(n * dims * 4);
  const { lut, mapping, flat, unselected } = style;
  const values = calc.colors;
  const size = lut ? lut.length / 4 : 0;
  let r: number;
  let g: number;
  let b: number;
  let a: number;
  for (let k = 0; k < n; k++) {
    const row = calc.order[k]!;
    if (mask && !mask[row]) [r, g, b, a] = unselected;
    else if (lut && mapping && values) {
      const v = values[row]!;
      const t = Number.isFinite(v) ? colorUnit(v, mapping) : 0;
      const i = 4 * Math.min(size - 1, Math.round(t * (size - 1)));
      r = lut[i]!;
      g = lut[i + 1]!;
      b = lut[i + 2]!;
      a = lut[i + 3]!;
    } else [r, g, b, a] = flat;
    let o = k * dims * 4;
    for (let s = 0; s < dims; s++, o += 4) {
      colors[o] = r;
      colors[o + 1] = g;
      colors[o + 2] = b;
      colors[o + 3] = a;
    }
  }
  return colors;
}
