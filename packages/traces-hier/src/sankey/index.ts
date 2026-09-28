/**
 * The `sankey` trace module (plan E13.5a, E13.5b): nodes in columns sized by their flow and links
 * between them as wide as their value, laid out by a port of d3-sankey (cycles routed as loops,
 * after d3-sankey-circular), placed by `domain`. Hover highlights a node's or a link's links and
 * shows their values; dragging a node rearranges the diagram (`arrangement`) and restyles
 * `node.x` / `node.y`. Core's schema/defaults parts and the runtime's render and interaction parts
 * in one object, registered with `register(sankey)` (ADR-019).
 *
 * Like Plotly, sankey has no legend entry. Deferred: `node.hoverlabel` / `link.hoverlabel`,
 * grouping nodes with a box or lasso selection, animated snapping, flow particles and 2.5D
 * ribbons (E13.5c).
 */
import type { TraceModule } from '@mk7s/holochart-runtime';
import { sankeyAttributes } from './attributes.ts';
import { calcSankey, type SankeyCalc } from './calc.ts';
import { supplySankeyDefaults } from './defaults.ts';
import { describeSankey } from './describe.ts';
import { sankeyHoverPoints } from './hover.ts';
import { sankeyRenderer } from './plot.ts';

export const sankey: TraceModule<SankeyCalc, typeof sankeyAttributes.children> = {
  type: 'sankey',
  categories: ['domain', 'noOpacity'],
  schema: sankeyAttributes,
  meta: {
    description:
      'Sankey diagram: flows between nodes as links as wide as their value, nodes in columns sized by their flow; cycles drawn as loops, nodes draggable.',
    docsPage: 'sankey',
    plotlyEquivalent: 'sankey',
  },
  supplyDefaults: supplySankeyDefaults,
  calc: calcSankey,
  plot: sankeyRenderer,
  hoverPoints: sankeyHoverPoints,
  describe: describeSankey,
};

export { sankeyAttributes } from './attributes.ts';
export type { SankeyCalc } from './calc.ts';
export { sankeyLayout, type SankeyGraph, type SankeyLayoutOptions } from './layout.ts';
