/**
 * The `volume` trace module (plan E14.7): a scalar field on a rectilinear 3D grid (`x`, `y`, `z`,
 * `value` as flattened columns) drawn as a volume, between `isomin` and `isomax`, colored by value
 * through a colorscale (with a colorbar), with `opacity` and `opacityscale`. Two ways to draw it
 * (`render`, a Holochart extension):
 *
 * - `'isosurfaces'` (default, Plotly's): `surface.count` translucent isosurfaces stacked through
 *   the range, with caps, slices and the space frame — `isosurface`'s extraction and mesh view,
 *   plus the per-vertex alpha of `opacityscale`.
 * - `'raymarch'`: GPU ray marching (`raymarch.ts`): the values in an 8-bit 3D texture, a transfer
 *   function (colorscale × `opacity` × `opacityscale`, `transfer.ts`) composited front to back
 *   along each pixel's ray; hover by a CPU ray cast (`raymarch-hover.ts`).
 *
 * Registered with `register(volume)` (ADR-019).
 */
import type { TraceModule } from '@mk7s/holochart-runtime';
import { coloraxisLayoutSchema } from '@mk7s/holochart-traces-basic';
import { sceneCrossTraceLayout, sceneSubplotDomain } from '../scene/layout.ts';
import { supplyTraceColoraxisDefaults, traceColorbar } from '../mesh3d/colors.ts';
import { calcIso, isoColorValues, type IsoCalc } from '../isosurface/calc.ts';
import { isoHoverPoints } from '../isosurface/hover.ts';
import { volumeAttributes } from './attributes.ts';
import { supplyVolumeDefaults } from './defaults.ts';
import { VolumeView } from './plot.ts';
import { rayMarchHoverPoints } from './raymarch-hover.ts';

export const volume: TraceModule<IsoCalc, typeof volumeAttributes.children> = {
  type: 'volume',
  categories: ['gl3d', 'showLegend'],
  schema: volumeAttributes,
  layoutSchema: coloraxisLayoutSchema,
  meta: {
    description:
      'A scalar field on a 3D grid drawn as a volume: stacked translucent isosurfaces (as Plotly) or GPU ray marching, colored by value with an opacity scale.',
    docsPage: 'volume',
    plotlyEquivalent: 'volume',
  },
  supplyDefaults: supplyVolumeDefaults,
  supplyLayoutDefaults: (layoutIn, layoutOut, ctx) =>
    supplyTraceColoraxisDefaults(layoutIn, layoutOut, ctx, 'volume', isoColorValues),
  touchAction: 'none',
  subplotDomain: sceneSubplotDomain,
  crossTraceLayout: sceneCrossTraceLayout,
  calc: (trace, ctx) => calcIso(trace, ctx, trace['render'] !== 'raymarch'),
  plot: { create: (ctx) => new VolumeView(ctx) },
  hoverPoints: (calc, trace, query, ctx) =>
    trace['render'] === 'raymarch'
      ? rayMarchHoverPoints(calc, trace, query, ctx)
      : isoHoverPoints(calc, trace, query, ctx),
  eventData: (calc, _trace, i) => ({ value: calc.grid.value[i] }),
  colorbar: (trace, ctx) => traceColorbar(trace, ctx.fullLayout, isoColorValues(trace)),
};

export { volumeAttributes } from './attributes.ts';
