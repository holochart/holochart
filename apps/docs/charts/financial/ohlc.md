---
title: OHLC
description: Show the open, high, low and close of each period as bars with open and close ticks, colored by the direction of the price.
status: complete
chart: ohlc
---

# OHLC

<ChartOverview />

## Overview

An OHLC chart shows four prices per period: a vertical line from the **low** to the **high**,
with the **open** as a tick on the left and the **close** as a tick on the right. Bars whose close
is above their open are _increasing_ (green by default), the others _decreasing_ (red). Use it for
prices of stocks, currencies or commodities per day, hour or minute, when the range of each
period matters as much as where it closed.

Holochart draws every bar as three line segments batched into one GPU line primitive per
direction: a trace is at most two draw calls however many bars it has, and zooming or panning
only updates a transform.

Pick a different chart when:

- you want the open–close move to stand out as a filled body: use a
  [candlestick chart](/charts/financial/candlestick), which takes the same data;
- you only have one price per period: use a [line chart](/charts/basic/line) on a date axis (see
  [dates & time series](/fundamentals/dates-time-series));
- you want to show how a total is built from gains and losses rather than prices over time: a
  [waterfall chart](/charts/financial/waterfall).

## Minimal example

The figure sketch below shows the essential data shape. Open **Complete source** on the live
example for a runnable module with setup, dependencies and cleanup.

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'ohlc',
      x: ['2024-01-02', '2024-01-03', '2024-01-04'],
      open: [101.2, 102.8, 101.9],
      high: [103.5, 103.1, 104.2],
      low: [100.4, 101.0, 101.5],
      close: [102.9, 101.7, 103.8],
    },
  ],
});
```

An OHLC trace gets a [range slider](/fundamentals/layout-axes-subplots#range-slider-and-range-selector)
under its x axis by default, as in Plotly: drag its window to pan, its ends to zoom. Set
`xaxis.rangeslider.visible: false` to remove it. The live example shows six months of daily bars:

<Example id="ohlc/basic" />

## Data format

- **`open`, `high`, `low`, `close`**: one price per bar, in y axis units (numbers; typed arrays
  work). All four are required: a trace missing one is not drawn. The trace has as many bars as
  its shortest price array (and `x`, when given).
- **`x`**: the position of each bar, usually dates (strings, `Date` objects or ms timestamps on a
  date axis), or numbers or categories. Without `x`, bars sit at 0, 1, 2, ….
- **Missing values.** A bar with any missing or non-numeric value (`null`, `NaN`, `''`) is not
  drawn and doesn't take part in hover; the others keep their places.
- **Direction.** A bar is increasing when its close is above its open and decreasing when below.
  A bar that closed where it opened compares its close with the previous bar's close and keeps the
  previous direction when that is unchanged too (the first bars count as increasing), as in
  Plotly.
- **Periods.** `xperiod` (ms, or `'M1'` for months on date axes), `xperiod0` and
  `xperiodalignment` (`'start'`, `'middle'`, `'end'`) place each bar within its period, as for
  [scatter and bar](/fundamentals/dates-time-series#period-alignment). Hover still shows the date
  given in `x`.
- **Axes.** Date, linear, log and category x axes work, and
  [range breaks](/fundamentals/layout-axes-subplots#range-breaks) hide weekends, nights and
  holidays (bars inside a break are not drawn).

## Variations

<ChartVariations />

### Colors, widths and ticks

`increasing.line` and `decreasing.line` style each direction (`color`, `width`, `dash`);
`line.width` and `line.dash` set both at once. `tickwidth` is the length of the open and close
ticks as a fraction of the spacing between bars (default 0.3, at most 0.5):

<ExampleLink id="ohlc/styled" />

### Monthly bars with period alignment

Bars that stand for a whole month, stamped with its first trading day, are centered in their
month with `xperiod: 'M1'`, so they line up with monthly ticks. The tick length follows the
shortest month:

<ExampleLink id="ohlc/monthly" />

### Range breaks and unified hover

`rangebreaks` remove weekends (`bounds: ['sat', 'mon']`) and holidays (`values`), so bars sit side
by side at an even spacing. With `hovermode: 'x unified'` one label lists the prices of every
trace at the date under the pointer:

<ExampleLink id="ohlc/range-breaks" />

### Moving averages and bands

Indicators are ordinary [scatter](/charts/basic/scatter) traces on the same axes: here a 20-day
moving average and Bollinger bands filled with `fill: 'tonexty'`. Scatter traces draw over
financial ones, as in Plotly:

<ExampleLink id="ohlc/indicators" />

## Styling

- **Per direction.** `increasing.line.color` (Plotly's default `#3D9970`),
  `decreasing.line.color` (`#FF4136`), and `.width` / `.dash` for each; they default to
  `line.width` (2 px) and `line.dash` (`'solid'`). Dashes use Plotly's names (`'dot'`, `'dash'`,
  `'longdash'`, `'dashdot'`, `'longdashdot'`) or a px list (`'5px,3px'`).
- **Default look.** In the default `holochart` template, rising bars use the colorway's emerald
  (`#118e36`) and falling bars its red (`#ea2a37`), at 1 px. `layout.template: 'plotly-classic'`
  gives Plotly's colors and widths ([themes and templates](/customization/themes-templates)).
- **Ticks.** `tickwidth` (fraction of the smallest spacing between bars, over every OHLC trace
  of the subplot).
- **Opacity and order.** Trace `opacity`; `zorder` (financial traces draw above bars and boxes and
  below scatter traces at equal `zorder`).
