/**
 * `surface` calc (plan E14.3): the grid in the scene axes' linear coordinates (`grid.ts`), the
 * `surfacecolor` values, and the scene autorange contribution.
 */
import type { CalcContext } from '@mk7s/holochart-runtime';
import type { FullTrace } from '@mk7s/holochart-core';
import { sceneScales } from '../scene/axes.ts';
import { sceneOf } from '../scene/layout-defaults.ts';
import type { SceneCalc } from '../scene/layout.ts';
import {
  buildSurfaceGrid,
  finiteExtent,
  isMatrix,
  matrixValues,
  type SurfaceGrid,
} from './grid.ts';
import type { SurfacePicker } from './pick.ts';

/** What surface calc holds. */
export interface SurfaceCalc extends SceneCalc {
  readonly grid: SurfaceGrid | null;
  /**
   * The values the colorscale maps, per grid point (row-major): `surfacecolor`, or the raw `z`
   * numbers on a z axis that is not linear; null: the (linear) heights.
   */
  readonly color: Float64Array | null;
  /** Whether `color` is `surfacecolor` (hover shows it as `%{surfacecolor}`). */
  readonly surfacecolor: boolean;
  /** Built on the first hover (`hover.ts`). */
  picker?: SurfacePicker;
}

/** The `calc` of `surface`. */
export function calcSurface(trace: FullTrace, ctx: Pick<CalcContext, 'fullLayout'>): SurfaceCalc {
  const scales = sceneScales(ctx.fullLayout, sceneOf(trace));
  const grid = buildSurfaceGrid(trace, scales);
  if (!grid) return { grid: null, color: null, surfacecolor: false, sceneExtremes: {} };
  const sc = trace['surfacecolor'];
  const surfacecolor = isMatrix(sc);
  let color: Float64Array | null = null;
  if (surfacecolor) color = matrixValues(sc, grid.nx, grid.ny);
  else if (scales.z.type !== 'linear') color = matrixValues(trace['z'] as never, grid.nx, grid.ny);
  return {
    grid,
    color,
    surfacecolor,
    sceneExtremes: { x: finiteExtent(grid.x), y: finiteExtent(grid.y), z: finiteExtent(grid.z) },
  };
}
