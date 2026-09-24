/**
 * `histogram2dcontour` calc (plan E10.3): bin like `histogram2d` (the automatic bins get one empty
 * bin on each side, so density contours close), then contour the bin grid at the bin centers
 * (plotly.js `contour/calc.js` + `set_contours.js`): levels, gap filling, marching squares per level,
 * `line.smoothing`, and, for filled contours, the region above each level. Pure.
 *
 * Everything that depends only on the data is here; colors, line styles and labels are resolved by
 * the view (labels depend on the zoom: they are placed in px).
 */
import type { FullTrace } from '@mk7s/holochart-core';
import { linearExtremes, type CalcContext, type TraceExtremes } from '@mk7s/holochart-runtime';
import { binSamples2d, emptyHistogram2dCalc, type Histogram2dCalc } from '../histogram2d/calc.ts';
import { recordZExtent } from '../histogram2d/colorscale.ts';
import {
  contourLevels,
  fillGaps,
  indexToData,
  levelRegion,
  marchingSquares,
  pathToData,
  smoothPath,
  type ContourColoring,
  type ContourGrid,
  type ContourLevels,
  type ContourPath,
  type ContourRegion,
} from '../shared/contour.ts';

/** histogram2dcontour calcdata: the 2D histogram plus its contours. */
export interface Histogram2dContourCalc extends Histogram2dCalc {
  readonly coloring: ContourColoring;
  readonly levels: ContourLevels;
  /** `z` with empty cells filled (what is contoured, and drawn by `coloring: 'heatmap'`). */
  readonly zFilled: Float64Array;
  /** Per level: its contour lines (smoothed), in linear coordinates. */
  readonly paths: readonly (readonly ContourPath[])[];
  /**
   * `coloring: 'fill'`: per level, the region `z ≥ level` as rings for the nonzero fill rule, in
   * linear coordinates (painted in level order over the background).
   */
  readonly regions: readonly ContourRegion[] | undefined;
  /** The contoured area, from the first to the last bin center (linear coordinates). */
  readonly bounds: {
    readonly x0: number;
    readonly x1: number;
    readonly y0: number;
    readonly y1: number;
  };
}

function numeric(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function regionToData(region: ContourRegion, xc: Float64Array, yc: Float64Array): ContourRegion {
  const n = region.x.length;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    x[k] = indexToData(region.x[k]!, xc);
    y[k] = indexToData(region.y[k]!, yc);
  }
  return { x, y, rings: region.rings };
}

/**
 * The trace's levels (Plotly `set_contours.js`): automatic levels span the data (or `zmin` /
 * `zmax` when `zauto` is off); manual ones come from `contours.start` / `end` / `size`.
 */
export function levelsOf(trace: FullTrace, zExtent: readonly [number, number]): ContourLevels {
  const contours = (trace['contours'] ?? {}) as Record<string, unknown>;
  const auto = trace['zauto'] !== false;
  const zmin = !auto && numeric(trace['zmin']) ? trace['zmin'] : zExtent[0];
  const zmax = !auto && numeric(trace['zmax']) ? trace['zmax'] : zExtent[1];
  const opt = (v: unknown): number | undefined => (numeric(v) ? v : undefined);
  return contourLevels({
    zmin,
    zmax,
    autocontour: trace['autocontour'] !== false,
    start: opt(contours['start']),
    end: opt(contours['end']),
    size: opt(contours['size']),
    ncontours: numeric(trace['ncontours']) ? trace['ncontours'] : 15,
  });
}

/** Contour a binned grid (shared with the M4 `contour` trace's needs). */
export function contourGrid(
  base: Histogram2dCalc,
  trace: FullTrace,
): Omit<Histogram2dContourCalc, keyof Histogram2dCalc> {
  const contours = (trace['contours'] ?? {}) as Record<string, unknown>;
  const coloring = (contours['coloring'] ?? 'fill') as ContourColoring;
  const { nx, ny } = base;
  const zFilled = fillGaps(base.z, nx, ny);
  const levels = levelsOf(trace, base.zExtent);
  const grid: ContourGrid = { z: zFilled, nx, ny };
  const line = (trace['line'] ?? {}) as Record<string, unknown>;
  const smoothing = numeric(line['smoothing']) ? line['smoothing'] : 1;
  const xc = base.x.centers;
  const yc = base.y.centers;
  const paths: ContourPath[][] = [];
  const regions: ContourRegion[] | undefined = coloring === 'fill' ? [] : undefined;
  for (const level of levels.levels) {
    const smoothed = marchingSquares(grid, level).map((p): ContourPath => {
      const s = smoothPath(p.x, p.y, p.closed, smoothing);
      return { x: s.x, y: s.y, closed: p.closed };
    });
    paths.push(smoothed.map((p) => pathToData(p, xc, yc)));
    if (regions) regions.push(regionToData(levelRegion(smoothed, grid, level), xc, yc));
  }
  return {
    coloring,
    levels,
    zFilled,
    paths,
    regions,
    bounds: { x0: xc[0]!, x1: xc[nx - 1]!, y0: yc[0]!, y1: yc[ny - 1]! },
  };
}

/** The histogram2dcontour `calc`. */
export function calcHistogram2dContour(trace: FullTrace, ctx: CalcContext): Histogram2dContourCalc {
  let base = binSamples2d(trace, ctx);
  // One bin can't be contoured (Plotly needs two centers per direction too).
  if (base.nx < 2 || base.ny < 2) base = emptyHistogram2dCalc();
  if (Number.isFinite(base.zExtent[0])) recordZExtent(trace, base.zExtent);
  if (base.nx === 0) {
    return {
      ...base,
      coloring: 'fill',
      levels: { start: 0, end: 0, size: 1, levels: [] },
      zFilled: base.z,
      paths: [],
      regions: undefined,
      bounds: { x0: NaN, x1: NaN, y0: NaN, y1: NaN },
    };
  }
  return { ...base, ...contourGrid(base, trace) };
}

/** Autorange: the bin centers (Plotly draws contours between the first and last center). */
export function histogram2dContourExtremes(calc: Histogram2dContourCalc): TraceExtremes {
  if (calc.nx === 0) return {};
  const b = calc.bounds;
  return { x: linearExtremes([b.x0, b.x1]), y: linearExtremes([b.y0, b.y1]) };
}
