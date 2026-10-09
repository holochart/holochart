/**
 * Box and lasso selection of `choropleth` regions (backlog GEO4), following plotly.js
 * `choropleth/select.js` (MIT): a region is selected when the point of its feature (Plotly's
 * `ct`) is inside the box or the lasso, in projected px. The geo subplot's select area gives
 * queries in container px (top-left origin), and the points are projected into the same. A region
 * that is not drawn, or whose point the projection hides, is not selectable.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import { pointInPolygon } from '@mk7s/holochart-render';
import type { HoverContext, SelectionQuery } from '@mk7s/holochart-runtime';
import type { ChoroplethCalc } from './calc.ts';

export function choroplethSelectPoints(
  calc: ChoroplethCalc,
  _trace: FullTrace,
  query: SelectionQuery,
  _ctx: HoverContext,
): number[] {
  const subplot = calc.subplot;
  const view = subplot?.view;
  const drawn = calc.drawn;
  if (!subplot || !view?.valid || !drawn) return [];
  const { rect } = subplot;
  const x0 = Math.min(query.x[0], query.x[1]);
  const x1 = Math.max(query.x[0], query.x[1]);
  const y0 = Math.min(query.y[0], query.y[1]);
  const y1 = Math.max(query.y[0], query.y[1]);
  const lasso = query.kind === 'lasso' && query.polygon ? query.polygon.flat() : undefined;
  const selected: number[] = [];
  for (let k = 0; k < drawn.index.length; k++) {
    const [lon, lat] = (drawn.located[k] as (typeof drawn.located)[number]).point;
    if (Number.isNaN(lon)) continue;
    const p = view.project(lon, lat);
    if (!p) continue;
    const cx = rect.x + p[0];
    const cy = rect.y + rect.height - p[1];
    if (cx < x0 || cx > x1 || cy < y0 || cy > y1) continue;
    if (lasso && !pointInPolygon(cx, cy, lasso)) continue;
    selected.push(drawn.index[k] as number);
  }
  return selected;
}