- **Legend.** Each trace shows Plotly's glyph: a falling and a rising bar side by side.

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'ohlc',
      x: ['2024-01-02', '2024-01-03', '2024-01-04'],
      open: [10, 12, 11],
      high: [13, 13, 14],
      low: [9, 10, 10],
      close: [12, 11, 13],
      tickwidth: 0.4,
      increasing: { line: { color: '#3fd0e0', width: 2 } },
      decreasing: { line: { color: '#ff2bd6', width: 2, dash: 'dot' } },
    },
  ],
});
```

## Interactivity

- **Hover.** Hovering a bar shows Plotly's label: the date, then `open`, `high`, `low` and
  `close`, with ▲ or ▼ after the close for the direction, beside the bar at the middle of its
  body. The x value leads the label in `closest` mode and sits in the axis label with
  `hovermode: 'x'`; unified labels read `name : open: …`. Prices are formatted like the y axis, or
  with `yhoverformat` (`'$.2f'`); dates with `xhoverformat`. `text` / `hovertext` add a line.
  In `closest` mode the pointer must be between the bar's low and high; along x, each bar hovers
  over half the spacing on each side.
- **Split labels.** `hoverlabel: { split: true }` shows one label per price at its height
  (equal prices share one), as in Plotly. `hovertemplate` is then ignored.
- **Templates.** `hovertemplate` takes `%{open}`, `%{high}`, `%{low}`, `%{close}` and `%{x}`, and
  two values Plotly doesn't have: `%{change}` (close − open) and `%{changepercent}` (the change
  as a percentage of the open):

  ```ts
  import { createChart } from '@mk7s/holochart';

  createChart(document.getElementById('chart')!, {
    data: [
      {
        type: 'ohlc',
        x: ['2024-01-02', '2024-01-03'],
        open: [10, 12],
        high: [13, 13],
        low: [9, 10],
        close: [12, 11],
        hovertemplate:
          '%{x|%b %d}<br>O %{open:.2f} H %{high:.2f} L %{low:.2f} C %{close:.2f}' +
          '<br>%{changepercent:+.2f}%<extra></extra>',
      },
    ],
  });
  ```

- **Events.** `hover` and `click` points carry `x`, `open`, `high`, `low`, `close` and
  `pointNumber`.
- **Range slider.** On by default under the x axis; its y axes are fixed, so a zoom box zooms x
  only (Plotly's behavior). Range selector buttons work as on any date axis.
- **Selection.** Box and lasso select the bars whose center (at the middle of the body) is
  inside; unselected bars fade to 30% opacity.

## Performance notes

- One instanced line primitive per direction holds every tick and range line: two draw calls
  whatever the bar count. Positions are uploaded once per data change; zoom and pan (also across
  range breaks) only set uniforms.
- Restyling colors, widths or dashes, and selections, re-upload colors only.
- Hover bisects the (usually sorted) positions: O(log n) per pointer move.
- Hundreds of thousands of bars stay interactive; at that density a
  [candlestick](/charts/financial/candlestick) or a line of closes reads better than 1 px ticks.

## Accessibility notes

- **Screen readers:** the hidden description (see the [accessibility guide](/guides/accessibility))
  gives the bar count and date span, the first and last close, the lowest low and highest high
  with their dates, and how many bars rose and fell; its table lists each bar's date and prices.
- **Keyboard:** Tab moves into the plot area; ← / → then step through the bars and ↑ / ↓ move to the
  trace above or below, each stop showing its hover label. See [the
  keys](/guides/accessibility#keys-in-the-plot-area).
- **Color:** the directions differ by color only, and green and red are hard to tell apart for
  many people. The open and close ticks still show the direction; for dashboards consider a
  second cue, such as dotted falling bars (`decreasing.line.dash`) or colors that differ in
  lightness (blue and orange).

## Attribute reference

See the [ohlc attribute reference](/reference/ohlc) for every attribute, its type, and its
default. The range slider is under
[`xaxis.rangeslider`](/reference/layout#xaxis.rangeslider) in the layout reference.

## Related charts

- [Candlestick](/charts/financial/candlestick): the same data as filled bodies with wicks
- [Dates & time series](/fundamentals/dates-time-series): range sliders, selectors, range breaks
  and unified hover for every trace type
- [Line](/charts/basic/line): one price per period
- [Bar](/charts/basic/bar): volume under a price chart (see the
  [candlestick recipe](/charts/financial/candlestick#volume-moving-averages-and-signals))

## Plotly migration notes

- Attribute names and defaults match Plotly's `ohlc`: `x`, `open`, `high`, `low`, `close`,
  `tickwidth`, `line`, `increasing`, `decreasing`, `text`, `hovertext`, `hovertemplate`,
  `hoverlabel.split`, `xperiod` / `xperiod0` / `xperiodalignment`, `xhoverformat`,
  `yhoverformat`, `zorder`. The direction rule, tick lengths (from the smallest spacing), hover
  slots and label text, and the default range slider follow Plotly.
- The smallest spacing is taken over the OHLC traces of a subplot (Plotly: of an x axis), and on
  range-break axes in trading time: bars next to a break keep their full width (Plotly narrows
  them).
- `%{change}` and `%{changepercent}` in `hovertemplate` are Holochart additions.
- The default look uses the colorway's green and red at 1 px; `template: 'plotly-classic'` gives
  Plotly's colors.
- Not supported yet: `xcalendar`.
