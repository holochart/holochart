/**
 * The layouts of `graph3d` (backlog G6): the force layout in three dimensions, and the layered
 * layout in space. Pure: typed arrays in, typed arrays out, like every
 * layout of the package (`../layout/types.ts`).
 *
 * ## Layered in 3D
 *
 * The 2D layered layout (Sugiyama) orders the nodes of a layer along a line to keep links from
 * crossing. In space a layer is a plane, and crossings are no longer what makes a drawing hard to
 * read, so only its first two steps are used, as they are: cycles are broken (`feedbackLinks`) and
 * the acyclic rest is ranked (`assignRanks`). Each rank is a plane, a `rankSep` apart along one
 * axis, the first rank at the top (the largest coordinate; a layout that reads from the top
 * returns decreasing coordinates, as in 2D). The force layout then runs in three dimensions with
 * every node's coordinate along that axis held at its plane: the engine holds any coordinate it is
 * given and moves a node along the others, so the nodes spread within their planes, and the
 * links, whose rest length is the distance between two planes, pull linked nodes above one
 * another.
 */
import { forceLayout, type ForceOptions } from '../layout/force/index.ts';
import { feedbackLinks } from '../layout/layered/acyclic.ts';
import type { LayeredRanker } from '../layout/layered/options.ts';
import { assignRanks } from '../layout/layered/rank.ts';
import type { LayoutGraph, LayoutResult } from '../layout/types.ts';

function finite(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Options of {@link layeredLayout3d}. */
export interface Layered3dOptions {
  /** The axis the planes are stacked along: 0 x, 1 y, 2 z. Default 2. */
  readonly axis?: 0 | 1 | 2;
  /** Distance between two planes, in layout units. Default 80. */
  readonly rankSep?: number;
  /** Default `'network-simplex'`. */
  readonly ranker?: LayeredRanker;
  /** Options of the force layout within the planes (`dimensions` is always 3). */
  readonly force?: ForceOptions;
}

/** What {@link layeredLayout3d} returns: positions, and where the planes are. */
export interface Layered3dResult extends LayoutResult {
  readonly z: Float64Array;
  /** The rank (plane) of each node, from 0. */
  readonly rank: Int32Array;
  /** The coordinate of each plane along the axis, by rank: decreasing. */
  readonly planes: Float64Array;
  readonly axis: 0 | 1 | 2;
  readonly reversed: Uint8Array;
}

/** The layered layout in space (see the module comment). */
export function layeredLayout3d(
  graph: LayoutGraph,
  options: Layered3dOptions = {},
): Layered3dResult {
  const n = Math.max(0, Math.floor(graph.nodes));
  const axis = options.axis ?? 2;
  const rankSep = finite(options.rankSep) ?? 80;
  const links = graph.source.length;

  // The acyclic graph the ranker sees: reversed links turned, self-links left out.
  const reversed = feedbackLinks(n, graph.source, graph.target);
  const tail = new Int32Array(links);
  const head = new Int32Array(links);
  const weight = new Float64Array(links);
  let kept = 0;
  for (let k = 0; k < links; k++) {
    const a = graph.source[k]!;
    const b = graph.target[k]!;
    if (a === b) continue;
    tail[kept] = reversed[k] === 1 ? b : a;
    head[kept] = reversed[k] === 1 ? a : b;
    weight[kept] = graph.weight[k] ?? 1;
    kept++;
  }
  const rank = assignRanks(
    n,
    tail.subarray(0, kept),
    head.subarray(0, kept),
    weight.subarray(0, kept),
    options.ranker ?? 'network-simplex',
  );
  let last = 0;
  for (let i = 0; i < n; i++) if (rank[i]! > last) last = rank[i]!;
  // Centered on 0, the first rank at the top.
  const planes = new Float64Array(n > 0 ? last + 1 : 0);
  for (let r = 0; r < planes.length; r++) planes[r] = (last / 2 - r) * rankSep;

  const held = new Float64Array(n);
  for (let i = 0; i < n; i++) held[i] = planes[rank[i]!]!;
  const given = [graph.x, graph.y, graph.z ?? new Float64Array(n).fill(NaN)];
  given[axis] = held;
  const result = forceLayout(
    { ...graph, x: given[0]!, y: given[1]!, z: given[2]! },
    { linkDistance: rankSep, ...options.force, dimensions: 3 },
  );
  return {
    x: result.x,
    y: result.y,
    z: result.z ?? new Float64Array(n),
    rank,
    planes,
    axis,
    reversed,
  };
}

/** A 3D force layout of `graph` (`dimensions: 3`, whatever `options` says). */
export function forceLayout3d(graph: LayoutGraph, options: ForceOptions = {}): LayoutResult {
  return forceLayout(graph, { ...options, dimensions: 3 });
}
