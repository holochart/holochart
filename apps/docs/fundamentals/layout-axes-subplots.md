---
title: Layout, axes & subplots
description: Configure axes, place multiple subplots, and control figure size and margins.
status: complete
---

# Layout, axes & subplots

`layout` holds everything in a figure that is not a trace: the figure size and margins, the title,
the axes and the subplots they form, and the legend. This page covers those. Every attribute is
listed in the [layout reference](/reference/layout).

Other parts of `layout` have pages of their own: [3D scenes](/fundamentals/3d-scenes),
[shapes and images](/fundamentals/shapes-images),
[buttons, dropdowns and sliders](/fundamentals/controls),
[hover](/fundamentals/hover-text-templates) and [themes](/fundamentals/styling-themes).

The defaults quoted on this page are the attribute defaults, which match Plotly's. A chart without
`layout.template` uses the [default look](/fundamentals/styling-themes#the-default-look), a
template that sets some of them differently. Those are noted where they matter.

## Figure size and margins

[`width`](/reference/layout#width) and [`height`](/reference/layout#height) set the figure size in
px. A dimension that `layout` does not set takes the size of the chart's element, or 700 × 450 px
when the element has no size: see [Size](/fundamentals/configuration#size).

[`margin`](/reference/layout#margin) is the space around the plot area, where axis labels, the
title and the legend go:

- `l`, `r`, `t`, `b`: the four margins in px. The defaults are 80, 80, 100 and 80; the default
  look uses 40, 16, 16 and 32.
- `pad`: px between the plot area and the axis lines (default 0).
- `autoexpand` (default `true`): lets the legend, colorbars, the range slider and axes with
  `automargin` grow the margins. With `false`, the margins are exactly `l`, `r`, `t` and `b`.
- `gutter`: px kept between the figure edge and whatever grew a margin (default 0; 4 in the
  default look). Plotly has no `gutter`.

An axis with [`automargin: true`](/reference/layout#xaxis.automargin) grows its margin until its
tick labels and title fit. `automargin` is `false` by default; the default look turns it on for
every axis, so its small margins grow as needed. To let an axis grow some margins only, combine
`'left'`, `'right'`, `'top'`, `'bottom'`, `'width'` and `'height'` with `+`.

Margins never leave less than 64 px of plot area in each direction: on a small figure they shrink
in proportion.

```ts
createChart(el, {
  data: [{ type: 'bar', x: ['Housing', 'Food', 'Transport'], y: [1450, 620, 310] }],
  layout: {
    width: 480,
    height: 320,
    margin: { l: 60, r: 20, t: 40, b: 40 },
    yaxis: { automargin: false },
  },
});
```

## Figure title

[`title.text`](/reference/layout#title.text) is the figure title. `title.x` and `title.y` place
it, as fractions of the whole figure (`xref` / `yref: 'container'`, the default) or of the plot
area (`'paper'`); `xanchor` and `yanchor` say which side of the text sits there. By default the
title is centered in the top margin, in `layout.font` at 1.4 times its size. The default look
draws it at the top left, 11 px, and sets `title.automargin`, so the top margin grows to hold it.
`title.subtitle.text` adds a second line under it.

## Axes

A figure with cartesian traces has an x axis, `layout.xaxis`, and a y axis, `layout.yaxis`.
Further axes are `xaxis2`, `yaxis2`, and so on. A trace picks its axes by id:
`xaxis: 'x2'` is `layout.xaxis2`. An axis that a trace names exists even when `layout` has no
entry for it. [Placing traces](/fundamentals/traces#placing-traces) lists which trace types use
axes.

### Type

[`type`](/reference/layout#xaxis.type) is `'linear'`, `'log'`, `'date'`, `'category'` or
`'multicategory'`. When it is not set, it is detected from the data of the first trace on the
axis: see [Numbers, dates and categories](/fundamentals/data-formats#numbers-dates-and-categories).
A log axis is never detected: set `type: 'log'`.

### Range

Without a [`range`](/reference/layout#xaxis.range), an axis fits its data (`autorange: true`).

- `range: [0, 100]` fixes both ends and turns `autorange` off. Values are in data units: numbers,
  date strings, or category names. On a log axis they are exponents: `range: [2, 6]` is 100 to
  1,000,000.
- `range: [0, null]` fixes one end; the `null` end still fits the data.
- `autorange: 'reversed'` fits the data with the axis flipped.
- `rangemode: 'tozero'` makes the fitted range include 0, and `'nonnegative'` keeps it from going
  below 0. Linear axes only.
- `autorangeoptions` constrains the fitted range: `minallowed` / `maxallowed` set an end exactly,
  `clipmin` / `clipmax` bound it, and `include` names values it must contain.
- `minallowed` / `maxallowed` on the axis stop zoom and pan there, and cap the fitted range.
  `fixedrange: true` turns zoom and pan off for the axis.

### Ticks, grid and lines

- **Tick positions.** By default the axis picks round steps (`tickmode: 'auto'`); `nticks` caps
  how many. Setting `dtick` places a tick every `dtick` from `tick0`: a number, or on date axes
  milliseconds or `'M<n>'` for `n` months. Setting `tickvals` (with optional `ticktext`) places
  ticks at exactly those values. Holochart does not support `tickmode: 'sync'`: it behaves as
  `'auto'`.
- **Tick labels.** [`tickformat`](/reference/layout#xaxis.tickformat) takes a d3-format specifier
  for numbers (`'.2f'`, `'~s'`, `'$,'`) or a d3-time-format one for dates (`'%b %Y'`); see
  [Date formatting](/fundamentals/dates-time-series#date-formatting). `tickprefix` and
  `ticksuffix` add text around each label, `tickangle` rotates the labels, and
  `showticklabels: false` hides them.
- **Tick marks.** `ticks: 'outside'` or `'inside'` draws them, `''` (the default) does not; the
  default look draws them outside. `minor` adds minor ticks and grid lines between the major ones.
- **Grid and zero line.** `showgrid` and `zeroline` are `true` by default. The zero line shows on
  linear axes whose range contains 0. `gridcolor`, `gridwidth` and `griddash` style the grid.
- **Axis line.** `showline: true` draws it (`false` by default; the default look draws it).
  `mirror: true` repeats it on the opposite side of the plot area.
- **Title.** [`title.text`](/reference/layout#xaxis.title), in `title.font`; `title.standoff` is
  the distance in px from the tick labels.
- `visible: false` hides the line, ticks, labels, grid and title. The axis still maps its data.

```ts
createChart(el, {
  data: [{ type: 'scatter', x: [1, 2, 3, 4], y: [120, 4500, 32000, 910000] }],
  layout: {
    xaxis: { title: { text: 'Week' }, dtick: 1 },
    yaxis: { type: 'log', title: { text: 'Downloads' }, range: [2, 6] },
  },
});
```

[Log plots](/charts/scientific/log-plots) covers log axes, and
[Dates & time series](/fundamentals/dates-time-series) covers date axes.

## Subplots with `domain` and `anchor`

A pair of axes that a trace uses is a subplot. Two attributes place an axis:

- [`domain`](/reference/layout#xaxis.domain): the part of the plot area the axis spans, as
  fractions `[start, end]` (default `[0, 1]`). Y domains count from the bottom.
- [`anchor`](/reference/layout#xaxis.anchor): the axis it is drawn against. By default that is the
  other axis of the first trace on it. `side` picks the edge of that axis: `'bottom'` or `'top'`
  for an x axis, `'left'` or `'right'` for a y axis.

Two subplots side by side need two x domains. The trace on `x2` and `y2` makes both axes, and
each is anchored to the other:

```ts
createChart(el, {
  data: [
    { type: 'scatter', x: [1, 2, 3], y: [4, 2, 5] },
    { type: 'bar', x: ['A', 'B', 'C'], y: [12, 9, 15], xaxis: 'x2', yaxis: 'y2' },
  ],
  layout: {
    xaxis: { domain: [0, 0.45] },
    xaxis2: { domain: [0.55, 1] },
  },
});
```

Two subplots stacked on one x axis need two y domains. The x axis is anchored to `y`, the axis of
its first trace, so `anchor: 'y2'` moves it under the lower subplot:

```ts
const months = ['Jan', 'Feb', 'Mar', 'Apr'];

createChart(el, {
  data: [
    { type: 'scatter', x: months, y: [11, 12, 14, 16] },
    { type: 'bar', x: months, y: [96, 81, 55, 60], yaxis: 'y2' },
  ],
  layout: {
    xaxis: { anchor: 'y2' },
    yaxis: { domain: [0.55, 1] },
    yaxis2: { domain: [0, 0.45] },
  },
});
```

## Grids and `makeSubplots`

Writing domains by hand gets tedious past two subplots, so there are two ways to lay out a grid:
`layout.grid`, part of the figure (and so of its JSON), and `makeSubplots`, a helper that computes
the layout up front like Python's `make_subplots`.

Either way, traces pick their subplot the usual way, with `xaxis: 'x2'` and `yaxis: 'y2'`. The
grid only decides where those axes go.

### `layout.grid`

[`layout.grid`](/reference/layout#grid) splits the plot area into `rows × columns` cells
(Plotly semantics; `rows * columns` must be more than 1, and each is at most 100). `pattern` says
which axes go in which cells:

- `'coupled'` (default): one x axis per column (`x`, `x2`, …) and one y axis per row (`y`, `y2`,
  …). Subplots in a column share their x axis and subplots in a row their y axis.
- `'independent'`: every cell gets its own axis pair, `xy`, `x2y2`, … in row-major order.

```ts
const temp = [14, 18, 23, 27, 31];
const humidity = [40, 52, 61, 70, 83];
const iceCream = [120, 175, 260, 330, 410];
const umbrellas = [34, 25, 19, 22, 41];

createChart(el, {
  data: [
    { type: 'scatter', x: temp, y: iceCream }, // x, y: top left
    { type: 'scatter', x: humidity, y: iceCream, xaxis: 'x2' }, // top right
    { type: 'scatter', x: temp, y: umbrellas, yaxis: 'y2' }, // bottom left
    { type: 'scatter', x: humidity, y: umbrellas, xaxis: 'x2', yaxis: 'y2' }, // bottom right
  ],
  layout: { grid: { rows: 2, columns: 2, pattern: 'coupled' } },
});
```

<Example id="layout/grid-coupled" />

With `pattern: 'independent'`, each panel autoranges on its own data, so bars with category x axes
can sit next to numeric scatter plots:

<Example id="layout/grid-independent" :height="480" />

To choose the cell contents yourself, give `subplots`, a 2D array of subplot ids (`'xy'`,
`'x2y3'`, or `''` for an empty cell), or `xaxes` / `yaxes`, the axis of each column and row. The
other attributes:

- `roworder`: `'top to bottom'` (default) or `'bottom to top'`, which row is row 0.
- `xgap` / `ygap`: space between columns and rows, as a fraction of a cell. The defaults are 0.1
  for coupled axes and 0.2 / 0.3 for independent subplots (`pattern: 'independent'` or a
  `subplots` array), which need room for their own tick labels.
- `domain.x` / `domain.y`: the part of the plot area the grid fills (default `[0, 1]`).
- `xside`: `'bottom plot'` (default) or `'top plot'` draws each x axis against the bottom-most or
  top-most subplot of its column; `'bottom'` or `'top'` draws it at the grid edge instead, as a
  free axis. `yside` does the same with `'left plot'` (default), `'right plot'`, `'left'`, and
  `'right'`.

The grid only sets **defaults**: the `domain`, `anchor`, `side`, and `position` of the axes it
places. Any of those set on an axis wins, so you can widen one subplot or move one axis without
leaving the grid.

#### Pies and other domain traces

Traces without axes, such as [pie](/charts/basic/pie), take a cell with `domain.row` and
`domain.column` (0-based; row 0 follows `roworder`). The cell becomes the default `domain.x` and
`domain.y` of the trace:

```ts
const labels = ['Housing', 'Food', 'Transport', 'Other'];

createChart(el, {
  data: [
    { type: 'pie', labels, values: [35, 25, 20, 20], domain: { row: 0, column: 0 } },
    { type: 'pie', labels, values: [38, 22, 15, 25], domain: { row: 0, column: 1 } },
  ],
  layout: { grid: { rows: 1, columns: 2 } },
});
```

<Example id="pie/grid-scalegroup" :height="420" />

### Overlaying axes

An axis with [`overlaying`](/reference/layout#yaxis.overlaying) set to another axis of the same
letter is drawn over it and takes its `domain` (its own `domain` is ignored). This is how you add a
secondary y axis, usually with `side: 'right'`:

```ts
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const sales = [120, 135, 160, 190, 240, 280];
const temperature = [2, 4, 9, 14, 18, 22];

createChart(el, {
  data: [
    { type: 'bar', x: months, y: sales },
    { type: 'scatter', mode: 'lines', x: months, y: temperature, yaxis: 'y2' },
  ],
  layout: {
    yaxis: { title: { text: 'Sales' } },
    yaxis2: { title: { text: '°C' }, overlaying: 'y', side: 'right' },
  },
});
```

The target axis must exist and must not overlay another axis itself; otherwise `overlaying` is
ignored. A zoom box, pan, pinch or scroll (with
[`config.scrollZoom`](/fundamentals/configuration#scrollzoom)) on the plot area moves every axis
drawn over it, so the secondary axis zooms with its primary one (each by the same pixels, as in
Plotly); the drag strips beside an axis move that axis alone.

The traces on the overlaying axis draw over those of the axis it overlays, and every grid and zero
line of the pair draws under all of their traces. Both axes draw their grid by default: set
`showgrid: false` on one of them when the two grids do not line up.

<Example id="axes/demand-temperature" :height="440" />

#### More than two y axes: free axes, `shift` and `autoshift`

A third y axis needs a place outside the plot area: give it `anchor: 'free'` and a `position`
(0–1 across the plot area; a numeric `position` alone makes the anchor default to `'free'`).
`shift` moves a free y axis sideways by that many pixels (negative to the left). With
`autoshift: true` it moves out past everything already drawn on that side of the axis it overlays
(the primary axis' ticks, labels and title, then earlier autoshifted axes), and `position` then
defaults to that plot's edge, `automargin` to `true` and `shift` to ∓3 px:

```ts
const t = [1, 2, 3, 4, 5, 6];
createChart(el, {
  data: [
    { type: 'scatter', x: t, y: [20, 22, 25, 24, 27, 30], name: 'Temperature' },
    { type: 'scatter', x: t, y: [61, 58, 55, 57, 50, 48], name: 'Humidity', yaxis: 'y2' },
    {
      type: 'scatter',
      x: t,
      y: [1012, 1010, 1007, 1009, 1004, 1001],
      name: 'Pressure',
      yaxis: 'y3',
    },
  ],
  layout: {
    yaxis2: { overlaying: 'y', side: 'right', title: { text: '%' } },
    yaxis3: {
      overlaying: 'y',
      side: 'left',
      anchor: 'free',
      autoshift: true,
      title: { text: 'hPa' },
    },
  },
});
```

### `makeSubplots`

`makeSubplots` builds a subplot grid in code, with the options of Python's `make_subplots` in
camelCase: `rows`, `cols`, `sharedX`, `sharedY`, `startCell`, `specs`, `rowHeights`,
`columnWidths`, `subplotTitles`, `horizontalSpacing`, and `verticalSpacing`. Rows and columns are
1-based, and row 1 is at the top (`startCell: 'top-left'`, the default; `'bottom-left'` puts it at
the bottom).

It returns:

- `layout`: the axes (`xaxis`, `yaxis2`, … with `domain` and `anchor`) and, with `subplotTitles`,
  the title `annotations`. Spread it into the figure layout.
- `place(trace, row, col, { secondaryY })`: a copy of the trace pointed at that cell. The input
  trace is not modified.
- `cells`: the computed subplots, `cells[row - 1][col - 1]`, with their domains and axis ids.

```ts
import { createChart, makeSubplots } from '@mk7s/holochart';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const temp = [2, 4, 9, 14, 18, 22];
const sales = [120, 135, 160, 190, 240, 280];

const sp = makeSubplots({
  rows: 2,
  cols: 2,
  sharedX: true,
  specs: [
    [{ rowspan: 2 }, {}],
    [null, {}],
  ],
  subplotTitles: ['Sales vs temperature', 'Monthly sales', 'Mean temperature'],
});

createChart(el, {
  data: [
    sp.place({ type: 'scatter', mode: 'markers', x: temp, y: sales }, 1, 1),
    sp.place({ type: 'bar', x: months, y: sales }, 1, 2),
    sp.place({ type: 'scatter', mode: 'lines', x: months, y: temp }, 2, 2),
  ],
  layout: { ...sp.layout, title: { text: 'Sales' } },
});
```

<Example id="layout/make-subplots" :height="480" />

If you add annotations of your own, concatenate them with the titles:
`annotations: [...((sp.layout['annotations'] as object[] | undefined) ?? []), myNote]`.

`specs` has one entry per cell, `null` for an empty cell or a cell covered by a span:

- `type`: `'xy'` (default) for cartesian axes, or `'domain'` for pie-like traces. `place` sets
  `domain.x` / `domain.y` on a trace placed in a domain cell.
- `colspan` / `rowspan`: how many columns to the right and rows away from the start cell the
  subplot covers.
- `secondaryY: true`: adds a y axis on the right that overlays the cell's y axis. Place a trace on
  it with `sp.place(trace, row, col, { secondaryY: true })`.
- `l`, `r`, `t`, `b`: padding inside the cell, as plot-area fractions.

`makeSubplots` does not support other subplot types: `scene`, `polar`, `ternary`, `geo`, `map`,
`mapbox` and `smith` throw an error. To put polar subplots, 3D scenes or maps in a grid, set
their `domain` (or `domain.row` / `domain.column` with `layout.grid`) instead: see
[polar subplots](#polar-subplots), [several scenes](/fundamentals/3d-scenes#several-scenes) and
[several maps](/fundamentals/maps#several-maps-and-other-subplots).

`horizontalSpacing` and `verticalSpacing` are fractions of the plot area and default to
`0.2 / cols` and `0.3 / rows`. `rowHeights` and `columnWidths` are relative sizes, one per row or
column. Invalid options (a `specs` array of the wrong shape, overlapping spans, more titles than
subplots) throw an `Error` whose message starts with `makeSubplots:`.

#### Differences from Python's `make_subplots`

- **Shared axes of the same extent are one axis.** `sharedX: true` (or `'columns'`) gives each
  column a single x axis, anchored to its bottom-most subplot; `sharedY: true` (or `'rows'`) gives
  each row a single y axis, anchored to its left-most subplot. Python instead creates one axis per
  subplot and links them with `matches`. Zoom and pan are shared either way.
- **Subplots of different extents are linked with `matches`.** One axis has one domain, so when
  shared subplots differ in extent (`sharedX: 'rows'`, or `sharedX: 'all'` over several columns),
  each extent gets its own axis with [`matches`](#linked-axes-matches) set to the first one, as in
  Python. A spanning cell in a shared column (or row) keeps its own, unlinked axis.

## Polar subplots

Polar traces ([`scatterpolar`](/charts/scientific/polar) and
[`barpolar`](/charts/scientific/barpolar)) are drawn on polar subplots instead of x/y axes. Each
subplot is a layout container: `layout.polar`, `layout.polar2`, …, with its own radial and angular
axes (`radialaxis`, `angularaxis`), `sector`, `hole`, `bgcolor` and `domain`. A trace picks its
subplot with `subplot: 'polar2'` (default `'polar'`), the way cartesian traces pick `xaxis` and
`yaxis`.

- **Placement.** `polar.domain.x` / `domain.y` give the subplot's extent as fractions of the plot
  area; the subplot is the largest circle (or sector) that fits in it, centered. With
  `layout.grid`, `domain.row` and `domain.column` place it in a grid cell. Subplots without a
  `domain` share the width side by side, as in Plotly.
- **Mixing.** Polar and cartesian subplots can share a figure: give each its own part of the plot
  area (axis `domain` for the cartesian one, `polar.domain` for the polar one).

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    { type: 'scatter', x: [1, 2, 3], y: [2, 1, 3] },
    { type: 'scatterpolar', r: [1, 2, 3], theta: [0, 120, 240], subplot: 'polar' },
    { type: 'barpolar', r: [3, 1, 2], theta: ['N', 'E', 'S'], subplot: 'polar2' },
  ],
  layout: {
    xaxis: { domain: [0, 0.3] },
    polar: { domain: { x: [0.35, 0.65] } },
    polar2: { domain: { x: [0.7, 1] }, angularaxis: { direction: 'clockwise' } },
  },
});
```

Two polar subplots, each with its own `domain` and axes (a log radial axis on the left):

<Example id="polar/subplots" />

## Range breaks

[`rangebreaks`](/reference/layout#xaxis.rangebreaks) hide spans of a date (or linear) axis: the axis
skips them, so a trading chart has no gaps for weekends, nights or holidays. Each break is one of:

- `bounds` with `pattern: 'day of week'`: days to hide, as numbers (Sunday = 0) or English day
  names. `bounds: ['sat', 'mon']` hides Saturday 00:00 through Monday 00:00 (the pattern defaults
  to `'day of week'` when the bounds name days).
- `bounds` with `pattern: 'hour'`: hours to hide, wrapping past midnight. `bounds: [16, 9.5]` hides
  16:00 to 09:30.
- `bounds` without a pattern: one span in data units, such as `['2024-12-24', '2024-12-27']`.
- `values` (with no `bounds`): single values to hide, each for `dvalue` (default one day, in ms),
  such as a list of holidays.

```ts
const days = ['2024-01-11', '2024-01-12', '2024-01-16', '2024-01-17', '2024-01-18'];
const close = [185.6, 185.9, 183.6, 182.7, 188.6];

createChart(el, {
  data: [{ type: 'scatter', x: days, y: close }],
  layout: {
    xaxis: {
      rangebreaks: [
        { bounds: ['sat', 'mon'] },
        { values: ['2024-01-15', '2024-02-19', '2024-03-29', '2024-05-27'] },
      ],
    },
  },
});
```

The same two breaks on daily OHLC bars, with every 2024 market holiday in `values`. An `ohlc`
trace turns the [range slider](#range-slider-and-range-selector) on, and the slider skips the
breaks too:

<Example id="ohlc/range-breaks" :height="400" />

Overlapping breaks merge. Here weekends (`bounds: ['sat', 'mon']`) and nights
(`bounds: [17, 9], pattern: 'hour'`) together leave only the 09:00–17:00 sessions of a line of
15-minute prices:

<Example id="timeseries/business-hours" :height="400" />

What to know:

- **Patterns use UTC** days and hours. Holochart does not support time zones: a date axis always
  shows UTC, which has no daylight-saving changes, so every day loses exactly the same hours.
- **Data inside a break is not drawn.** A point inside a break is a missing point: it leaves a
  gap in a line, unless the trace sets `connectgaps: true`. A break with no points in it leaves
  no gap: the line runs from the last point before it to the first point after it.
- **Ticks never land in a break.** A tick that would fall inside one moves to its end (a weekly
  tick on Sunday shows as Monday), and ticks that end up crowded are dropped. With `'day of week'`
  breaks, day steps are 1, 2, 7 or 14 days.
- **Hover, zoom and pan work across breaks.** Hover labels show the real dates, and the range a
  zoom or pan reports in its `relayout` event is in real dates too.
- A span break that covers the whole fixed `range` is ignored.

How it works: an axis with breaks maps data to a _compressed_ linear space in which each break has
zero width, so the axis stays a straight line from data to pixels and the GPU transform that pans
and zooms traces does not change.
Positions stay exact across breaks: `x0` + `dx` series step in real time (a point that lands in a
break is hidden), and `xperiod` alignment tiles the real calendar, as in Plotly. Bar widths are
measured without the hidden time, though: the default width comes from the smallest spacing
between bars on screen, and a bar straddling a break keeps its full width there (in Plotly it
narrows by the hidden time).

## Range slider and range selector

Long time series get two navigation aids from the x axis, as in Plotly:

- [`xaxis.rangeslider`](/reference/layout#xaxis.rangeslider) adds an overview strip under the axis
  with all the data and a window over the range in view. Drag the window to pan, drag its ends to
  zoom, drag from outside it to draw a new window, or click beside it to center the window there.
  `rangeslider: {}` is enough to turn it on.
- [`xaxis.rangeselector`](/reference/layout#xaxis.rangeselector) adds buttons that set the range to
  a preset span ending at the current range end: `count` × `step` (`'month'`, `'year'`, `'day'`,
  `'hour'`, `'minute'`, `'second'`) back from it with `stepmode: 'backward'`, from the start of the
  period with `stepmode: 'todate'` (`count: 1, step: 'year', stepmode: 'todate'` is year to date),
  or everything with `step: 'all'`. The button whose range is in view shows as active. Date axes
  only.

```ts
const x = ['2024-01-02', '2024-03-01', '2024-06-03', '2024-09-02', '2024-12-02'];
const y = [182, 179, 194, 229, 239];

createChart(el, {
  data: [{ type: 'scatter', mode: 'lines', x, y }],
  layout: {
    xaxis: {
      range: ['2024-06-03', '2024-12-02'],
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

<Example id="timeseries/range-slider" :height="440" />

The thumbnail is not a picture of the chart: the subplot's traces are drawn a second time, in a
small viewport of their own, so it stays sharp, follows restyles and new data, and costs no extra
work while you pan (moving the window changes transforms only). Its x range is the axis'
autorange over all the data (`rangeslider.range` with `autorange: false`), widened to cover the
range in view. Its y range is set per subplot with `rangeslider.yaxis.rangemode` (`yaxis2` for the
subplot on `y2`, …): `'match'` (default) follows the y axis in view, `'auto'` spans all the y
data, `'fixed'` uses `rangeslider.yaxis.range`; outside `'match'`, the part of the window outside
the y range in view is shaded.

Range breaks carry over: the slider skips them like the axis does, and the selector counts
calendar time back from the range end. Here a year of daily candles hides weekends and holidays;
a `candlestick` trace turns the range slider on without `rangeslider: {}`:

<Example id="candlestick/range-breaks" :height="440" />

What to know:

- **One `relayout` per drag.** While you drag the window, the range is previewed (transforms
  only, `relayouting` events); releasing commits it with one `relayout` of `xaxis.range[0]` and
  `xaxis.range[1]`. Plotly relayouts on every move.
- **The margin grows.** The bottom margin makes room for the axis labels, a 15 px gap, the slider
  (`thickness` × the height inside the layout's own margins, default 0.15) and `margin.b` again
  below it.
- **Y axes stay put.** A y axis anchored to an axis with a range slider defaults to
  `fixedrange: true`, as in Plotly: zoom along x with the slider or the selector.
- **The axis title stays with the axis**, above the slider (Plotly moves it below the slider).
- **Selector buttons are real `<button>`s** over the chart (like the modebar): focusable, operable
  with the keyboard and announced with their span ("6m (Last 6 months)"). They are not part of
  image exports, and they are disabled with `config.staticPlot`. The default look puts them at the
  top right, clear of the legend; set `x` and `y` together (and `xanchor` / `yanchor`) to move
  them.
- Plotly's date arithmetic is kept (UTC): one month back from 2024-03-31 is 2024-03-02 (February
  31 overflows), and `todate` starts at the first period boundary at or after `count` steps back.

## Linked axes (`matches`)

[`matches`](/reference/layout#xaxis.matches) links an axis to another of the same type. Linked axes
keep their own `domain`, anchor and tick style but share one range:

- they autorange together over the data of every linked axis;
- a zoom, pan, scroll or `relayout` of any of them moves all of them (`relayout` reports every
  linked axis);
- `range`, `autorange`, `rangemode`, `rangebreaks`, `constrain`, `categoryorder` and
  `categoryarray` are shared: each is taken from the axis the others match when it sets it,
  otherwise from the first linked axis that sets it. `fixedrange` on one fixes them all.

Link any number of axes to one (`xaxis2: { matches: 'x' }`, `xaxis3: { matches: 'x' }`). The
target can be an axis of the other letter (`yaxis: { matches: 'x' }`). A link to an axis of
another type, to a missing axis or one that would make a loop is ignored.

```ts
const weeks = [1, 2, 3, 4, 5, 6];
const oslo = [-4.1, -3.8, -2.2, -1.5, 0.3, 1.1];
const madrid = [6.2, 6.9, 7.4, 8.8, 9.1, 10.4];

createChart(el, {
  data: [
    { type: 'scatter', x: weeks, y: oslo },
    { type: 'scatter', x: weeks, y: madrid, xaxis: 'x2', yaxis: 'y2' },
  ],
  layout: {
    grid: { rows: 1, columns: 2, pattern: 'independent' },
    xaxis2: { matches: 'x' },
    yaxis2: { matches: 'y' },
  },
});
```

Four panels in a 2×2 grid, every x axis matching `x` and every y axis matching `y`. They share
one range over all four cities' data, and a zoom or pan in one panel moves the other three:

<Example id="axes/linked-axes" :height="480" />

## Aspect lock (`scaleanchor`)

[`scaleanchor`](/reference/layout#yaxis.scaleanchor) locks an axis' scale (pixels per unit) to
another axis: `yaxis: { scaleanchor: 'x' }` makes one unit on y as long as one unit on x, which
keeps circles round and maps undistorted. `scaleratio` sets the ratio (`2`: a y unit is twice as
long as an x unit). Zooming either axis zooms the other by the same factor, so the lock holds while
exploring; a zoom box is widened to the plot's aspect.

`constrain` says how an axis gives way when the lock needs it:

- `'range'` (default): its range widens (or narrows) around the point `constraintoward` names;
- `'domain'`: its range stays and the axis, with its subplot, shrinks inside its `domain`.

`constraintoward` picks the fixed end: `'left'`, `'center'` (default) or `'right'` on x axes,
`'bottom'`, `'middle'` (default) or `'top'` on y axes.

```ts
const angles = Array.from({ length: 65 }, (_, i) => (i / 64) * 2 * Math.PI);
const circleX = angles.map(Math.cos);
const circleY = angles.map(Math.sin);

createChart(el, {
  data: [{ type: 'scatter', mode: 'lines', x: circleX, y: circleY }],
  layout: {
    xaxis: { constrain: 'domain', constraintoward: 'left' },
    yaxis: { scaleanchor: 'x' },
  },
});
```

The same shapes twice, both with the y axis anchored to its x axis. Left, `constrain: 'range'`:
the x range widens to fill the subplot. Right, `constrain: 'domain'` with
`constraintoward: 'left'`: the x axis keeps its range and the subplot shrinks, pinned to the left.

<Example id="axes/scaleanchor" :height="380" />

Axes linked by `scaleanchor` or `matches` form one group whose scales all agree. The anchor must
be an axis of the same type. `scaleanchor` is ignored on an axis that also sets `matches`, and an
anchor that would make a loop (x anchored to y and y to x) is ignored. When an update sets the
range of some axes in a group (a zoom, or `relayout`), those win and the others adapt; otherwise
the axis with the fewest pixels per unit (after `scaleratio`) decides and the others widen.

## Spike lines

Spike lines are crosshair lines from the hovered point to the axes. Turn them on per axis with
[`showspikes`](/reference/layout#xaxis.showspikes) (setting any other `spike*` attribute also
turns them on):

- `spikemode`: `'toaxis'` (default, from the point to the axis line), `'across'` (across every
  subplot on the axis) and `'marker'` (a dot on the axis line), combined with `+`.
- `spikesnap`: `'hovered data'` (default) follows the hovered point, `'data'` also spikes the
  closest point when no label shows, and `'cursor'` follows the pointer.
- `spikecolor` (default: the point's color, or a contrasting color when that would not show),
  `spikethickness` (default 3 px) and `spikedash` (default `'dash'`).
- `layout.spikedistance`: how far (px) the spiked point may be from the pointer; `-1` (default)
  for no limit and `0` for no spikes.

With `hovermode: 'x unified'` (or `'y unified'`), spikes are on by default for that axis, drawn
`across`, dotted, 1.5 px wide and in the axis `color`. The modebar's spike button (add it with
`config.modeBarButtonsToAdd: ['toggleSpikelines']`) turns them on and off on every axis.

```ts
const x = [1, 2, 3, 4, 5, 6, 7, 8];
const y = [52, 55, 61, 58, 63, 67, 64, 70];

createChart(el, {
  data: [{ type: 'scatter', mode: 'lines+markers', x, y }],
  layout: {
    xaxis: { showspikes: true, spikemode: 'across+marker', spikethickness: 1, spikedash: 'dot' },
    yaxis: { showspikes: true, spikecolor: '#5e74d5', spikedash: 'solid' },
  },
});
```

<Example id="axes/spike-lines" />

Spikes are drawn in the hover layer over the canvas, like hover labels: moving them never redraws
a trace, and they are not part of image exports. Holochart does not draw a value label where a
spike meets the axis. For spikes in 3D scenes, see [3D scenes](/fundamentals/3d-scenes#spikes).

## Legend

The legend lists one item per trace (one per label for pie-like traces). It shows when more than
one trace has an item; [`showlegend`](/reference/layout#showlegend) forces it on or off, and
`showlegend: false` on a trace removes that trace's item.

- **Position.** `legend.x` and `legend.y` are fractions of the plot area (the default, `'paper'`
  for `xref` and `yref`) or of the figure (`'container'`), and `xanchor` / `yanchor` say which
  side of the legend sits there. `orientation` is `'v'` (default, a column at `x: 1.02`, `y: 1`:
  right of the plot) or `'h'` (rows, by default at `x: 0`, `y: -0.1`: under the plot). A legend
  outside the plot area grows the margin on that side.
- **The default look** draws a horizontal legend above the plot area (`orientation: 'h'`, `x: 0`,
  `y: 1`, `yanchor: 'bottom'`). For a column at the right, set all of
  `legend: { orientation: 'v', x: 1.02, y: 1, yanchor: 'top' }`.
- **Order.** Items follow trace order. `legend.traceorder: 'reversed'` flips it, and a trace's
  `legendrank` (default 1000) sorts it: lower ranks come first.
- **Clicks.** A click hides or shows the trace (`legend.itemclick: 'toggle'`), and a double-click
  isolates it (`legend.itemdoubleclick: 'toggleothers'`). Set either to `false` to turn it off.
- `legend.title.text` adds a title, and `bgcolor`, `bordercolor`, `borderwidth` and `font` style
  the box.

## Legend groups and group titles

Traces with the same [`legendgroup`](/reference/scatter#legendgroup) form a legend group: with
the default `legend.traceorder` (`'grouped'` as soon as a trace has a group) their items sit
together, and clicking one item toggles the whole group (`legend.groupclick: 'togglegroup'`, the
default; `'toggleitem'` toggles only the item). Give a group a heading with
[`legendgrouptitle.text`](/reference/scatter#legendgrouptitle.text) on any of its traces (the
first titled trace, in legend order, names the group):

```ts
const x = ['Q1', 'Q2', 'Q3', 'Q4'];

createChart(el, {
  data: [
    {
      type: 'bar',
      name: 'Phones',
      x,
      y: [42, 38, 45, 61],
      legendgroup: 'consumer',
      legendgrouptitle: { text: 'Consumer' },
    },
    { type: 'bar', name: 'Wearables', x, y: [12, 14, 15, 22], legendgroup: 'consumer' },
    {
      type: 'bar',
      name: 'Servers',
      x,
      y: [30, 33, 35, 34],
      legendgroup: 'enterprise',
      legendgrouptitle: { text: 'Enterprise', font: { weight: 'bold' } },
    },
  ],
  layout: {
    legend: {
      orientation: 'v',
      x: 1.02,
      y: 1,
      yanchor: 'top',
      grouptitlefont: { color: '#eceef4' },
    },
  },
});
```

As in Plotly:

- A group title is a text-only row at the top of its group, drawn in `legendgrouptitle.font`,
  whose unset fields come from `legend.grouptitlefont` (by default the global `layout.font`, 10%
  larger). It fades when every trace of its group is hidden.
- Clicking a title toggles its whole group, and double-clicking it isolates the group. With
  `groupclick: 'toggleitem'`, titles don't react to clicks.
- Vertical legends put `legend.tracegroupgap` px between groups. Horizontal legends (the default
  look's) show each group as a column headed by its title; the columns fill rows, and
  `tracegroupgap` separates the rows.
- In horizontal legends, `legendwidth` sets one trace's item width, overriding
  `legend.entrywidth`: px of text after the glyph, or a fraction of the plot width with
  `entrywidthmode: 'fraction'`.
- Without any `legendgroup`, the whole legend is one group, so a `legendgrouptitle` heads it.

<Example id="legends/group-titles-vertical" :height="420" />

<Example id="legends/group-titles" :height="420" />

`table` traces never appear in the legend: `showlegend` has no effect on them.

## Multiple legends

A trace names the legend its item goes to with
[`legend`](/reference/scatter#legend): `'legend'` (the default) for `layout.legend`, `'legend2'`
for `layout.legend2`, and so on. Each numbered legend is a complete legend with every attribute
of `layout.legend` — its own position, orientation, title, fonts, colors, `traceorder`, groups,
`maxheight` and click behavior — and each pushes the margins on its own:

```ts
const x = ['Jan', 'Feb', 'Mar', 'Apr'];

createChart(el, {
  data: [
    { type: 'scatter', name: 'Lisbon', x, y: [11, 12, 14, 16] },
    { type: 'scatter', name: 'Oslo', x, y: [-2, -1, 2, 6] },
    { type: 'bar', name: 'Lisbon', x, y: [96, 81, 55, 60], yaxis: 'y2', legend: 'legend2' },
    { type: 'bar', name: 'Oslo', x, y: [49, 36, 47, 41], yaxis: 'y2', legend: 'legend2' },
  ],
  layout: {
    yaxis: { domain: [0.55, 1] },
    yaxis2: { domain: [0, 0.45] },
    legend: { orientation: 'v', x: 1.02, y: 1, yanchor: 'top', title: { text: 'Temperature' } },
    legend2: { x: 1.02, y: 0.45, yanchor: 'top', title: { text: 'Rainfall' } },
  },
});
```

As in Plotly:

- The legends are `legend` plus those the traces use; a `legend2` container that no trace
  references is ignored.
- Numbered legends default like `legend` (a vertical legend at `x: 1.02`, `y: 1`), so give each
  one a position. With the default look, a numbered legend takes the look of the template's
  `legend` (fonts, colors, item width) but not its place above the plot (Plotly gives it nothing
  of the template's `legend`); a template can style `legend2` itself.
- `layout.showlegend` shows or hides every legend. By default the legends show when `legend` has
  two items or any other legend has one; `legend2.visible: false` hides one legend.
- Legend groups and group titles are per legend. Double-clicking an item isolates it among its
  own legend's items and leaves the other legends as they are; a click with
  `groupclick: 'togglegroup'` toggles the item's whole `legendgroup`, in every legend.
- Each legend is its own keyboard toolbar (one tab stop each), named "Legend", "Legend 2", … and
  its title.

<Example id="legends/multiple" :height="460" />

## Scrolling legends

A legend taller than its `maxheight` keeps that height and its content — items and title —
scrolls inside it, with a scrollbar at its right edge. `maxheight` is in px, or, up to 1, a
fraction of a reference height: the plot height for a vertical legend beside the plot (with
`yref: 'paper'`), the figure height otherwise. It defaults to `1` for such vertical legends (at
most as tall as the plot) and `0.5` for the others (at most half the figure), as in Plotly, and
is never less than 30 px.

- The wheel over the legend scrolls it and never zooms the plot beneath (at either end of the
  content, the page scrolls instead).
- The scrollbar can be dragged with the mouse, a pen or a finger; a finger dragged over the items
  scrolls them along with it (a tap still toggles an item).
- Moving the keyboard focus through the items scrolls the focused item into view.
- The scroll position survives redraws (a click toggling an item, `restyle`, `relayout`) and
  resets when the content fits again. Static plots (`staticPlot`) show the top of the content,
  without a scrollbar.

<Example id="legends/scrolling" :height="420" />

<Example id="legends/scrolling-horizontal" :height="420" />
