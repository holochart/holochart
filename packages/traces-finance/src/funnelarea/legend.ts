/**
 * Funnelarea legend (plan E12.6, E5.2; Plotly's pie-like legends): one item per stage label,
 * toggled through `layout.hiddenlabels` (shared with pies) by the legend component, and a fallback
 * glyph for the whole trace. The glyph is a square in the stage's color with its outline and, with
 * `marker.pattern`, the stage's pattern (as pie's).
 */
import { isArrayLike, type FullLayout, type FullTrace } from '@mk7s/holochart-core';
import type { LegendGlyph, LegendIconContext, LegendItem } from '@mk7s/holochart-runtime';
import { castOption, slicePattern } from '@mk7s/holochart-traces-basic';
import { funnelareaColorway, type FunnelareaCalc } from './calc.ts';

function glyph(
  trace: FullTrace,
  pts: readonly number[],
  color: string,
  fullLayout: FullLayout | undefined,
): LegendGlyph {
  const marker = trace['marker'] as
    { line?: { color?: unknown; width?: unknown }; pattern?: unknown } | undefined;
  const line = marker?.line;
  const lineColor = castOption(line?.color, pts);
  const pattern = slicePattern(marker?.pattern, pts, fullLayout?.paper_bgcolor);
  return {
    kind: 'bar',
    fill: {
      color,
      lineColor: typeof lineColor === 'string' ? lineColor : '#444',
      lineWidth: Number(castOption(line?.width, pts)) || 0,
      ...(pattern && { pattern }),
    },
  };
}

/** A stage's color, falling back to its place in the colorway before colors resolve. */
function colorAt(color: string, k: number, fullLayout: FullLayout | undefined): string {
  if (color) return color;
  const way = fullLayout ? funnelareaColorway(fullLayout) : [];
  return way.length > 0 ? way[k % way.length]! : '#444';
}

/** One legend item per stage label, in stage order; hidden stages have `hidden: true`. */
export function funnelareaLegendItems(
  calc: FunnelareaCalc,
  trace: FullTrace,
  ctx: LegendIconContext,
): readonly LegendItem[] {
  return calc.slices.map((slice, k) => ({
    key: slice.label,
    name: slice.label,
    glyph: glyph(trace, slice.pts, colorAt(slice.color, k, ctx.fullLayout), ctx.fullLayout),
    hidden: slice.hidden,
  }));
}

/** The glyph of the trace as a whole: the first stage's color. */
export function funnelareaLegendIcon(trace: FullTrace, ctx?: LegendIconContext): LegendGlyph {
  const colors = (trace['marker'] as { colors?: unknown } | undefined)?.colors;
  const first = isArrayLike(colors) && typeof colors[0] === 'string' ? colors[0] : '';
  return glyph(trace, [0], colorAt(first, 0, ctx?.fullLayout), ctx?.fullLayout);
}
