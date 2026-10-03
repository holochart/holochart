---
title: Waterfall
description: Show how a running total is built from positive and negative changes, with subtotal and total bars and connector lines between them.
status: complete
chart: waterfall
---

# Waterfall

## Overview

A waterfall chart shows how a starting value becomes a final one through a series of changes.
Each _relative_ bar floats: it starts where the previous bar ended and rises or falls by its own
value, so gains (green by default) and losses (red) read as steps up and down. _Sum_ bars (blue)
stand on the base and show the running total at that point: a subtotal, or the final result.
Thin connector lines join each bar's end to the next bar. Use it for profit and loss statements,
cash bridges, budget and headcount changes, or any "from A to B" story where the size of each
contribution matters.

Holochart lays waterfalls out like bars and draws them with bar's renderer: every bar of a trace
is one instanced GPU rect set, the connectors one line primitive and the labels one batched SDF
text set, so zooming or panning only updates a transform.

Pick a different chart when:

- the parts don't happen in an order and simply add up to a whole: use a
  [pie](/charts/basic/pie) or a stacked [bar chart](/charts/basic/bar);
- you follow how many items make it through the stages of a process: use a
  [funnel](/charts/financial/funnel);
- you show a price or a value over time rather than the changes that make up a total: use a
  [line chart](/charts/basic/line), or [OHLC](/charts/financial/ohlc) bars for prices.

## Minimal example

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'waterfall',
      x: ['Sales', 'Services', 'Costs', 'Taxes', 'Net'],
      y: [60, 20, -40, -10, null],
      measure: ['relative', 'relative', 'relative', 'relative', 'total'],
    },
  ],
});
```

The first four bars add their change to the running total (60, 80, 40, 30); the `total` bar
shows the result, 30, from the axis up. The live example is a full profit and loss statement with
two subtotals and `textinfo: 'delta'` labels outside the bars:

<Example id="waterfall/pnl" />

## Data format

- **Positions and values.** A vertical waterfall (the default) takes one position per bar in `x`
  (usually categories) and one change per bar in `y` (numbers; typed arrays work). With only `x`
  given, the waterfall is horizontal (`orientation: 'h'`): positions in `y`, values in `x`.
  Without positions, bars sit at `x0`, `x0 + dx`, … (defaults 0 and 1). The trace has as many
  bars as its shorter array.
- **`measure`.** What each value means, one entry per bar:
  - `'relative'` (the default, also `'r'`): a change added to the running total;
  - `'total'` (`'t'`): a sum bar showing the running total so far; its own value is ignored, so
    pass `null`;
  - `'absolute'` (`'a'`): a sum bar that resets the running total to its value, such as an
    opening balance.
- **`base`.** One number where the waterfall starts on the value axis (default 0): every bar is
  drawn relative to it, and sum bars stand on it.
- **Missing values.** A missing or non-numeric value (`null`, `NaN`) counts as 0 and breaks the
  connector lines on both sides of that bar. `total` and `absolute` bars always count as having a
  value.
- **Axes.** Category, linear, date and log axes work, and `xperiod` / `xperiod0` /
  `xperiodalignment` (`y…` for horizontal waterfalls) place bars within their periods, as for
  [bars](/fundamentals/dates-time-series#period-alignment).

## Variations

### Horizontal cash bridge

With only `x` values, or `orientation: 'h'`, the bars run along x, one per `y` stage. An
`absolute` bar sets the opening balance, and `textinfo: 'final'` labels each bar with the running
total after it. Here the stage axis is reversed (`yaxis.autorange: 'reversed'`) so the bridge reads
top to bottom:

<Example id="waterfall/horizontal" />

### Grouped waterfalls

Waterfall traces at the same positions sit side by side (`layout.waterfallmode: 'group'`, the
default; `'overlay'` draws them over each other). `waterfallgap` sets the gap between positions and
`waterfallgroupgap` the gap between the traces of one position. Each trace keeps its own running
total and connectors; here both start at a common `base`:

<Example id="waterfall/grouped" />

### Connector modes

`connector.mode: 'between'` (the default) draws a line from each bar's end across the gap to the
next bar. `'spanning'` also draws it across the bars at their ends, so one continuous line runs
through the whole waterfall. `connector.line` sets its color, width and dash:

<Example id="waterfall/connector-modes" />

### A bridge built from bars

When each step needs its own label font, hover text or legend entry, the same picture can be built
from ordinary [bar](/charts/basic/bar) traces: each change is a bar with a `base` at the running
total, and the traces share one `offsetgroup` so every bar takes the full slot. A waterfall trace
computes those bases for you:

<Example id="reports/budget-bridge" />

## Styling

- **Per direction.** `increasing.marker`, `decreasing.marker` and `totals.marker` style rising,
  falling and sum bars: `color` (Plotly's defaults `#3D9970`, `#FF4136` and `#4499FF`) and
  `line.color` / `line.width` for outlines (default 0 px: no outline).
