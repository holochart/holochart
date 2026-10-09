/**
 * Options of the force layout and their defaults. One flat container serves both algorithms: the
 * shared options first (dimensions, cooling, collision, Barnes–Hut, centering, positional and group
 * forces), then those of the d3-force-style `'spring'` simulation, then those of `'forceatlas2'`.
 *
 * Lengths are layout units (CSS px at natural size, see `../types.ts`); strengths have no unit.
 */
import type { LayoutGraph } from '../types.ts';

/**
 * - `'spring'`: the d3-force model. Links are springs with a rest length, every pair of nodes
 *   repels, velocities decay and the whole cools on a fixed schedule. Even link lengths; the usual
 *   choice up to a few thousand nodes.
 * - `'forceatlas2'`: the ForceAtlas2 model (Jacomy et al. 2014). Links attract in proportion to
 *   their length, nodes repel in proportion to their degrees, and the step size adapts to how much
 *   the nodes swing. It pulls communities apart better on graphs with hubs.
 */
export type ForceAlgorithm = 'spring' | 'forceatlas2';

/**
 * What a link's weight (`link.value`) does, relative to the median weight of the graph:
 * - `'strength'`: a heavier link pulls harder (both algorithms);
 * - `'distance'`: a heavier link is shorter. `'spring'`: its rest length is `linkDistance` divided
 *   by the relative weight, kept within a quarter to four times `linkDistance`. `'forceatlas2'`
 *   has no rest length, so this is the same as `'strength'` there;
 * - `'none'`: weights are ignored.
 */
export type LinkWeightMode = 'strength' | 'distance' | 'none';

/** A value for every node, or one value per node (`NaN`: none for that node). */
export type PerNode = number | ArrayLike<number>;

export interface ForceOptions {
  /** Default `'spring'`. */
  readonly algorithm?: ForceAlgorithm;
  /**
   * 2 lays out in the plane (the result has no `z`); 3 in space, reading `graph.z` for pins.
   * Default 2.
   */
  readonly dimensions?: 2 | 3;
  /** Seed of the generator that separates coincident nodes. Default 1. */
  readonly seed?: number;
  /**
   * Ticks from start to rest: {@link forceLayout} runs this many, and the cooling rate is derived
   * from it. Default {@link defaultTicks}: 300 up to 3,000 nodes, fewer above.
   */
  readonly ticks?: number;
  /** The simulation is at rest once `alpha` is below this. Default 0.001. */
  readonly alphaMin?: number;
  /**
   * How fast `alpha` cools per tick, `alpha ← alpha × (1 − alphaDecay)`. Default
   * `1 − alphaMin^(1 / ticks)`, which reaches `alphaMin` after `ticks` ticks.
   */
  readonly alphaDecay?: number;
  /** Spacing of the start spiral (2D) or ball (3D). Default `linkDistance / 3`. */
  readonly initialRadius?: number;
  /**
   * Where the layout is centered, `[x, y]` or `[x, y, z]`. Default: the origin, or along an axis
   * on which some nodes have a given coordinate, the mean of those.
   */
  readonly center?: readonly number[];

  /**
   * Keep nodes from overlapping, each taken as a circle (a sphere in 3D) of the larger of its
   * `halfWidth` and `halfHeight`. Default `true`.
   */
  readonly collide?: boolean;
  /** Room left between two nodes' outlines. Default 0. */
  readonly collidePadding?: number;
  /** Share of an overlap removed per tick, 0 to 1. Default 1. */
  readonly collideStrength?: number;
  /** Collision passes per tick; more settle dense clumps better. Default 1. */
  readonly collideIterations?: number;

  /**
   * Barnes–Hut accuracy: a cell is taken as one mass when `width / distance < theta`. 0 is the
   * exact sum. Default 0.9 for `'spring'`, 1.2 for `'forceatlas2'` (the paper's value).
   */
  readonly theta?: number;
  /** Pairs closer than this repel as if this far apart. Default 1. */
  readonly distanceMin?: number;
  /** Pairs farther apart than this do not repel. Default `Infinity`. */
  readonly distanceMax?: number;

