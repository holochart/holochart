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
- Linked axes (`matches`, `scaleanchor`)
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
ignored. Zoom and pan don't move overlaid axes together yet; that comes with linked axes (plan
E3.9).

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

Until linked axes (`matches`, plan E3.9) exist:

- **Shared axes are one axis.** `sharedX: true` (or `'columns'`) gives each column a single x axis,
  anchored to its bottom-most subplot; `sharedY: true` (or `'rows'`) gives each row a single y axis,
  anchored to its left-most subplot. Python instead creates one axis per subplot and links them
  with `matches`. Zoom and pan are shared either way, but one axis has one domain, so
  only subplots of the same extent can share it: a spanning cell in a shared column (or row) keeps
  its own axis, and sharing between subplots of different extents throws (for example
  `sharedX: 'rows'`, or `sharedX: 'all'` over several columns).
- **Secondary y axes don't zoom with their primary axis** yet, as with any overlaid axis.
