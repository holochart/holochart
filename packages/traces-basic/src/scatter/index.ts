/**
 * The `scatter` trace module (plan E9.1–E9.5, E9.7): core's schema/defaults parts and the
 * runtime's render and interaction parts in one object, registered with `register(scatter)`
 * (ADR-019).
 */
import type { TraceModule } from '@mk7s/holochart-runtime';
import { coloraxisLayoutSchema, supplyColoraxisDefaults } from '../shared/colorscale.ts';
import { scatterAttributes } from './attributes.ts';
import { calcScatter, scatterCategoryValues, type ScatterCalc } from './calc.ts';
import {
  calcScatterAppend,
  scatterExtremesAppendCached,
  scatterExtremesCached,
} from './calc-stream.ts';
import { scatterColorbar } from './colorbar.ts';
import { scatterCrossTraceCalc } from './cross-trace.ts';
import { supplyScatterDefaults } from './defaults.ts';
import { scatterHoverPoints, scatterLegendIcon, scatterSelectPoints } from './interaction.ts';
import { scatterRenderer } from './plot.ts';
import { describeScatter } from './describe.ts';

export const scatter: TraceModule<ScatterCalc, typeof scatterAttributes.children> = {
  type: 'scatter',
  categories: ['cartesian', 'symbols', 'showLegend', 'errorBarsOK'],
  schema: scatterAttributes,
  layoutSchema: coloraxisLayoutSchema,
  meta: {
    description:
      'Markers, lines (linear, spline, steps), text labels, filled and stacked areas and bubbles at x/y positions, with error bars and colorscales; every part is one GPU draw call regardless of the point count.',
    docsPage: 'scatter',
    plotlyEquivalent: 'scatter / scattergl',
  },
  // Plotly's animatable scatter attributes (E7.3).
  animatable: [
    'x',
    'x0',
    'dx',
    'y',
    'y0',
    'dy',
    'line.color',
    'line.width',
    'marker.color',
    'marker.size',
    'marker.opacity',
    'marker.line.color',
    'marker.line.width',
  ],
  supplyDefaults: supplyScatterDefaults,
  supplyLayoutDefaults: supplyColoraxisDefaults,
  calc: calcScatter,
  extremes: scatterExtremesCached,
  calcAppend: calcScatterAppend,
  extremesAppend: scatterExtremesAppendCached,
  crossTraceCalc: scatterCrossTraceCalc,
  categoryValues: scatterCategoryValues,
  plot: scatterRenderer,
  hoverPoints: scatterHoverPoints,
  selectPoints: (calc, trace, query) => scatterSelectPoints(calc, trace, query),
  legendIcon: scatterLegendIcon,
  colorbar: scatterColorbar,
  describe: describeScatter,
};

export { scatterAttributes, SCATTER_SYMBOLS, LINE_SHAPES, FILL_MODES } from './attributes.ts';
export type { ScatterCalc, ScatterLink, ScatterStack } from './calc.ts';
export { markerStyle } from './plot.ts';
export { bubbleSizeref, type BubbleSizerefOptions } from './bubble.ts';
