---
title: Working with dates & time series
description: Plot dates and times, format date axes, navigate long series, and draw millions of points.
status: complete
---

# Working with dates & time series

Time series are ordinary [scatter](/charts/basic/scatter) or [bar](/charts/basic/bar) traces
whose x values are dates. Holochart detects dates, builds a date axis with calendar-aware ticks,
and gives you the navigation aids of Plotly: a range slider, range selector buttons, range breaks
for closed markets, period alignment for monthly or weekly data, and unified hover. Long series
stay fast: dense lines are decimated per pixel column, and a pan or zoom only re-reads the points
in view.

## A basic time series

Give `x` as dates and the x axis becomes a date axis on its own (`xaxis.type: 'date'` forces it):

```ts
createChart(el, {
  data: [
    {
      type: 'scatter',
      mode: 'lines',
      x: ['2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04'],
      y: [1200, 1260, 1190, 1310],
    },
  ],
});
```

<Example id="line/basic" />

Accepted date values, per point:

- **ISO strings**: `'2025-03-01'`, `'2025-03-01 14:30'`, `'2025-03-01T14:30:05.250'`. Plotly's
  date strings, read as UTC.
- **`Date` objects**: their instant (`getTime()`), shown in UTC.
- **Numbers** on a date axis: milliseconds since 1970-01-01 UTC (`Date.UTC(…)`, `Date.now()`). A
  `Float64Array` of milliseconds is the fastest input for long series: nothing is parsed.

Dates have no time zone: an axis shows the UTC wall time of each value, as Plotly does
(`layout.timezone` is not supported). To show local times, shift the values before plotting.

Evenly spaced series can skip `x` entirely: `x0: '2025-01-01', dx: 86_400_000` puts point `i` at
`x0 + i·dx` (in milliseconds on a date axis).

## Date formatting

Date axes pick their tick spacing (years, months, days, hours down to milliseconds) and a label
format for it on their own. Change them with:

