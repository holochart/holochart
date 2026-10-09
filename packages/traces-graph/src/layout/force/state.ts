/**
 * What the parts of the force layout share: the positions and pins of one simulation, the prepared
 * links, and the tree and generator they all draw on. `simulation.ts` owns it; the two algorithms
 * (`spring.ts`, `forceatlas2.ts`) each turn it into a {@link ForceModel} that advances it by a tick.
 *
 * Every array has three axes whatever the dimensions: in 2D the `z` arrays stay all zero (nothing
 * ever pushes along z), so one code path serves both.
 */
import type { PreparedLinks } from './links.ts';
import type { Lcg } from './math.ts';
import type { ResolvedForceOptions } from './options.ts';
import type { BarnesHutTree } from './tree.ts';

export interface ForceState {
  readonly n: number;
  readonly three: boolean;
  readonly options: ResolvedForceOptions;
  /** Positions, updated in place. */
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly z: Float64Array;
  /** Where a node is held along each axis; `NaN`: free along it. */
  readonly fixX: Float64Array;
  readonly fixY: Float64Array;
  readonly fixZ: Float64Array;
  /** 1 for a node held along every axis of the layout. */
  readonly pinned: Uint8Array;
  readonly links: PreparedLinks;
  /** Group of each node (−1: none) and the number of groups; `null` when no force uses them. */
  readonly group: Int32Array | null;
  readonly groups: number;
  /** Collision radius of each node: the larger half extent plus half the padding. */
  readonly radius: Float64Array;
  /** The point the layout is centered on. */
  readonly center: Float64Array;
  readonly tree: BarnesHutTree;
  readonly rng: Lcg;
  /** How far from rest, 1 to 0; cooled by the simulation before each tick. */
  alpha: number;
}

/** One algorithm bound to a state. */
export interface ForceModel {
  /** Advance the positions by one tick at the state's current `alpha`. */
  step(): void;
}

/** Largest move per tick along an axis. A guard, far above any real step: see {@link bounded}. */
export const MAX_STEP = 1e6;

/**
 * `v` kept within ±{@link MAX_STEP}, and 0 for `NaN`: whatever the input (weights of 1e300, pins a
 * light year apart), a position can only ever move by a finite amount, so it stays finite.
 */
export function bounded(v: number): number {
  if (Math.abs(v) <= MAX_STEP) return v;
  return v > 0 ? MAX_STEP : v < 0 ? -MAX_STEP : 0;
}
