/**
 * Attributes shared by `ohlc` and `candlestick` (plan E12.2, E12.3; plotly.js `ohlc/attributes.js`,
 * which candlestick reuses): the price arrays, `x` with period alignment (as scatter and bar,
 * E3.5), hover formats, `text`, `hoverlabel.split` and `zorder`.
 */
import { attr, commonTraceAttributes } from '@mk7s/holochart-core';

/** Plotly's default colors of rising and falling prices (`constants/delta.js`). */
export const INCREASING_COLOR = '#3D9970';
export const DECREASING_COLOR = '#FF4136';

const price = (which: 'open' | 'high' | 'low' | 'close') =>
  attr.dataArray({
    editType: 'calc',
    role: 'data',
    description: `The ${which} price of each period, in y-axis data units.`,
  });

/** Data, hover and ordering attributes of both financial trace types. */
export function priceAttributes(kind: 'bar' | 'candle') {
  return {
    x: attr.dataArray({
      editType: 'calc',
      role: 'data',
      description: `x coordinate of each ${kind} (usually dates). Default: 0, 1, 2, …`,
    }),
    open: price('open'),
    high: price('high'),
    low: price('low'),
    close: price('close'),
    // Same texts as scatter's and bar's (the strings compress together in bundles).
    xperiod: attr.any({
      editType: 'calc',
      description:
        "Only on date or linear x axes: snap each x value to its period of this length (ms, or `'M<n>'` months on date axes), positioned per `xperiodalignment`.",
    }),
    xperiod0: attr.any({
      editType: 'calc',
      description:
        'A period boundary for `xperiod`. Default: 2000-01-01 on date axes (a Sunday for weekly periods), 0 otherwise.',
    }),
    xperiodalignment: attr.enumerated({
      values: ['start', 'middle', 'end'],
      dflt: 'middle',
      editType: 'calc',
      description: 'Where points sit within their `xperiod`.',
    }),
    xhoverformat: attr.string({
      dflt: '',
      editType: 'none',
      description:
        'd3 number or date format of x values in hover labels. Default: the axis format.',
    }),
    yhoverformat: attr.string({
      dflt: '',
      editType: 'none',
      description:
        'd3 number or date format of the prices in hover labels. Default: the y axis format.',
    }),
    text: attr.string({
      dflt: '',
      arrayOk: true,
      editType: 'calc',
      description: `Hover text: one string for every ${kind}, or one per ${kind}. \`hovertext\` wins.`,
    }),
    hoverlabel: attr.object(
      {
        ...commonTraceAttributes.hoverlabel.children,
        split: attr.boolean({
          dflt: false,
          editType: 'style',
          description:
            'Show the open, high, low and close in separate labels, each at its price, instead of one label. `hovertemplate` is then ignored.',
        }),
      },
      {
        editType: 'none',
        description:
          'Hover label style for this trace. Unset fields fall back to `layout.hoverlabel` (so there are no trace-level defaults).',
      },
    ),
    zorder: attr.integer({
      dflt: 0,
      editType: 'plot',
      description:
        'Stacking order among the traces of a subplot: higher is drawn on top. At equal `zorder`, financial traces draw above bars and boxes and below scatter traces (Plotly’s layer order), then in trace order.',
    }),
  } as const;
}

/** A direction's line color, with Plotly's default for rising or falling prices. */
export function directionColor(direction: 'increasing' | 'decreasing', what: string) {
  return attr.color({
    dflt: direction === 'increasing' ? INCREASING_COLOR : DECREASING_COLOR,
    editType: 'style',
    description: `Line color of ${direction === 'increasing' ? 'rising' : 'falling'} ${what}.`,
  });
}

/** A direction's line width, defaulting to `line.width`. */
export function directionWidth(direction: 'increasing' | 'decreasing', what: string) {
  return attr.number({
    min: 0,
    editType: 'style',
    description: `Line width in CSS px of ${direction === 'increasing' ? 'rising' : 'falling'} ${what}. Default: \`line.width\`.`,
  });
}
