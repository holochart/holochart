/**
 * Keyboard stops of the polar traces (backlog S2.14), loaded with the chart's first keyboard focus
 * (`TraceModule.a11y`, `a11y-loader.ts`): the points of a `scatterpolar` trace inside its subplot
 * and the bars of a `barpolar` trace, in data order (← / ↑ the previous, → / ↓ the next), each
 * the hover point the trace gives where the point or the middle of the bar is drawn. `heatmap`
 * and `contour` get their cell cursor from `@mk7s/holochart-traces-stats` (`gridA11y`).
 *
 * This file imports types only: each trace's loader hands over the functions its stops need (see
 * the loader).
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type { HoverContext, HoverPoint, HoverQuery, TraceA11yParts } from '@mk7s/holochart-runtime';
import type { barpolarHoverPoints } from './barpolar/hover.ts';
import type { barPixels } from './barpolar/geometry.ts';
import type { PolarCalc } from './polar/cross-trace.ts';
import type { polarPositions } from './polar/positions.ts';
import type { PolarSubplot } from './polar/subplot.ts';
import type { ScatterpolarCalc } from './scatterpolar/calc.ts';
import type { scatterpolarHoverPoints } from './scatterpolar/hover.ts';

/**
 * The hover point of element `i` drawn at geometric `(x, y)` (px from the subplot's center, y up):
 * the trace's own, asked there (of points drawn on one spot, each is still a stop).
 */
function at<C>(
  hover: (calc: C, trace: FullTrace, query: HoverQuery, ctx: HoverContext) => HoverPoint[],
  calc: C,
  trace: FullTrace,
  ctx: HoverContext,
  sp: PolarSubplot,
  i: number,
  x: number,
  y: number,
): HoverPoint[] {
  const cx = sp.cx + x;
  const cy = sp.cy - y;
  const py = (ctx.height ?? 0) - cy;
  const found = hover(
    calc,
    trace,
    { px: cx, py, xl: cx, yl: py, cx, cy, mode: 'closest', distance: 1 },
    ctx,
  );
  const p = found.find((q) => q.pointIndex === i) ?? found[0];
  return p ? [p] : [];
}

/** The parts of `scatterpolar`. */
export const scatterpolar = (
  hover: typeof scatterpolarHoverPoints,
  positions: typeof polarPositions,
): TraceA11yParts => ({
  scatterpolar: {
    keyboardPoints(calc: ScatterpolarCalc, trace: FullTrace, ctx: HoverContext) {
      const sp = calc.subplot;
      if (!sp) return [];
      const { x, y, inside } = positions(calc, sp);
      const points = { ...trace, hoveron: 'points' };
      return Array.from(inside).flatMap((on, i) =>
        on ? at(hover, calc, points, ctx, sp, i, x[i]!, y[i]!) : [],
      );
    },
  },
});

/** The parts of `barpolar`. */
export const barpolar = (
  hover: typeof barpolarHoverPoints,
  pixels: typeof barPixels,
): TraceA11yParts => ({
  barpolar: {
    keyboardPoints(calc: PolarCalc, trace: FullTrace, ctx: HoverContext) {
      const sp = calc.subplot;
      const px = sp && pixels(calc, sp);
      if (!sp || !px) return [];
      return Array.from(px.visible).flatMap((on, i) => {
        const angle = (px.g0[i]! + px.g1[i]!) / 2;
        const r = (px.rp0[i]! + px.rp1[i]!) / 2;
        return on
          ? at(hover, calc, trace, ctx, sp, i, r * Math.cos(angle), r * Math.sin(angle))
          : [];
      });
    },
  },
});
