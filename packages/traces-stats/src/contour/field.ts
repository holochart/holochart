/**
 * Contouring a z grid for a contour trace (plotly.js `contour/calc.js` + `set_contours.js`,
 * `empty_pathinfo.js`, `convert_to_constraints.js`), shared by `histogram2dcontour` (bin grid) and
 * `contour` (the user's grid): levels, marching squares per level, `line.smoothing`, the filled
 * regions of `coloring: 'fill'` and the shaded region of constraint contours. Pure.
 *
 * Everything that depends only on the data is here; colors, line styles and labels are resolved by
 * the view (labels depend on the zoom: they are placed in px).
 */
import type { FullTrace } from '@mk7s/holochart-core';
import {
  clipPathToMask,
  hasGaps,
  maskIndex,
  maskRegion,
  type MaskIndex,
} from '../shared/contour-mask.ts';
import {
  constraintLevels,
  constraintRegion,
  contourLevels,
  gridBoundary,
  indexToData,
  levelRegion,
  marchingSquares,
  pathToData,
  smoothPath,
  type ConstraintOperation,
  type ContourColoring,
  type ContourGrid,
  type ContourLevels,
  type ContourPath,
  type ContourRegion,
} from '../shared/contour.ts';

/** The contoured area, from the first to the last grid point (linear coordinates). @experimental */
export interface ContourBounds {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

/** A constraint contour's resolved operation and value. @experimental */
export interface ContourConstraint {
  readonly operation: ConstraintOperation;
  /** A number, or `[lo, hi]` for intervals. */
  readonly value: number | readonly [number, number];
}

/** What contouring a grid gives (part of the contour traces' calcdata). @experimental */
export interface ContourField {
  /** `contours.coloring` (`'none'` for constraint contours, which color with `line.color`). */
  readonly coloring: ContourColoring;
  /** Set for constraint contours (`contours.type: 'constraint'`). */
  readonly constraint: ContourConstraint | undefined;
  /** The levels: `contours.start/end/size`, or the constraint's one or two levels. */
  readonly levels: ContourLevels;
  /** `z` with empty cells filled (what is contoured, and drawn by `coloring: 'heatmap'`). */
  readonly zFilled: Float64Array;
  /** Per level: its contour lines (smoothed), in linear coordinates. */
  readonly paths: readonly (readonly ContourPath[])[];
  /**
   * `coloring: 'fill'`: per level, the region `z ≥ level` as rings for the nonzero fill rule, in
   * linear coordinates (painted in level order over the background). Constraint contours: the one
   * shaded region (none for `=`).
   */
  readonly regions: readonly ContourRegion[] | undefined;
  /** The contoured area, from the first to the last grid point (linear coordinates). */
  readonly bounds: ContourBounds;
  /**
   * Where the data is, when gaps are not connected (`contour` with `connectgaps: false`): rings in
   * linear coordinates for the nonzero rule. `paths` are already clipped to it; fills are clipped
   * when drawn.
   */
  readonly mask?: ContourRegion | undefined;
}

/**
 * A grid to contour: row-major `z[j·nx + i]` (gaps already filled) at points `xc[i]`, `yc[j]`.
 * @internal
 */
export interface ContourFieldGrid {
  readonly z: Float64Array;
  readonly nx: number;
  readonly ny: number;
  /** Linear x coordinate of each column (non-uniform allowed). */
  readonly xc: ArrayLike<number>;
  /** Linear y coordinate of each row. */
  readonly yc: ArrayLike<number>;
  /** Finite extent of `z` (automatic levels). */
  readonly zExtent: readonly [number, number];
  /**
   * Presence field (1 where the original `z` had data, 0 in gaps): clip the contours to the data
   * (see `shared/contour-mask.ts`). Omitted: gaps are connected.
   */
  readonly presence?: Float64Array | undefined;
}

function numeric(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** A region converted from index to data coordinates with {@link indexToData}. */
export function regionToData(
  region: ContourRegion,
  xc: ArrayLike<number>,
  yc: ArrayLike<number>,
): ContourRegion {
  const n = region.x.length;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    x[k] = indexToData(region.x[k]!, xc);
    y[k] = indexToData(region.y[k]!, yc);
  }
  return { x, y, rings: region.rings };
}

/** The constraint of a constraint contour trace, else `undefined`. */
export function constraintOf(trace: FullTrace): ContourConstraint | undefined {
  const contours = (trace['contours'] ?? {}) as Record<string, unknown>;
  if (contours['type'] !== 'constraint') return undefined;
  const operation = (contours['operation'] ?? '=') as ConstraintOperation;
  const levels = constraintLevels(operation, contours['value']);
  const value: number | [number, number] =
    levels.length === 1 ? levels[0]! : [levels[0]!, levels[1]!];
  return { operation, value };
}

/**
 * The trace's levels (Plotly `set_contours.js`): automatic levels span the data (or `zmin` /
 * `zmax` when `zauto` is off); manual ones come from `contours.start` / `end` / `size`. Constraint
 * contours have the constraint's one or two levels.
 * @internal
 */
export function levelsOf(trace: FullTrace, zExtent: readonly [number, number]): ContourLevels {
  const contours = (trace['contours'] ?? {}) as Record<string, unknown>;
  if (contours['type'] === 'constraint') {
    const levels = constraintLevels(
      (contours['operation'] ?? '=') as ConstraintOperation,
      contours['value'],
    );
    const start = levels[0]!;
    const end = levels[levels.length - 1]!;
    return { start, end, size: end > start ? end - start : 1, levels };
  }
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

/** An empty field (no grid). @internal */
export function emptyContourField(z: Float64Array = new Float64Array(0)): ContourField {
  return {
    coloring: 'fill',
    constraint: undefined,
    levels: { start: 0, end: 0, size: 1, levels: [] },
    zFilled: z,
    paths: [],
    regions: undefined,
    bounds: { x0: NaN, x1: NaN, y0: NaN, y1: NaN },
  };
}

/** Contour a grid for a contour trace (levels or constraint). @internal */
export function contourField(grid: ContourFieldGrid, trace: FullTrace): ContourField {
  const contours = (trace['contours'] ?? {}) as Record<string, unknown>;
  const constraint = constraintOf(trace);
  const coloring: ContourColoring = constraint
    ? 'none'
    : ((contours['coloring'] ?? 'fill') as ContourColoring);
  const { nx, ny, xc, yc } = grid;
  const zFilled = grid.z;
  const levels = levelsOf(trace, grid.zExtent);
  const g: ContourGrid = { z: zFilled, nx, ny };
  const line = (trace['line'] ?? {}) as Record<string, unknown>;
  const smoothing = numeric(line['smoothing']) ? line['smoothing'] : 1;
  const paths: ContourPath[][] = [];
  const presence = grid.presence && hasGaps(grid.presence) ? grid.presence : undefined;
  const mask: MaskIndex | undefined = presence ? maskIndex(presence, nx, ny) : undefined;
  const wantRegions = constraint !== undefined || coloring === 'fill';
  // Level regions in index space.
  const levelRegions: ContourRegion[] = [];
  for (const level of levels.levels) {
    const smoothed = marchingSquares(g, level).map((p): ContourPath => {
      const s = smoothPath(p.x, p.y, p.closed, smoothing);
      return { x: s.x, y: s.y, closed: p.closed };
    });
    const drawn = mask ? smoothed.flatMap((p) => clipPathToMask(p, mask)) : smoothed;
    paths.push(drawn.map((p) => pathToData(p, xc, yc)));
    if (wantRegions) levelRegions.push(levelRegion(smoothed, g, level));
  }
  let regions: ContourRegion[] | undefined;
  if (constraint) {
    const b = gridBoundary(nx, ny);
    const rect: ContourRegion = { x: b.x, y: b.y, rings: Uint32Array.of(0) };
    const shaded = constraintRegion(constraint.operation, levelRegions, rect);
    regions = shaded ? [regionToData(shaded, xc, yc)] : undefined;
  } else if (coloring === 'fill') {
    regions = levelRegions.map((r) => regionToData(r, xc, yc));
  }
  return {
    coloring,
    constraint,
    levels,
    zFilled,
    paths,
    regions,
    bounds: { x0: xc[0]!, x1: xc[nx - 1]!, y0: yc[0]!, y1: yc[ny - 1]! },
    mask: presence ? regionToData(maskRegion(presence, nx, ny), xc, yc) : undefined,
  };
}
