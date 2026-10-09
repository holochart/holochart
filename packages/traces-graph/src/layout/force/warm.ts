/**
 * A force layout that goes on from given positions instead of starting from the spiral: the
 * engine side of the `graph` trace's `force.start` (`graph/warm.ts` says what it is for and how
 * it differs from a cold start). Pure, with no imports from other packages, so the layout worker
 * runs it too.
 */
import type { LayoutGraph, LayoutResult } from '../types.ts';
import { createForceRun, type ForceOptions, type ForceRun } from './index.ts';
import { createForceEngine } from './simulation.ts';

/** Positions a force layout goes on from, one per node (`NaN`: none), and how warm it is there. */
export interface ForceStart {
  readonly x: Float64Array;
  readonly y: Float64Array;
  /** 0 (at rest: nothing is simulated) to 1 (a full run). */
  readonly alpha: number;
}

function held(values: ArrayLike<number>, i: number): boolean {
  const v = values[i];
  return typeof v === 'number' && Number.isFinite(v);
}

function mean(values: Float64Array): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (v === v) {
      count++;
      sum += (v - sum) / count;
    }
  }
  return sum;
}

/**
 * A force layout of `graph` that goes on from `start` (see the module comment), to step by hand.
 * `ticks` is what a full run takes (`options.ticks`): it sets how fast the layout cools, and this
 * run reaches rest sooner by as much as it starts cooler.
 */
export function warmForceRun(
  graph: LayoutGraph,
  options: ForceOptions,
  start: ForceStart,
): ForceRun {
  const center = options.center ?? [mean(start.x), mean(start.y)];
  const { simulation, state, options: resolved } = createForceEngine(graph, { ...options, center });
  const n = simulation.x.length;
  for (let i = 0; i < n; i++) {
    if (!held(graph.x, i) && start.x[i] === start.x[i]) simulation.x[i] = start.x[i]!;
    if (!held(graph.y, i) && start.y[i] === start.y[i]) simulation.y[i] = start.y[i]!;
  }
  state.alpha = Math.min(1, Math.max(0, start.alpha));
  return {
    simulation,
    ticks: resolved.ticks,
    frame(x, y) {
      x.set(simulation.x);
      y.set(simulation.y);
    },
    finish(): LayoutResult {
      return { x: simulation.x, y: simulation.y };
    },
  };
}

/** The force layout of `graph` in steps: from `start` when there is one, else from the spiral. */
export function forceRunOf(
  graph: LayoutGraph,
  options: ForceOptions,
  start: ForceStart | undefined,
): ForceRun {
  return start ? warmForceRun(graph, options, start) : createForceRun(graph, options);
}

/** The force layout of `graph` from `start`, run to rest. */
export function warmForceLayout(
  graph: LayoutGraph,
  options: ForceOptions,
  start: ForceStart,
): LayoutResult {
  const run = warmForceRun(graph, options, start);
  // Cooler than a full run from the first tick on: it is at rest within `ticks`.
  run.simulation.tick(run.ticks);
  return run.finish();
}
