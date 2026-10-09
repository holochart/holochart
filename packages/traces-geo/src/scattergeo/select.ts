/**
 * Box and lasso selection of `scattergeo` points (backlog GEO3), following plotly.js
 * `scattergeo/select.js` (MIT): selection happens in projected space. The geo subplot's select
 * area gives queries in container px; they are taken to the geometry the points are projected in,
 * where scatter's `selectPoints` tests them. Points the projection hides are not selectable, and
 * as in Plotly only traces with markers or text select.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type { HoverContext, SelectionQuery } from '@mk7s/holochart-runtime';
import { scatter } from '@mk7s/holochart-traces-basic';
import type { ScattergeoCalc } from './calc.ts';
import { geoPositions, subplotFrame } from './positions.ts';

export function scattergeoSelectPoints(
  calc: ScattergeoCalc,
  trace: FullTrace,
  query: SelectionQuery,
  ctx: HoverContext,
): number[] {
  const subplot = calc.subplot;
  const positions = subplot && !calc.unresolved ? geoPositions(calc, subplot) : undefined;
  if (!subplot || !positions) return [];
  // Container px (y down) → base geometry (y up): only differences matter, so no height is needed.
  const { toBase } = subplotFrame(subplot, 0);
  const [x0, y0] = toBase(query.x[0], query.y[1]);
  const [x1, y1] = toBase(query.x[1], query.y[0]);
  const q: SelectionQuery = {
    kind: query.kind,
    x: [Math.min(x0, x1), Math.max(x0, x1)],
    y: [Math.min(y0, y1), Math.max(y0, y1)],
    ...(query.polygon ? { polygon: query.polygon.map(([x, y]) => toBase(x, y)) } : {}),
  };
  return scatter.selectPoints!(positions.scatter, trace, q, ctx);
}
