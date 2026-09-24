/**
 * `violin` attribute schema (plan E10.5, ADR-002), following plotly.js' violin attributes. Samples,
 * points, markers and grouping come from the box builders (`box/attributes.ts`).
 */
import { attr } from '@mk7s/holochart-core';
import {
  groupingLayoutAttributes,
  layoutRoleAttributes,
  markerAttributes,
  outlineAttributes,
  pointAttributes,
  pointsModeAttribute,
  sampleAttributes,
  selectionAttributes,
  textAttributes,
} from '../box/attributes.ts';

/** The violin schema. Common trace attributes (`name`, `opacity`, `hovertemplate`, …) come from core. */
// A pure IIFE, so bundles without this trace drop the whole schema (E21.6).
export const violinAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      ...sampleAttributes('violin'),
      bandwidth: attr.number({
        min: 0,
        editType: 'calc',
        description:
          "Bandwidth of the Gaussian kernel density estimate, in value-axis units. Default: Silverman's rule, `1.059 · min(sd, IQR / 1.349) · n^(−1/5)` (at least 1% of the sample range).",
      }),
      scalegroup: attr.string({
        dflt: '',
        editType: 'calc',
        description:
          'Violins of traces with the same scale group are scaled together (by `scalemode`), so their widths compare. Default: the trace name, so each trace is scaled on its own. Violins scale together within a subplot.',
      }),
      scalemode: attr.enumerated({
        values: ['width', 'count'],
        dflt: 'width',
        editType: 'calc',
        description:
          "`'width'`: the widest violin of the scale group fills its slot; `'count'`: widths are also proportional to each violin's sample count.",
      }),
      spanmode: attr.enumerated({
        values: ['soft', 'hard', 'manual'],
        dflt: 'soft',
        editType: 'calc',
        description:
          'How far the density is drawn: `soft` two bandwidths past the extreme samples, `hard` exactly to them, `manual` over `span`. Default: `manual` when `span` is set.',
      }),
      span: attr.infoArray({
        items: [
          attr.any({ editType: 'calc', description: 'Start of the span (value-axis data).' }),
          attr.any({ editType: 'calc', description: 'End of the span (value-axis data).' }),
        ],
        editType: 'calc',
        description:
          "The value range of the density with `spanmode: 'manual'`; a missing end falls back to the `soft` end.",
      }),
      ...outlineAttributes('violin'),
      points: pointsModeAttribute('violin'),
      ...pointAttributes('violin'),
      ...layoutRoleAttributes('violin'),
      marker: markerAttributes(),
      ...textAttributes(),
      box: attr.object(
        {
          visible: attr.boolean({
            editType: 'plot',
            description:
              'Draw a box plot inside the violin. Default: true when any other `box` attribute is set.',
          }),
          width: attr.number({
            min: 0,
            max: 1,
            dflt: 0.25,
            editType: 'plot',
            description: 'Width of the inner box as a fraction of the violin width.',
          }),
          fillcolor: attr.color({
            editType: 'style',
            description: 'Fill of the inner box. Default: the violin `fillcolor`.',
          }),
          line: attr.object(
            {
              color: attr.color({
                editType: 'style',
                description: 'Outline color of the inner box. Default: `line.color`.',
              }),
              width: attr.number({
                min: 0,
                editType: 'style',
                description: 'Outline width (px) of the inner box. Default: `line.width`.',
              }),
            },
            { editType: 'style', description: 'Outline of the inner box.' },
          ),
        },
        { editType: 'plot', description: 'The box plot drawn inside the violin.' },
      ),
      meanline: attr.object(
        {
          visible: attr.boolean({
            editType: 'plot',
            description:
              'Draw a dashed line at the sample mean: across the inner box when it is shown, else across the violin. Default: true when `meanline.color` or `width` is set.',
          }),
          color: attr.color({
            editType: 'style',
            description: 'Mean line color. Default: `line.color`.',
          }),
          width: attr.number({
            min: 0,
            editType: 'style',
            description: 'Mean line width (px). Default: `line.width`.',
          }),
        },
        { editType: 'plot', description: 'The mean line.' },
      ),
      side: attr.enumerated({
        values: ['both', 'positive', 'negative'],
        dflt: 'both',
        editType: 'calc',
        description:
          'Which half of the violin is drawn: `both`, only the `positive` side (right of, or above, the position) or the `negative` one. Two traces at the same positions with opposite sides make split violins.',
      }),
      selected: selectionAttributes('selected'),
      unselected: selectionAttributes('unselected'),
      hoveron: attr.flaglist({
        flags: ['violins', 'points', 'kde'],
        extras: ['all'],
        dflt: 'violins+points+kde',
        editType: 'style',
        description:
          'What shows hover labels: the violins (one label per statistic), the points, and the density at the pointer (`kde`, a label on the violin edge; its value is relative to the scale group’s peak).',
      }),
    },
    {
      description:
        'Violin plot: a kernel density estimate of samples at each position, mirrored (or one-sided), with an optional inner box plot, mean line and points.',
    },
  ))();

/** Layout attributes owned by `violin` (coerced when a violin trace is present). */
export const violinLayoutAttributes = /* @__PURE__ */ (() => {
  const { mode, gap, groupgap } = groupingLayoutAttributes('violin');
  return { violinmode: mode, violingap: gap, violingroupgap: groupgap };
})();
