/**
 * `contour` calc (plan E11.2), following plotly.js `contour/calc.js`: the grid of `heatmap`
 * (`../heatmap/calc.ts`: 2D or column `z`, `transpose`, coordinates, categories), with the grid
 * points where Plotly puts them for contours, then the contouring shared with
 * `histogram2dcontour` (traces-stats `contourField`): gaps always filled for contouring (Plotly's
 * Laplace fill), and with `connectgaps: false` the drawing clipped to the data. Pure.
 *
 * Coordinates are linear (log10 on log axes); contour crossings are interpolated between grid
 * points in linear coordinates (Plotly interpolates in calc space, so on log axes its lines between
 * grid points are straight in data units and bend on screen).
 */
import { isArrayLike, type FullTrace } from '@mk7s/holochart-core';
import {
  linearExtremes,
  type AxisInfo,
  type CalcContext,
  type TraceExtremes,
} from '@mk7s/holochart-runtime';
import {
  contourField,
  contourPresenceField,
  emptyContourField,
  fillGaps,
  recordZExtent,
  type ContourCalc,
} from '@mk7s/holochart-traces-stats';
import { calcHeatmapGrid, emptyHeatmapCalc, type HeatmapCalc } from '../heatmap/calc.ts';
import { isColumnZ } from '../heatmap/defaults.ts';

/**
 * contour calcdata: the grid of a heatmap plus its contours. `z` holds the hover values:
 * `zFilled`, except NaN at gaps drawn as holes (`connectgaps: false`).
 */
export type ContourTraceCalc = HeatmapCalc & ContourCalc;

/**
 * The grid points of one direction. Plotly's `makeBoundArray` for contours: an `x` array gives
 * the points (only the first `n` values: more is not read as cell edges, unlike heatmaps); else
 * the cell centers of the heatmap grid (`x0` + i·`dx`, category indices, or extended arrays).
 */
function gridPoints(
  trace: FullTrace,
  letter: 'x' | 'y',
  axis: AxisInfo | undefined,
  centers: Float64Array,
): Float64Array {
  const v = trace[letter];
  const n = centers.length;
  if (
    !axis ||
    axis.type === 'category' ||
    isColumnZ(trace['z']) ||
    trace[`${letter}type`] === 'scaled' ||
    !isArrayLike(v) ||
    (v as ArrayLike<unknown>).length <= n
  ) {
    return centers;
  }
  const values = v as ArrayLike<unknown>;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = axis.scale.d2l(values[i]);
  return out.every(Number.isFinite) ? out : centers;
}

/** Finite extent of an array (`[NaN, NaN]` without finite values). */
function extentOf(z: ArrayLike<number>): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = 0; k < z.length; k++) {
    const v = z[k]!;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return lo <= hi ? [lo, hi] : [NaN, NaN];
}

function numeric(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * The value extent the colorscale spans (Plotly `contour/calc.js`): the data, except for
 * `coloring: 'heatmap'` with manual levels and an automatic color domain, where it spans the
 * levels' bands (`start − size/2` to one band past the last level).
 */
function colorExtent(trace: FullTrace, data: readonly [number, number]): [number, number] {
  const contours = (trace['contours'] ?? {}) as Record<string, unknown>;
  const start = contours['start'];
  const end = contours['end'];
  if (
    contours['type'] !== 'constraint' &&
    contours['coloring'] === 'heatmap' &&
    trace['zauto'] !== false &&
    trace['autocontour'] === false &&
    numeric(start) &&
    numeric(end)
  ) {
    let cs = numeric(contours['size']) && contours['size'] > 0 ? contours['size'] : 1;
    const e = end + cs / 1e6;
    let nc = Math.floor((e - start) / cs) + 1;
    if (!Number.isFinite(cs)) {
      cs = 1;
      nc = 1;
    }
    const min0 = start - cs / 2;
    return [min0, min0 + nc * cs];
  }
  return [data[0], data[1]];
}

/** An empty calc (no data). */
export function emptyContourCalc(): ContourTraceCalc {
  const base = emptyHeatmapCalc();
  return { ...base, ...emptyContourField(base.z), smoothing: 'best' };
}

/** The contour `calc`: the grid, then its contours; records the value extent for the colorbar. */
export function calcContour(trace: FullTrace, ctx: CalcContext): ContourTraceCalc {
  const grid = calcHeatmapGrid(trace, ctx);
  const { nx, ny } = grid;
  // A single row or column can't be contoured (Plotly draws nothing either).
  if (nx < 2 || ny < 2) return emptyContourCalc();
  const xc = gridPoints(trace, 'x', ctx.xaxis, grid.x.centers);
  const yc = gridPoints(trace, 'y', ctx.yaxis, grid.y.centers);
  const raw = grid.z;
  const presence = trace['connectgaps'] === true ? undefined : contourPresenceField(raw);
  const zFilled = fillGaps(raw, nx, ny);
  const zExtent = extentOf(zFilled);
  if (!Number.isFinite(zExtent[0])) return emptyContourCalc();
  recordZExtent(trace, colorExtent(trace, zExtent));
  const field = contourField({ z: zFilled, nx, ny, xc, yc, zExtent, presence }, trace);
  // Gaps drawn as holes stay gaps for hover and the heatmap coloring.
  const hover = field.mask ? raw : zFilled;
  return {
    ...grid,
    ...field,
    x: { ...grid.x, centers: xc },
    y: { ...grid.y, centers: yc },
    z: hover,
    zExtent,
    heatmapZ: hover,
    // Hover labels sit on the grid points (Plotly's contour hover).
    smoothing: 'best',
  };
}

/** Autorange: the grid points, first to last (Plotly draws contours between them). */
export function contourExtremes(calc: ContourTraceCalc): TraceExtremes {
  if (calc.nx === 0) return {};
  const b = calc.bounds;
  return { x: linearExtremes([b.x0, b.x1]), y: linearExtremes([b.y0, b.y1]) };
}
