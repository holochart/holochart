/**
 * What every graph layout is given and what it returns (ADR-029). A layout is a pure function over
 * typed arrays: it knows nothing of traces, attributes or three.js, so it runs in calc, in tests
 * and in a worker alike, and its input and output move between threads without copying.
 *
 * Coordinates are **layout units**: one unit is one CSS px at the size the graph is laid out for
 * (node sizes, spacings and label boxes are given in the same units). The `graph` trace puts them
 * on its axes as linear coordinates, y up; a layout that reads top to bottom (`layered`, `tree`)
 * returns decreasing `y` for later ranks.
 */

/** A graph as a layout sees it: node and link counts and one typed array per property. */
export interface LayoutGraph {
  /** Number of nodes; nodes are `0 … nodes − 1`. */
  readonly nodes: number;
  /**
   * Node index of each link's source and target. Only links between two existing nodes are here
   * (the trace drops the others), self-links (`source[k] === target[k]`) and parallel links
   * included: a layout that cannot use them skips them.
   */
  readonly source: Int32Array;
  readonly target: Int32Array;
  /** `link.value` of each link, 1 where it has none. Finite and positive. */
  readonly weight: Float64Array;
  /**
   * Half the extent of each node along x and y, in layout units: a marker's radius twice, or half
   * a box node's width and height. Layouts keep nodes at least this far apart (plus their own
   * spacing options).
   */
  readonly halfWidth: Float64Array;
  readonly halfHeight: Float64Array;
  /**
   * Positions the figure gives (`node.x`, `node.y`, and `node.z` for `graph3d`), `NaN` where it
   * gives none. A node with all of its coordinates given is **pinned**: a layout that moves nodes
   * (`force`) leaves it there and lets it act on the others; a layout that places every node itself
   * (`layered`, `tree`) ignores these. A node with some coordinates given is held on those and
   * free along the others.
   */
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly z?: Float64Array;
  /** Index of each node's group (`node.group`), `-1` for none; `groups` is the number of groups. */
  readonly group?: Int32Array;
  readonly groups?: number;
  /**
   * Tree input (`ids` / `parents`, as the hierarchical traces take): each node's parent, `-1` for
   * a root. When absent, a tree layout derives the parents from the links (a spanning forest from
   * the nodes without incoming links).
   */
  readonly parent?: Int32Array;
  /** A value per node that a layout may place by (a dendrogram's branch height). `NaN`: none. */
  readonly value?: Float64Array;
}

/** A link's path when it is not the straight line between its ends. */
export interface LinkRoute {
  /**
   * Flat `[x0, y0, x1, y1, …]` in layout units, from the source to the target (both ends are the
   * node centers or the points on the nodes' outlines the layout chose).
   */
  readonly points: Float64Array;
  /**
   * How to draw through the points: `'polyline'` joins them with straight segments (orthogonal
   * routes), `'spline'` reads them as cubic Bézier control points (`3k + 1` of them).
   */
  readonly kind: 'polyline' | 'spline';
}

/** A labelled frame around a group of nodes (a `layered` cluster), in layout units. */
export interface LayoutCluster {
  /** The group index it frames (see {@link LayoutGraph.group}). */
  readonly group: number;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** Where a layout put everything. Arrays are owned by the caller from here on. */
export interface LayoutResult {
  /** Node centers, one per node. Always finite. */
  readonly x: Float64Array;
  readonly y: Float64Array;
  /** Only from a 3D layout. */
  readonly z?: Float64Array;
  /**
   * Routes of the links that are not straight, by link index (sparse: `undefined` or a missing
   * entry is a straight link). Indices are those of {@link LayoutGraph.source}.
   */
  readonly routes?: readonly (LinkRoute | undefined)[];
  /** Links the layout reversed to break cycles (`layered`): drawn in the back-edge style. */
  readonly reversed?: Uint8Array;
  readonly clusters?: readonly LayoutCluster[];
  /**
   * Nodes a layout left out (a collapsed subtree's descendants): 1 where the node is not drawn.
   * Links with a hidden end are not drawn either.
   */
  readonly hidden?: Uint8Array;
}

/**
 * A layout: positions for `graph`. Deterministic: the same input gives the same output on every
 * machine (no `Math.random`, no time, no iteration order of hashed collections), so visual
 * baselines, server rendering and exports agree.
 */
export type GraphLayout<Options = unknown> = (graph: LayoutGraph, options: Options) => LayoutResult;

/**
 * A layout that settles over time (`force`): the trace runs it to rest in calc, or steps it frame
 * by frame for `simulate: true` and while a node is dragged.
 */
export interface LayoutSimulation {
  /** Current positions; the arrays are updated in place by {@link tick}. */
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly z?: Float64Array;
  /** How far from rest: starts at 1 and cools toward 0. */
  readonly alpha: number;
  /** Run up to `steps` iterations (default 1). `false` once the layout is at rest. */
  tick(steps?: number): boolean;
  /** Warm the layout up again (a drag, new data): `alpha` is set to at least `alpha` (default 0.3). */
  reheat(alpha?: number): void;
  /** Hold node `i` at a position (a drag); `NaN` for a coordinate frees it along that axis. */
  pin(i: number, x: number, y: number, z?: number): void;
  /** Release node `i`. */
  unpin(i: number): void;
}
