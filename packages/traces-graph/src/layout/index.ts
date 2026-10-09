/**
 * The layout table of the `graph` trace (ADR-029): `arrangement` names a layout here, and
 * `arrangement: 'custom'` one that an app registered with `registerGraphLayout` (`./registry.ts`,
 * which also has the names of the arrangements: a module that needs no built-in layout imports
 * that file, not this one).
 *
 * Adding a built-in layout is one line in {@link BUILT_IN}. Its options are the layout's own
 * (camelCase); the trace builds them from its option containers in `graph/options.ts`.
 */
import { arcLayout } from './arc.ts';
import { circularLayout } from './circular.ts';
import { forceLayout } from './force/index.ts';
import { gridLayout } from './grid.ts';
import { hiveLayout } from './hive.ts';
import { layeredLayout } from './layered/index.ts';
import { presetLayout } from './preset.ts';
import {
  circularFallback,
  resolveCustomLayout,
  type AnyGraphLayout,
  type GraphArrangement,
  type ResolvedGraphLayout,
} from './registry.ts';
import { dendrogramLayout, radialTreeLayout, tidyTreeLayout } from './tree/index.ts';
import type { GraphLayout } from './types.ts';

export {
  GRAPH_ARRANGEMENTS,
  registerGraphLayout,
  resolveCustomLayout,
  type GraphArrangement,
  type ResolvedGraphLayout,
} from './registry.ts';

/** The layouts built into the package, by arrangement. */
const BUILT_IN: Partial<Record<GraphArrangement, AnyGraphLayout>> = {
  preset: presetLayout,
  force: forceLayout,
  layered: layeredLayout,
  tree: tidyTreeLayout,
  radial: radialTreeLayout,
  dendrogram: dendrogramLayout,
  circular: circularLayout,
  grid: gridLayout,
  arc: arcLayout,
  hive: hiveLayout,
};

/**
 * The layout of `arrangement` (`customName`: the `custom.name` of `'custom'`). A missing layout
 * falls back to `circular` and warns once per name; it never throws.
 */
export function resolveGraphLayout(
  arrangement: GraphArrangement,
  customName?: string,
): ResolvedGraphLayout {
  if (arrangement === 'custom') return resolveCustomLayout(customName);
  const found = BUILT_IN[arrangement];
  if (found) return { layout: found as GraphLayout<unknown>, arrangement, fallback: false };
  return circularFallback(
    `the '${arrangement}' arrangement is not available; drawn with 'circular'.`,
  );
}

export {
  arcLayout,
  type ArcLayoutOptions,
  type ArcLayoutResult,
  type ArcOrder,
  type ArcSides,
} from './arc.ts';
export { circularLayout, type CircularOptions } from './circular.ts';
export {
  createForceSimulation,
  defaultTicks,
  forceLayout,
  type ForceAlgorithm,
  type ForceOptions,
  type LinkWeightMode,
  type PerNode,
} from './force/index.ts';
export { gridLayout, type GridOptions } from './grid.ts';
export { hiveLayout, type HiveLayoutOptions, type HiveLayoutResult } from './hive.ts';
export {
  layeredLayout,
  type LayeredOptions,
  type LayeredRankdir,
  type LayeredRanker,
  type LayeredRouting,
} from './layered/index.ts';
export { presetLayout } from './preset.ts';
export { degrees, nodeOrder, type NodeSort } from './order.ts';
export {
  dendrogramLayout,
  radialTreeLayout,
  tidyTreeLayout,
  type CollapsedInput,
  type DendrogramOptions,
  type DendrogramResult,
  type RadialTreeOptions,
  type RadialTreeResult,
  type TidyTreeOptions,
  type TreeLayoutResult,
  type TreeLinkShape,
  type TreeOptions,
  type TreeOrientation,
  type TreeSort,
} from './tree/index.ts';
