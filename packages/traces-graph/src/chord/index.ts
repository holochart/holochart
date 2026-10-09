/**
 * The `chord` trace module (backlog G8, ADR-029): a chord diagram. Nodes are arcs of a ring, as
 * wide as their outgoing plus their incoming flow, and links are ribbons between them, laid out
 * by our own code in the manner of d3-chord (`layout.ts`) and placed by `domain`. The flows come
 * from `node` / `link`, shaped like sankey's and `graph`'s, or from a square `matrix`. Directed
 * ribbons can end in an arrowhead or short of the ring; `node.group` keeps groups together and
 * draws an outer ring of labeled group arcs. Hover highlights the ribbons of a node, of a group
 * or the one under the pointer and dims the rest. Core's schema/defaults parts and the runtime's
 * render and interaction parts in one object, registered with `register(chord)` (ADR-019).
 *
 * The legend is per item, as a pie's (`legendItems`, `layout.hiddenlabels`): one item per group,
 * or per node for a trace without groups, which has `showlegend` off by default.
 */
import { accessibleText, type TraceModule } from '@mk7s/holochart-runtime';
import { pieLayoutAttributes } from '@mk7s/holochart-traces-basic';
import { lazyA11y } from '../a11y-loader.ts';
import { chordAttributes } from './attributes.ts';
import { calcChord, type ChordCalc } from './calc.ts';
import { supplyChordDefaults, supplyChordLayoutDefaults } from './defaults.ts';
import { describeChord } from './describe.ts';
import { chordHoverPoints, hoverLabel, hoverModel, toHoverPoint } from './hover.ts';
import { chordLegendIcon, chordLegendItems } from './legend.ts';
import { chordRenderer } from './plot.ts';

export const chord: TraceModule<ChordCalc, typeof chordAttributes.children> = {
  type: 'chord',
  // `pie-like`: the legend has one item per group or node, so one chord with groups shows its
  // legend (core counts such a trace as two entries).
  categories: ['domain', 'noOpacity', 'showLegend', 'pie-like'],
  schema: chordAttributes,
  // `hiddenlabels` is the pies' own attribute (one list for every per-item legend).
  layoutSchema: /* @__PURE__ */ (() => ({ hiddenlabels: pieLayoutAttributes.hiddenlabels }))(),
  meta: {
    description:
      'Chord diagram: nodes as arcs of a ring sized by their flow and links as ribbons between them, from `node` / `link` or a square matrix; directed ribbons with arrowheads, groups with an outer ring, hover highlighting.',
    docsPage: 'chord',
  },
  supplyDefaults: supplyChordDefaults,
  supplyLayoutDefaults: supplyChordLayoutDefaults,
  calc: calcChord,
  plot: chordRenderer,
  hoverPoints: chordHoverPoints,
  legendIcon: chordLegendIcon,
  legendItems: chordLegendItems,
  a11y: /* @__PURE__ */ lazyA11y('chord', hoverModel, hoverLabel, toHoverPoint, accessibleText),
  describe: describeChord,
};

export { chordAttributes } from './attributes.ts';
export type { ChordCalc, ChordCalcLink } from './calc.ts';
export {
  chordLayout,
  matrixLinks,
  type ChordArc,
  type ChordGroupArc,
  type ChordLayout,
  type ChordLayoutInput,
  type ChordLayoutOptions,
  type ChordLinkSort,
  type ChordNodeSort,
  type ChordRibbon,
  type MatrixLinks,
} from './layout.ts';
