/**
 * `funnelarea` attribute schema (plan E12.6, ADR-002), following plotly.js'
 * `funnelarea/attributes.js` and `layout_attributes.js`: pie's labels, values, colors, text and
 * `scalegroup`, inside labels only, a title above the funnel, `aspectratio` and `baseratio`, and
 * `layout.funnelareacolorway` / `extendfunnelareacolors` (plus pie's `hiddenlabels`, shared with
 * pies). `marker.pattern` is the shared pattern fill (E8.10), as pie's. `domain` comes from the
 * registry (the trace is in the `domain` category).
 *
 * Deferred: `texttemplatefallback` / `hovertemplatefallback`, the extruded 3D pyramid (`depth` /
 * `shape`, P2).
 */
import { attr } from '@mk7s/holochart-core';
import {
  patternAttributes,
  pieAttributes,
  pieLayoutAttributes,
} from '@mk7s/holochart-traces-basic';

/** The funnelarea schema. @experimental */
// A pure IIFE, so bundles without this trace drop the whole schema (E21.6).
export const funnelareaAttributes = /* @__PURE__ */ (() => {
  const P = pieAttributes.children;
  return attr.object(
    {
      labels: P.labels,
      label0: P.label0,
      dlabel: P.dlabel,
      values: P.values,
      marker: attr.object(
        {
          colors: attr.dataArray({
            editType: 'calc',
            description:
              'Stage colors, one per data point. Unset stages take `layout.funnelareacolorway` colors, shared by label across all funnel areas of the figure.',
          }),
          line: attr.object(
            {
              color: attr.color({
                arrayOk: true,
                editType: 'style',
                description:
                  'Outline color of the stages, or one per stage. Default: `layout.paper_bgcolor`.',
              }),
              width: attr.number({
                min: 0,
                dflt: 1,
                arrayOk: true,
                editType: 'style',
                description: 'Outline width in CSS px (centered on the edge), or one per stage.',
              }),
            },
            { editType: 'calc', description: 'Stage outlines.' },
          ),
          pattern: patternAttributes('stage'),
        },
        { editType: 'calc', description: 'Stage style.' },
      ),
      text: P.text,
      scalegroup: attr.string({
        dflt: '',
        editType: 'calc',
        description:
          'Funnel areas with the same non-empty scale group are sized by their totals: their areas are proportional to the sums of their values.',
      }),
      textinfo: attr.flaglist({
        flags: ['label', 'text', 'value', 'percent'],
        extras: ['none'],
        editType: 'calc',
        description:
          "What stage labels show, in a fixed order (label, text, value, percent of the total), one per line. Default `'percent'`, or `'text+percent'` when `text` is an array. Use `texttemplate` for other layouts.",
      }),
      hoverinfo: attr.flaglist({
        flags: ['label', 'text', 'value', 'percent', 'name'],
        extras: ['all', 'none', 'skip'],
        arrayOk: true,
        editType: 'none',
        description:
          "Which fields hover labels show, in a fixed order; `'skip'` also turns hover events off for this trace. Default `'all'`.",
      }),
      texttemplate: attr.string({
        arrayOk: true,
        dflt: '',
        editType: 'plot',
        description:
          'Template for stage labels, overriding `textinfo`: `%{label}`, `%{value}`, `%{percent}`, `%{text}`, `%{color}`, `%{customdata}`, `%{meta}`, with optional d3 formats (`%{percent:.1%}`). Without a format, `value` and `percent` are formatted like `textinfo`.',
      }),
      textposition: attr.enumerated({
        values: ['inside', 'none'],
        dflt: 'inside',
        arrayOk: true,
        editType: 'plot',
        description:
          'Where stage labels go: `inside` (centered in the stage, shrunk to fit) or `none`.',
      }),
      textfont: P.textfont,
      insidetextfont: P.insidetextfont,
      title: attr.object(
        {
          text: P.title.children.text,
          font: P.title.children.font,
          position: attr.enumerated({
            values: ['top left', 'top center', 'top right'],
            dflt: 'top center',
            editType: 'plot',
            description: 'Where the title goes above the funnel.',
          }),
        },
        { editType: 'plot', description: 'The funnel area title.' },
      ),
      aspectratio: attr.number({
        min: 0,
        dflt: 1,
        editType: 'plot',
        description: 'Height of the funnel relative to its width.',
      }),
      baseratio: attr.number({
        min: 0,
        max: 1,
        dflt: 0.333,
        editType: 'plot',
        description: "Width of the funnel's narrow end relative to its wide end.",
      }),
    },
    {
      description:
        'Funnel area: stages of a process as stacked trapezoids with areas proportional to their values.',
    },
  );
})();

/**
 * Layout attributes owned by `funnelarea` (coerced when a funnelarea trace is present).
 * @internal
 */
// A pure IIFE, so bundles without this trace drop the whole schema (E21.6).
export const funnelareaLayoutAttributes = /* @__PURE__ */ (() =>
  ({
    hiddenlabels: pieLayoutAttributes.hiddenlabels,
    funnelareacolorway: attr.colorlist({
      editType: 'calc',
      description:
        'Default stage colors. Defaults to `layout.colorway`; extended with lighter and darker copies when `extendfunnelareacolors` is on.',
    }),
    extendfunnelareacolors: attr.boolean({
      dflt: true,
      editType: 'calc',
      description:
        'Extend the stage colorway to three times its length: every color 20% lighter, then every color 20% darker. Colors from `marker.colors` are never extended.',
    }),
  }) as const)();
