/**
 * Bar hover and selection hit-testing (plan E9.8, E6.1, E6.3; ADR-010: CPU, 2D).
 *
 * Bars are few and rectangular, so a linear scan over the bar boxes in px is exact and cheap; no
 * spatial index is needed.
 *
 * - `closest`: the bar under the pointer (thin bars get a minimum hit size). Ranked by the distance
 *   from the pointer to the bar's center line, so the narrower of overlapping bars wins.
 * - Hover along the bars' position axis (`x` for vertical bars): every bar whose *slot* (the whole
 *   group at a position, Plotly's `bardelta`) contains the pointer; bars of one position tie, so
 *   unified labels show the whole group.
 * - Hover along the length axis: the bars under the pointer, ranked along that axis.
 *
 * Labels anchor at the bar end (Plotly).
 */
import { isArrayLike, type FullTrace } from '@mk7s/holochart-core';
import { pointInPolygon } from '@mk7s/holochart-render';
import type { HoverContext, HoverPoint, HoverQuery, SelectionQuery } from '@mk7s/holochart-runtime';
import type { BarCalc } from './calc.ts';
import { barStyle, cssColor } from './style.ts';
import { barValues, coordinateAt } from './text.ts';

/** Smallest hit size (px) of a bar along either axis, so thin or zero-length bars stay hoverable. */
export const MIN_HIT_PX = 4;

/** Linear start of bars below a log axis: the bottom of the visible range. */
function floorOf(calc: BarCalc, ctx: HoverContext): number {
  const axis = calc.orientation === 'h' ? ctx.xaxis : ctx.yaxis;
  const range = axis?.scale.range;
  return range ? Math.min(range[0], range[1]) : NaN;
}

function stringAt(value: unknown, i: number): string {
  const v = isArrayLike(value) ? value[i] : value;
  return v === undefined || v === null ? '' : String(v);
}

/** Expand `[a, b]` (either order) to at least `min` around its middle. */
function span(a: number, b: number, min: number): [number, number] {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (hi - lo >= min) return [lo, hi];
  const mid = (lo + hi) / 2;
  return [mid - min / 2, mid + min / 2];
}

/** Hover points of a bar trace (see the module comment for the modes). */
export function barHoverPoints(
  calc: BarCalc,
  trace: FullTrace,
  query: HoverQuery,
  ctx: HoverContext,
): HoverPoint[] {
  const t = ctx.transform;
  const horizontal = calc.orientation === 'h';
  // Position axis (p) and size axis (s) in px, as (scale, offset, pointer).
  const [pm, pb, pp] = horizontal
    ? [t.scaleY, t.offsetY, query.py]
    : [t.scaleX, t.offsetX, query.px];
  const [sm, sb, sp] = horizontal
    ? [t.scaleX, t.offsetX, query.px]
    : [t.scaleY, t.offsetY, query.py];
  const posMode = query.mode === (horizontal ? 'y' : 'x');
  const floor = floorOf(calc, ctx);
  const { bars } = calc;
  const hits: { i: number; distance: number }[] = [];

  for (let i = 0; i < calc.length; i++) {
    const c = bars.center[i]!;
    const w = bars.width[i]!;
    const s0 = calc.s0[i] === -Infinity ? floor : calc.s0[i]!;
    const s1 = calc.s1[i]!;
    if (!Number.isFinite(c) || !Number.isFinite(s0) || !Number.isFinite(s1)) continue;
    const centerPx = c * pm + pb;
    if (posMode) {
      // The whole slot at this position (the group), or the bar itself if it is wider.
      const slotCenter = calc.pos[i]! * pm + pb;
      const [lo, hi] = span(
        Math.min((c - w / 2) * pm + pb, slotCenter - Math.abs(bars.slot * pm) / 2),
        Math.max((c + w / 2) * pm + pb, slotCenter + Math.abs(bars.slot * pm) / 2),
        MIN_HIT_PX,
      );
      if (pp >= lo && pp <= hi) hits.push({ i, distance: Math.abs(pp - slotCenter) });
      continue;
    }
    const [plo, phi] = span((c - w / 2) * pm + pb, (c + w / 2) * pm + pb, MIN_HIT_PX);
    const [slo, shi] = span(s0 * sm + sb, s1 * sm + sb, MIN_HIT_PX);
    if (pp < plo || pp > phi || sp < slo || sp > shi) continue;
    const distance =
      query.mode === 'closest' ? Math.abs(pp - centerPx) : Math.abs(sp - (s1 * sm + sb));
    hits.push({ i, distance });
  }
  if (hits.length === 0) return [];

  const style = barStyle(trace, calc.length, null, ctx.fullLayout);
  // With a `base`, the size-axis value is where the bar ends, not its length (Plotly's
  // `trace.base ? di.b + di.s : di.s`): a Gantt bar on a date axis reports its finish date.
  const withBase = Boolean(trace['base']);
  return hits.map(({ i, distance }) => {
    const c = bars.center[i]! * pm + pb;
    const end = calc.s1[i]! * sm + sb;
    const { values, posLetter } = barValues(trace, calc, i);
    const position = coordinateAt(trace, posLetter, i);
    const size = withBase ? bars.base[i]! + bars.value[i]! : bars.value[i];
    const hovertext = stringAt(trace['hovertext'], i) || stringAt(trace['text'], i);
    const point: HoverPoint = {
      pointIndex: i,
      distance,
      px: horizontal ? end : c,
      py: horizontal ? c : end,
      x: horizontal ? size : position,
      y: horizontal ? position : size,
      ...(hovertext ? { text: hovertext } : {}),
      color: cssColor(style.color, i),
      fields: values,
    };
    return point;
  });
}

/**
 * Indices of the bars whose center lies inside a box or lasso selection (Plotly: a bar is
 * selected when its center is). Bars below a log axis are centered on their visible part.
 */
export function barSelectPoints(
  calc: BarCalc,
  _trace: FullTrace,
  query: SelectionQuery,
  ctx: HoverContext,
): number[] {
  const horizontal = calc.orientation === 'h';
  const floor = floorOf(calc, ctx);
  const [x0, x1] = [Math.min(...query.x), Math.max(...query.x)];
  const [y0, y1] = [Math.min(...query.y), Math.max(...query.y)];
  const polygon = query.kind === 'lasso' && query.polygon ? query.polygon.flat() : undefined;
  const out: number[] = [];
  for (let i = 0; i < calc.length; i++) {
    const p = calc.bars.center[i]!;
    const s0 = calc.s0[i] === -Infinity ? floor : calc.s0[i]!;
    const s = (s0 + calc.s1[i]!) / 2;
    const [x, y] = horizontal ? [s, p] : [p, s];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    if (polygon && !pointInPolygon(x, y, polygon)) continue;
    out.push(i);
  }
  return out;
}
