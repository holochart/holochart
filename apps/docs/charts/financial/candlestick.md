---
title: Candlestick
description: Show the open, high, low and close of each period as a body from open to close with wicks to the high and low, colored by direction.
status: complete
chart: candlestick
---

# Candlestick

## Overview

A candlestick chart shows four prices per period: a **body** from the open to the close and
**wicks** from the body to the high and the low. Candles whose close is above their open are
_increasing_ (green by default), the others _decreasing_ (red); bodies are filled with their
line color at half opacity. Use it for daily or intraday prices when the move within each period
(how far it ran, where it closed) is the story.

Holochart draws a candlestick trace in **two draw calls whatever its size**: every body is one
instance of a GPU rect set (fill and outline per candle), and every wick is one segment of a
batched line primitive. Positions are uploaded once, so zooming and panning a hundred thousand
candles only updates a transform.

Pick a different chart when:

- you want thin bars that show the open and close as ticks: use an [OHLC chart](/charts/financial/ohlc),
  which takes the same data;
- you have one price per period: use a [line chart](/charts/basic/line) on a date axis;
- you want the distribution of many samples per period rather than four prices: use a
  [box plot](/charts/statistical/box).

## Minimal example

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'candlestick',
      x: ['2024-01-02', '2024-01-03', '2024-01-04'],
      open: [101.2, 102.8, 101.9],
      high: [103.5, 103.1, 104.2],
      low: [100.4, 101.0, 101.5],
      close: [102.9, 101.7, 103.8],
    },
  ],
});
```

A candlestick trace gets a [range slider](/fundamentals/layout-axes-subplots#range-slider-and-range-selector)
under its x axis by default, as in Plotly; `xaxis.rangeslider.visible: false` removes it. The live
example shows three months of daily candles:

<Example id="candlestick/basic" />

## Data format

- **`open`, `high`, `low`, `close`**: one price per candle, in y axis units (numbers; typed
  arrays work). All four are required: a trace missing one is not drawn. The trace has as many
  candles as its shortest price array (and `x`, when given).
- **`x`**: the position of each candle, usually dates (strings, `Date` objects or ms timestamps
  on a date axis), or numbers or categories. Without `x`, candles sit at 0, 1, 2, ….
- **Missing values.** A candle with any missing or non-numeric value is not drawn and doesn't
  take part in hover.
- **Direction.** A candle is increasing when its close is above its open and decreasing when
  below; a candle that closed where it opened (a flat body, drawn as a line across the candle)
  compares its close with the previous close, as in Plotly.
- **Width.** Candles are sized from the smallest spacing between the positions of all
  candlestick traces on the subplot: half of it is a position's slot, and a candle is
  `(1 − boxgap) × (1 − boxgroupgap)` of the slot wide (49% of the spacing with the defaults, 0.3
  each). On category axes the spacing is one category.
- **Periods.** `xperiod`, `xperiod0` and `xperiodalignment` place each candle within its period, as
  for [scatter and bar](/fundamentals/dates-time-series#period-alignment).
- **Axes.** Date, linear, log and category x axes work, with
  [range breaks](/fundamentals/layout-axes-subplots#range-breaks) for weekends, nights and
  holidays.

## Variations

### Range breaks and range selector

A year of daily candles on a trading calendar: `rangebreaks` hide weekends and holidays, so the
candles sit side by side at an even width, and range selector buttons jump to the last month,
three months, the year to date or everything:

<Example id="candlestick/range-breaks" :height="440" />

### Fills, outlines and whisker caps

`increasing.fillcolor` and `decreasing.fillcolor` fill the bodies (a transparent fill gives
hollow candles), `increasing.line` and `decreasing.line` set the outline and wick color and
width, `whiskerwidth` adds caps to the wicks (a fraction of the candle width) and a smaller
`layout.boxgap` makes candles wider:

<Example id="candlestick/styled" />

### Intraday candles with overnight breaks

Fifteen-minute candles over three sessions, with the nights (`pattern: 'hour'`) and the weekend
hidden. Candles keep their width across the breaks; `hovermode: 'x'` puts the time on the axis
and the prices beside the candle:

<Example id="candlestick/intraday" :height="420" />

### Volume, moving averages and signals

A trading chart recipe: candlesticks with 20- and 50-day moving averages (scatter lines), buy and
sell markers where they cross, and a volume subplot sharing the x axis (`xaxis.anchor: 'y2'` with
two y domains). The range breaks apply to both subplots, since they share the axis:

<Example id="recipes/candlestick-volume" :height="520" />

## Styling

- **Per direction.** `increasing.line.color` (Plotly's default `#3D9970`),
  `decreasing.line.color` (`#FF4136`), `.line.width` (default `line.width`, 2 px) and
  `.fillcolor` (default: the line color at half opacity). The outline is centered on the body's
  edge, like Plotly's stroke.
- **Default look.** In the default `holochart` template, rising candles use the colorway's
  emerald (`#118e36`) and falling candles its red (`#ea2a37`), with 1 px outlines and wicks and
  half-opacity bodies. `layout.template: 'plotly-classic'` gives Plotly's colors
  ([themes and templates](/customization/themes-templates)).
- **Width and grouping.** `layout.boxgap` and `layout.boxgroupgap` (0.3 each) size the candles;
  `layout.boxmode: 'group'` puts the candlestick traces of a subplot side by side in each slot
  (comparing two assets), `'overlay'` (the default) draws them over each other.
