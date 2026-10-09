/**
 * Options of the layered layout (story G3) and their defaults. The `graph` trace hands its
 * `layered` container to the layout as it is, so every value is checked here: anything that is not
 * a usable value falls back to its default instead of reaching the pipeline.
 *
 * Lengths are layout units (CSS px, see `../types.ts`).
 */

/** Where the ranks run: top to bottom, bottom to top, left to right or right to left. */
export type LayeredRankdir = 'TB' | 'BT' | 'LR' | 'RL';

/** How ranks are assigned (see `rank.ts`). */
export type LayeredRanker = 'network-simplex' | 'tight-tree' | 'longest-path';

/** How links are routed (see `route.ts`). */
export type LayeredRouting = 'spline' | 'polyline' | 'orthogonal';

export interface LayeredOptions {
  /** Direction the links point in. Default `'TB'`. */
  readonly rankdir?: LayeredRankdir;
  /** Free space between two ranks, measured between their tallest nodes. Default 50. */
  readonly ranksep?: number;
  /** Free space between two nodes of a rank. Default 30. */
  readonly nodesep?: number;
  /** Free space between two long links that pass a rank side by side. Default 12. */
  readonly edgesep?: number;
  /**
   * `'network-simplex'` (default) gives the shortest total link length, `'tight-tree'` is its
   * starting point (longest path, then every component pulled tight along a spanning tree) and
   * `'longest-path'` puts every node as early as its links allow.
   */
  readonly ranker?: LayeredRanker;
  /**
   * `'spline'` (default): smooth cubic Bézier chains; `'polyline'`: straight segments through the
   * same points; `'orthogonal'`: axis-aligned segments with one bend between two ranks.
   */
  readonly routing?: LayeredRouting;
  /** Keep the nodes of a `group` together and return a frame per group. Default `false`. */
  readonly clusters?: boolean;
  /** Space between a cluster's frame and its nodes. Default 12. */
  readonly clusterPadding?: number;
  /** Room for the title along the top of a cluster's frame, above the padding. Default 18. */
  readonly clusterLabelHeight?: number;
  /** Free space between two disconnected parts of the graph. Default 40. */
  readonly componentsep?: number;
  /** Width over height the packing of disconnected parts aims for. Default 1.6. */
  readonly aspect?: number;
  /** Upper bound on the crossing reduction sweeps (it stops earlier when they stop helping). Default 24. */
  readonly orderRounds?: number;
}

/** Every option, set. */
export type ResolvedLayeredOptions = { -readonly [K in keyof LayeredOptions]-?: LayeredOptions[K] };

export const LAYERED_DEFAULTS: Readonly<ResolvedLayeredOptions> = {
  rankdir: 'TB',
  ranksep: 50,
  nodesep: 30,
  edgesep: 12,
  ranker: 'network-simplex',
  routing: 'spline',
  clusters: false,
  clusterPadding: 12,
  clusterLabelHeight: 18,
  componentsep: 40,
  aspect: 1.6,
  orderRounds: 24,
};

const RANKDIRS: readonly unknown[] = ['TB', 'BT', 'LR', 'RL'];
const RANKERS: readonly unknown[] = ['network-simplex', 'tight-tree', 'longest-path'];
const ROUTINGS: readonly unknown[] = ['spline', 'polyline', 'orthogonal'];

/** A finite length ≥ 0, or the default. */
const length = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;

/** The options with every missing or unusable value replaced by its default. */
export function resolveLayeredOptions(
  options: LayeredOptions | null | undefined,
): ResolvedLayeredOptions {
  const o: LayeredOptions = options ?? {};
  const d = LAYERED_DEFAULTS;
  const aspect = length(o.aspect, d.aspect);
  return {
    rankdir: RANKDIRS.includes(o.rankdir) ? o.rankdir! : d.rankdir,
    ranksep: length(o.ranksep, d.ranksep),
    nodesep: length(o.nodesep, d.nodesep),
    edgesep: length(o.edgesep, d.edgesep),
    ranker: RANKERS.includes(o.ranker) ? o.ranker! : d.ranker,
    routing: ROUTINGS.includes(o.routing) ? o.routing! : d.routing,
    clusters: o.clusters === true,
    clusterPadding: length(o.clusterPadding, d.clusterPadding),
    clusterLabelHeight: length(o.clusterLabelHeight, d.clusterLabelHeight),
    componentsep: length(o.componentsep, d.componentsep),
    aspect: aspect > 0 ? aspect : d.aspect,
    orderRounds: Math.round(length(o.orderRounds, d.orderRounds)),
  };
}
