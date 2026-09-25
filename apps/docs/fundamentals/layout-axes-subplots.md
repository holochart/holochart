---
title: Layout, axes & subplots
description: Configure axes, place multiple subplots, and control figure size and margins.
status: draft
---

# Layout, axes & subplots

This page will cover the `layout` object: axes, subplots, figure size, and margins.

Planned topics:

- Axis types: linear, log, date, category, and multicategory
- Ranges and autorange, ticks and tick formatting, grid lines, and axis titles
- Subplots with axis `domain`
- Figure size, margins, and automargin
- Title, legend, and other layout components

See also the [layout attribute reference](/reference/layout).

## Grids and `makeSubplots`

Each pair of axes is a subplot, and axis `domain` places it in the plot area. Writing domains by
hand gets tedious past two subplots, so there are two ways to lay out a grid: `layout.grid`, part
of the figure (and so of its JSON), and `makeSubplots`, a helper that computes the layout up front
like Python's `make_subplots`.

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

<Example id="_dev/grid-coupled" />

With `pattern: 'independent'`, each panel autoranges on its own data, so bars with category x axes
can sit next to numeric scatter plots:

<Example id="_dev/grid-independent" :height="480" />

To choose the cell contents yourself, give `subplots`, a 2D array of subplot ids (`'xy'`,
`'x2y3'`, or `''` for an empty cell), or `xaxes` / `yaxes`, the axis of each column and row. The
other attributes:

- `roworder`: `'top to bottom'` (default) or `'bottom to top'`, which row is row 0.
- `xgap` / `ygap`: space between columns and rows, as a fraction of a cell. The defaults are 0.1
  for coupled axes and 0.2 / 0.3 for independent subplots, which need room for their own tick
  labels.
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
ignored. A zoom box, pan, scroll or pinch on the plot area moves every axis drawn over it, so the
secondary axis zooms with its primary one (each by the same pixels, as in Plotly); the drag strips
beside an axis move that axis alone.

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
1-based, and row 1 is at the top (`startCell: 'top-left'`).

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

<Example id="_dev/grid-make-subplots" :height="480" />

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

Other subplot types (`scene`, `polar`, `ternary`, `geo`, `map`, `smith`) throw an error naming the
milestone that adds them.

#### Differences from Python's `make_subplots`

- **Shared axes of the same extent are one axis.** `sharedX: true` (or `'columns'`) gives each
  column a single x axis, anchored to its bottom-most subplot; `sharedY: true` (or `'rows'`) gives
  each row a single y axis, anchored to its left-most subplot. Python instead creates one axis per
  subplot and links them with `matches`. Zoom and pan are shared either way.
- **Subplots of different extents are linked with `matches`.** One axis has one domain, so when
  shared subplots differ in extent (`sharedX: 'rows'`, or `sharedX: 'all'` over several columns),
  each extent gets its own axis with [`matches`](#linked-axes-matches) set to the first one, as in
  Python. A spanning cell in a shared column (or row) keeps its own, unlinked axis.

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

<Example id="_dev/rangebreaks-stocks" :height="440" />

Overlapping breaks merge. Here nights and weekends together leave only the 09:30–16:00 sessions:

<Example id="_dev/rangebreaks-intraday" :height="380" />

What to know:

- **Patterns use UTC** days and hours (as Plotly; `layout.timezone` is not supported yet). UTC has
  no daylight-saving changes, so every day loses exactly the same hours.
- **Data inside a break is not drawn**, and the line joins the points on either side.
- **Ticks never land in a break.** A tick that would fall inside one moves to its end (a weekly
  tick on Sunday shows as Monday), and ticks that end up crowded are dropped. With `'day of week'`
  breaks, day steps are 1, 2, 7 or 14 days.
- **Hover, zoom and pan work across breaks.** Hover labels show the real dates, and the ranges a
  zoom or pan reports (`relayout`, `fullLayout`) are real dates too.
- A span break that covers the whole fixed `range` is ignored.

How it works: an axis with breaks maps data to a _compressed_ linear space in which each break has
zero width, so the axis stays a straight line from data to pixels and the GPU transform that pans
and zooms traces does not change.
Because of that, per-point steps in data units are taken in that compressed space: `x0` + `dx`
series and `xperiod` alignment across a break are not exact, and bar widths are measured without
the hidden time.

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

<Example id="_dev/rangeslider-timeseries" :height="440" />

The thumbnail is not a picture of the chart: the subplot's traces are drawn a second time, in a
small viewport of their own, so it stays sharp, follows restyles and new data, and costs no extra
work while you pan (moving the window changes transforms only). Its x range is the axis'
autorange over all the data (`rangeslider.range` with `autorange: false`), widened to cover the
range in view. Its y range is set per subplot with `rangeslider.yaxis.rangemode` (`yaxis2` for the
subplot on `y2`, …): `'match'` (default) follows the y axis in view, `'auto'` spans all the y
data, `'fixed'` uses `rangeslider.yaxis.range`; outside `'match'`, the part of the window outside
the y range in view is shaded.

Range breaks carry over: the slider skips them like the axis does, and the selector counts
calendar time back from the range end.

<Example id="_dev/rangeslider-rangebreaks" :height="420" />

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
- `range`, `autorange`, `rangemode`, `rangebreaks`, `constrain` and the category order are taken
  from the first axis without `matches` (or the first one that sets them), and `fixedrange` on one
  fixes them all.

Link any number of axes to one (`xaxis2: { matches: 'x' }`, `xaxis3: { matches: 'x' }`). A link to
an axis of another type, to a missing axis or one that would make a loop is ignored.

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

<Example id="_dev/matches-subplots" :height="480" />

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

<Example id="_dev/scaleanchor-square" :height="380" />

Chains and groups work as in Plotly: axes linked by `scaleanchor` or `matches` form one group whose
scales all agree, and an anchor that would make a loop (x anchored to y and y to x) is ignored.
When an update sets the range of some axes in a group (a zoom, or `relayout`), those win and the
others adapt; otherwise the axis showing the most data decides and the others widen.

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
`across`, dotted and 1.5 px wide. The modebar's spike button (add it with
`config.modeBarButtonsToAdd: ['togglespikelines']`) turns them on and off on every axis.

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

<Example id="_dev/spikes-hover" />

Spikes are drawn in the hover layer over the canvas, like hover labels: moving them never redraws
a trace, and they are not part of image exports. Spike labels on the axis are not supported yet.