- **Default look.** In the default `holochart` template, rising bars use the colorway's emerald
  (`#118e36`), falling bars its red (`#ea2a37`) and sum bars its blue (`#5e74d5`), with 1 px
  connectors in the tick-label gray (`#80838f`; Plotly: 2 px `#444`).
  `layout.template: 'plotly-classic'` gives Plotly's colors and widths
  ([themes and templates](/customization/themes-templates)).
- **Connectors.** `connector.visible` (default `true`), `connector.mode` (`'between'` or
  `'spanning'`) and `connector.line.color`, `.width` and `.dash` (Plotly's dash names or a px list
  such as `'5px,3px'`). Connectors draw over the bars and under the labels.
- **Labels.** `textinfo` picks what each bar says, in a fixed order, one per line: `label` (the
  position), `text`, `initial` (the running total before the bar), `delta` (its change) and
  `final` (the running total after it). Unset, bars show `text`. Values are formatted like the
  axes. `texttemplate` overrides it with `%{initial}`, `%{delta}`, `%{final}`, `%{label}`,
  `%{value}` (the running total, not counting `base`), `%{x}`, `%{y}`, `%{text}`, `%{customdata}` and `%{meta}`, with
  optional d3 formats (`%{delta:+.1f}`).
- **Label placement.** As for bars: `textposition` (`'auto'`, `'inside'`, `'outside'`, `'none'`),
  `insidetextanchor`, `textangle`, `constraintext`, and `textfont`, `insidetextfont` and
  `outsidetextfont`.
- **Extent and order.** `width` and `offset` (position-axis units), `offsetgroup` and
  `alignmentgroup` to line groups up across subplots, trace `opacity` and `zorder`.
