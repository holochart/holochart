/**
 * `graph` legend and colorbar (backlog G1, ADR-029). With `node.group` the legend has one item
 * per group, as a pie has one per label: a click toggles the group's name in
 * `layout.hiddenlabels`, and calc hides the group's nodes and their links. Without groups the
 * trace has no legend item by default (`showlegend` defaults to `false`); when asked for, it is a
 * node marker in the trace's color. Numeric node colors show the colorbar of their colorscale.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type {
  ColorbarSpec,
  LegendGlyph,
  LegendIconContext,
  LegendItem,
} from '@mk7s/holochart-runtime';
import { markerColorbar, resolveColorMapping } from '@mk7s/holochart-traces-basic';
import type { GraphModelCalc } from './calc.ts';
import { groupColors, part } from './style.ts';

function glyph(trace: FullTrace, color: string): LegendGlyph {
  const node = part(trace, 'node');
  const line = part(node, 'line');
  const symbol = node['symbol'];
  return {
    kind: 'marker',
    marker: {
      ...(typeof symbol === 'string' || typeof symbol === 'number' ? { symbol } : {}),
      // A box node is a square in the legend.
      ...(node['shape'] === 'box' ? { symbol: 'square' } : {}),
      size: 10,
      color,
      ...(typeof line['color'] === 'string' ? { lineColor: line['color'] } : {}),
      lineWidth: typeof line['width'] === 'number' ? line['width'] : 0,
    },
  };
}

/** The glyph of the trace as a whole: a node in its color. */
export function graphLegendIcon(trace: FullTrace, ctx?: LegendIconContext): LegendGlyph {
  const color = part(trace, 'node')['color'];
  const way = ctx?.fullLayout?.['colorway'];
  const fallback = Array.isArray(way) && typeof way[0] === 'string' ? way[0] : '#636efa';
  return glyph(trace, typeof color === 'string' ? color : fallback);
}

/**
 * One legend item per group, in order of first appearance; `undefined` (one item for the trace)
 * when the nodes have no groups, or when their colors do not come from the groups (`node.color`
 * is given), since the items could then not show a group's color.
 */
export function graphLegendItems(
  calc: GraphModelCalc,
  trace: FullTrace,
  ctx: LegendIconContext,
): readonly LegendItem[] | undefined {
  const { model } = calc;
  if (model.groupNames.length === 0) return undefined;
  const node = part(trace, 'node');
  const given = node['color'];
  // Group items are shown for group colors and for one color for all (the items then differ by
  // name only); per-node colors say nothing about a group.
  if (given !== undefined && given !== null && typeof given !== 'string') return undefined;
  const colors = groupColors(model, ctx.fullLayout);
  return model.groupNames.map((name, g) => ({
    key: name,
    name,
    glyph: glyph(trace, typeof given === 'string' ? given : colors[g]!),
    hidden: calc.hiddenGroups.has(g),
  }));
}

/** The colorbar of numeric node colors (`node.showscale`, or the `coloraxis` they refer to). */
export function graphColorbar(trace: FullTrace, ctx: LegendIconContext): ColorbarSpec | null {
  if (!resolveColorMapping(part(trace, 'node'), ctx.fullLayout)) return null;
  return markerColorbar(trace, ctx.fullLayout, 'node');
}
