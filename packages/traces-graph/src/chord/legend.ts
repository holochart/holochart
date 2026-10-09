/**
 * `chord` legend (backlog G8, ADR-029), per item as a pie's: one item per group when
 * `node.group` is given, else one per node, in input order. A click toggles the item's name in
 * `layout.hiddenlabels`, and calc leaves the hidden nodes and their links out of the ring. A
 * trace without groups has `showlegend` off by default (its labels are around the ring).
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type { LegendGlyph, LegendIconContext, LegendItem } from '@mk7s/holochart-runtime';
import { rgbaToCss } from '@mk7s/holochart-traces-basic';
import type { ChordCalc } from './calc.ts';
import { groupColors, nodeColors } from './model.ts';

const glyph = (color: string): LegendGlyph => ({ kind: 'bar', fill: { color, lineWidth: 0 } });

/** The glyph of the trace as a whole: a swatch in the first colorway color. */
export function chordLegendIcon(_trace: FullTrace, ctx?: LegendIconContext): LegendGlyph {
  const way = ctx?.fullLayout?.['colorway'];
  return glyph(Array.isArray(way) && typeof way[0] === 'string' ? way[0] : '#636efa');
}

/** One legend item per group, or per node without groups; nodes without links have none. */
export function chordLegendItems(
  calc: ChordCalc,
  trace: FullTrace,
  ctx: LegendIconContext,
): readonly LegendItem[] {
  if (calc.groupNames.length > 0) {
    const colors = groupColors(calc, trace, ctx.fullLayout);
    return calc.groupNames.map((name, g) => ({
      key: name,
      name,
      glyph: glyph(rgbaToCss(colors[g]!)),
      hidden: calc.hiddenGroups.has(g),
    }));
  }
  const colors = nodeColors(calc, trace, ctx.fullLayout);
  const linked = new Uint8Array(calc.nodes);
  for (const l of calc.links) linked[l.source] = linked[l.target] = 1;
  const items: LegendItem[] = [];
  for (let i = 0; i < calc.nodes; i++) {
    if (linked[i] === 0) continue;
    items.push({
      key: calc.names[i]!,
      name: calc.names[i]!,
      glyph: glyph(rgbaToCss(colors[i]!)),
      hidden: calc.hidden[i] === 1,
    });
  }
  return items;
}
