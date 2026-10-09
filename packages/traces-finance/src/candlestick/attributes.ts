/**
 * `candlestick` attribute schema (plan E12.3, ADR-002), following plotly.js'
 * `candlestick/attributes.js`: the prices, `x` with period alignment, the whisker caps, the
 * outline width of all candles and the outline and body fill of rising (`increasing`) and falling
 * (`decreasing`) candles, hover formats and `hoverlabel.split`; and the `boxmode`, `boxgap` and
 * `boxgroupgap` layout attributes candles share with box plots (Plotly's candlestick layout
 * attributes are box's).
 */
import { attr } from '@mk7s/holochart-core';
import { directionColor, directionWidth, priceAttributes } from '../shared/attributes.ts';

function direction(d: 'increasing' | 'decreasing') {
  const which = d === 'increasing' ? 'rising' : 'falling';
  return attr.object(
    {
      line: attr.object(
        {
          color: directionColor(d, 'candles (outline and wicks)'),
          width: directionWidth(d, 'candles'),
        },
        { editType: 'style', description: `Outline and wick style of ${which} candles.` },
      ),
      fillcolor: attr.color({
        editType: 'style',
        description: `Body fill of ${which} candles. Default: their line color at half opacity.`,
      }),
    },
    {
      editType: 'style',
      description: `Style of ${which} candles: candles whose close is ${d === 'increasing' ? 'above' : 'below'} their open (an unchanged candle compares its close with the previous close).`,
    },
  );
}

/**
 * The candlestick schema. Common trace attributes (`name`, `opacity`, `xaxis`, …) come from core.
 * @experimental
 */
// A pure IIFE, so bundles without this trace drop the whole schema (E21.6).
export const candlestickAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      ...priceAttributes('candle'),
      line: attr.object(
        {
          width: attr.number({
            min: 0,
            dflt: 2,
            editType: 'style',
            description:
              'Outline and wick width in CSS px of every candle. `increasing.line.width` and `decreasing.line.width` override it per direction.',
          }),
        },
        { editType: 'style', description: 'Outline and wick style of every candle.' },
      ),
      increasing: direction('increasing'),
      decreasing: direction('decreasing'),
      whiskerwidth: attr.number({
        min: 0,
        max: 1,
        dflt: 0,
        editType: 'calc',
        description:
          'Width of caps at the ends of the wicks, as a fraction of the candle width (0: no caps).',
      }),
    },
    {
      description:
        'Candlestick: the open, high, low and close of each period as a body from open to close with wicks to the high and low, colored by direction.',
    },
  ))();

/**
 * Layout attributes owned by `candlestick`, the same as box's (coerced when a candlestick trace is
 * present). Candles group with the other candlestick traces of a subplot.
 * @internal
 */
// A pure IIFE, so bundles without this trace drop the whole schema (E21.6).
export const candlestickLayoutAttributes = /* @__PURE__ */ (() =>
  ({
    // The same nodes as box's `boxLayoutAttributes` (whichever module registers last declares
    // them), so the layout schema is the same with either.
    boxmode: attr.enumerated({
      values: ['group', 'overlay'],
      dflt: 'overlay',
      editType: 'calc',
      description:
        'How boxes of different traces at the same position combine: side by side (`group`) or drawn over each other (`overlay`).',
    }),
    boxgap: attr.number({
      min: 0,
      max: 1,
      dflt: 0.3,
      editType: 'calc',
      description:
        'Gap between boxes at neighboring positions, as a fraction of the position slot.',
    }),
    boxgroupgap: attr.number({
      min: 0,
      max: 1,
      dflt: 0.3,
      editType: 'calc',
      description:
        "Gap between the boxes of one position in `group` mode, as a fraction of each one's share.",
    }),
  }) as const)();
