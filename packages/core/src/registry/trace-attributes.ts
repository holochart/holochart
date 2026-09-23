/** Attributes shared by every trace type, merged into each module's schema by the registry. */
import { attr } from '../schema/attr.ts';

/** Attributes every trace has. */
export const commonTraceAttributes = {
  type: attr.string({
    noBlank: true,
    strict: true,
    editType: 'calc',
    description: "Trace type, e.g. `'scatter'`. Defaults to `'scatter'`.",
  }),
  visible: attr.enumerated({
    values: [true, false, 'legendonly'],
    dflt: true,
    editType: 'calc',
    description:
      'Whether the trace is drawn. `legendonly` hides it but keeps its (toggleable) legend entry.',
  }),
  name: attr.string({
    editType: ['legend', 'plot'],
    description: 'Trace name shown in the legend and hover labels. Defaults to `trace N`.',
  }),
  uid: attr.string({
    editType: 'plot',
    description:
      'Stable identity used to match traces across updates, so reordered traces are moved instead of rebuilt.',
  }),
  showlegend: attr.boolean({
    dflt: true,
    editType: ['legend', 'layout'],
    description: 'Whether this trace has a legend entry.',
  }),
  legendgroup: attr.string({
    dflt: '',
    editType: 'legend',
    description: 'Traces in the same legend group toggle together.',
  }),
  opacity: attr.number({
    min: 0,
    max: 1,
    dflt: 1,
    editType: 'style',
    animatable: true,
    description: 'Opacity of the whole trace.',
  }),
  meta: attr.any({
    arrayOk: true,
    editType: 'plot',
    description: 'Arbitrary user data, available in text templates as `%{meta}`.',
  }),
  customdata: attr.dataArray({
    editType: 'calc',
    description: 'Per-point user data, returned in events and available in hover templates.',
  }),
  ids: attr.dataArray({
    editType: 'calc',
    description: 'Per-point ids used to match points across animation frames.',
  }),
  dataset: attr.string({
    noBlank: true,
    strict: true,
    editType: 'calc',
    description:
      "Name of a figure-level dataset (`figure.datasets`). Data arrays, and per-point attributes whose values cannot start with `@` (such as colors and sizes), may then reference its columns as `'@column'`; on string attributes such as `text`, `'@…'` stays literal text.",
  }),
  uirevision: attr.any({
    editType: 'none',
    description:
      'While unchanged, user interaction state for this trace (legend visibility, selections) is kept across updates.',
  }),
} as const;

/** Attributes added to traces in the `cartesian` category. */
export const cartesianTraceAttributes = {
  xaxis: attr.subplotId({
    dflt: 'x',
    editType: 'calc',
    description:
      "The x axis this trace is plotted against: `'x'` → `layout.xaxis`, `'x2'` → `layout.xaxis2`.",
  }),
  yaxis: attr.subplotId({
    dflt: 'y',
    editType: 'calc',
    description:
      "The y axis this trace is plotted against: `'y'` → `layout.yaxis`, `'y2'` → `layout.yaxis2`.",
  }),
} as const;
