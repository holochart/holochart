/**
 * `bar` attribute schema (plan E9.8, E9.9, ADR-002): the single source of truth for the trace's
 * types, validation, defaults, edit types and docs, following plotly.js' bar attributes.
 *
 * Error bars (`error_x` / `error_y`) come from the shared error-bar module (E9.7). Deferred:
 * `marker.pattern` (E8.10), period
 * alignment (`xperiod`…), `marker.colorbar` (E5.3: `showscale` is declared, the colorbar component
 * draws it).
 */
import { attr } from '@mk7s/holochart-core';
import { colorscaleAttributes } from '../shared/colorscale.ts';
import { errorBarAttributes } from '../shared/error-bars/index.ts';

const coordinate = (letter: 'x' | 'y') =>
  ({
    data: attr.dataArray({
      editType: 'calc',
      role: 'data',
      description: `${letter} coordinates: bar positions for ${letter === 'x' ? 'vertical' : 'horizontal'} bars, bar lengths otherwise. Numbers, dates or category names depending on the axis type.`,
    }),
    start: attr.any({
      dflt: 0,
      editType: 'calc',
      description: `Starting ${letter} coordinate when \`${letter}\` is not given: bar \`i\` is at \`${letter}0 + i·d${letter}\`.`,
    }),
    step: attr.number({
      dflt: 1,
      editType: 'calc',
      description: `Step between implicit ${letter} coordinates (see \`${letter}0\`).`,
    }),
  }) as const;

const X = /* @__PURE__ */ coordinate('x');
const Y = /* @__PURE__ */ coordinate('y');

/** Font of bar labels. `size` and `color` may be given per bar. */
function textFont(description: string) {
  return attr.object(
    {
      family: attr.string({
        noBlank: true,
        strict: true,
        editType: 'calc',
        description: 'CSS font-family list.',
      }),
      size: attr.number({
        min: 1,
        arrayOk: true,
        editType: 'calc',
        description: 'Font size in CSS px, or one per bar.',
      }),
      color: attr.color({
        arrayOk: true,
        editType: 'style',
        description: 'Text color, or one per bar.',
      }),
      weight: attr.integer({
        min: 1,
        max: 1000,
        extras: ['normal', 'bold'],
        editType: 'calc',
        description: 'Font weight: a CSS numeric weight (1–1000), `normal` or `bold`.',
      }),
      style: attr.enumerated({
        values: ['normal', 'italic'],
        editType: 'calc',
        description: 'Font style.',
      }),
    },
    { editType: 'calc', description },
  );
}

/** Style overrides for selected or unselected bars (E6.3). */
function selectionStyle(which: 'selected' | 'unselected') {
  const dim = which === 'unselected';
  return attr.object(
    {
      marker: attr.object(
        {
          color: attr.color({
            editType: 'style',
            description: `Fill color of ${which} bars.`,
          }),
          opacity: attr.number({
            min: 0,
            max: 1,
            editType: 'style',
            description: dim
              ? 'Opacity of unselected bars. Default: 0.2 × the bar opacity.'
              : 'Opacity of selected bars.',
          }),
        },
        { editType: 'style', description: `Marker style of ${which} bars.` },
      ),
      textfont: attr.object(
        {
          color: attr.color({
            editType: 'style',
            description: `Text color of ${which} bars.`,
          }),
        },
        { editType: 'style', description: `Text style of ${which} bars.` },
      ),
    },
    { editType: 'style', description: `Style of ${which} bars while a selection is active.` },
  );
}