  /**
   * Pull of each connected component, moved as a whole, toward `center`. It keeps the layout
   * centered and disconnected parts from drifting apart without squeezing or bending any of them.
   * A component with a node held along an axis is not pulled along that axis. Default 0.05.
   * `'spring'`: against the default repulsion that leaves unconnected nodes about 43 units apart
   * (`√(π × |chargeStrength| / centerStrength)`), a little more than a link's length.
   * `'forceatlas2'`: the pull is a force, times `degree + 1` as gravity is.
   */
  readonly centerStrength?: number;

  /**
   * Positional forces: pull nodes toward a coordinate along one axis, the same for all or one per
   * node (a timeline network: `xTarget` from each node's date, a strong `xStrength`). Default
   * none.
   */
  readonly xTarget?: PerNode;
  readonly yTarget?: PerNode;
  readonly zTarget?: PerNode;
  /** Strength of each positional force: the share of the gap closed per tick at `alpha` 1. Default 0.1. */
  readonly xStrength?: number;
  readonly yStrength?: number;
  readonly zStrength?: number;
  /**
   * Pull of each node toward the centroid of its group (`graph.group`), which keeps a group
   * together. Default 0 (off).
   */
  readonly groupStrength?: number;

  // `'spring'`

  /** Rest length of a link. Default 30. */
  readonly linkDistance?: number;
  /**
   * Strength of every link, 0 to 1. Default: per link, `1 / min(degree(source), degree(target))`,
   * so the links of a hub do not crush its neighbours onto it. Scaled by the weight when
   * `linkWeight` is `'strength'` and never above 1 (a link closing its whole gap in one tick).
   */
  readonly linkStrength?: number;
  /** Default `'strength'`. */
  readonly linkWeight?: LinkWeightMode;
  /** Passes over the links per tick; more make the springs stiffer. Default 1. */
  readonly linkIterations?: number;
  /** Many-body strength: negative repels, positive attracts. Default −30. */
  readonly chargeStrength?: number;
  /** Share of its velocity a node loses per tick, 0 to 1. Default 0.4. */
  readonly velocityDecay?: number;

  // `'forceatlas2'`

  /**
   * Repulsion constant: the larger, the larger the layout (by its square root when attraction is
   * linear). Default 10, or 1 with `linLog`, whose attraction is far weaker at a distance; both
   * give links of some tens to a hundred layout units on graphs of a hundred nodes.
   */
  readonly scalingRatio?: number;
  /**
   * Pull of every node toward `center`, times `degree + 1`, the same at any distance. Default 1.
   */
  readonly gravity?: number;
  /**
   * Gravity that grows with the distance from the center: a tighter, rounder layout, in which long
   * chains curl. Default `false`.
   */
  readonly strongGravity?: boolean;
  /**
   * Attraction grows with the logarithm of a link's length instead of the length (Noack's LinLog):
   * tighter, better separated clusters. Default `false`.
   */
  readonly linLog?: boolean;
  /** How much swinging is tolerated: higher is faster and less precise. Default 1. */
  readonly jitterTolerance?: number;
}

/**
 * The default number of ticks for a graph of `nodes` nodes: 300 (d3-force's) up to 3,000 nodes,
 * then in inverse proportion to the node count (90 at 10,000), and never below 50. A tick costs
 * about `nodes × log(nodes)`, so above 3,000 nodes the time to rest grows with the logarithm only,
 * at the price of a rougher layout: pass `ticks` to choose otherwise. The rule reads the node count
 * alone, so it is as deterministic as the rest.
 */
export function defaultTicks(nodes: number): number {
  if (!(nodes > 3000)) return 300;
  return Math.max(50, Math.round(900000 / nodes));
}

/** Options with every default filled in. */
export interface ResolvedForceOptions {
  readonly algorithm: ForceAlgorithm;
  readonly three: boolean;
  readonly seed: number;
  readonly ticks: number;
  readonly alphaMin: number;
  /** `undefined`: derive it from `ticks` (see `simulation.ts`). */
  readonly alphaDecay: number | undefined;
  readonly initialRadius: number;
  /** `NaN` along an axis: the default center. */
  readonly center: readonly [number, number, number];
  readonly collide: boolean;
  readonly collidePadding: number;
  readonly collideStrength: number;
  readonly collideIterations: number;
  readonly xTarget: Float64Array | null;
  readonly yTarget: Float64Array | null;
  readonly zTarget: Float64Array | null;
  readonly xStrength: number;
  readonly yStrength: number;
  readonly zStrength: number;
  readonly groupStrength: number;
  readonly linkDistance: number;
  readonly linkStrength: number | undefined;
  readonly linkWeight: LinkWeightMode;
  readonly linkIterations: number;
  readonly chargeStrength: number;
  readonly theta: number;
  readonly distanceMin: number;
  readonly distanceMax: number;
  readonly velocityDecay: number;
  readonly centerStrength: number;
  readonly scalingRatio: number;
  readonly gravity: number;
  readonly strongGravity: boolean;
  readonly linLog: boolean;
  readonly jitterTolerance: number;
}