- **Wick caps.** `whiskerwidth` (0 to 1 of the candle width; default 0, no caps).
- **Opacity and order.** Trace `opacity`; `zorder`.
- **Legend.** Each trace shows a falling and a rising candle side by side.

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'candlestick',
      x: ['2024-01-02', '2024-01-03', '2024-01-04'],
      open: [10, 12, 11],
      high: [13, 13, 14],
      low: [9, 10, 10],
      close: [12, 11, 13],
      whiskerwidth: 0.3,
      increasing: { line: { color: '#6fe3ff' }, fillcolor: 'rgba(0, 0, 0, 0)' },
      decreasing: { line: { color: '#ff9e00' }, fillcolor: '#ff9e00' },
    },
  ],
  layout: { boxgap: 0.15 },
});
```

## Interactivity

- **Hover.** Hovering a candle shows Plotly's label: the date, then `open`, `high`, `low` and
  `close` with ▲ or ▼ for the direction, beside the candle at the middle of its body. With
  `hovermode: 'x'` the date goes in the axis label; unified labels (`'x unified'`) read
  `name : open: …`. `yhoverformat` / `xhoverformat` format the values, `text` / `hovertext` add a
  line, and `hoverlabel: { split: true }` shows one label per price at its height. In `closest`
  mode the pointer must be between the low and the high; along x, a candle hovers over its slot.
- **Templates.** `hovertemplate` takes `%{open}`, `%{high}`, `%{low}`, `%{close}` and `%{x}`, plus
  `%{change}` (close − open) and `%{changepercent}` (the change as a percentage of the open), which
  Plotly doesn't have:

  ```ts
  import { createChart } from '@mk7s/holochart';

  createChart(document.getElementById('chart')!, {
    data: [
      {
        type: 'candlestick',
        x: ['2024-01-02', '2024-01-03'],
        open: [10, 12],
        high: [13, 13],
        low: [9, 10],
        close: [12, 11],
        hovertemplate: '%{x|%b %d}: %{close:$.2f} (%{changepercent:+.1f}%)<extra></extra>',
      },
    ],
  });
  ```

- **Events.** `hover` and `click` points carry `x`, `open`, `high`, `low`, `close` and
  `pointNumber`:

  ```ts
  chart.on('click', (e) => console.log(e.points[0]?.x, e.points[0]?.close));
  ```

- **Range slider and zoom.** The default range slider shows a thumbnail of every candle; drag its
  window to pan, its ends to zoom. Its y axes are fixed (Plotly), so a zoom box zooms x only.
- **Selection.** Box and lasso select the candles whose center (at the middle of the body) is
  inside; the others fade to 30% opacity.

## Performance notes

- Two draw calls per trace whatever the candle count: one instanced rect set for the bodies and
  one instanced line batch for the wicks, caps and flat bodies. The `candlestick/large` example in
  the sandbox draws 100,000 one-minute candles on a range-break axis and measures the first draw,
  pan and zoom.
- Zoom and pan (also across range breaks) only set uniforms; restyles and selections re-upload
  colors and widths, not positions.
- Hover bisects the (usually sorted) positions: O(log n) per pointer move.
- The range slider thumbnail is a second view of the same trace (two more draw calls).

## Accessibility notes

- **Screen readers:** the hidden description (see the [accessibility guide](/guides/accessibility))
  gives the candle count and date span, the first and last close, the lowest low and highest high
  with their dates, and how many candles rose and fell; its table lists each candle's date and
  prices.
- **Keyboard:** Tab moves into the plot area; ← / → then step through the candles and ↑ / ↓ move to
  the trace above or below, each stop showing its hover label. See [the
  keys](/guides/accessibility#keys-in-the-plot-area).
- **Color:** the directions differ by color, and green and red are hard to tell apart for many
  people. Hollow rising and filled falling candles (as in the styled example) add a second cue
  that doesn't rely on hue.

## Attribute reference

See the [candlestick attribute reference](/reference/candlestick) for every attribute, its type,
and its default. `boxmode`, `boxgap` and `boxgroupgap` are in the [layout reference](/reference/layout).

## Related charts

- [OHLC](/charts/financial/ohlc): the same data as bars with open and close ticks
- [Dates & time series](/fundamentals/dates-time-series): range sliders, selectors, range breaks
  and unified hover
- [Bar](/charts/basic/bar): volume bars on a subplot under the prices
- [Box](/charts/statistical/box): distributions per position, drawn like candles

## Plotly migration notes

- Attribute names and defaults match Plotly's `candlestick`: `x`, `open`, `high`, `low`, `close`,
  `whiskerwidth`, `line.width`, `increasing` / `decreasing` (`line.color`, `line.width`,
  `fillcolor`), `text`, `hovertext`, `hovertemplate`, `hoverlabel.split`, `xperiod` / `xperiod0` /
  `xperiodalignment`, `xhoverformat`, `yhoverformat`, `zorder`, and the layout's `boxmode`,
  `boxgap` and `boxgroupgap`. Candle widths, the direction rule, hover slots and label text and the
  default range slider follow Plotly.
- In `boxmode: 'group'`, candles group with the other candlestick traces only (Plotly also groups
  them with box traces).
- On range-break axes, candles next to a break keep their full width (Plotly narrows them), and
  the spacing that sizes them is measured in trading time.
- A flat body (open = close) is drawn as a line across the candle, as Plotly's stroke shows it;
  Plotly's median line (at the close, just inside the body) is not drawn.
- `%{change}` and `%{changepercent}` in `hovertemplate` are Holochart additions.
- Not supported yet: `xcalendar`, extruded 3D candles (`depth`, planned).
