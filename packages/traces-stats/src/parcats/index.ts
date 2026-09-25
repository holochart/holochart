/**
 * The `parcats` (parallel categories) trace module (plan E10.11): one column of category bands per
 * dimension, sized by count, with paths across them for every combination of categories (and
 * numeric `line.color`), placed by `domain`. Hover shows paths, categories, colored bands or whole
 * dimensions (`hoveron`); dragging reorders categories and dimensions (`arrangement`) and restyles
 * `categoryarray` / `displayindex`. Core's schema/defaults parts and the runtime's render and
 * interaction parts in one object, registered with `register(parcats)` (ADR-019).
 *
 * Like Plotly, parcats has no legend entry. Deferred: the drag transitions, raising hovered bands,
 * the band and path strokes.
 */
import type { TraceModule } from '@mk7s/holochart-runtime';
import { lineColorbar } from '../parcoords/common.ts';
import { parcatsAttributes } from './attributes.ts';
import { calcParcats, type ParcatsCalc } from './calc.ts';
import { supplyParcatsDefaults } from './defaults.ts';
import { describeParcats } from './describe.ts';
import { parcatsHoverPoints } from './hover.ts';
import { parcatsRenderer } from './plot.ts';

export const parcats: TraceModule<ParcatsCalc, typeof parcatsAttributes.children> = {
  type: 'parcats',
  categories: ['domain', 'noOpacity'],
  schema: parcatsAttributes,
  meta: {
    description:
      'Parallel categories: category bands per dimension sized by count, with paths across them for each combination; hover for counts and probabilities, drag to reorder categories and dimensions.',
    docsPage: 'parallel-categories',
    plotlyEquivalent: 'parcats',
  },
  supplyDefaults: supplyParcatsDefaults,
  calc: calcParcats,
  plot: parcatsRenderer,
  hoverPoints: parcatsHoverPoints,
  colorbar: (trace, ctx) => lineColorbar(trace, ctx.fullLayout),
  describe: describeParcats,
};

export { parcatsAttributes } from './attributes.ts';
export type { ParcatsCalc } from './calc.ts';
