/**
 * The `icicle` trace module (plan E13.4): a hierarchy (built by the shared engine, E13.1) as rows
 * of cells placed by `domain` (E4.5), the current root (`level`) at one end and each level next
 * to the previous one (`tiling.orientation`, `flip`, `pad`), cells sized by value, with `maxdepth`,
 * node colors from `iciclecolorway`, `marker.colors` or a colorscale, `leaf.opacity`, outlines,
 * patterns (E8.10), fitted and wrapped labels in 9 `textposition`s, the treemap's path bar, hover,
 * and drill-down (`icicleclick` / `click` listeners may cancel). It shares the treemap's renderer:
 * one instanced GPU rect set and one SDF text batch. Registered with `register(icicle)` (ADR-019).
 *
 * Colorscales may be shared through `marker.coloraxis`, and `layout.uniformtext` (E4.6) sizes the
 * labels of every icicle of the chart alike.
 *
 * Deferred: transitions of `level` changes made by `animate` / `react`.
 */
import type { TraceModule } from '@mk7s/holochart-runtime';
import { coloraxisLayoutSchema } from '@mk7s/holochart-traces-basic';
import { hierarchyColorbar } from '../hierarchy/colors.ts';
import { describeHierarchy } from '../hierarchy/describe.ts';
import { calcRects, type RectCalc } from '../treemap/geometry.ts';
import { rectA11y, rectHoverPoints } from '../treemap/hover.ts';
import { rectCrossTraceLayout } from '../treemap/layout.ts';
import { rectRenderer } from '../treemap/plot.ts';
import { icicleAttributes, icicleLayoutAttributes } from './attributes.ts';
import { supplyIcicleDefaults, supplyIcicleLayoutDefaults } from './defaults.ts';
import { icicleCells } from './partition.ts';

export const icicle: TraceModule<RectCalc, typeof icicleAttributes.children> = {
  type: 'icicle',
  categories: ['domain', 'icicle'],
  schema: icicleAttributes,
  // Wrapped so the schema tree-shakes out of bundles without icicle (E21.6).
  layoutSchema: /* @__PURE__ */ (() => ({ ...icicleLayoutAttributes, ...coloraxisLayoutSchema }))(),
  meta: {
    description:
      'Icicle charts: a hierarchy as rows or columns of cells sized by value, placed by `domain`, with a path bar and animated drill-down, drawn as one instanced GPU rect set with batched SDF labels.',
    docsPage: 'icicle',
    plotlyEquivalent: 'icicle',
  },
  supplyDefaults: supplyIcicleDefaults,
  supplyLayoutDefaults: supplyIcicleLayoutDefaults,
  calc: (trace, ctx) => calcRects(trace, ctx, icicleCells),
  crossTraceLayout: /* @__PURE__ */ rectCrossTraceLayout('icicle'),
  plot: rectRenderer,
  hoverPoints: rectHoverPoints,
  a11y: rectA11y,
  colorbar: (trace, ctx) => hierarchyColorbar(trace, ctx.fullLayout),
  describe: (ctx) => describeHierarchy(ctx, 'Icicle'),
};

export { icicleAttributes, icicleLayoutAttributes } from './attributes.ts';
