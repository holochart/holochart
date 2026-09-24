/**
 * Pie legend (plan E9.11, E5.2): one item per label (Plotly's `pie-like` legends), toggled through
 * `layout.hiddenlabels` by the legend component, and a fallback glyph for the whole trace.
 */
import { isArrayLike, type FullLayout, type FullTrace } from '@mk7s/holochart-core';
import type { LegendGlyph, LegendIconContext, LegendItem } from '@mk7s/holochart-runtime';
import type { PieCalc, PieSlice } from './calc.ts';
import { castOption, rgbaString } from './helpers.ts';
import { pieColorway } from './layout.ts';

const DEFAULT_LINE = '#444';

function glyph(trace: FullTrace, pts: readonly number[], color: string): LegendGlyph {
  const line = (trace['marker'] as { line?: { color?: unknown; width?: unknown } } | undefined)
    ?.line;
  const lineColor = castOption(line?.color, pts);
  return {
    kind: 'bar',
    fill: {
      color,
      lineColor: typeof lineColor === 'string' ? lineColor : DEFAULT_LINE,
      lineWidth: Number(castOption(line?.width, pts)) || 0,
    },
  };
}

/** The color of a slice, falling back to its position in the colorway before colors resolve. */
function colorOf(slice: PieSlice, k: number, fullLayout: FullLayout | undefined): string {
  if (slice.color) return slice.color;
  const way = fullLayout ? pieColorway(fullLayout) : [];
  return way.length > 0 ? (way[k % way.length] as string) : DEFAULT_LINE;
}

/**
 * One legend item per slice label, in slice order (sorted by value when `sort`). Hidden slices
 * (`layout.hiddenlabels`) are listed with `hidden: true`.
 */
export function pieLegendItems(
  calc: PieCalc,
  trace: FullTrace,
  ctx: LegendIconContext,
): readonly LegendItem[] {
  return calc.slices.map((slice, k) => ({
    key: slice.label,
    name: slice.label,
    glyph: glyph(trace, slice.pts, colorOf(slice, k, ctx.fullLayout)),
    hidden: slice.hidden,
  }));
}

/**
 * The glyph of the trace as a whole (used when the legend asks per trace): the first slice's
 * color — its explicit `marker.colors[0]`, else the first slice colorway color.
 */
export function pieLegendIcon(trace: FullTrace, ctx?: LegendIconContext): LegendGlyph {
  const colors = (trace['marker'] as { colors?: unknown } | undefined)?.colors;
  const explicit = isArrayLike(colors) ? rgbaString(colors[0]) : null;
  const way = ctx?.fullLayout ? pieColorway(ctx.fullLayout) : [];
  return glyph(trace, [0], explicit ?? (way[0] as string | undefined) ?? DEFAULT_LINE);
}
