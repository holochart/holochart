/**
 * Funnelarea hover (plan E12.6, E6.1; plotly.js pie `attachFxHandlers` for funnel areas): the
 * stage under the pointer (exact, inside its trapezoid) with pie's label lines (label, text,
 * value, percent per `hoverinfo`) and template fields, anchored at the middle of the stage's right
 * edge. Funnel areas are domain traces: the runtime asks them on every hover with the pointer in
 * container px.
 */
import { localeOf, type FullTrace } from '@mk7s/holochart-core';
import type { HoverContext, HoverPoint, HoverQuery } from '@mk7s/holochart-runtime';
import { castOption, pieHoverText, sliceLabels, sliceValues } from '@mk7s/holochart-traces-basic';
import type { Corner, FunnelareaCalc, FunnelareaSlice } from './calc.ts';

/** Whether `(x, y)` (relative to the center) lies inside a convex polygon (either winding). */
function inside(points: readonly Corner[], x: number, y: number): boolean {
  let sign = 0;
  for (let k = 0; k < points.length; k++) {
    const [x0, y0] = points[k]!;
    const [x1, y1] = points[(k + 1) % points.length]!;
    const cross = (x1 - x0) * (y - y0) - (y1 - y0) * (x - x0);
    if (cross === 0) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

/** The stage under a container point, or `undefined`. */
export function stageAt(calc: FunnelareaCalc, x: number, y: number): FunnelareaSlice | undefined {
  const layout = calc.layout;
  if (!layout) return undefined;
  const px = x - layout.cx;
  const py = y - layout.cy;
  for (const slice of calc.slices) {
    const c = slice.corners;
    if (slice.hidden || !c) continue;
    if (py < c.tl[1] || py > c.bl[1]) continue;
    if (inside([c.tl, c.tr, c.br, c.bl], px, py)) return slice;
  }
  return undefined;
}

/** The funnelarea `hoverPoints`: the stage under `query.cx` / `query.cy`, if any. */
export function funnelareaHoverPoints(
  calc: FunnelareaCalc,
  trace: FullTrace,
  query: HoverQuery,
  ctx: HoverContext,
): HoverPoint[] {
  const layout = calc.layout;
  if (!layout) return [];
  // Figure height: overlay px are from the bottom, container px from the top.
  const height = query.cy !== undefined ? query.py + query.cy : layout.height;
  const slice = stageAt(calc, query.cx ?? query.px, query.cy ?? height - query.py);
  if (!slice?.corners) return [];
  const { tr, br } = slice.corners;
  const hovertext = castOption(trace['hovertext'] || trace['text'], slice.pts);
  const locale = localeOf(ctx.fullLayout);
  const fields: Record<string, unknown> = {
    ...sliceValues(trace, calc, slice),
    text: hovertext,
    v: slice.v,
    pointNumbers: slice.pts,
    curveNumber: typeof trace._index === 'number' ? trace._index : undefined,
  };
  if (slice.pts.length === 1) fields['pointNumber'] = fields['i'] = slice.pts[0];
  const text = typeof hovertext === 'string' || typeof hovertext === 'number' ? hovertext : '';
  return [
    {
      pointIndex: slice.i,
      pointIndices: slice.pts,
      distance: 0,
      px: layout.cx + (tr[0] + br[0]) / 2,
      py: height - (layout.cy + (tr[1] + br[1]) / 2),
      ...(text !== '' ? { text: String(text) } : {}),
      color: slice.color,
      fields,
      labels: sliceLabels(calc, slice, locale),
      hoverText: pieHoverText(trace, calc, slice, hovertext, locale),
    },
  ];
}