- [`tickformat`](/reference/layout#xaxis.tickformat): a d3-time-format string such as
  `'%b %Y'` (Mar 2025), `'%d %b'` (01 Mar), `'%H:%M'` or `'%Y-%m-%d'`. `%{x|…}` in a
  `hovertemplate` uses the same codes for the hover label.
- [`tickformatstops`](/reference/layout#xaxis.tickformatstops): a different format per zoom
  level, chosen by the tick spacing in milliseconds (`dtickrange`), so ticks read `2025`,
  `Mar 2025`, `01 Mar` or `14:00` as you zoom in.
- [`dtick`](/reference/layout#xaxis.dtick): a fixed step, in milliseconds or as `'M1'`, `'M3'`,
  `'M12'` for months; `tick0` sets where steps start.
- [`ticklabelmode: 'period'`](/reference/layout#xaxis.ticklabelmode): center each label in the
  period it names (a month label in the middle of its month) instead of on its first instant.
- [`hoverformat`](/reference/layout#xaxis.hoverformat): the date format of hover labels (and of
  the title of a unified hover label).

```ts
createChart(el, {
  data: [
    {
      type: 'scatter',
      mode: 'lines',
      x: ['2025-01-01', '2025-02-01', '2025-03-01', '2025-04-01'],
      y: [42, 47, 45, 51],
      hovertemplate: '%{x|%A %d %B %Y}<br>%{y} orders<extra></extra>',
    },
  ],
  layout: {
    xaxis: {
      ticklabelmode: 'period',
      tickformatstops: [
        { dtickrange: [null, 86_400_000], value: '%H:%M' },
        { dtickrange: [86_400_000, 'M1'], value: '%d %b' },
        { dtickrange: ['M1', 'M12'], value: '%b %Y' },
        { dtickrange: ['M12', null], value: '%Y' },
      ],
    },
  },
});
```

<Example id="timeseries/date-formatting" />

## Range slider and range selector

[`xaxis.rangeslider`](/reference/layout#xaxis.rangeslider) adds an overview of the whole series
under the axis, with a window over the range in view that you drag to pan and resize to zoom.
[`xaxis.rangeselector`](/reference/layout#xaxis.rangeselector) adds preset buttons (last month,
year to date, all). Both are described in detail under
[Layout, axes & subplots](/fundamentals/layout-axes-subplots#range-slider-and-range-selector).

```ts
createChart(el, {
  data: [{ type: 'scatter', mode: 'lines', x: ['2024-01-02', '2024-12-31'], y: [182, 239] }],
  layout: {
    xaxis: {
      rangeslider: {},
      rangeselector: {
        buttons: [
          { count: 1, label: '1m', step: 'month', stepmode: 'backward' },
          { count: 6, label: '6m', step: 'month', stepmode: 'backward' },
          { count: 1, label: 'YTD', step: 'year', stepmode: 'todate' },
          { step: 'all' },
        ],
      },
    },
  },
});
```

<Example id="timeseries/range-slider" />

## Range breaks

[`rangebreaks`](/reference/layout#xaxis.rangebreaks) hide weekends, nights and holidays, so a
trading chart has no flat stretches where the market was closed. Patterns use UTC days and hours.
See [Range breaks](/fundamentals/layout-axes-subplots#range-breaks) for every kind of break.

```ts
createChart(el, {
  data: [
    { type: 'scatter', mode: 'lines', x: ['2025-03-07 15:00', '2025-03-10 10:00'], y: [1, 2] },
  ],
  layout: {
    xaxis: {
      rangebreaks: [
        { bounds: ['sat', 'mon'] }, // weekends
        { bounds: [17, 9], pattern: 'hour' }, // 17:00 to 09:00
      ],
    },
  },
});
```

<Example id="timeseries/business-hours" />

## Period alignment

Values that stand for a whole period (a month's total, a week's average) are usually stamped with
the period's first day. [`xperiod`](/reference/scatter#xperiod) tells the trace how long a period
is (in milliseconds, or `'M1'` for a month, `'M3'` for a quarter, `'M12'` for a year) and
[`xperiodalignment`](/reference/scatter#xperiodalignment) where to draw each value in it:
`'start'`, `'middle'` or `'end'`. [`xperiod0`](/reference/scatter#xperiod0) sets where periods
start (for example a Monday for weeks). Hover still shows the value's own date. Bars take the
same attributes ([monthly bars](/charts/basic/bar#monthly-bars-with-periods)).

```ts
createChart(el, {
  data: [
    {
      type: 'scatter',
      x: ['2025-01-01', '2025-02-01', '2025-03-01'],
      y: [120, 135, 128],
      xperiod: 'M1',
      xperiodalignment: 'middle',
    },
  ],
  layout: { xaxis: { dtick: 'M1', ticklabelmode: 'period' } },
});
```

<Example id="timeseries/period-alignment" />

## Unified hover

With [`hovermode: 'x unified'`](/reference/layout#hovermode) one hover label lists every series
at the date under the pointer, with a vertical spike line through the plot. It suits several
series that share their dates, such as prices, sensor channels or KPIs.

```ts
createChart(el, {
  data: [
    { type: 'scatter', mode: 'lines', name: 'North', x: ['2025-01-01', '2025-01-02'], y: [3, 4] },
    { type: 'scatter', mode: 'lines', name: 'South', x: ['2025-01-01', '2025-01-02'], y: [2, 5] },
  ],
  layout: { hovermode: 'x unified' },
});
```

<Example id="timeseries/unified-hover" />

## Long and dense series

A line with more points than pixels is drawn through a min/max level of detail: per pixel column
only the first, lowest, highest and last point are kept, so the line looks the same as with every
point (each column keeps its full vertical extent and the points where the line enters and leaves
it) at a fraction of the vertices. For long lines (100,000 points or more) the columns come from a
multi-resolution pyramid built once per data set, and only the view plus one view width on each
side is uploaded: a pan or zoom re-reads a few thousand pyramid entries instead of the whole
series, so a decade of one-minute bars (2.6 million points) pans smoothly.

<Example id="timeseries/minute-bars" />

What to know:

- **It is automatic.** It applies to `mode: 'lines'` (and the line of `'lines+markers'`) when x
  increases along the data, with `line.shape` `'linear'` or one of the steps (`'hv'`, `'vh'`,
  `'hvh'`, `'vhv'`), on any axis type. Set [`line.simplify: false`](/reference/scatter#line.simplify)
  to draw every vertex (Plotly's attribute: it simplifies SVG paths there, and is on by default in
  both).
- **Only drawing is decimated.** Hover, click, selection, `fill` and markers use every point.
  Gaps (`null`, `NaN`) still break the line; `connectgaps` works as usual.
- **Some lines are drawn whole instead:** x not sorted (a line that goes back in x), dashed lines
  (the dash pattern would restart at the edge of the drawn window), stacked traces
  (`stackgroup`), and splines (`line.shape: 'spline'` is decimated over the whole trace, and
  rebuilt when the zoom changes by 2× or more).
- **Streaming works.** [`extendTraces`](/fundamentals/updating-charts) and `prependTraces` rebuild
  only the pyramid chunks at the edited ends.
- **Pass typed arrays.** A `Float64Array` of millisecond timestamps and one of values skip date
  parsing and copying.
- **Cost.** Building the pyramid of 2.6 million points takes about 50 ms, once per data set; a
  zoom step then costs 1–5 ms and a pan usually nothing (the drawn window is re-read only after
  panning a view width).
- The pyramid code is loaded on first use (a separate chunk of about 2 kB); until it arrives the
  line is decimated over the whole trace, and `chart.ready` waits for it.

See the [performance guide](/guides/performance) for other large-data techniques.

## Plotly differences

- `layout.timezone` is not supported (as in Plotly.js, dates are shown in UTC).
- Plotly's `line.simplify` removes nearly collinear SVG path points; Holochart uses it to switch
  min/max decimation, with the same default (`true`).
