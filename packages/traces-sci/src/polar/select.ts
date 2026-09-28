/**
 * Box and lasso selection on polar subplots (plan E6.3 / E11.4), following plotly.js: the polar
 * subplot hands the drag to the selection machinery with mock cartesian axes in px, so selection
 * happens in screen space. The runtime's select areas (`ComponentView.selectArea`) give queries in
 * container px:
 *
 * - `scatterpolar` selects the drawn markers inside (scatter's `selectPoints` on the px positions;
 *   points hidden outside the radial range or sector are not selectable). Like scatter, only
 *   traces with markers or text select.
 * - `barpolar` selects bars whose "center" is inside: the middle of the outer edge (plotly.js
 *   `barpolar/plot.js` `di.ct`, the outer radius at the mid angle, on polygon grids too).
 *
 * Selection events carry each point's `r` and `theta` (Plotly adds the traces' array attributes).
 */
import type { FullTrace } from '@mk7s/holochart-core';
import { selectionContains, type HoverContext, type SelectionQuery } from '@mk7s/holochart-runtime';
import { scatter } from '@mk7s/holochart-traces-basic';
import { barPixels } from '../barpolar/geometry.ts';
import { polarPointFields } from '../scatterpolar/hover.ts';
import { innerCalc } from '../scatterpolar/plot.ts';
import type { ScatterpolarCalc } from '../scatterpolar/calc.ts';
import type { PolarCalc } from './cross-trace.ts';

/** `r` / `theta` of point `i` for selection events (`TraceModule.eventData`). */
export function polarEventData(
  calc: PolarCalc,
  trace: FullTrace,
  i: number,
): Readonly<Record<string, unknown>> {
  const sp = calc.subplot;
  return sp ? polarPointFields(trace, i, sp, calc.coords.r[i]!, calc.coords.theta[i]!).fields : {};
}

export function scatterpolarSelectPoints(
  calc: ScatterpolarCalc,
  trace: FullTrace,
  query: SelectionQuery,
  ctx: HoverContext,
): number[] {
  const sp = calc.subplot;
  if (!sp) return [];
  // Container px (y down) → the subplot's geometric px (y up, origin at the center).
  const { cx, cy } = sp;
  const q: SelectionQuery = {
    kind: query.kind,
    x: [query.x[0] - cx, query.x[1] - cx],
    y: [cy - query.y[1], cy - query.y[0]],
    ...(query.polygon ? { polygon: query.polygon.map(([x, y]) => [x - cx, cy - y] as const) } : {}),
  };
  return scatter.selectPoints!(innerCalc(calc, sp), trace, q, ctx);
}

export function barpolarSelectPoints(
  calc: PolarCalc,
  _trace: FullTrace,
  query: SelectionQuery,
): number[] {
  const sp = calc.subplot;
  const px = sp ? barPixels(calc, sp) : undefined;
  if (!sp || !px) return [];
  const out: number[] = [];
  for (let i = 0; i < px.rp0.length; i++) {
    if (px.visible[i] !== 1) continue;
    const mid = (px.g0[i]! + px.g1[i]!) / 2;
    const r = px.rp1[i]!;
    if (selectionContains(query, sp.cx + r * Math.cos(mid), sp.cy - r * Math.sin(mid))) out.push(i);
  }
  return out;
}
