/**
 * The `pie` trace module (plan E9.11): pie and donut charts placed by `domain` (E4.5), with
 * Plotly's label aggregation, shared slice colors, `scalegroup` sizing, inside / outside labels
 * with collision avoidance and leader lines, per-label legend items and per-slice hover. Core's
 * schema/defaults parts and the runtime's render and interaction parts in one object, registered
 * with `register(pie)` (ADR-019).
 *
 * Deferred: animated re-flow and pull transitions (E7.3), `marker.pattern` (E8.10), `uniformtext`
 * (E4.6), `automargin`.
 */
import type { TraceModule } from '@mk7s/holochart-runtime';
import { pieAttributes, pieLayoutAttributes } from './attributes.ts';
import { calcPie, type PieCalc } from './calc.ts';
import { supplyPieDefaults, supplyPieLayoutDefaults } from './defaults.ts';
import { pieHoverPoints } from './hover.ts';
import { crossTraceLayoutPie } from './layout.ts';
import { pieLegendIcon, pieLegendItems } from './legend.ts';
import { pieRenderer } from './plot.ts';

export const pie: TraceModule<PieCalc, typeof pieAttributes.children> = {
  type: 'pie',
  categories: ['domain', 'pie-like', 'pie', 'showLegend'],
  schema: pieAttributes,
  layoutSchema: pieLayoutAttributes,
  meta: {
    description:
      'Pie and donut charts: slices proportional to their values, placed by `domain`, drawn as one instanced GPU arc set with batched SDF labels and leader lines.',
    docsPage: 'pie',
    plotlyEquivalent: 'pie',
  },
  supplyDefaults: supplyPieDefaults,
  supplyLayoutDefaults: supplyPieLayoutDefaults,
  calc: calcPie,
  crossTraceLayout: crossTraceLayoutPie,
  plot: pieRenderer,
  hoverPoints: pieHoverPoints,
  legendIcon: pieLegendIcon,
  legendItems: pieLegendItems,
};

export { pieAttributes, pieLayoutAttributes } from './attributes.ts';
export type { PieCalc, PieLayout, PieSlice } from './calc.ts';
export { formatPiePercent, formatPieValue } from './helpers.ts';
