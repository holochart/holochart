/**
 * `parcoords` calc (plan E10.10), after plotly.js' `parcoords/calc.js` and the view model of
 * `parcoords.js`: the visible dimensions in draw order with their ranges and every line's position
 * on each axis (0 = bottom, 1 = top), and the order lines are drawn in. Pure and layout-free:
 * pixels come from the transform the view sets, so a resize never touches the lines.
 */
import { isArrayLike, type FullTrace } from '@mk7s/holochart-core';
import type { CalcContext } from '@mk7s/holochart-runtime';
import { finiteExtent, isNumericColorArray } from './common.ts';
import { numericTicks } from './ranges.ts';

/** One visible dimension (axis), in draw order. */
export interface ParcoordsDimension {
  /** Index in `dimensions` (hidden ones included): what restyle paths use. */
  readonly index: number;
  readonly label: string;
  /** The values (the first `calc.length` are drawn). */
  readonly values: ArrayLike<unknown>;
  /** Axis range `[bottom, top]` in data units (`range`, else the values' extent); may be flipped. */
  readonly range: readonly [number, number];
  /** Position of each line on the axis: `(v − bottom) / (top − bottom)`, NaN when not a number. */
  readonly unit: Float32Array;
  /** Numeric `tickvals` (ordinal axis) or `undefined`. */
  readonly tickvals: readonly number[] | undefined;
}

/** Calcdata of a parcoords trace. */
export interface ParcoordsCalc {
  readonly dimensions: readonly ParcoordsDimension[];
  /** Number of lines (`_length`). */
  readonly length: number;
  /** Numeric line colors, or `undefined` when every line has the plain `line.color`. */
  readonly colors: Float64Array | undefined;
  /** Finite extent of `colors` (for `cauto`). */
  readonly colorExtent: readonly [number, number];
  /**
   * Draw order of the lines: by ascending color value, so lines with higher values are drawn on
   * top (Plotly's depth test), NaN colors first; data order for plain colors.
   */
  readonly order: Uint32Array;
}

/** Plotly's `fixExtremes`: a usable `[lo, hi]` from an extent that may be empty or zero-width. */
export function fixExtent(lo: number, hi: number): [number, number] {
  const a = Number.isFinite(lo) ? lo : 0;
  const b = Number.isFinite(hi) ? hi : 0;
  if (a !== b) return [a, b];
  // Plotly scales a single value by 0.9 / 1.1; by its magnitude here, so negatives don't flip.
  return a === 0 ? [-1, 1] : [a - 0.1 * Math.abs(a), b + 0.1 * Math.abs(b)];
}

/** The axis range of a dimension: `range` as given, else the extent of its first `length` values. */
export function dimensionRange(dim: Record<string, unknown>, length: number): [number, number] {
  const r = dim['range'];
  if (isArrayLike(r) && r.length === 2) {
    const a = Number(r[0]);
    const b = Number(r[1]);
    if (Number.isFinite(a) && Number.isFinite(b) && a !== b) return [a, b];
  }
  const values = isArrayLike(dim['values']) ? dim['values'] : [];
  const [lo, hi] = finiteExtent(values, Math.min(length, values.length));
  return fixExtent(lo, hi);
}

function toNumber(v: unknown): number {
  return typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
}

/** The parcoords calc. */
export function calcParcoords(trace: FullTrace, _ctx?: CalcContext): ParcoordsCalc {
  const length = Math.max(0, Number(trace['_length']) || 0);
  const dimsIn = Array.isArray(trace['dimensions'])
    ? (trace['dimensions'] as Record<string, unknown>[])
    : [];
  const dimensions: ParcoordsDimension[] = [];
  dimsIn.forEach((dim, i) => {
    if (dim['visible'] === false || !isArrayLike(dim['values'])) return;
    const values = dim['values'];
    const range = dimensionRange(dim, length);
    const span = range[1] - range[0];
    const unit = new Float32Array(length);
    // `+ 0` turns -0 (the top of a flipped axis) into 0.
    for (let k = 0; k < length; k++) unit[k] = (toNumber(values[k]) - range[0]) / span + 0;
    dimensions.push({
      index: typeof dim['_index'] === 'number' ? dim['_index'] : i,
      label: typeof dim['label'] === 'string' ? dim['label'] : '',
      values,
      range,
      unit,
      tickvals: numericTicks(dim['tickvals']),
    });
  });

  const color = (trace['line'] as { color?: unknown } | undefined)?.color;
  let colors: Float64Array | undefined;
  let colorExtent: [number, number] = [NaN, NaN];
  const order = new Uint32Array(length);
  for (let k = 0; k < length; k++) order[k] = k;
  if (isNumericColorArray(color)) {
    colors = new Float64Array(length);
    for (let k = 0; k < length; k++) colors[k] = toNumber(color[k]);
    colorExtent = finiteExtent(colors);
    const c = colors;
    // NaN first, then ascending; stable (ties keep data order).
    order.sort((a, b) => {
      const ca = c[a]!;
      const cb = c[b]!;
      if (Number.isNaN(ca) || Number.isNaN(cb))
        return Number.isNaN(ca) ? (Number.isNaN(cb) ? a - b : -1) : 1;
      return ca - cb || a - b;
    });
  }
  return { dimensions, length, colors, colorExtent, order };
}
