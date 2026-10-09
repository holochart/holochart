/**
 * The `isosurface` trace module (plan E14.8): level surfaces of a scalar field on a rectilinear 3D
 * grid (`x`, `y`, `z`, `value` as flattened columns), between `isomin` and `isomax` —
 * `surface.count` surfaces (with `fill` and `pattern`), `caps` on the grid's boundary, `slices`
 * through it and a `spaceframe` — extracted as plotly.js does (marching tetrahedra, `extract.ts`),
 * colored by value through a colorscale (with a colorbar), lit with Plotly's model, hovered with
 * the nearest grid point's `x`, `y`, `z` and `value`. Registered with `register(isosurface)`
 * (ADR-019).
 *
 * | Module       | What                                                                     |
 * | ------------ | ------------------------------------------------------------------------ |
 * | `attributes` | the schema, shared with `volume` (`isoAttributes`)                       |
 * | `defaults`   | Plotly's `supplyIsoDefaults`                                             |
 * | `grid`       | grid validation (Plotly's `processGrid`), axis values, index helpers     |
 * | `extract`    | Plotly's `generateIsoMeshes`: surfaces, space frame, caps, slices, fill  |
 * | `calc`       | linear columns, the grid, the value range, the mesh                      |
 * | `plot`       | the mesh view (render's mesh primitive)                                  |
 * | `hover`      | nearest grid point, `value: …` line                                      |
 *
 * Deferred: `contour` (Plotly's hover iso-line), calendars; extraction in a worker (it is a pure
 * function of typed arrays, but calc is synchronous).
 */
import type { TraceModule } from '@mk7s/holochart-runtime';
import { coloraxisLayoutSchema } from '@mk7s/holochart-traces-basic';
import { sceneA11y } from '../a11y-loader.ts';
import { sceneCrossTraceLayout, sceneSubplotDomain } from '../scene/layout.ts';
import { supplyTraceColoraxisDefaults, traceColorbar } from '../mesh3d/colors.ts';
import { isosurfaceAttributes } from './attributes.ts';
import { calcIso, isoColorValues, type IsoCalc } from './calc.ts';
import { supplyIsoDefaults } from './defaults.ts';
import { isoHoverPoints } from './hover.ts';
import { IsoMeshView } from './plot.ts';

export const isosurface: TraceModule<IsoCalc, typeof isosurfaceAttributes.children> = {
  type: 'isosurface',
  categories: ['gl3d', 'showLegend'],
  schema: isosurfaceAttributes,
  layoutSchema: coloraxisLayoutSchema,
  meta: {
    description:
      'Isosurfaces of a scalar field on a 3D grid, between two values, with caps, slices and a space frame, colored by value.',
    docsPage: 'isosurface',
    plotlyEquivalent: 'isosurface',
  },
  supplyDefaults: supplyIsoDefaults,
  supplyLayoutDefaults: (layoutIn, layoutOut, ctx) =>
    supplyTraceColoraxisDefaults(layoutIn, layoutOut, ctx, 'isosurface', isoColorValues),
  touchAction: 'none',
  subplotDomain: sceneSubplotDomain,
  crossTraceLayout: sceneCrossTraceLayout,
  calc: (trace, ctx) => calcIso(trace, ctx),
  plot: { create: (ctx) => new IsoMeshView(ctx) },
  a11y: sceneA11y,
  hoverPoints: isoHoverPoints,
  eventData: (calc, _trace, i) => ({ value: calc.grid.value[i] }),
  colorbar: (trace, ctx) => traceColorbar(trace, ctx.fullLayout, isoColorValues(trace)),
};

export { isosurfaceAttributes } from './attributes.ts';
export type { IsoCalc } from './calc.ts';
