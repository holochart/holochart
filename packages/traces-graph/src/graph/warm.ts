/**
 * A force layout that goes on from a picture instead of starting over (backlog G5): `force.start`.
 *
 * A force layout starts from a spiral, and where it ends depends on that start. A figure that
 * differs from another by one pinned node (a node the user dragged) would be laid out afresh and
 * come out as another picture altogether: turned, mirrored, its parts swapped. And a layout that
 * has cooled is not at its rest: it stopped on a schedule, so simulating it any further moves
 * every node, not only those near the pin (on graphs of a few hundred nodes, by tens of px for a
 * third of a run). So what a drag leaves on screen cannot be had again from the pins alone.
 *
 * `force.start` says it outright: where every node is (`x`, `y`), and how warm the layout still is
 * there (`alpha`).
 *
 * - `alpha: 0`: at rest. The positions are the layout and nothing is simulated; pinned nodes are
 *   where `node.x` / `node.y` say. This is what the chart writes when a node is dropped: the
 *   picture on screen, with that node where it was let go.
 * - `0 < alpha ≤ 1`: the simulation goes on from the positions, cooling from `alpha` at the rate
 *   of a full run (`force.ticks`), so it takes that share of one. The chart writes 0.3 when a
 *   pinned node is released: the layout warms up again and the node finds its place. 1 is a full
 *   run from the given positions, to refine a layout that was computed elsewhere.
 *
 * What differs from a layout that starts cold (`forceLayout`), whatever the `alpha`:
 *
 * - a node that is not held starts at its `start` position (one without, at its place in the
 *   spiral);
 * - the layout is centered on the middle of the start positions, not on the mean of the pins, so
 *   the parts of the graph that are not linked to a pin stay where they are instead of following
 *   it;
 * - the result is not moved to the center afterwards, and no pass removes the last overlaps: the
 *   positions mean what they say.
 *
 * `forceRunOf` is the one place that decides between the two, for calc (to rest), for the view
 * (in steps: `simulate.ts`, and while a node is dragged) and for the layout worker. The runs
 * themselves are in `../layout/force/warm.ts`, which the worker can import; this file reads the
 * attribute.
 */
import { isArrayLike } from '@mk7s/holochart-core';
import type { ForceStart } from '../layout/force/warm.ts';

export { forceRunOf, warmForceLayout, warmForceRun } from '../layout/force/warm.ts';
export type { ForceStart } from '../layout/force/warm.ts';

/** How warm a layout is when a pinned node is released, and while a node is dragged (d3's 0.3). */
export const REHEAT_ALPHA = 0.3;

type Container = Readonly<Record<string, unknown>>;

function numbers(values: unknown, nodes: number): Float64Array | undefined {
  if (!isArrayLike(values) || typeof values === 'string') return undefined;
  const given = values as ArrayLike<unknown>;
  const out = new Float64Array(nodes).fill(NaN);
  let any = false;
  for (let i = 0; i < Math.min(nodes, given.length); i++) {
    const v = given[i];
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[i] = v;
      any = true;
    }
  }
  return any ? out : undefined;
}

/** `force.start` of a defaulted trace, for `nodes` nodes; `undefined` when it gives no position. */
export function forceStartOf(trace: Container, nodes: number): ForceStart | undefined {
  const force = trace['force'];
  if (force === null || typeof force !== 'object') return undefined;
  const start = (force as Container)['start'];
  if (start === null || typeof start !== 'object') return undefined;
  const x = numbers((start as Container)['x'], nodes);
  const y = numbers((start as Container)['y'], nodes);
  if (!x || !y) return undefined;
  const alpha = (start as Container)['alpha'];
  return { x, y, alpha: typeof alpha === 'number' && alpha >= 0 && alpha <= 1 ? alpha : 1 };
}
