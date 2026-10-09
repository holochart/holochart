/**
 * Keyboard stops of `funnelarea` (backlog S2.14), loaded with the chart's first keyboard focus
 * (`TraceModule.a11y`, `a11y-loader.ts`): its visible stages from the top, each the hover point of
 * the stage (asked at the stage's center), so ← / ↑ and → / ↓ step through them like pie slices.
 *
 * This file imports types only: the loader hands over the functions it needs (see the loader).
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type { HoverContext, TraceA11yParts } from '@mk7s/holochart-runtime';
import type { FunnelareaCalc } from './funnelarea/calc.ts';
import type { funnelareaHoverPoints } from './funnelarea/hover.ts';

/** The parts of `funnelarea`. */
export const funnelarea = (hover: typeof funnelareaHoverPoints): TraceA11yParts => ({
  funnelarea: {
    keyboardPoints(calc: FunnelareaCalc, trace: FullTrace, ctx: HoverContext) {
      const layout = calc.layout;
      if (!layout) return [];
      return calc.slices.flatMap((slice) => {
        const c = slice.corners;
        if (slice.hidden || !c) return [];
        const cx = layout.cx + (c.tl[0] + c.tr[0] + c.br[0] + c.bl[0]) / 4;
        const cy = layout.cy + (c.tl[1] + c.bl[1]) / 2;
        const py = layout.height - cy;
        return hover(
          calc,
          trace,
          { px: cx, py, xl: cx, yl: py, cx, cy, mode: 'closest', distance: 0 },
          ctx,
        );
      });
    },
  },
});
