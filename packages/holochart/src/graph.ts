/**
 * `@mk7s/holochart/graph`: network graphs for the full bundle (ADR-029). Graphs are not part of
 * `@mk7s/holochart` itself, so that an app without one does not pay for them; this entry
 * registers `@mk7s/holochart-traces-graph` (the `graph` and `chord` traces and their layouts, and
 * `graph3d`, whose 3D scene the full bundle has already) into the shared registry (ADR-019) and
 * re-exports the package:
 *
 * ```ts
 * import * as Holochart from '@mk7s/holochart';
 * import '@mk7s/holochart/graph';
 * ```
 *
 * A partial bundle registers the package itself: `register(...tracesGraph)`, and
 * `register(...tracesGraph3d)` for `graph3d`, which brings the 3D scene with it.
 */
import { register } from '@mk7s/holochart-runtime';
import { tracesGraph, tracesGraph3d } from '@mk7s/holochart-traces-graph';

register(...tracesGraph, ...tracesGraph3d);

export * from '@mk7s/holochart-traces-graph';
