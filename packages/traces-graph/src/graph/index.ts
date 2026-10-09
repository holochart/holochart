/**
 * The `graph` trace module (backlog G1–G4, ADR-029): a node-link chart, with nodes at given
 * positions or placed by a layout (`arrangement`: force-directed, layered, a tidy or radial tree,
 * a dendrogram, a circle, a grid, an arc diagram, a hive plot), links as lines with optional arrowheads,
 * curves for parallel links and loops for self-links, labels culled where they collide, colors by
 * group (with a legend) or by value (with a colorbar), hover on nodes and links and box and lasso
 * selection of nodes; a hover highlights a node's neighbourhood, two selected nodes the path
 * between them, and nodes are dragged (backlog G5: `highlight.ts`, `drag.ts`, `interact.ts`).
 * Large graphs (backlog G7): a layout can run off the main thread and be drawn while it settles
 * (`worker`: `pending.ts`, `stream.ts`), detail follows the zoom (`lod`: `lod.ts`), links can be
 * bundled (`link.bundle`), and hover finds links through a spatial index (`link-index.ts`).
 * Core's schema/defaults parts and the runtime's render and interaction parts in one object,
 * registered with `register(graph)` (ADR-019).
 *
 * The trace is cartesian: it draws on its `xaxis` / `yaxis`, so zoom, pan, selection,
 * `uirevision`, subplots and export are the cartesian ones. It tells core what its axes should
 * default to (`axisHints`): positions that are data (`arrangement: 'preset'`) go on the axes like
 * any trace's, and type them; computed positions hide the axes and lock them to one scale.
 */
import type { FullTrace, TraceAxisHints } from '@mk7s/holochart-core';
import type { TraceModule } from '@mk7s/holochart-runtime';
import { coloraxisLayoutSchema, pieLayoutAttributes } from '@mk7s/holochart-traces-basic';
import { graphKit, lazyA11y } from '../a11y-loader.ts';
import { graphAttributes } from './attributes.ts';
import { arrangementOf, calcGraph, graphExtremes, type GraphCalc } from './calc.ts';
import { supplyGraphDefaults, supplyGraphLayoutDefaults } from './defaults.ts';
import { describeGraph } from './describe.ts';
import { frameOf } from './frame.ts';
import {
  graphEventData,
  graphHoverPoints,
  graphSelectPoints,
  linkHoverPoint,
  nodeHoverPoint,
} from './hover.ts';
import { graphColorbar, graphLegendIcon, graphLegendItems } from './legend.ts';
import { drawnLinks } from './links.ts';
import { equalScales, realAxisOf } from './options.ts';
import { graphRenderer } from './plot.ts';
import { part } from './style.ts';

/**
 * The graph's `axisHints`: see the module comment. A computed arrangement with a real axis (a
 * dendrogram's heights, the positions of a timeline: `realAxisOf`) hides the other axis only,
 * leaves the two scales free and types the real one from its data. A tidy tree and a dendrogram
 * leave the scales free too (`equalScales`).
 */
export function graphAxisHints(trace: FullTrace): TraceAxisHints {
  const arrangement = arrangementOf(trace);
  const node = part(trace, 'node');
  if (arrangement === 'preset') return { x: node['x'], y: node['y'] };
  const real = realAxisOf(trace, arrangement);
  if (!real) return { hide: true, equal: equalScales(arrangement) };
  return {
    hide: real.axis === 'x' ? 'y' : 'x',
    [real.axis]: real.kind === 'value' ? node['value'] : node[real.axis],
    ...(real.reversed ? { reverse: real.axis } : {}),
  };
}

export const graph: TraceModule<GraphCalc, typeof graphAttributes.children> = {
  type: 'graph',
  // `pie-like`: the legend has one item per group, so one graph with groups shows its legend
  // (core counts such a trace as two entries). A graph without groups defaults `showlegend` off.
  categories: ['cartesian', 'symbols', 'showLegend', 'pie-like'],
  schema: graphAttributes,
  // `hiddenlabels` is the pies' own attribute (one list for every per-item legend).
  layoutSchema: /* @__PURE__ */ (() => ({
    hiddenlabels: pieLayoutAttributes.hiddenlabels,
    ...coloraxisLayoutSchema,
  }))(),
  meta: {
    description:
      'Network graph: nodes and the links between them, at given positions or placed by a layout (`arrangement`: force-directed, layered with box nodes and routed links, tidy and radial trees that fold on a click, a dendrogram, an arc diagram, a hive plot); arrowheads, curved parallel links and loops, labels culled where they collide, colors by group or by value; every part is one GPU draw call regardless of the size of the graph. For large graphs: layouts off the main thread, drawn while they settle (`worker`), level of detail that follows the zoom (`lod`) and link bundling (`link.bundle`).',
    docsPage: 'graph',
  },
  supplyDefaults: supplyGraphDefaults,
  supplyLayoutDefaults: supplyGraphLayoutDefaults,
  axisHints: graphAxisHints,
  calc: calcGraph,
  extremes: (calc, trace) => graphExtremes(calc, trace),
  plot: graphRenderer,
  // Node drags start sideways on touch; a swipe that starts vertically scrolls the page (E6.6).
  touchAction: 'pan-y',
  hoverPoints: graphHoverPoints,
  selectPoints: graphSelectPoints,
  eventData: graphEventData,
  // Keyboard stops along the links, loaded with the chart's first keyboard focus.
  a11y: /* @__PURE__ */ lazyA11y(
    'graph',
    frameOf,
    nodeHoverPoint,
    linkHoverPoint,
    drawnLinks,
    graphKit,
  ),
  legendIcon: graphLegendIcon,
  legendItems: graphLegendItems,
  colorbar: graphColorbar,
  describe: describeGraph,
};

export { graphAttributes } from './attributes.ts';
export { graphPath } from './highlight.ts';
export type { GraphPathInfo } from './highlight.ts';
export type { GraphCalc, GraphForce, GraphGuides, GraphModelCalc, GraphTree } from './calc.ts';
export type { BundleSpace, GraphBundle, GraphPending } from './pending.ts';
export type { LabelRule } from './labels.ts';
export type { PlotArea, RealAxis } from './options.ts';
export type { GraphModel } from './model.ts';
