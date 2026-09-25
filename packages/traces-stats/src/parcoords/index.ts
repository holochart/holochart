/**
 * The `parcoords` trace module (plan E10.10): parallel coordinates. One vertical axis per
 * dimension (ticks from core's tick functions, `tickvals` / `ticktext` for ordinal axes, range
 * labels at the ends) and one line per row across them, colored through `line.colorscale`; all
 * lines are one GPU line primitive, so 100k+ rows stay interactive. Brushing an axis filters the
 * lines (restyling `dimensions[i].constraintrange`, several ranges with `multiselect`); dragging an
 * axis label reorders the dimensions (restyling `dimensions`). Placed by `domain`; registered with
 * `register(parcoords)` (ADR-019).
 *
 * Like Plotly, parcoords has no hover labels, legend entry or selection events.
 *
 * Deferred: `line.coloraxis`, `dimensiondefaults` templates, the snap and axis-drop transitions
 * (E7.3).
 */
import type { TraceModule } from '@mk7s/holochart-runtime';
import { parcoordsAttributes } from './attributes.ts';
import { calcParcoords, type ParcoordsCalc } from './calc.ts';
import { lineColorbar } from './common.ts';
import { supplyParcoordsDefaults } from './defaults.ts';
import { describeParcoords } from './describe.ts';
import { parcoordsRenderer } from './plot.ts';

export const parcoords: TraceModule<ParcoordsCalc, typeof parcoordsAttributes.children> = {
  type: 'parcoords',
  categories: ['domain', 'noOpacity'],
  schema: parcoordsAttributes,
  meta: {
    description:
      'Parallel coordinates: one axis per dimension and one GPU-drawn line per row, colored by a colorscale; brush axes to filter lines, drag labels to reorder axes.',
    docsPage: 'parallel-coordinates',
    plotlyEquivalent: 'parcoords',
  },
  supplyDefaults: supplyParcoordsDefaults,
  calc: calcParcoords,
  plot: parcoordsRenderer,
  colorbar: (trace, ctx) => lineColorbar(trace, ctx.fullLayout),
  describe: describeParcoords,
};

export { parcoordsAttributes } from './attributes.ts';
export type { ParcoordsCalc, ParcoordsDimension } from './calc.ts';
