/**
 * The `treemap` trace module (plan E13.3): a hierarchy (`labels`, `parents`, `ids`, `values`,
 * built by the shared engine, E13.1) as nested rectangles filling `domain` (E4.5), sized by value
 * with d3's tilings (`tiling.packing`: squarify with `squarifyratio`, binary, dice, slice,
 * slice-dice, dice-slice; `flip`, `pad`), branch headers in `marker.pad`, `depthfade`,
 * `cornerradius`, node colors from `treemapcolorway`, `marker.colors` or a colorscale, outlines,
 * patterns (E8.10), fitted and wrapped labels in 9 `textposition`s, a path bar of the current
 * root's ancestors, hover, and drill-down: a click on a tile zooms into it, a click on the entry or
 * a path bar segment goes up, animated (`treemapclick` / `click` listeners may cancel). Drawn as
 * one instanced GPU rect set and one SDF text batch. Registered with `register(treemap)` (ADR-019).
 *
 * Colorscales may be shared through `marker.coloraxis`, and `layout.uniformtext` (E4.6) sizes the
 * labels of every treemap of the chart alike.
 *
 * The full bundle adds `depth`, `bevel`, `material`, `tilt` and `perspective` (tiles as prisms in
 * terraces, the "city" 3D treemap; `@mk7s/holochart`'s `extrudedTreemap`). Deferred: transitions
 * of `level` changes made by `animate` / `react`.
 */
import type { TraceModule } from '@mk7s/holochart-runtime';
import { coloraxisLayoutSchema } from '@mk7s/holochart-traces-basic';
import { hierarchyColorbar } from '../hierarchy/colors.ts';
import { describeHierarchy } from '../hierarchy/describe.ts';
import { treemapAttributes, treemapLayoutAttributes } from './attributes.ts';
import { supplyTreemapDefaults, supplyTreemapLayoutDefaults } from './defaults.ts';
import { calcRects, treemapCells, type RectCalc } from './geometry.ts';
import { rectHoverPoints } from './hover.ts';
import { rectCrossTraceLayout } from './layout.ts';
import { rectRenderer } from './plot.ts';

export const treemap: TraceModule<RectCalc, typeof treemapAttributes.children> = {
  type: 'treemap',
  categories: ['domain', 'treemap'],
  schema: treemapAttributes,
  // Wrapped so the schema tree-shakes out of bundles without treemap (E21.6).
  layoutSchema: /* @__PURE__ */ (() => ({
    ...treemapLayoutAttributes,
    ...coloraxisLayoutSchema,
  }))(),
  meta: {
    description:
      'Treemaps: a hierarchy as nested rectangles sized by value, placed by `domain`, with a path bar and animated drill-down, drawn as one instanced GPU rect set with batched SDF labels.',
    docsPage: 'treemap',
    plotlyEquivalent: 'treemap',
  },
  supplyDefaults: supplyTreemapDefaults,
  supplyLayoutDefaults: supplyTreemapLayoutDefaults,
  calc: (trace, ctx) => calcRects(trace, ctx, treemapCells),
  crossTraceLayout: /* @__PURE__ */ rectCrossTraceLayout('treemap'),
  plot: rectRenderer,
  hoverPoints: rectHoverPoints,
  colorbar: (trace, ctx) => hierarchyColorbar(trace, ctx.fullLayout),
  describe: (ctx) => describeHierarchy(ctx, 'Treemap'),
};

export { treemapAttributes, treemapLayoutAttributes } from './attributes.ts';
export type { RectCalc, RectGeometry, RectLayout, Segment, Tile } from './geometry.ts';
export type { TreemapPacking } from './tiling.ts';
