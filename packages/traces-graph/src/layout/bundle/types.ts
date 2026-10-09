/**
 * What both edge-bundling methods are given (node positions and the links) and the small helpers
 * they share. Bundling runs after a layout: it reads where the nodes are and returns a route per
 * link, in the same layout units, without moving any node. Pure typed arrays, no DOM, so it runs
 * in a worker and in Node alike.
 */

/** Node centers, as a `LayoutResult` has them. The number of nodes is the length of the arrays. */
export interface BundlePositions {
  readonly x: Float64Array;
  readonly y: Float64Array;
}

/** The links and, for hierarchical bundling, the hierarchy. A `LayoutGraph` fits. */
export interface BundleGraph {
  /** Node index of each link's source and target. */
  readonly source: Int32Array;
  readonly target: Int32Array;
  /** Group of each node, `-1` for none; `groups` is the number of groups. */
  readonly group?: Int32Array;
  readonly groups?: number;
  /** Each node's parent node, `-1` for a root: a hierarchy over the nodes themselves. */
  readonly parent?: Int32Array;
}

/** The bundling strength when the options give none. */
export const DEFAULT_BUNDLE_STRENGTH = 0.85;

/** A number option clamped to `[0, 1]`, `dflt` when it is missing or not a number. */
export const unit = (v: unknown, dflt: number): number =>
  typeof v === 'number' && !Number.isNaN(v) ? Math.min(1, Math.max(0, v)) : dflt;

/** A whole-number option of at least `min`, `dflt` when it is missing or not a number. */
export const whole = (v: unknown, dflt: number, min: number): number =>
  typeof v === 'number' && !Number.isNaN(v) ? Math.max(min, Math.floor(v)) : dflt;
