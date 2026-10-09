/**
 * The layouts the worker runs, by arrangement (backlog G7). This is the worker's own table, apart
 * from the trace's (`../layout/index.ts`): it holds every built-in layout and nothing an app
 * registered, because a registered layout is a function of the page and cannot be sent to another
 * thread.
 *
 * `force` is not here: the handler runs it in steps (`createForceRun`), to report positions
 * while it cools and to see a cancel between ticks. The others return in one call.
 */
import { arcLayout } from '../layout/arc.ts';
import { circularLayout } from '../layout/circular.ts';
import { gridLayout } from '../layout/grid.ts';
import { hiveLayout } from '../layout/hive.ts';
import { layeredLayout } from '../layout/layered/index.ts';
import { presetLayout } from '../layout/preset.ts';
import { dendrogramLayout, radialTreeLayout, tidyTreeLayout } from '../layout/tree/index.ts';
import type { GraphLayout } from '../layout/types.ts';
import type { WorkerArrangement } from './protocol.ts';

/** A layout whose options are whatever the request carries. */
type AnyLayout = GraphLayout<never>;

/** Every arrangement but `force`, which is stepped. */
export const ONE_CALL_LAYOUTS: Readonly<Record<Exclude<WorkerArrangement, 'force'>, AnyLayout>> = {
  preset: presetLayout,
  circular: circularLayout,
  grid: gridLayout,
  layered: layeredLayout,
  tree: tidyTreeLayout,
  radial: radialTreeLayout,
  dendrogram: dendrogramLayout,
  arc: arcLayout,
  hive: hiveLayout,
};
