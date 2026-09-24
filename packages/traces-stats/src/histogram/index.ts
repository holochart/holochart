/**
 * The `histogram` trace module (plan E10.1): samples binned into bars, drawn, stacked and grouped
 * by bar's machinery (histograms and bars share one `bar-like` stack group per subplot, as in
 * Plotly). Registered with `register(histogram)` (ADR-019); the `@mk7s/holochart` bundle does it.
 */
import type { TraceModule } from '@mk7s/holochart-runtime';
import { bar, type BarCalc } from '@mk7s/holochart-traces-basic';
import { histogramAttributes } from './attributes.ts';
import { calcHistogram, type HistogramCalc } from './calc.ts';
import { supplyHistogramDefaults, supplyHistogramLayoutDefaults } from './defaults.ts';
import { describeHistogram } from './describe.ts';
import { histogramHoverPoints, histogramSelectPoints } from './hover.ts';
import { histogramRenderer } from './plot.ts';

/** Bar's parts, typed for histogram calcs (a histogram calc is a bar calc). */
const barModule = bar as unknown as Required<
  Pick<
    TraceModule<HistogramCalc>,
    'crossTraceCalc' | 'extremes' | 'categoryValues' | 'legendIcon' | 'colorbar'
  >
> &
  Pick<TraceModule<BarCalc>, 'layoutSchema'>;

export const histogram: TraceModule<HistogramCalc, typeof histogramAttributes.children> = {
  type: 'histogram',
  categories: ['cartesian', 'bar-like', 'histogram', 'showLegend', 'errorBarsOK'],
  schema: histogramAttributes,
  layoutSchema: barModule.layoutSchema,
  meta: {
    description:
      'Histograms: samples binned into bars (counts, sums, averages, min or max per bin), normalized or cumulative, vertical or horizontal, grouped or stacked with bars (`layout.barmode`).',
    docsPage: 'histogram',
    plotlyEquivalent: 'histogram',
  },
  animatable: ['marker.color', 'marker.opacity'],
  supplyDefaults: supplyHistogramDefaults,
  supplyLayoutDefaults: supplyHistogramLayoutDefaults,
  calc: calcHistogram,
  crossTraceCalc: barModule.crossTraceCalc,
  extremes: barModule.extremes,
  categoryValues: barModule.categoryValues,
  plot: histogramRenderer,
  hoverPoints: histogramHoverPoints,
  selectPoints: histogramSelectPoints,
  legendIcon: barModule.legendIcon,
  colorbar: barModule.colorbar,
  describe: describeHistogram,
};

export { histogramAttributes } from './attributes.ts';
export type { HistogramCalc } from './calc.ts';
