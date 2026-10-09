/**
 * Edge bundling for the `graph` trace (ADR-029): after a layout has placed the nodes, links that
 * run the same way are drawn together as bundles, so a dense graph shows its structure instead of
 * a hairball. Nodes do not move; only the links get routes, in the layout's units.
 *
 * Two methods, each in its own file:
 * - `'hierarchical'` (`./hierarchical.ts`, Holten 2006): for graphs with groups (or a tree over
 *   the nodes). A link follows the path between its ends in the hierarchy, as a smooth spline.
 *   Linear in the links, exact, and at its best on circular and radial arrangements.
 * - `'force'` (`./force.ts`, Holten and van Wijk 2009): for graphs without groups. Compatible
 *   links attract each other. Costly, so bounded, and refused above a size cap.
 *
 * {@link bundleLinks} picks one. Everything here is a pure function over typed arrays with no DOM
 * and no imports from other packages: it runs in calc, in a worker and in Node, and the same
 * input gives the same bytes everywhere.
 */
import type { LinkRoute } from '../types.ts';
import { forceBundle, type ForceBundleOptions } from './force.ts';
import { hasGroups, hierarchicalBundle, type HierarchicalBundleOptions } from './hierarchical.ts';
import type { BundleGraph, BundlePositions } from './types.ts';

export { bsplineRoute, bsplineToBezier } from './bspline.ts';
export {
  edgeCompatibility,
  FIRST_STEP,
  forceBundle,
  linkCompatibility,
  SOFTENING,
  type ForceBundleOptions,
  type ForceBundleResult,
  type LinkCompatibility,
} from './force.ts';
export {
  buildHierarchy,
  controlPolygon,
  hasGroups,
  hierarchicalBundle,
  hierarchyPath,
  type BundleHierarchy,
  type HierarchicalBundleOptions,
} from './hierarchical.ts';
export { DEFAULT_BUNDLE_STRENGTH, type BundleGraph, type BundlePositions } from './types.ts';

/**
 * Options of {@link bundleLinks}: the method, the shared `strength`, and the options of both
 * methods (each reads its own and ignores the other's).
 */
export interface BundleOptions extends HierarchicalBundleOptions, ForceBundleOptions {
  /**
   * `'auto'` (default): `'hierarchical'` when the graph has groups (`group` with `groups > 0` and
   * at least one node in a group), or when `hierarchy: 'parents'` is asked for and the graph has
   * `parent`; else `'force'`. Naming a method runs that one and never the other: `'hierarchical'`
   * on a graph without a hierarchy bundles nothing.
   */
  readonly method?: 'auto' | 'hierarchical' | 'force';
  /** 0 = straight links … 1 = fully bundled. Default 0.85. */
  readonly strength?: number;
}

/** What {@link bundleLinks} returns. */
export interface BundleResult {
  /**
   * One entry per link (same indices as `graph.source`); `undefined` = a straight link. Fits
   * `LayoutResult.routes`.
   */
  readonly routes: (LinkRoute | undefined)[];
  /**
   * The method that gave the routes, or `'none'` when no link got one: no links, `strength` 0,
   * no hierarchy for `'hierarchical'`, no compatible links for `'force'`, or refused.
   */
  readonly method: 'hierarchical' | 'force' | 'none';
  /**
   * True when force bundling was asked for but the graph is over the size cap (`maxLinks`), so
   * links were left straight.
   */
  readonly refused: boolean;
}

/**
 * Bundle the links of a laid-out graph: hierarchical bundling when it has groups, force-directed
 * bundling when it has none (see {@link BundleOptions.method}). `positions` are the node centers
 * a layout returned; the number of nodes is their length.
 */
export function bundleLinks(
  positions: BundlePositions,
  graph: BundleGraph,
  options: BundleOptions = {},
): BundleResult {
  const nodes = Math.min(positions.x.length, positions.y.length);
  const method =
    options.method === 'hierarchical' || options.method === 'force'
      ? options.method
      : hasGroups(graph, nodes) || (options.hierarchy === 'parents' && graph.parent)
        ? 'hierarchical'
        : 'force';
  if (method === 'force') return forceBundle(positions, graph, options);
  const routes = hierarchicalBundle(positions, graph, options);
  const bundled = routes.some((route) => route !== undefined);
  return { routes, method: bundled ? 'hierarchical' : 'none', refused: false };
}
