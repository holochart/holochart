/**
 * The `graph3d` trace module (backlog G6, ADR-029): the `graph` trace's model in a 3D scene.
 * Nodes are lit spheres (or sprites), links lines or tubes with cones for arrowheads, at given
 * positions or placed in space by the force layout or in planes by rank (`arrangement`). The
 * scene is `traces-3d`'s: its orbit camera, wheel and pinch, `chart.animateCamera`,
 * `scene.autorotate`, GPU picking for hover and click, and view keys are the ones every 3D trace
 * has.
 *
 * It is in this package's index but not in `tracesGraph`: it needs the scene, so an app that draws
 * 2D graphs only does not load `traces-3d`. Register `tracesGraph3d`, or import
 * `@mk7s/holochart/graph`.
 *
 * The scene's axes: with `arrangement: 'preset'` positions are data on them, and they are drawn
 * and typed like any 3D trace's; a computed arrangement has no readable scale, so the module asks
 * for hidden axes (core's `axisHints`, which the scene's defaults honor).
 */
import type { FullTrace, TraceAxisHints } from '@mk7s/holochart-core';
import type { DescribeContext, TraceDescription, TraceModule } from '@mk7s/holochart-runtime';
import {
  sceneA11y,
  sceneCrossTraceLayout,
  sceneFor,
  sceneSubplotDomain,
} from '@mk7s/holochart-traces-3d';
import { coloraxisLayoutSchema, pieLayoutAttributes } from '@mk7s/holochart-traces-basic';
import { graphKit, lazyA11y, withSceneKeys } from '../a11y-loader.ts';
import { describeGraph } from '../graph/describe.ts';
import { graphColorbar, graphLegendIcon, graphLegendItems } from '../graph/legend.ts';
import { part } from '../graph/style.ts';
import { graph3dAttributes } from './attributes.ts';
import { arrangement3dOf, as2d, calcGraph3d, type Graph3dCalc } from './calc.ts';
import { supplyGraph3dDefaults, supplyGraph3dLayoutDefaults } from './defaults.ts';
import {
  graph3dEventData,
  graph3dHoverPoints,
  graph3dLinkPoint,
  graph3dNodePoint,
} from './hover.ts';
import { graph3dRenderer } from './plot.ts';

/** The graph3d `axisHints`: see the module comment. */
export function graph3dAxisHints(trace: FullTrace): TraceAxisHints {
  if (arrangement3dOf(trace) !== 'preset') return { hide: true };
  const node = part(trace, 'node');
  return { x: node['x'], y: node['y'], z: node['z'] };
}

/** The 2D trace's description, said of a 3D graph. */
export function describeGraph3d(ctx: DescribeContext<Graph3dCalc>): TraceDescription {
  const flat = describeGraph({ ...ctx, calc: as2d(ctx.calc) });
  return {
    ...flat,
    kind: '3D network graph',
    summary: `3D ${flat.summary.charAt(0).toLowerCase()}${flat.summary.slice(1)}`,
  };
}

export const graph3d: TraceModule<Graph3dCalc, typeof graph3dAttributes.children> = {
  type: 'graph3d',
  // `pie-like`: one legend item per group, as for the 2D trace.
  categories: ['gl3d', 'symbols', 'showLegend', 'pie-like'],
  schema: graph3dAttributes,
  layoutSchema: /* @__PURE__ */ (() => ({
    hiddenlabels: pieLayoutAttributes.hiddenlabels,
    ...coloraxisLayoutSchema,
  }))(),
  meta: {
    description:
      'Network graph in a 3D scene: nodes as lit spheres or sprites and links as lines or tubes, at given positions or placed in space by a force layout or in planes by rank; hovered through GPU picking; every part is one draw call.',
    docsPage: 'graph3d',
  },
  supplyDefaults: supplyGraph3dDefaults,
  supplyLayoutDefaults: supplyGraph3dLayoutDefaults,
  axisHints: graph3dAxisHints,
  touchAction: 'none',
  subplotDomain: sceneSubplotDomain,
  crossTraceLayout: sceneCrossTraceLayout,
  calc: calcGraph3d,
  plot: graph3dRenderer,
  // Keyboard stops along the links (this package's chunk) and the scene's view keys (the 3D
  // package's), both loaded with the chart's first keyboard focus.
  a11y: /* @__PURE__ */ withSceneKeys(
    'graph3d',
    /* @__PURE__ */ lazyA11y('graph3d', sceneFor, graph3dNodePoint, graph3dLinkPoint, graphKit),
    sceneA11y,
  ),
  hoverPoints: graph3dHoverPoints,
  eventData: graph3dEventData,
  legendIcon: graphLegendIcon,
  legendItems: (calc, trace, ctx) => graphLegendItems(as2d(calc), trace, ctx),
  colorbar: graphColorbar,
  describe: describeGraph3d,
};

export { graph3dAttributes, GRAPH3D_ARRANGEMENTS } from './attributes.ts';
export type { Graph3dArrangement } from './attributes.ts';
export type { Graph3dCalc, Graph3dPlanes } from './calc.ts';
export { forceLayout3d, layeredLayout3d } from './layout.ts';
export type { Layered3dOptions, Layered3dResult } from './layout.ts';
