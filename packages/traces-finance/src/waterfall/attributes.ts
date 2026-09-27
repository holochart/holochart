/**
 * `waterfall` attribute schema (plan E12.4, ADR-002), following plotly.js'
 * `waterfall/attributes.js` and `layout_attributes.js`: bar's coordinates, labels, extent and
 * grouping, plus `measure`, a scalar `base`, the style of rising (`increasing`), falling
 * (`decreasing`) and sum (`totals`) bars, the connector lines, `textinfo` / `texttemplate` with
 * the initial, delta and final values, and `layout.waterfallmode` / `waterfallgap` /
 * `waterfallgroupgap`.
 *
 * Deferred: `xhoverformat` / `yhoverformat` (bar has neither yet), `texttemplatefallback`,
 * `hovertemplatefallback`, `marker.pattern`.
 */
import { attr } from '@mk7s/holochart-core';
import {
  barLikeAttributes,
  barLikeLayoutAttributes,
  connectorLine,
  hoverinfoAttribute,
} from '../bars/attributes.ts';

/** Plotly's default colors (`constants/delta.js`, `waterfall/defaults.js`). */
export const WATERFALL_COLORS = {
  increasing: '#3D9970',
  decreasing: '#FF4136',
  totals: '#4499FF',
} as const;

export type WaterfallDirection = keyof typeof WATERFALL_COLORS;

function direction(d: WaterfallDirection) {
  const what =
    d === 'totals'
      ? 'sum bars (`total` and `absolute` measures)'
      : `${d === 'increasing' ? 'rising' : 'falling'} bars (\`relative\` measures ${d === 'increasing' ? 'at or above' : 'below'} zero)`;
  return attr.object(
    {
      marker: attr.object(
        {
          color: attr.color({
            editType: 'style',
            description: `Fill color of ${what}. Default \`'${WATERFALL_COLORS[d]}'\`.`,
          }),
          line: attr.object(
            {
              color: attr.color({
                dflt: '#444',
                editType: 'style',
                description: `Outline color of ${what}.`,
              }),
              width: attr.number({
                min: 0,
                dflt: 0,
                editType: 'style',
                description: `Outline width in CSS px of ${what} (centered on the edge).`,
              }),
            },
            { editType: 'style', description: `Outline of ${what}.` },
          ),
        },
        { editType: 'style', description: `Style of ${what}.` },
      ),
    },
    { editType: 'style', description: `Style of ${what}.` },
  );
}

/** The waterfall schema. Common trace attributes (`name`, `opacity`, `xaxis`, …) come from core. */
// A pure IIFE, so bundles without this trace drop the whole schema (E21.6).
export const waterfallAttributes = /* @__PURE__ */ (() =>
  attr.object(
    {
      ...barLikeAttributes(),
      measure: attr.dataArray({
        editType: 'calc',
        description:
          "What each value is: `'relative'` (the default: a change added to the running total), `'total'` (a bar showing the running total; its own value is ignored) or `'absolute'` (a bar resetting the running total to its value). `'r'`, `'t'` and `'a'` work too.",
      }),
      base: attr.number({
        editType: 'calc',
        description:
          'Where the waterfall starts on the value axis (default 0): every bar is drawn relative to it.',
      }),
      orientation: attr.enumerated({
        values: ['v', 'h'],
        editType: 'calc',
        description:
          "`'v'`: vertical bars at `x` positions with `y` values; `'h'`: horizontal bars at `y` positions with `x` values. Defaults to `'h'` when only `x` is given.",
      }),
      texttemplate: attr.string({
        arrayOk: true,
        dflt: '',
        editType: 'plot',
        description:
          'Template for bar labels, overriding `textinfo` and `text`: `%{initial}`, `%{delta}` and `%{final}` (the running total before and after the bar, and its change), `%{label}` (position), `%{value}`, `%{x}`, `%{y}`, `%{text}`, `%{customdata}`, `%{meta}`, with optional d3 formats (`%{delta:+.1f}`).',
      }),
      textinfo: attr.flaglist({
        flags: ['label', 'text', 'initial', 'delta', 'final'],
        extras: ['none'],
        editType: 'plot',
        description:
          'What bar labels show, in a fixed order (label, text, initial, delta, final), one per line, formatted like the axes. Unset: `text`. Totals are computed per trace.',
      }),
      hoverinfo: hoverinfoAttribute(
        ['initial', 'delta', 'final'],
        'the running total before (`initial`) and after (`final`) the bar and its change (`delta`, with ▲ or ▼)',
      ),
      increasing: direction('increasing'),
      decreasing: direction('decreasing'),
      totals: direction('totals'),
      connector: attr.object(
        {
          line: connectorLine(2, 'connector lines'),
          mode: attr.enumerated({
            values: ['spanning', 'between'],
            dflt: 'between',
            editType: 'plot',
            description:
              "`'between'`: a line from each bar's end to the next bar; `'spanning'`: also across the bars' ends, so the line runs through the whole waterfall.",
          }),
          visible: attr.boolean({
            dflt: true,
            editType: 'plot',
            description: 'Draw the connector lines.',
          }),
        },
        { editType: 'plot', description: 'Lines connecting each bar to the next.' },
      ),
    },
    {
      description:
        'Waterfall: bars showing how a running total is built from positive and negative changes, with sum bars and connector lines.',
    },
  ))();

/** Layout attributes owned by `waterfall` (coerced when a waterfall trace is present). */
// A pure IIFE, so bundles without this trace drop the whole schema (E21.6).
export const waterfallLayoutAttributes = /* @__PURE__ */ (() => {
  const a = barLikeLayoutAttributes('waterfall', ['group', 'overlay'], 'group');
  return { waterfallmode: a.mode, waterfallgap: a.gap, waterfallgroupgap: a.groupgap } as const;
})();