- **Legend.** Each trace shows the directions side by side: rising, sums (when the trace has sum
  bars) and falling.

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'waterfall',
      x: ['Opening', 'Q1', 'Q2', 'Q3', 'Q4', 'Closing'],
      y: [120, 14, -6, 9, -4, null],
      measure: ['absolute', 'relative', 'relative', 'relative', 'relative', 'total'],
      texttemplate: '%{delta:+}',
      textposition: 'outside',
      increasing: { marker: { color: '#128b8b' } },
      decreasing: { marker: { color: '#cc540a' } },
      totals: { marker: { color: '#5e74d5', line: { color: '#eceef4', width: 1 } } },
      connector: { mode: 'spanning', line: { color: '#a4a7b5', width: 1, dash: 'dot' } },
    },
  ],
});
```

## Interactivity

- **Hover.** Hovering a bar shows its position and the running total after it, then, for relative
  bars, Plotly's extra lines: the change with ▲ or ▼ (a fall in parentheses, such as `(40) ▼`)
  and `Initial: …`, the total before the bar. The final value gets its own line only when the
  value is hidden from the label. `hoverinfo` picks the parts: `name`, `x`, `y`, `text`,
  `initial`, `delta` and `final`. The label takes the bar's direction color.
- **Templates.** `hovertemplate` takes `%{initial}`, `%{delta}` and `%{final}` besides `%{x}`,
  `%{y}`, `%{text}` and `%{customdata}`:

  ```ts
  import { createChart } from '@mk7s/holochart';

  createChart(document.getElementById('chart')!, {
    data: [
      {
        type: 'waterfall',
        x: ['Sales', 'Costs', 'Net'],
        y: [60, -40, null],
        measure: ['relative', 'relative', 'total'],
        hovertemplate: '%{x}: %{delta:+,.0f}<br>Running total %{final:,.0f}<extra></extra>',
      },
    ],
  });
  ```

- **Events.** `hover` and `click` points carry `x`, `y` (the running total), `initial`, `delta`,
  `final`, `curveNumber` and `pointNumber`.
- **Selection.** Box and lasso select bars as for [bar charts](/charts/basic/bar#interactivity);
  unselected bars dim.
- **Zoom, pan and legend.** Drag to zoom, double-click to reset; a legend click hides a trace and
  the other waterfalls of the position re-flow.

## 3D-native options

Holochart extensions (full bundle), see [Extrusion & 2.5D](/customization/extrusion-2-5d#funnels-and-waterfalls):

- `depth`: extrusion of the steps toward the viewer in px, a percentage of the bar width
  (`'60%'`), or one number per step. `0` (default) draws a flat waterfall.
- `bevel.size` and `bevel.segments`: rounded front and side edges.
- `material`: Plotly's lighting model (default), `flat`, or a three.js material type.
- `layout.view3d`: the plot area in perspective, with hover and click still exact on the steps.

The connector lines run along the front faces of the bar ends (both `between` and `spanning`),
and labels sit on the front faces.

<Example id="waterfall/depth" />

## Performance notes

- A waterfall draws in a constant number of draw calls whatever its bar count: one instanced rect
  set for the bars, one line primitive for the connectors and one batched SDF text set for the
  labels.
- Positions are uploaded once per data change; zoom and pan only update transforms.
- Restyling direction colors or outlines, and selections, re-upload colors only; connector colors
  and dashes restyle in place.
- Running totals and the layout of grouped waterfalls are computed on the CPU in the calc step,
  in linear time.
- Waterfalls are usually small: past a few dozen bars the steps get hard to read, so aggregate
  small changes into an "Other" bar.

## Accessibility notes

- **Screen readers:** the hidden description (see the [accessibility guide](/guides/accessibility))
  reads `Waterfall "name": N bars. Final value X.`; its table lists each bar's position, its change
  and the running total after it.
- **Keyboard:** Tab moves into the plot area; ← / → then step through the bars and ↑ / ↓ move to the
  trace above or below, each stop showing its hover label. See [the
  keys](/guides/accessibility#keys-in-the-plot-area).
- **Color:** rising and falling bars differ by color only, and green and red are hard to tell apart
  for many people. Labels with the signed change (`texttemplate: '%{delta:+}'`) carry the
  direction as text; colors that differ in lightness (teal and orange, as in the horizontal
  example) help too.

## Attribute reference

See the [waterfall attribute reference](/reference/waterfall) for every attribute, its type, and
its default. [`waterfallmode`](/reference/layout#waterfallmode),
[`waterfallgap`](/reference/layout#waterfallgap) and
[`waterfallgroupgap`](/reference/layout#waterfallgroupgap) are in the layout reference.

## Related charts

- [Bar](/charts/basic/bar): floating bars with `base` when a bridge needs per-bar traces
- [Funnel](/charts/financial/funnel): how many items make it through each stage of a process
- [OHLC](/charts/financial/ohlc) and [candlestick](/charts/financial/candlestick): prices over time
- [Pie](/charts/basic/pie): how a whole splits into parts, without an order

## Plotly migration notes

- Attribute names and defaults match Plotly's `waterfall`: `x`, `y`, `measure`, `base`,
  `orientation`, `increasing` / `decreasing` / `totals` (`marker.color`, `marker.line`),
  `connector` (`visible`, `mode`, `line`), `text`, `textinfo`, `texttemplate`, `textposition`,
  the label fonts, `insidetextanchor`, `textangle`, `constraintext`, `width`, `offset`,
  `offsetgroup`, `alignmentgroup`, `hoverinfo`, `hovertemplate`, `zorder`, and the layout's
  `waterfallmode`, `waterfallgap` and `waterfallgroupgap`. Waterfalls never share slots with bars
  or funnels, as in Plotly.
- The running totals, connector rules, label values and hover lines follow Plotly.
- In `between` mode Plotly lengthens bars by half the connector width so thick connectors stay
  flush with the bar ends; bars keep their exact size here.
- The legend glyph shows the directions as vertical bands (Plotly draws triangles).
- The default look uses the colorway's emerald, red and blue with 1 px gray connectors;
  `template: 'plotly-classic'` gives Plotly's colors.
- Not supported yet: `xhoverformat` / `yhoverformat` (bar has none either),
  `texttemplatefallback` / `hovertemplatefallback`, `marker.pattern`.
