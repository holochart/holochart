/**
 * `pie` attribute schema (plan E9.11, ADR-002), following plotly.js' `traces/pie/attributes.js` and
 * `layout_attributes.js`. `domain` comes from the registry (the trace is in the `domain`
 * category); `name`, `opacity`, `hovertext`, `customdata`, … are common trace attributes.
 *
 * Deferred: `marker.pattern` (E8.10), `automargin` (outside labels pushing the margins),
 * `texttemplatefallback` / `hovertemplatefallback`, per-slice `showlegend` / `legend` /
 * `legendrank` arrays, and the font `variant` / `textcase` / `lineposition` / `shadow` fields.
 */
import { attr } from '@mk7s/holochart-core';

/** Font of slice labels and titles. `size` and `color` may be given per slice. */
function textFont(description: string) {
  return attr.object(
    {
      family: attr.string({
        noBlank: true,
        strict: true,
        editType: 'plot',
        description: 'CSS font-family list.',
      }),
      size: attr.number({
        min: 1,
        arrayOk: true,
        editType: 'plot',
        description: 'Font size in CSS px, or one per slice.',
      }),
      color: attr.color({
        arrayOk: true,
        editType: 'style',
        description: 'Text color, or one per slice.',
      }),
      weight: attr.integer({
        min: 1,
        max: 1000,
        extras: ['normal', 'bold'],
        editType: 'plot',
        description: 'Font weight: a CSS numeric weight (1–1000), `normal` or `bold`.',
      }),
      style: attr.enumerated({
        values: ['normal', 'italic'],
        editType: 'plot',
        description: 'Font style.',
      }),
    },
    { editType: 'plot', description },
  );
}

