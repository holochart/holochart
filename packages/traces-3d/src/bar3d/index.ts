/**
 * The `bar3d` trace module (plan E14.9, a Holochart extension): true 3D bars on an x/y grid —
 * positions `x`, `y` (categorical or numeric), heights `z` from `base`, footprints `width` ×
 * `depth`, stacked across traces with `stackgroup` — drawn as lit boxes in one instanced draw call
 * per trace, colored per bar or by height through a colorscale (with a colorbar), with box edges
 * (`marker.line`), Plotly's `lighting` or a `material`, and hover per bar (x, y, z, base).
 * Registered with `register(bar3d)` (ADR-019).
 */
import { isArrayLike, type FullLayout, type FullTrace } from '@mk7s/holochart-core';
import type { LegendGlyph, TraceModule } from '@mk7s/holochart-runtime';
import {
  coloraxisLayoutSchema,
  mapColor,
  markerColorbar,
  resolveColorMapping,
  rgbaToCss,
  scatter,
} from '@mk7s/holochart-traces-basic';
import { sceneA11y } from '../a11y-loader.ts';
import { sceneCrossTraceLayout, sceneSubplotDomain } from '../scene/layout.ts';
import { bar3dAttributes } from './attributes.ts';
import { calcBar3d, type Bar3dCalc } from './calc.ts';
import { supplyBar3dDefaults } from './defaults.ts';
import { bar3dHoverPoints } from './hover.ts';
import { bar3dColorAt, Bar3dView } from './plot.ts';

/**
 * The legend's bar glyph: the bar color (a colorscaled trace shows its colorscale's middle, as a
 * per-point `scatter3d` line does) with the edge color at up to 1 px.
 */
function bar3dLegendIcon(trace: FullTrace, fullLayout?: FullLayout): LegendGlyph {
  const marker = (trace['marker'] ?? {}) as Record<string, unknown>;
  const mapping = resolveColorMapping(marker, fullLayout);
  const fill =
    mapping && isArrayLike(marker['color'])
      ? mapColor((mapping.cmin + mapping.cmax) / 2, mapping)
      : bar3dColorAt(marker, 0, mapping);
  const line = (marker['line'] ?? {}) as Record<string, unknown>;
  const width = Number(line['width']);
  return {
    kind: 'bar',
    fill: {
      color: rgbaToCss(fill),
      ...(typeof line['color'] === 'string' ? { lineColor: line['color'] } : {}),
      lineWidth: width > 0 ? Math.min(1, width) : 0,
    },
  };
}

export const bar3d: TraceModule<Bar3dCalc, typeof bar3dAttributes.children> = {
  type: 'bar3d',
  categories: ['gl3d', 'showLegend'],
  schema: bar3dAttributes,
  layoutSchema: coloraxisLayoutSchema,
  meta: {
    description:
      'True 3D bars on an x/y grid (a Holochart extension): lit boxes of height z at (x, y), categorical or numeric, stacked across traces, colored per bar or by height, one instanced draw call per trace.',
    docsPage: 'bar3d',
  },
  supplyDefaults: supplyBar3dDefaults,
  // Color axes (`marker.coloraxis`): scatter's layout defaults collect their domains.
  ...(scatter.supplyLayoutDefaults ? { supplyLayoutDefaults: scatter.supplyLayoutDefaults } : {}),
  touchAction: 'none',
  subplotDomain: sceneSubplotDomain,
  crossTraceLayout: sceneCrossTraceLayout,
  calc: calcBar3d,
  plot: { create: (ctx) => new Bar3dView(ctx) },
  a11y: sceneA11y,
  hoverPoints: bar3dHoverPoints,
  legendIcon: (trace, ctx) => bar3dLegendIcon(trace, ctx?.fullLayout),
  eventData: (calc, _trace, i) => ({ base: calc.bottom[i], top: calc.top[i] }),
  colorbar: (trace, ctx) => markerColorbar(trace, ctx.fullLayout, 'marker'),
};

export { bar3dAttributes } from './attributes.ts';
export type { Bar3dCalc } from './calc.ts';
