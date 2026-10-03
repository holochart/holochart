/**
 * The `sankey` trace module (plan E13.5a, E13.5b): nodes in columns sized by their flow and links
 * between them as wide as their value, laid out by a port of d3-sankey (cycles routed as loops,
 * after d3-sankey-circular), placed by `domain`. Hover highlights a node's or a link's links and
 * shows their values; dragging a node rearranges the diagram (`arrangement`) and restyles
 * `node.x` / `node.y`. `link.flow` (E13.5c, a Holochart extension) streams animated particles
 * along the links. Core's schema/defaults parts and the runtime's render and interaction parts in
 * one object, registered with `register(sankey)` (ADR-019).
 *
 * Like Plotly, sankey has no legend entry. Deferred: `node.hoverlabel` / `link.hoverlabel`,
 * grouping nodes with a box or lasso selection, animated snapping, and extruded ribbons in a 2.5D
 * view (E13.5c; there is no 2.5D view yet).
 */
import type { TraceModule } from '@mk7s/holochart-runtime';
import { sankeyAttributes } from './attributes.ts';
import { calcSankey, type SankeyCalc } from './calc.ts';
import { supplySankeyDefaults } from './defaults.ts';
import { describeSankey } from './describe.ts';
import { lazyA11y } from '../a11y-loader.ts';
import { hoverLabels, sankeyHoverPoints, toHoverPoints, traceRect } from './hover.ts';
import { modelFor } from './model.ts';
import { sankeyRenderer } from './plot.ts';

export const sankey: TraceModule<SankeyCalc, typeof sankeyAttributes.children> = {
  type: 'sankey',
  categories: ['domain', 'noOpacity'],
  // Node drags start sideways on touch; vertical swipes scroll the page (E6.6).
  touchAction: 'pan-y',
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
  a11y: lazyA11y('sankey', traceRect, modelFor, hoverLabels, toHoverPoints),
  describe: describeSankey,
};

export { sankeyAttributes } from './attributes.ts';
export type { SankeyCalc } from './calc.ts';
export { sankeyLayout, type SankeyGraph, type SankeyLayoutOptions } from './layout.ts';
