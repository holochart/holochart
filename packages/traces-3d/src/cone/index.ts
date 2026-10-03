/**
 * The `cone` trace module (plan E14.5): a 3D vector field drawn as cones — positions `x`, `y`,
 * `z`, vectors `u`, `v`, `w` — sized per `sizemode` / `sizeref` (Plotly's `scaled`, `absolute`
 * and `raw`), placed per `anchor`, colored by the vector norms through a colorscale (with a
 * colorbar), lit with Plotly's model, all cones in one instanced draw call, and hovered with the
 * vector and its norm. Registered with `register(cone)` (ADR-019).
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type { TraceModule } from '@mk7s/holochart-runtime';
import { coloraxisLayoutSchema } from '@mk7s/holochart-traces-basic';
import { sceneA11y } from '../a11y-loader.ts';
import { sceneCrossTraceLayout, sceneSubplotDomain } from '../scene/layout.ts';
import { numbersOf, supplyTraceColoraxisDefaults, traceColorbar } from '../mesh3d/colors.ts';
import { coneAttributes } from './attributes.ts';
import { calcCone, type ConeCalc } from './calc.ts';
import { supplyConeDefaults } from './defaults.ts';
import { coneHoverPoints } from './hover.ts';
import { ConeView } from './plot.ts';

const NORMS = new WeakMap<
  object,
  { length: number; v: unknown; w: unknown; extent: [number, number] }
>();

/** `[min, max]` of the vector norms of a defaulted trace (cached per `u`, `v`, `w` arrays). */
function coneNormExtent(trace: FullTrace): [number, number] | undefined {
  const [u, v, w] = ['u', 'v', 'w'].map((k) => trace[k]);
  if (!u || typeof u !== 'object' || !v || !w) return undefined;
  const n = Math.min(...[u, v, w].map((a) => (a as ArrayLike<unknown>).length));
  const hit = NORMS.get(u);
  if (hit && hit.length === n && hit.v === v && hit.w === w) return hit.extent;
  const [a, b, c] = [u, v, w].map((a) => numbersOf(a, n)) as [
    Float64Array,
    Float64Array,
    Float64Array,
  ];
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    const norm = Math.hypot(a[i]!, b[i]!, c[i]!);
    if (norm < lo) lo = norm;
    if (norm > hi) hi = norm;
  }
  const extent: [number, number] = lo <= hi ? [lo, hi] : [0, 0];
  NORMS.set(u, { length: n, v, w, extent });
  return extent;
}

export const cone: TraceModule<ConeCalc, typeof coneAttributes.children> = {
  type: 'cone',
  categories: ['gl3d', 'showLegend'],
  schema: coneAttributes,
  layoutSchema: coloraxisLayoutSchema,
  meta: {
    description:
      'A 3D vector field drawn as cones sized and colored by the vector norms (one instanced draw call), with Plotly’s lighting.',
    docsPage: 'cone',
    plotlyEquivalent: 'cone',
  },
  supplyDefaults: supplyConeDefaults,
  supplyLayoutDefaults: (layoutIn, layoutOut, ctx) =>
    supplyTraceColoraxisDefaults(layoutIn, layoutOut, ctx, 'cone', coneNormExtent),
  touchAction: 'none',
  subplotDomain: sceneSubplotDomain,
  crossTraceLayout: sceneCrossTraceLayout,
  calc: calcCone,
  plot: { create: (ctx) => new ConeView(ctx) },
  a11y: sceneA11y,
  hoverPoints: coneHoverPoints,
  eventData: (calc, _trace, i) => ({ norm: calc.norm[i] }),
  colorbar: (trace, ctx) => traceColorbar(trace, ctx.fullLayout, coneNormExtent(trace)),
};

export { coneAttributes } from './attributes.ts';
export type { ConeCalc } from './calc.ts';
