/**
 * The `sunburst` trace module (plan E13.2): a hierarchy (`labels`, `parents`, `ids`, `values`,
 * built by the shared engine, E13.1) as rings of sectors placed by `domain` (E4.5), the current
 * root (`level`) in the middle, with `maxdepth`, `rotation`, `sort`, node colors from
 * `sunburstcolorway`, `marker.colors` or a colorscale, `leaf.opacity`, outlines, patterns (E8.10),
 * fitted labels (`textinfo` / `texttemplate`, `insidetextorientation`), hover, and drill-down: a
 * click on a sector zooms into it and a click on the center goes back up, animated
 * (`sunburstclick` / `click` listeners may cancel). Drawn as one instanced GPU arc set and one SDF
 * text batch. Registered with `register(sunburst)` (ADR-019).
 *
 * Colorscales may be shared through `marker.coloraxis`, and `layout.uniformtext` (E4.6) sizes the
 * labels of every sunburst of the chart alike.
 *
 * Deferred: the layered 3D extrusion (`depth` / `depthstep`, P2), label links, transitions of
 * `level` changes made by `animate` / `react`.
 */
import type { TraceModule } from '@mk7s/holochart-runtime';
import { coloraxisLayoutSchema } from '@mk7s/holochart-traces-basic';
import { describeHierarchy } from '../hierarchy/describe.ts';
import { hierarchyColorbar } from '../hierarchy/colors.ts';
import { sunburstAttributes, sunburstLayoutAttributes } from './attributes.ts';
import { supplySunburstDefaults, supplySunburstLayoutDefaults } from './defaults.ts';
import { calcSunburst, type SunburstCalc } from './geometry.ts';
import { sunburstHoverPoints } from './hover.ts';
import { crossTraceLayoutSunburst } from './layout.ts';
import { sunburstRenderer } from './plot.ts';

export const sunburst: TraceModule<SunburstCalc, typeof sunburstAttributes.children> = {
  type: 'sunburst',
  categories: ['domain', 'sunburst'],
  schema: sunburstAttributes,
  // Wrapped so the schema tree-shakes out of bundles without sunburst (E21.6).
  layoutSchema: /* @__PURE__ */ (() => ({
    ...sunburstLayoutAttributes,
    ...coloraxisLayoutSchema,
  }))(),
  meta: {
    description:
      'Sunburst charts: a hierarchy as rings of sectors sized by value, placed by `domain`, with animated drill-down, drawn as one instanced GPU arc set with batched SDF labels.',
    docsPage: 'sunburst',
    plotlyEquivalent: 'sunburst',
  },
  supplyDefaults: supplySunburstDefaults,
  supplyLayoutDefaults: supplySunburstLayoutDefaults,
  calc: (trace, ctx) => calcSunburst(trace, ctx),
  crossTraceLayout: crossTraceLayoutSunburst,
  plot: sunburstRenderer,
  hoverPoints: sunburstHoverPoints,
  colorbar: (trace, ctx) => hierarchyColorbar(trace, ctx.fullLayout),
  describe: (ctx) => describeHierarchy(ctx, 'Sunburst'),
};

export { sunburstAttributes, sunburstLayoutAttributes } from './attributes.ts';
export type { Sector, SunburstCalc, SunburstGeometry, SunburstLayout } from './geometry.ts';
