/**
 * The `scatter` trace module (plan E9.1): core's schema/defaults parts and the runtime's render
 * parts in one object, registered with `register(scatter)` (ADR-019).
 */
import type { TraceModule } from '@mk7s/holochart-runtime';
import { scatterAttributes } from './attributes.ts';
import { calcScatter, scatterExtremes, type ScatterCalc } from './calc.ts';
import { supplyScatterDefaults } from './defaults.ts';
import { scatterRenderer } from './plot.ts';

export const scatter: TraceModule<ScatterCalc, typeof scatterAttributes.children> = {
  type: 'scatter',
  categories: ['cartesian', 'symbols', 'showLegend', 'errorBarsOK'],
  schema: scatterAttributes,
  meta: {
    description:
      'Points at x/y positions, drawn as instanced GPU markers. Line, text and fill modes arrive with E9.2–E9.4.',
    docsPage: 'scatter',
    plotlyEquivalent: 'scatter / scattergl',
  },
  animatable: ['x', 'y', 'marker.color', 'marker.size', 'marker.opacity'],
  supplyDefaults: supplyScatterDefaults,
  calc: calcScatter,
  extremes: scatterExtremes,
  plot: scatterRenderer,
};

export { scatterAttributes, SCATTER_SYMBOLS } from './attributes.ts';
export type { ScatterCalc } from './calc.ts';
export { markerStyle } from './plot.ts';