/** The pie schema. */
export const pieAttributes = attr.object(
  {
    labels: attr.dataArray({
      editType: 'calc',
      role: 'data',
      description:
        'Slice labels. Slices with the same label are merged: their `values` are summed (or occurrences counted without `values`), and other per-slice attributes use the first non-empty entry.',
    }),
    label0: attr.number({
      dflt: 0,
      editType: 'calc',
      description:
        'Without `labels`: numeric labels `label0 + i·dlabel` (only used when `values` is set).',
    }),
    dlabel: attr.number({
      dflt: 1,
      editType: 'calc',
      description: 'Label step, see `label0`.',
    }),
    values: attr.dataArray({
      editType: 'calc',
      role: 'data',
      description:
        'Slice values. Non-numeric entries are skipped; merged slices whose total is negative are dropped. Without `values` every label counts 1.',
    }),
    marker: attr.object(
      {
        colors: attr.dataArray({
          editType: 'calc',
          description:
            'Slice colors, one per data point. Unset slices take `layout.piecolorway` colors, shared by label across all pies of the figure.',
        }),
        line: attr.object(
          {
            color: attr.color({
              dflt: '#444',
              arrayOk: true,
              editType: 'style',
              description: 'Slice outline color, or one per slice.',
            }),
            width: attr.number({
              min: 0,
              dflt: 0,
              arrayOk: true,
              editType: 'style',
              description:
                'Slice outline width in CSS px (centered on the edge), or one per slice.',
            }),
          },
          { editType: 'calc', description: 'Slice outlines.' },
        ),
      },
      { editType: 'calc', description: 'Slice style.' },
    ),
    text: attr.dataArray({
      editType: 'plot',
      description:
        'Text per slice, shown on the slice with the `text` flag of `textinfo`, and in hover labels unless `hovertext` is set.',
    }),
    scalegroup: attr.string({
      dflt: '',
      editType: 'calc',
      description:
        'Pies with the same non-empty scale group are sized by their totals: their areas are proportional to the sums of their values.',
    }),
    textinfo: attr.flaglist({
      flags: ['label', 'text', 'value', 'percent'],
      extras: ['none'],
      editType: 'calc',
      description:
        "What slice labels show, in a fixed order (label, text, value, percent), one per line. Default `'percent'`, or `'text+percent'` when `text` is an array. Use `texttemplate` for other layouts.",
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
        'Template for slice labels, overriding `textinfo`: `%{label}`, `%{value}`, `%{percent}`, `%{text}`, `%{color}`, `%{customdata}`, `%{meta}`, with optional d3 formats (`%{percent:.1%}`). Without a format, `value` and `percent` are formatted like `textinfo`.',
    }),
    textposition: attr.enumerated({
      values: ['inside', 'outside', 'auto', 'none'],
      dflt: 'auto',
      arrayOk: true,
      editType: 'plot',
      description:
        'Where slice labels go: `inside` (shrunk to fit), `outside` (next to the slice, moved apart to avoid overlaps, with leader lines when moved), `auto` (inside when it fits unshrunk, else outside), `none`.',
    }),
    textfont: textFont('Font of slice labels. Defaults to `layout.font`.'),
    insidetextorientation: attr.enumerated({
      values: ['horizontal', 'radial', 'tangential', 'auto'],
      dflt: 'auto',
      editType: 'plot',
      description:
        'Orientation of inside labels: `horizontal`, `radial` (along the radius), `tangential` (across it), or `auto` (whichever is largest).',
    }),
    insidetextfont: textFont(
      'Font of labels inside slices. Defaults to `textfont`, with a color contrasting the slice.',
    ),
    outsidetextfont: textFont('Font of labels outside slices. Defaults to `textfont`.'),
    title: attr.object(
      {
        text: attr.string({
          dflt: '',
          editType: 'plot',
          description: 'Title of the pie. Empty: no title.',
        }),
        font: textFont('Title font. Defaults to `layout.font`.'),
        position: attr.enumerated({
          values: [
            'top left',
            'top center',
            'top right',
            'middle center',
            'bottom left',
            'bottom center',
            'bottom right',
          ],
          editType: 'plot',
          description:
            "Where the title goes. Default `'middle center'` (inside the hole) for donuts, else `'top center'`; `'middle center'` needs a `hole`.",
        }),
      },
      { editType: 'plot', description: 'The pie title.' },
    ),
    hole: attr.number({
      min: 0,
      max: 1,
      dflt: 0,
      editType: 'calc',
      description: 'Fraction of the radius cut out of the middle: a donut chart when > 0.',
    }),
    sort: attr.boolean({
      dflt: true,
      editType: 'calc',
      description: 'Order slices from largest to smallest.',
    }),
    direction: attr.enumerated({
      values: ['clockwise', 'counterclockwise'],
      dflt: 'counterclockwise',
      editType: 'calc',
      description:
        "Direction in which slices follow each other. The first slice always has an edge at the starting angle (12 o'clock for `rotation: 0`).",
    }),
    rotation: attr.angle({
      dflt: 0,
      editType: 'calc',
      description: "Starting angle in degrees, clockwise from 12 o'clock.",
    }),
    pull: attr.number({
      min: 0,
      max: 1,
      dflt: 0,
      arrayOk: true,
      editType: 'calc',
      description:
        'Fraction of the radius slices are pulled out from the center, one value for all slices or one per slice.',
    }),
  },
  { description: 'Pie or donut: slices of a circle proportional to their values.' },
);

/** Layout attributes owned by `pie` (coerced when a pie trace is present). */
export const pieLayoutAttributes = {
  hiddenlabels: attr.dataArray({
    editType: 'calc',
    description:
      "Labels of pie slices to hide (like `visible: 'legendonly'` for traces), across all pies. Legend clicks on pie items toggle it.",
  }),
  piecolorway: attr.colorlist({
    editType: 'calc',
    description:
      'Default slice colors. Defaults to `layout.colorway`; extended with lighter and darker copies when `extendpiecolors` is on.',
  }),
  extendpiecolors: attr.boolean({
    dflt: true,
    editType: 'calc',
    description:
      'Extend the slice colorway to three times its length: every color 20% lighter, then every color 20% darker. Colors from `marker.colors` are never extended.',
  }),
} as const;
