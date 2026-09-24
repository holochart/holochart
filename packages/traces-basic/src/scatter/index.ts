/**
 * The `scatter` trace module (plan E9.1–E9.3, E9.7): core's schema/defaults parts and the
 * runtime's render and interaction parts in one object, registered with `register(scatter)`
 * (ADR-019).
 */
import type { TraceModule } from '@mk7s/holochart-runtime';
import { coloraxisLayoutSchema, supplyColoraxisDefaults } from '../shared/colorscale.ts';
import { scatterAttributes } from './attributes.ts';
import { calcScatter, scatterCategoryValues, scatterExtremes, type ScatterCalc } from './calc.ts';
import { calcScatterAppend, scatterExtremesAppend } from './calc-stream.ts';
import { scatterColorbar } from './colorbar.ts';
import { supplyScatterDefaults } from './defaults.ts';
import { scatterHoverPoints, scatterLegendIcon, scatterSelectPoints } from './interaction.ts';
import { scatterRenderer } from './plot.ts';

export const scatter: TraceModule<ScatterCalc, typeof scatterAttributes.children> = {
  type: 'scatter',
  categories: ['cartesian', 'symbols', 'showLegend', 'errorBarsOK'],
  schema: scatterAttributes,
  layoutSchema: coloraxisLayoutSchema,
  meta: {
    description:
      'Markers, lines (linear, spline, steps) and text labels at x/y positions, with error bars and colorscales; every part is one GPU draw call regardless of the point count.',
    docsPage: 'scatter',
    plotlyEquivalent: 'scatter / scattergl',
  },
  animatable: ['x', 'y', 'marker.color', 'marker.size', 'marker.opacity'],
  supplyDefaults: supplyScatterDefaults,
  supplyLayoutDefaults: supplyColoraxisDefaults,
  calc: calcScatter,
  extremes: scatterExtremes,
  calcAppend: calcScatterAppend,
  extremesAppend: scatterExtremesAppend,
  categoryValues: scatterCategoryValues,
  plot: scatterRenderer,
  hoverPoints: scatterHoverPoints,
  selectPoints: (calc, trace, query) => scatterSelectPoints(calc, trace, query),
  legendIcon: scatterLegendIcon,
  colorbar: scatterColorbar,
};

export { scatterAttributes, SCATTER_SYMBOLS, LINE_SHAPES } from './attributes.ts';
export type { ScatterCalc } from './calc.ts';
export { markerStyle } from './plot.ts';
