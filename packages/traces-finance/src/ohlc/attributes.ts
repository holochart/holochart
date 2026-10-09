/**
 * `ohlc` attribute schema (plan E12.2, ADR-002), following plotly.js' `ohlc/attributes.js`: the
 * prices, `x` with period alignment, the tick width, the line style of all bars and of rising
 * (`increasing`) and falling (`decreasing`) bars, hover formats and `hoverlabel.split`.
 */
import { attr } from '@mk7s/holochart-core';
import { directionColor, directionWidth, priceAttributes } from '../shared/attributes.ts';

function direction(d: 'increasing' | 'decreasing') {
  const which = d === 'increasing' ? 'rising' : 'falling';
  return attr.object(
    {
      line: attr.object(
        {
          color: directionColor(d, 'bars'),
          width: directionWidth(d, 'bars'),
          dash: attr.string({
            editType: 'style',
            description: `Dash style of ${which} bars (see \`line.dash\`). Default: \`line.dash\`.`,
          }),
        },
        { editType: 'style', description: `Line style of ${which} bars.` },
      ),
    },
    {
      editType: 'style',
      description: `Style of ${which} bars: bars whose close is ${d === 'increasing' ? 'above' : 'below'} their open (an unchanged bar compares its close with the previous close).`,
    },
  );
}

/**
 * The ohlc schema. Common trace attributes (`name`, `opacity`, `xaxis`, …) come from core.
 * @experimental
 */
// A pure IIFE, so bundles without this trace drop the whole schema (E21.6).
export const ohlcAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      ...priceAttributes('bar'),
      line: attr.object(
        {
          width: attr.number({
            min: 0,
            dflt: 2,
            editType: 'style',
            description:
              'Line width in CSS px of every bar. `increasing.line.width` and `decreasing.line.width` override it per direction.',
          }),
          dash: attr.string({
            dflt: 'solid',
            editType: 'style',
            description:
              "Dash style of every bar: `'solid'`, `'dot'`, `'dash'`, `'longdash'`, `'dashdot'`, `'longdashdot'`, or a dash list such as `'5px,10px,2px'`. `increasing.line.dash` and `decreasing.line.dash` override it per direction.",
          }),
        },
        { editType: 'style', description: 'Line style of every bar.' },
      ),
      increasing: direction('increasing'),
      decreasing: direction('decreasing'),
      tickwidth: attr.number({
        min: 0,
        max: 0.5,
        dflt: 0.3,
        editType: 'calc',
        description:
          'Length of the open (left) and close (right) ticks, as a fraction of the smallest x spacing between bars of the ohlc traces of the subplot.',
      }),
    },
    {
      description:
        'OHLC: the open, high, low and close of each period as a vertical line from low to high with an open tick on the left and a close tick on the right, colored by direction.',
    },
  ))();
