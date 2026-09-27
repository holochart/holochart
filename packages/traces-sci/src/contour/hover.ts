/**
 * Contour hover (plan E11.2, E6.1; ADR-010: CPU), following plotly.js `contour/hover.js` over
 * `heatmap/hover.js` with `isContour`: between the first and last grid point, the nearest grid
 * point along each axis (cells split halfway between points), labelled `x: …`, `y: …`, `z: …`
 * with its coordinates and value, the label anchored on the point. `z` is the gap-filled value,
 * except at gaps drawn as holes (`connectgaps: false`), which get an empty `z` or, with
 * `hoverongaps: false`, no label. Constraint contours color the label with their fill (or line).
 */
import { toRGBA, type FullTrace } from '@mk7s/holochart-core';
import type { HoverContext, HoverPoint, HoverQuery } from '@mk7s/holochart-runtime';
import { rgbaToCss } from '@mk7s/holochart-traces-basic';
import { zColorMapping } from '@mk7s/holochart-traces-stats';
import { heatmapCellHoverPoint } from '../heatmap/hover.ts';
import type { ContourTraceCalc } from './calc.ts';

/**
 * The index of the grid point nearest to `l` along points `c` (ascending or descending), or −1
 * outside `[c[0], c[n − 1]]`.
 */
export function nearestPoint(c: ArrayLike<number>, l: number): number {
  const n = c.length;
  if (n === 0 || !Number.isFinite(l)) return -1;
  const first = c[0]!;
  const last = c[n - 1]!;
  if (!(l >= Math.min(first, last) && l <= Math.max(first, last))) return -1;
  const dir = last >= first ? 1 : -1;
  // Binary search for the last point at or before l (in the direction of the points).
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (dir * (c[mid]! - l) <= 0) lo = mid;
    else hi = mid;
  }
  if (lo === hi) return lo;
  return Math.abs(l - c[lo]!) <= Math.abs(c[hi]! - l) ? lo : hi;
}

/** Opaque CSS color of a color with alpha > 0, else undefined. */
function opaque(color: unknown): string | undefined {
  const c = typeof color === 'string' ? toRGBA(color) : null;
  return c && c[3] > 0 ? rgbaToCss([c[0], c[1], c[2], 1]) : undefined;
}

/** Hover points of a contour: the grid point nearest to the pointer, if inside the grid. */
export function contourHoverPoints(
  calc: ContourTraceCalc,
  trace: FullTrace,
  query: HoverQuery,
  ctx: HoverContext,
): HoverPoint[] {
  if (calc.nx === 0) return [];
  const i = nearestPoint(calc.x.centers, query.xl);
  const j = nearestPoint(calc.y.centers, query.yl);
  if (i < 0 || j < 0) return [];
  const z = calc.z[j * calc.nx + i]!;
  if (!Number.isFinite(z) && trace['hoverongaps'] === false) return [];
  const distance = Number.isFinite(query.distance) ? query.distance : Number.MAX_VALUE;
  const mapping = zColorMapping(trace, ctx.fullLayout, calc.zExtent);
  const point = heatmapCellHoverPoint(calc, trace, i, j, distance, ctx, mapping);
  if (!calc.constraint) return [point];
  // Constraint contours: the label takes the fill (or line) color (Plotly).
  const contours = (trace['contours'] ?? {}) as Record<string, unknown>;
  const line = (trace['line'] ?? {}) as Record<string, unknown>;
  const color =
    opaque(trace['fillcolor']) ??
    (contours['showlines'] !== false ? opaque(line['color']) : undefined);
  const { color: _mapped, ...rest } = point;
  return [color ? { ...rest, color } : rest];
}
