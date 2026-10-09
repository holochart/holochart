/**
 * The force-directed layout of the `graph` trace (backlog G2 and G6, ADR-029): {@link forceLayout}
 * runs a simulation to rest and returns the positions; {@link createForceSimulation} hands out the
 * simulation itself, to animate the cooling or drag a node.
 */
import type { LayoutGraph, LayoutResult, LayoutSimulation } from '../types.ts';
import type { ForceOptions } from './options.ts';
import { createForceEngine } from './simulation.ts';
import { bounded, type ForceState } from './state.ts';

export { createForceSimulation } from './simulation.ts';
export { defaultTicks } from './options.ts';
export type { ForceAlgorithm, ForceOptions, LinkWeightMode, PerNode } from './options.ts';

/**
 * Move the nodes so the box around them (their extents included) is centered on `center`. Only
 * along an axis no node is held on: a given coordinate is never changed.
 */
function recenter(
  position: Float64Array,
  fix: Float64Array,
  extent: (i: number) => number,
  center: number,
): void {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < position.length; i++) {
    if (fix[i] === fix[i]) return;
    const e = extent(i);
    if (position[i]! - e < lo) lo = position[i]! - e;
    if (position[i]! + e > hi) hi = position[i]! + e;
  }
  const shift = center - (lo + hi) / 2;
  if (!Number.isFinite(shift)) return;
  for (let i = 0; i < position.length; i++) position[i]! += shift;
}

/**
 * How much farther apart than touching the final overlap removal pushes two nodes (layout units,
 * each node's share). Aiming a little past the goal lets the passes stop when every pair is clear
 * of it, instead of creeping up on it for ever.
 */
const SETTLE_MARGIN = 0.05;
/** Passes of the final overlap removal at most. */
const SETTLE_PASSES = 100;

/**
 * Remove the overlaps the simulation left. Collision is one force among others while it runs, so
 * at rest some pairs still overlap by a fraction of a unit; here it works alone, pass after pass,
 * until no pair overlaps (or the passes run out, in a clump too dense to open).
 */
function settle(state: ForceState): void {
  const { n, three, x, y, z, fixX, fixY, fixZ, tree, pinned, rng } = state;
  if (n < 2) return;
  const radius = state.radius.map((r) => r + SETTLE_MARGIN);
  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  const dz = new Float64Array(n);
  for (let pass = 0; pass < SETTLE_PASSES; pass++) {
    dx.fill(0);
    dy.fill(0);
    dz.fill(0);
    tree.build(n, x, y, z, null, radius);
    // Within the two margins of a pair, the nodes themselves no longer overlap.
    if (tree.separate(dx, dy, dz, pinned, 1, rng) <= 2 * SETTLE_MARGIN) return;
    for (let i = 0; i < n; i++) {
      if (fixX[i] !== fixX[i]) x[i]! += bounded(dx[i]!);
      if (fixY[i] !== fixY[i]) y[i]! += bounded(dy[i]!);
      if (three && fixZ[i] !== fixZ[i]) z[i]! += bounded(dz[i]!);
    }
  }
}

/** A node's half extent along an axis as the centering reads it: 0 unless finite and positive. */
const extentOf = (values: ArrayLike<number>) => (i: number) => {
  const v = values[i];
  return v !== undefined && v > 0 && v < Infinity ? v : 0;
};

/**
 * A force layout in steps, for a caller that draws while it settles (`force.simulate`): the
 * simulation, the number of ticks {@link forceLayout} would run it for, and the two things
 * `forceLayout` does around those ticks.
 */
export interface ForceRun {
  readonly simulation: LayoutSimulation;
  /** Ticks from start to rest (`options.ticks`, or its default for the graph's size). */
  readonly ticks: number;
  /**
   * The simulation's current positions, centered as the finished layout is, written to `x` and
   * `y` (and `z`). The simulation is not touched, so this can be called between ticks: every
   * frame of an animation is centered like its last one.
   */
  frame(x: Float64Array, y: Float64Array, z?: Float64Array): void;
  /**
   * What {@link forceLayout} returns for the simulation as it is now: the last overlaps removed
   * (with `collide`) and the layout centered. Call it once, when the simulation is at rest; the
   * arrays are the simulation's own.
   */
  finish(): LayoutResult;
}

/** A force layout of `graph` to step by hand: see {@link ForceRun}. */
export function createForceRun(graph: LayoutGraph, options: ForceOptions = {}): ForceRun {
  const { simulation, state, options: resolved } = createForceEngine(graph, options);
  const { x, y, z, fixX, fixY, fixZ, center, three } = state;
  const width = extentOf(graph.halfWidth);
  const height = extentOf(graph.halfHeight);
  const none = (): number => 0;
  // Not centered along an axis where a node is pinned or a positional target is set.
  const centerAll = (px: Float64Array, py: Float64Array, pz: Float64Array | undefined): void => {
    if (!resolved.xTarget) recenter(px, fixX, width, center[0]!);
    if (!resolved.yTarget) recenter(py, fixY, height, center[1]!);
    if (three && pz && !resolved.zTarget) recenter(pz, fixZ, none, center[2]!);
  };
  return {
    simulation,
    ticks: resolved.ticks,
    frame(outX, outY, outZ) {
      outX.set(x);
      outY.set(y);
      if (three) outZ?.set(z);
      centerAll(outX, outY, three ? outZ : undefined);
    },
    finish() {
      if (resolved.collide) settle(state);
      centerAll(x, y, z);
      return three ? { x, y, z } : { x, y };
    },
  };
}

/**
 * The force layout as a {@link GraphLayout}: a simulation run for `options.ticks` ticks (or to
 * rest, if a given `alphaDecay` gets there sooner), cleared of the last overlaps when `collide` is
 * on, then centered on `options.center` (the origin by default). It is not centered along an axis
 * where a node is pinned or a positional target is set: those coordinates mean what they say.
 */
export function forceLayout(graph: LayoutGraph, options: ForceOptions = {}): LayoutResult {
  const run = createForceRun(graph, options);
  run.simulation.tick(run.ticks);
  return run.finish();
}
