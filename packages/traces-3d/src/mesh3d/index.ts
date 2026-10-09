/**
 * The `mesh3d` trace module (plan E14.4): a triangle mesh in a 3D scene — explicit triangles
 * (`i`, `j`, `k`) or triangles derived from the vertices (`alphahull`: Delaunay along
 * `delaunayaxis`, the convex hull, or an alpha shape; `triangulate.ts`) — colored by `intensity`
 * through a colorscale (per vertex or per triangle), per vertex (`vertexcolor`), per triangle
 * (`facecolor`) or in one `color`, with Plotly's lighting (`flatshading`, `lighting`,
 * `lightposition`; the `material` extension), hover (`x`, `y`, `z`, `text`) and the hover
 * contour. Registered with `register(mesh3d)` (ADR-019).
 *
 * Deferred: the `Holochart.io.meshFromSTL/OBJ/PLY/GLTF` loaders (P2), calendars.
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type { TraceModule } from '@mk7s/holochart-runtime';
import { coloraxisLayoutSchema } from '@mk7s/holochart-traces-basic';
import { sceneA11y } from '../a11y-loader.ts';
import { sceneCrossTraceLayout, sceneSubplotDomain } from '../scene/layout.ts';
import { mesh3dAttributes } from './attributes.ts';
import { calcMesh3d, type Mesh3dCalc } from './calc.ts';
import { numbersOf, supplyTraceColoraxisDefaults, traceColorbar } from './colors.ts';
import { supplyMesh3dDefaults } from './defaults.ts';
import { mesh3dHoverPoints } from './hover.ts';
import { Mesh3dView } from './plot.ts';

/** The intensity values of a mesh with a colorscale (undefined without). */
function intensityOf(trace: FullTrace): Float64Array | undefined {
  const v = trace['intensity'];
  return v !== undefined ? numbersOf(v) : undefined;
}

export const mesh3d: TraceModule<Mesh3dCalc, typeof mesh3dAttributes.children> = {
  type: 'mesh3d',
  categories: ['gl3d', 'showLegend'],
  schema: mesh3dAttributes,
  layoutSchema: coloraxisLayoutSchema,
  meta: {
    description:
      'A 3D triangle mesh: explicit triangles or ones derived from the vertices (Delaunay, convex hull, alpha shape), colored by intensity, per vertex, per triangle or in one color, lit with Plotly’s lighting model.',
    docsPage: 'mesh3d',
    plotlyEquivalent: 'mesh3d',
  },
  supplyDefaults: supplyMesh3dDefaults,
  supplyLayoutDefaults: (layoutIn, layoutOut, ctx) =>
    supplyTraceColoraxisDefaults(layoutIn, layoutOut, ctx, 'mesh3d', intensityOf),
  touchAction: 'none',
  subplotDomain: sceneSubplotDomain,
  crossTraceLayout: sceneCrossTraceLayout,
  calc: calcMesh3d,
  plot: { create: (ctx) => new Mesh3dView(ctx) },
  a11y: sceneA11y,
  hoverPoints: mesh3dHoverPoints,
  colorbar: (trace, ctx) => traceColorbar(trace, ctx.fullLayout, intensityOf(trace)),
};

export { mesh3dAttributes } from './attributes.ts';
export type { Mesh3dCalc } from './calc.ts';
