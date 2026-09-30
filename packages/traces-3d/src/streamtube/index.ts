/**
 * The `streamtube` trace module (plan E14.6): stream tubes through a 3D vector field given on a
 * grid (`x`, `y`, `z`, `u`, `v`, `w`) — streamlines integrated (RK4, trilinear interpolation) from
 * `starts` (by default the x–z plane at the grid's lowest y), sampled per `maxdisplayed`, drawn as
 * lit tubes (one mesh) whose radius follows the divergence (`sizeref`) and whose color is the
 * vector norm through a colorscale (with a colorbar), hovered with the vector, norm and
 * divergence. Registered with `register(streamtube)` (ADR-019).
 *
 * Pieces: `grid.ts` (grid detection, trilinear sampling), `integrate.ts` (starts, stepping,
 * stopping rules, divergence, radii), `tube.ts` (ring geometry), `calc.ts`, `plot.ts`, `hover.ts`.
 *
 * Deferred: the animated flow texture (P2), `hovertemplatefallback`, integration in a worker.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type { TraceModule } from '@mk7s/holochart-runtime';
import { coloraxisLayoutSchema } from '@mk7s/holochart-traces-basic';
import { numbersOf, supplyTraceColoraxisDefaults, traceColorbar } from '../mesh3d/colors.ts';
import { sceneCrossTraceLayout, sceneSubplotDomain } from '../scene/layout.ts';
import { streamtubeAttributes } from './attributes.ts';
import { calcStreamtube, normExtent, type StreamtubeCalc } from './calc.ts';
import { supplyStreamtubeDefaults } from './defaults.ts';
import { streamtubeHoverPoints } from './hover.ts';
import { StreamtubeView } from './plot.ts';

const NORMS = new WeakMap<
  object,
  { length: number; v: unknown; w: unknown; extent: [number, number] }
>();

/** `[min, max]` of the field's vector norms of a defaulted trace (cached per `u`, `v`, `w`). */
function streamtubeNormExtent(trace: FullTrace): [number, number] | undefined {
  const [u, v, w] = ['u', 'v', 'w'].map((k) => trace[k]);
  if (!u || typeof u !== 'object' || !v || !w) return undefined;
  const n = Math.min(
    ...['x', 'y', 'z', 'u', 'v', 'w'].map((k) => (trace[k] as ArrayLike<unknown>).length),
  );
  const hit = NORMS.get(u);
  if (hit && hit.length === n && hit.v === v && hit.w === w) return hit.extent;
  const extent = normExtent(numbersOf(u, n), numbersOf(v, n), numbersOf(w, n), n);
  NORMS.set(u, { length: n, v, w, extent });
  return extent;
}

export const streamtube: TraceModule<StreamtubeCalc, typeof streamtubeAttributes.children> = {
  type: 'streamtube',
  categories: ['gl3d', 'showLegend'],
  schema: streamtubeAttributes,
  layoutSchema: coloraxisLayoutSchema,
  meta: {
    description:
      'Stream tubes through a 3D vector field on a grid: streamlines from starting points drawn as lit tubes colored by the vector norm, their radius following the divergence.',
    docsPage: 'streamtube',
    plotlyEquivalent: 'streamtube',
  },
  supplyDefaults: supplyStreamtubeDefaults,
  supplyLayoutDefaults: (layoutIn, layoutOut, ctx) =>
    supplyTraceColoraxisDefaults(layoutIn, layoutOut, ctx, 'streamtube', streamtubeNormExtent),
  touchAction: 'none',
  subplotDomain: sceneSubplotDomain,
  crossTraceLayout: sceneCrossTraceLayout,
  calc: calcStreamtube,
  plot: { create: (ctx) => new StreamtubeView(ctx) },
  hoverPoints: streamtubeHoverPoints,
  eventData: (calc, _trace, i) => ({ norm: calc.norm[i], divergence: calc.divergence[i] }),
  colorbar: (trace, ctx) => traceColorbar(trace, ctx.fullLayout, streamtubeNormExtent(trace)),
};

export { streamtubeAttributes } from './attributes.ts';
export type { StreamtubeCalc } from './calc.ts';
export { detectStreamGrid, sampleStreamGrid, type StreamGrid } from './grid.ts';
export { integrateStreams, type StreamSet } from './integrate.ts';
