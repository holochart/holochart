/**
 * `funnel` attribute schema (plan E12.5, ADR-002), following plotly.js' `funnel/attributes.js`
 * and `layout_attributes.js`: bar's coordinates, labels, extent and grouping (labels centered by
 * default: `insidetextanchor: 'middle'`, `textangle: 0`), bar's marker without `cornerradius`,
 * `textinfo` / `texttemplate` with the three percentages, the connector regions and lines between
 * stages, and `layout.funnelmode` / `funnelgap` / `funnelgroupgap`.
 *
 * Deferred: `xhoverformat` / `yhoverformat` (bar has neither yet), `texttemplatefallback`,
 * `hovertemplatefallback`, `marker.pattern`.
 */
import { attr } from '@mk7s/holochart-core';
import { barAttributes } from '@mk7s/holochart-traces-basic';
import {
  barLikeAttributes,
  barLikeLayoutAttributes,
  connectorLine,
  hoverinfoAttribute,
} from '../bars/attributes.ts';

/**
 * The funnel schema. Common trace attributes (`name`, `opacity`, `xaxis`, …) come from core.
 * @experimental
 */
// A pure IIFE, so bundles without this trace drop the whole schema (E21.6).
export const funnelAttributes = /* @__PURE__ */ (() => {
  const B = barAttributes.children;
  // Bar's marker without `cornerradius` and `pattern` (Plotly's `funnelMarker`).
  const { cornerradius: _, ...rest } = B.marker.children;
  const marker = Object.fromEntries(
    Object.entries(rest).filter(([key]) => key !== 'pattern'),
  ) as Omit<typeof rest, 'pattern'>;
  return attr.object(
    {
      ...barLikeAttributes(),
      orientation: attr.enumerated({
        values: ['v', 'h'],
        editType: 'calc',
        description:
          "`'h'` (the default): horizontal bars, one per `y` stage, `x` long; `'v'`: vertical bars, one per `x` stage, `y` long (the default when only `y` is given). A horizontal funnel's stage axis is reversed (first stage on top) and its value axis hidden, unless another trace type uses them.",
      }),
      insidetextanchor: { ...B.insidetextanchor, dflt: 'middle' },
      textangle: { ...B.textangle, dflt: 0 },
      offset: attr.number({
        editType: 'calc',
        description:
          "Shift of the bars' leading edge from their position, in position-axis units. Default: centered in the (group) slot.",
      }),
      width: attr.number({
        min: 0,
        editType: 'calc',
        description:
          'Bar width in position-axis units. Default: the slot left by `layout.funnelgap` and the funnel mode.',
      }),
      texttemplate: attr.string({
        arrayOk: true,
        dflt: '',
        editType: 'plot',
        description:
          'Template for bar labels, overriding `textinfo`: `%{value}`, `%{percentInitial}`, `%{percentPrevious}`, `%{percentTotal}` (ratios, shown as percentages without a format), `%{label}` (stage), `%{x}`, `%{y}`, `%{text}`, `%{customdata}`, `%{meta}`, with optional d3 formats (`%{percentInitial:.1%}`).',
      }),
      textinfo: attr.flaglist({
        flags: ['label', 'text', 'percent initial', 'percent previous', 'percent total', 'value'],
        extras: ['none'],
        editType: 'plot',
        description:
          "What bar labels show, in a fixed order (label, text, value, then the percentages of the first stage, the previous stage and the trace's total), one per line. Default `'value'`, or `'text+value'` when `text` is an array. Percentages are computed per trace.",
      }),
      hoverinfo: hoverinfoAttribute(
        ['percent initial', 'percent previous', 'percent total'],
        "the value as a percentage of the first stage, of the previous stage and of the trace's total",
      ),
      marker: attr.object(marker, { editType: 'calc', description: 'Bar style.' }),
      connector: attr.object(
        {
          fillcolor: attr.color({
            editType: 'style',
            description:
              'Fill of the regions between stages. Default: `marker.color` at half its opacity (black at half opacity for per-bar colors).',
          }),
          line: connectorLine(0, 'lines along the edges of the connector regions'),
          visible: attr.boolean({
            dflt: true,
            editType: 'plot',
            description: 'Draw the connector regions and lines.',
          }),
        },
        { editType: 'plot', description: 'Regions connecting each stage to the next.' },
      ),
    },
    {
      description:
        'Funnel: stages of a process as bars centered on the value axis, with connector regions between them.',
    },
  );
})();

/** Layout attributes owned by `funnel` (coerced when a funnel trace is present). @internal */
// A pure IIFE, so bundles without this trace drop the whole schema (E21.6).
export const funnelLayoutAttributes = /* @__PURE__ */ (() => {
  const a = barLikeLayoutAttributes('funnel', ['stack', 'group', 'overlay'], 'stack');
  return { funnelmode: a.mode, funnelgap: a.gap, funnelgroupgap: a.groupgap } as const;
})();
