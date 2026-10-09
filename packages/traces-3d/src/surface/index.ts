/**
 * The `surface` trace module (plan E14.3): a grid of heights (`z`, with `x` / `y` vectors or 2D
 * arrays) drawn as a lit 3D surface in a scene, built on the GPU from float textures (no vertex
 * buffers: 1024² points upload in milliseconds), colored by `z` or `surfacecolor` through a
 * colorscale (with a colorbar), with `opacityscale`, `hidesurface`, `connectgaps`, Plotly's
 * lighting, contour lines of x, y and z (in the shader, projected onto the walls with `project`),
 * highlight lines at the hovered point and a wireframe (Holochart extension). Hover snaps to the
 * nearest grid point, as in Plotly.
 *
 * | Module        | What                                                                    |
 * | ------------- | ----------------------------------------------------------------------- |
 * | `attributes`  | the schema                                                              |
 * | `defaults`    | defaults, `opacityscale` names, color axes                              |
 * | `grid`        | vectors / matrices → linear grids, gap filling (`connectgaps`)          |
 * | `calc`        | the grid, `surfacecolor`, the scene autorange contribution              |
 * | `colors`      | colorscale mapping and colorbar                                         |
 * | `contours`    | contour levels, marching triangles (projections)                        |
 * | `shader`      | the height-field vertex shader and the line hooks                       |
 * | `primitive`   | `SurfacePrimitive`: textures, uniforms, lighting, translucency, picking |
 * | `projections` | projected contour lines on the walls (3D line primitive)                |
 * | `pick`        | CPU ray cast against the drawn triangles                                |
 * | `hover`       | hover points and the shared hit of hover and highlights                 |
 * | `view`        | the trace view (and the mesh primitive for three.js materials)          |
 * | `normals`     | the shader's normals on the CPU (mesh primitive path, tests)            |
 *
 * Deferred: Plotly's `refineData` resampling of small grids, projections of the highlight lines,
 * `xcalendar` / `ycalendar` / `zcalendar`.
 */
import type { TraceModule } from '@mk7s/holochart-runtime';
import { coloraxisLayoutSchema } from '@mk7s/holochart-traces-basic';
import { sceneA11y } from '../a11y-loader.ts';
import { sceneCrossTraceLayout, sceneSubplotDomain } from '../scene/layout.ts';
import { surfaceAttributes } from './attributes.ts';
import { calcSurface, type SurfaceCalc } from './calc.ts';
import { surfaceColorbar } from './colors.ts';
import { supplySurfaceDefaults, supplySurfaceLayoutDefaults } from './defaults.ts';
import { surfaceHoverPoints } from './hover.ts';
import { SurfaceView } from './view.ts';

export const surface: TraceModule<SurfaceCalc, typeof surfaceAttributes.children> = {
  type: 'surface',
  categories: ['gl3d', '2dMap', 'showLegend'],
  schema: surfaceAttributes,
  layoutSchema: coloraxisLayoutSchema,
  meta: {
    description:
      'Surfaces: a grid of heights drawn as a lit 3D surface built on the GPU, with contour lines, projections, a wireframe and a colorbar.',
    docsPage: 'surface',
    plotlyEquivalent: 'surface',
  },
  touchAction: 'none',
  supplyDefaults: supplySurfaceDefaults,
  supplyLayoutDefaults: supplySurfaceLayoutDefaults,
  subplotDomain: sceneSubplotDomain,
  crossTraceLayout: sceneCrossTraceLayout,
  calc: calcSurface,
  plot: { create: (ctx) => new SurfaceView(ctx) },
  a11y: sceneA11y,
  hoverPoints: surfaceHoverPoints,
  colorbar: (trace, ctx) => surfaceColorbar(trace, ctx.fullLayout),
};

export { surfaceAttributes } from './attributes.ts';
export type { SurfaceCalc } from './calc.ts';
