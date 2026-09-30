/**
 * Hover of `isosurface` and `volume` (plan E14.7, E14.8), after plotly.js `isosurface/convert.js`
 * `handlePick` and `gl3d/scene.js`: the scene's GPU pick gives the triangle (or vertex) under the
 * pointer; its vertex nearest to the pointer snaps to the nearest grid point, and the label shows
 * that point's `x`, `y` and `z`, then `value: …` (formatted with `valuehoverformat`, always shown,
 * as in Plotly), then its `text`. `hovertemplate` gets `%{value}`; events report `value` and the
 * grid point's index in the columns (`pointNumber`).
 *
 * Plotly snaps each coordinate to the grid value at or above it (`findNearestOnAxis`); here it is
 * the nearest grid value. Ray-marched volumes hover through a CPU ray cast instead
 * (`volume/raymarch-hover.ts`), and share {@link isoGridHoverPoint}.
 */
import { formatNumber, type FullTrace } from '@mk7s/holochart-core';
import type { HoverContext, HoverPoint, HoverQuery } from '@mk7s/holochart-runtime';
import { mapColor, rgbaToCss } from '@mk7s/holochart-traces-basic';
import { sceneHoverPoint, sceneHoverText, scenePicks, type ScenePicks } from '../scene/hover.ts';
import type { Scene3D } from '../scene/scene.ts';
import { traceColorMapping } from '../mesh3d/colors.ts';
import type { IsoCalc } from './calc.ts';
import { gridCoordinate, gridIndex, nearestGridIndex } from './grid.ts';

function perPoint(v: unknown, i: number): unknown {
  return Array.isArray(v) || ArrayBuffer.isView(v) ? (v as ArrayLike<unknown>)[i] : v;
}

/** The hover flags of a point (`'all'` → x, y, z, text, name). */
function hoverFlags(info: unknown): Set<string> {
  const s = typeof info === 'string' && info !== '' ? info : 'all';
  return new Set(s === 'all' ? ['x', 'y', 'z', 'text', 'name'] : s.split('+'));
}

/** A value as hover text: `valuehoverformat`, else Plotly's hover precision. */
export function isoValueText(v: number, format: unknown): string {
  if (!Number.isFinite(v)) return '';
  return formatNumber(v, typeof format === 'string' && format !== '' ? { tickformat: format } : {});
}

/**
 * The hover point of the grid point nearest to linear position `(x, y, z)` (see the module
 * comment), or null off the grid.
 */
export function isoGridHoverPoint(
  pick: ScenePicks,
  trace: FullTrace,
  calc: IsoCalc,
  ctx: Pick<HoverContext, 'fullLayout'>,
  position: readonly [number, number, number],
  distance?: number,
): HoverPoint | null {
  const grid = calc.grid;
  if (grid.len === 0 || !position.every(Number.isFinite)) return null;
  const i = nearestGridIndex(grid, 0, position[0]);
  const j = nearestGridIndex(grid, 1, position[1]);
  const k = nearestGridIndex(grid, 2, position[2]);
  const q = gridIndex(grid, i, j, k);
  const value = grid.value[q]!;
  const mapping = traceColorMapping(trace, ctx.fullLayout, [calc.isomin, calc.isomax]);
  const point = sceneHoverPoint(pick, trace, {
    pointIndex: q,
    x: gridCoordinate(grid, 0, i),
    y: gridCoordinate(grid, 1, j),
    z: gridCoordinate(grid, 2, k),
    ...(distance !== undefined ? { distance } : {}),
    ...(mapping && Number.isFinite(value) ? { color: rgbaToCss(mapColor(value, mapping)) } : {}),
    fields: { value },
  });
  const valueLabel = isoValueText(value, trace['valuehoverformat']);
  // Plotly's order: x, y, z, then `value: …` (whatever `hoverinfo` says), then the text.
  const input = trace._input ?? {};
  const flags = hoverFlags(perPoint(trace['hoverinfo'] ?? input['hoverinfo'], q));
  const text = perPoint(trace['hovertext'], q) || perPoint(trace['text'], q);
  const extra = [`value: ${valueLabel}`];
  if (flags.has('text') && typeof text === 'string' && text !== '') extra.push(text);
  const labels = point.labels as { x: string; y: string; z: string };
  return {
    ...point,
    labels: { ...point.labels, value: valueLabel },
    hoverText: sceneHoverText(labels, flags, undefined, extra.join('<br>')),
  };
}

/** Screen position (container px) of mesh vertex `v`. */
function vertexOnScreen(scene: Scene3D, calc: IsoCalc, v: number) {
  const m = calc.mesh!;
  const w = scene.toWorld(m.x[v]!, m.y[v]!, m.z[v]!);
  return scene.project(w[0], w[1], w[2]);
}

/** The `hoverPoints` of `isosurface` and stacked `volume` meshes. */
export function isoHoverPoints(
  calc: IsoCalc,
  trace: FullTrace,
  query: HoverQuery,
  ctx: HoverContext,
): HoverPoint[] {
  const mesh = calc.mesh;
  if (!mesh || mesh.triangles.length === 0) return [];
  const pick = scenePicks(trace, query, ctx);
  const first = pick?.hits[0];
  if (!pick || !first) return [];
  let v = first.pointIndex;
  if (first.kind === 'triangle') {
    // Of the picked triangle's corners, the one nearest to the pointer.
    const t = first.pointIndex;
    if (!(t >= 0 && t * 3 + 2 < mesh.triangles.length)) return [];
    let best = Infinity;
    for (let c = 0; c < 3; c++) {
      const u = mesh.triangles[t * 3 + c]!;
      const s = vertexOnScreen(pick.scene, calc, u);
      const d = Math.hypot(s.x - (query.cx ?? 0), s.y - (query.cy ?? 0));
      if (d < best) [best, v] = [d, u];
    }
  }
  if (!(v >= 0 && v < mesh.count)) return [];
  const point = isoGridHoverPoint(pick, trace, calc, ctx, [mesh.x[v]!, mesh.y[v]!, mesh.z[v]!]);
  return point ? [point] : [];
}
