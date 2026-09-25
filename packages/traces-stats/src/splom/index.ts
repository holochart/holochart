/**
 * The `splom` trace module (plan E10.9): a scatter plot matrix. Core's schema/defaults parts (the
 * dimension axes and cell subplots go through core's splom stash), the runtime's multi-subplot
 * render and interaction parts (`cells`, `axisData`, per-axis extremes, per-cell hover and
 * selection) in one object, registered with `register(splom)` (ADR-019).
 */
import type { FullTrace } from '@mk7s/holochart-core';
import type { TraceModule } from '@mk7s/holochart-runtime';
import { coloraxisLayoutSchema, scatter } from '@mk7s/holochart-traces-basic';
import { splomAttributes } from './attributes.ts';
import { calcSplom, splomExtremes, type SplomCalc } from './calc.ts';
import { cellsOf, dimensionOfAxis, dimensionsOf, supplySplomDefaults } from './defaults.ts';
import { describeSplom } from './describe.ts';
import { splomHoverPoints, splomSelectPoints } from './hover.ts';
import { splomRenderer } from './plot.ts';

/** Scatter's marker-only view of a splom trace (legend glyph, colorbar). */
function asMarkers(trace: FullTrace): FullTrace {
  return { ...trace, mode: 'markers' };
}

export const splom: TraceModule<SplomCalc, typeof splomAttributes.children> = {
  type: 'splom',
  categories: ['symbols', 'showLegend'],
  schema: splomAttributes,
  // Color axes and the automatic colorscales (`layout.colorscale`), as scatter.
  layoutSchema: coloraxisLayoutSchema,
  meta: {
    description:
      'Scatter plot matrix: every pair of dimensions as a scatter plot in a grid of subplots, with linked box / lasso selection across cells; each dimension is uploaded to the GPU once and shared by every cell.',
    docsPage: 'splom',
    plotlyEquivalent: 'splom',
  },
  supplyDefaults: supplySplomDefaults,
  supplyLayoutDefaults: (layoutIn, layoutOut, ctx) =>
    scatter.supplyLayoutDefaults?.(layoutIn, layoutOut, ctx),
  cells: (trace) => cellsOf(trace),
  axisData: (trace, id) => {
    const i = dimensionOfAxis(trace, id);
    const dim = i === undefined ? undefined : dimensionsOf(trace)[i];
    return dim?.visible ? dim.values : undefined;
  },
  calc: calcSplom,
  extremes: (calc, trace) => splomExtremes(calc, trace),
  plot: splomRenderer,
  hoverPoints: splomHoverPoints,
  selectPoints: splomSelectPoints,
  legendIcon: (trace, ctx) =>
    (scatter.legendIcon as NonNullable<typeof scatter.legendIcon>)(asMarkers(trace), ctx),
  colorbar: (trace, ctx) => scatter.colorbar?.(trace, ctx) ?? null,
  describe: describeSplom,
};

export { splomAttributes } from './attributes.ts';
export type { SplomCalc } from './calc.ts';
export type { FullDimension, SplomCell } from './defaults.ts';
