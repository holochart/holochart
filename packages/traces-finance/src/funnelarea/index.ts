/**
 * The `funnelarea` trace module (plan E12.6): the stages of a process as stacked trapezoids whose
 * areas are proportional to their values, placed by `domain` (E4.5) and shaped by `aspectratio`
 * and `baseratio`, with pie's label aggregation, shared stage colors (`funnelareacolorway`),
 * `scalegroup` sizing, inside labels (`textinfo` / `texttemplate`), a title above the funnel,
 * per-label legend items (toggling `layout.hiddenlabels`) and per-stage hover. Drawn as one
 * batched polygon fill, one outline line primitive and one SDF text batch. Registered with
 * `register(funnelarea)` (ADR-019).
 *
 * Deferred: the extruded 3D pyramid (`depth` / `shape`, P2), `uniformtext` (E4.6), label links,
 * `marker.pattern` (E8.10).
 */
import { type DescribeContext, type TraceModule } from '@mk7s/holochart-runtime';
import {
  accessibleText,
  countText,
  traceNameText,
  type TraceDescription,
} from '@mk7s/holochart-runtime';
import { formatPiePercent, formatPieValue } from '@mk7s/holochart-traces-basic';
import { funnelareaAttributes, funnelareaLayoutAttributes } from './attributes.ts';
import { calcFunnelarea, crossTraceLayoutFunnelarea, type FunnelareaCalc } from './calc.ts';
import { supplyFunnelareaDefaults, supplyFunnelareaLayoutDefaults } from './defaults.ts';
import { funnelareaHoverPoints } from './hover.ts';
import { funnelareaLegendIcon, funnelareaLegendItems } from './legend.ts';
import { funnelareaRenderer } from './plot.ts';

/** The accessible description: stage count, total and each stage's share. */
function describeFunnelarea(ctx: DescribeContext<FunnelareaCalc>): TraceDescription {
  const { trace, calc } = ctx;
  const name = traceNameText(trace['name'], ctx.index);
  const visible = calc.slices.filter((s) => !s.hidden);
  const total = calc.vTotal;
  const share = (v: number): string => (total > 0 ? formatPiePercent(v / total) : '');
  let summary = `Funnel area "${name}": ${countText(visible.length, 'stage')}`;
  summary += total > 0 ? `, total ${formatPieValue(total)}.` : '.';
  const hidden = calc.slices.length - visible.length;
  if (hidden > 0) summary += ` ${countText(hidden, 'stage')} hidden.`;
  const rows = visible
    .slice(0, ctx.maxRows)
    .map((s) => [accessibleText(s.label), formatPieValue(s.v), share(s.v)]);
  const slices = calc.slices;
  return {
    kind: 'funnelarea',
    summary,
    table: { caption: name, columns: ['Stage', 'Value', 'Percent'], rows, total: visible.length },
    insight: {
      kind: 'shares',
      part: 'stage',
      length: slices.length,
      values: slices.map((s) => s.v),
      label: (i) => accessibleText(slices[i]!.label),
      skip: (i) => slices[i]!.hidden === true,
      formatValue: formatPieValue,
    },
  };
}

export const funnelarea: TraceModule<FunnelareaCalc, typeof funnelareaAttributes.children> = {
  type: 'funnelarea',
  categories: ['domain', 'pie-like', 'funnelarea', 'showLegend'],
  schema: funnelareaAttributes,
  layoutSchema: funnelareaLayoutAttributes,
  meta: {
    description:
      'Funnel areas: the stages of a process as stacked trapezoids with areas proportional to their values, placed by `domain`, drawn as one batched GPU polygon fill with batched SDF labels.',
    docsPage: 'funnelarea',
    plotlyEquivalent: 'funnelarea',
  },
  supplyDefaults: supplyFunnelareaDefaults,
  supplyLayoutDefaults: supplyFunnelareaLayoutDefaults,
  calc: calcFunnelarea,
  crossTraceLayout: crossTraceLayoutFunnelarea,
  plot: funnelareaRenderer,
  hoverPoints: funnelareaHoverPoints,
  legendIcon: funnelareaLegendIcon,
  legendItems: funnelareaLegendItems,
  describe: describeFunnelarea,
};

export { funnelareaAttributes, funnelareaLayoutAttributes } from './attributes.ts';
export type { FunnelareaCalc, FunnelareaSlice } from './calc.ts';