/** The bar schema. Common trace attributes (`name`, `opacity`, `xaxis`, …) come from core. */
// A pure IIFE, so bundles without this trace drop the whole schema: a package ships as one file,
// where top-level `attr.*()` calls would otherwise look side-effectful (E21.6).
export const barAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      x: X.data,
      x0: X.start,
      dx: X.step,
      y: Y.data,
      y0: Y.start,
      dy: Y.step,
      orientation: attr.enumerated({
        values: ['v', 'h'],
        editType: 'calc',
        description:
          "`'v'`: vertical bars at `x` positions with `y` lengths; `'h'`: horizontal bars at `y` positions with `x` lengths. Defaults to `'h'` when only `x` is given.",
      }),
      base: attr.any({
        arrayOk: true,
        editType: 'calc',
        description:
          "Where bars start on the length axis (default 0), one value or one per bar, in that axis' data units. On a date axis the base is a date (a date string, a `Date` or ms since the epoch) and the lengths are durations in ms, so a bar spans `base` to `base + length` (Gantt charts); hover then reports the end, `base + length`. Set the axis `type: 'date'` explicitly: numeric lengths alone make it linear. On log axes, bars without a positive base start below the visible range.",
      }),
      width: attr.number({
        min: 0,
        arrayOk: true,
        editType: 'calc',
        description:
          'Bar width in position-axis units (category slots, or ms on date axes: `86400000` is one day), one value or one per bar. Default: the slot left by `layout.bargap` and the bar mode.',
      }),
      offset: attr.number({
        arrayOk: true,
        editType: 'calc',
        description:
          "Shift of the bar's leading edge from its position, in position-axis units, one value or one per bar. Default: centered in its (group) slot.",
      }),
      offsetgroup: attr.string({
        dflt: '',
        editType: 'calc',
        description:
          'Traces with the same offset group share one slot in `group` mode (and stack together in `stack`/`relative` modes); bars at the same position line up, also across subplots on the same position axis.',
      }),
      alignmentgroup: attr.string({
        dflt: '',
        editType: 'calc',
        description:
          'Traces on the same position axis with the same alignment group split each position between their offset groups; different alignment groups lay out independently.',
      }),
      text: attr.string({
        arrayOk: true,
        dflt: '',
        editType: 'calc',
        description: 'Text per bar, drawn per `textposition` and shown in hover labels.',
      }),
      texttemplate: attr.string({
        arrayOk: true,
        dflt: '',
        editType: 'calc',
        description:
          'Template for bar labels, overriding `text`: `%{value}` (bar length), `%{label}` (position), `%{x}`, `%{y}`, `%{text}`, `%{customdata}`, `%{meta}`, with optional d3 formats (`%{value:.1f}`) or date formats (`%{x|%b %Y}`).',
      }),
      textposition: attr.enumerated({
        values: ['inside', 'outside', 'auto', 'none'],
        dflt: 'auto',
        arrayOk: true,
        editType: 'calc',
        description:
          'Where bar labels go: `inside` (against the bar end, see `insidetextanchor`), `outside` (past the bar end; inner bars of a stack stay inside), `auto` (inside when it fits, else outside), `none`.',
      }),
      insidetextanchor: attr.enumerated({
        values: ['end', 'middle', 'start'],
        dflt: 'end',
        editType: 'plot',
        description: 'Where inside labels sit along the bar.',
      }),
      textangle: attr.angle({
        dflt: 'auto',
        extras: ['auto'],
        editType: 'plot',
        description:
          "Label rotation in degrees, clockwise. `'auto'` turns inside labels 90° when that fits the bar better.",
      }),
      textfont: textFont('Font of bar labels. Defaults to `layout.font`.'),
      insidetextfont: textFont(
        'Font of labels inside bars. Defaults to `textfont`, with a color contrasting the bar fill.',
      ),
      outsidetextfont: textFont('Font of labels outside bars. Defaults to `textfont`.'),
      constraintext: attr.enumerated({
        values: ['inside', 'outside', 'both', 'none'],
        dflt: 'both',
        editType: 'calc',
        description:
          'Shrink labels (inside, outside, or both) so they are no larger than their bar.',
      }),
      zorder: attr.integer({
        dflt: 0,
        editType: 'plot',
        description:
          'Stacking order among the traces of a subplot: higher is drawn on top. At equal `zorder`, bars draw below scatter traces (Plotly’s layer order), then in trace order.',
      }),
      cliponaxis: attr.boolean({
        dflt: true,
        editType: 'plot',
        description:
          'Clip labels to the plot area. `false` is not drawn yet: labels are always clipped to the subplot.',
      }),
      marker: attr.object(
        {
          color: attr.color({
            arrayOk: true,
            editType: 'style',
            animatable: true,
            description:
              'Bar fill color, one per bar, or numbers mapped through `colorscale`. Defaults to the colorway.',
          }),
          ...colorscaleAttributes({
            colorAttr: 'marker.color',
            showscale: true,
            coloraxis: true,
          }),
          opacity: attr.number({
            min: 0,
            max: 1,
            dflt: 1,
            arrayOk: true,
            editType: 'style',
            animatable: true,
            description: 'Bar opacity (multiplied by the trace `opacity`), or one per bar.',
          }),
          cornerradius: attr.any({
            editType: 'style',
            description:
              "Corner radius in CSS px, or a percentage of the bar width (`'30%'`). Default: `layout.barcornerradius`. In stacks only the outermost bar is rounded.",
          }),
          line: attr.object(
            {
              color: attr.color({
                arrayOk: true,
                editType: 'style',
                description:
                  'Bar outline color, one per bar, or numbers mapped through its `colorscale`.',
              }),
              ...colorscaleAttributes({
                colorAttr: 'marker.line.color',
                showscale: false,
                coloraxis: true,
              }),
              width: attr.number({
                min: 0,
                dflt: 0,
                arrayOk: true,
                editType: 'style',
                description: 'Bar outline width in CSS px (centered on the edge), or one per bar.',
              }),
            },
            { editType: 'style', description: 'Bar outline.' },
          ),
        },
        { editType: 'calc', description: 'Bar style.' },
      ),
      error_x: errorBarAttributes('x'),
      error_y: errorBarAttributes('y'),
      selected: selectionStyle('selected'),
      unselected: selectionStyle('unselected'),
    },
    { description: 'Bar: rectangles from a base to a value, vertical or horizontal.' },
  ))();

/** Layout attributes owned by `bar` (coerced when a bar trace is present). */
// A pure IIFE, so bundles without this trace drop the whole schema: a package ships as one file,
// where top-level `attr.*()` calls would otherwise look side-effectful (E21.6).
export const barLayoutAttributes = /* @__PURE__ */ (() =>
  ({
    barmode: attr.enumerated({
      values: ['group', 'stack', 'relative', 'overlay'],
      dflt: 'group',
      editType: 'calc',
      description:
        'How bars at the same position combine: side by side (`group`), stacked (`stack`), stacked with negative values below zero (`relative`), or drawn over each other (`overlay`).',
    }),
    barnorm: attr.enumerated({
      values: ['', 'fraction', 'percent'],
      dflt: '',
      editType: 'calc',
      description: "Normalize each position's total to 1 (`fraction`) or 100 (`percent`).",
    }),
    bargap: attr.number({
      min: 0,
      max: 1,
      dflt: 0.2,
      editType: 'calc',
      description: 'Gap between bars at neighboring positions, as a fraction of the position slot.',
    }),
    bargroupgap: attr.number({
      min: 0,
      max: 1,
      dflt: 0,
      editType: 'calc',
      description: 'Gap between bars of the same position, as a fraction of each bar’s share.',
    }),
    barcornerradius: attr.any({
      editType: 'style',
      description:
        "Default `marker.cornerradius` of bars: CSS px, or a percentage of the bar width (`'30%'`).",
    }),
  }) as const)();