/** `value` when it is a finite number within the bounds, else `fallback`. */
function num(value: number | undefined, fallback: number, min = -Infinity, max = Infinity): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : fallback;
}

/** `value` when it is a finite number within the bounds, else `undefined` (use the default rule). */
function optional(value: number | undefined, min: number, max: number): number | undefined {
  const v = num(value, NaN, min, max);
  return v === v ? v : undefined;
}

function perNode(value: PerNode | undefined, nodes: number): Float64Array | null {
  if (value === undefined) return null;
  const out = new Float64Array(nodes);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    out.fill(value);
    return out;
  }
  for (let i = 0; i < nodes; i++) {
    const v = value[i];
    out[i] = typeof v === 'number' && Number.isFinite(v) ? v : NaN;
  }
  return out;
}

export function resolveOptions(graph: LayoutGraph, options: ForceOptions): ResolvedForceOptions {
  const nodes = Math.max(0, Math.floor(graph.nodes));
  const algorithm: ForceAlgorithm = options.algorithm === 'forceatlas2' ? 'forceatlas2' : 'spring';
  const linkDistance = num(options.linkDistance, 30, 0);
  const alphaMin = num(options.alphaMin, 0.001, Number.MIN_VALUE, 0.999);
  const distanceMax =
    typeof options.distanceMax === 'number' && options.distanceMax > 0
      ? options.distanceMax
      : Infinity;
  return {
    algorithm,
    three: options.dimensions === 3,
    seed: num(options.seed, 1),
    ticks: Math.max(1, Math.round(num(options.ticks, defaultTicks(nodes), 1))),
    alphaMin,
    alphaDecay: optional(options.alphaDecay, 0, 1),
    initialRadius: num(options.initialRadius, linkDistance / 3, 0),
    center: [
      num(options.center?.[0], NaN),
      num(options.center?.[1], NaN),
      num(options.center?.[2], NaN),
    ],
    collide: options.collide !== false,
    collidePadding: num(options.collidePadding, 0, 0),
    collideStrength: num(options.collideStrength, 1, 0, 1),
    collideIterations: Math.round(num(options.collideIterations, 1, 1)),
    xTarget: perNode(options.xTarget, nodes),
    yTarget: perNode(options.yTarget, nodes),
    zTarget: perNode(options.zTarget, nodes),
    xStrength: num(options.xStrength, 0.1, 0),
    yStrength: num(options.yStrength, 0.1, 0),
    zStrength: num(options.zStrength, 0.1, 0),
    groupStrength: num(options.groupStrength, 0, 0),
    linkDistance,
    linkStrength: optional(options.linkStrength, 0, Infinity),
    linkWeight:
      options.linkWeight === 'distance' || options.linkWeight === 'none'
        ? options.linkWeight
        : 'strength',
    linkIterations: Math.round(num(options.linkIterations, 1, 1)),
    chargeStrength: num(options.chargeStrength, -30),
    theta: num(options.theta, algorithm === 'forceatlas2' ? 1.2 : 0.9, 0),
    distanceMin: num(options.distanceMin, 1, 0),
    distanceMax,
    velocityDecay: num(options.velocityDecay, 0.4, 0, 1),
    centerStrength: num(options.centerStrength, 0.05, 0),
    scalingRatio: num(options.scalingRatio, options.linLog === true ? 1 : 10, 0),
    gravity: num(options.gravity, 1, 0),
    strongGravity: options.strongGravity === true,
    linLog: options.linLog === true,
    jitterTolerance: num(options.jitterTolerance, 1, Number.MIN_VALUE),
  };
}
