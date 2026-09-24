---
title: Table
description: Show exact values in columns with a fixed header, on their own or next to a chart.
status: complete
chart: table
---

# Table

## Overview

A table trace draws a grid of formatted values with a fixed header, inside the figure. Use it when
readers need the exact numbers: a summary next to a chart, a watchlist, a log, a list of services
with their metrics. Because it is a trace, it shares the figure's layout, theme, export and
accessibility description with the charts around it.

Tables are domain traces, like [pie](/charts/basic/pie): they have no axes and fill the area set
by `domain`. Rows scroll inside that area; only the visible rows are laid out and drawn, so a table
with 100,000 rows stays smooth.

Pick a different chart when:

- readers should see a trend, a ranking or a distribution rather than look up values: use a
  [line](/charts/basic/line) or a sorted [bar chart](/charts/basic/bar), and add a table next to
  it for the exact numbers;
- you need sorting, filtering, editing or pagination: tables here are for display, so use an HTML
  data grid next to the chart for those.

## Minimal example

```ts
import { createChart } from '@mk7s/holochart';

const chart = createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'table',
      header: { values: ['Region', 'Stores', 'Revenue (M)'] },
      cells: {
        values: [
          ['North', 'South', 'East'], // column 1
          [42, 37, 51], // column 2
          [12.4, 9.8, 15.1], // column 3
        ],
      },
    },
  ],
});
```

`header.values` names the columns and `cells.values` holds the data **column by column**. The
default look raises the header above background-colored cells, numbers are shown as given, and
text with spaces wraps to the column width and makes its row taller:

<Example id="table/basic" />

## Data format

- `cells.values`: one array per column, so a value is `values[column][row]`. This is the transpose
  of a list of records: turn rows into columns first (`columns.map((c) => rows.map((r) => r[c]))`).
  Columns may differ in length; short ones are padded with empty cells. Plain arrays and typed
  arrays (`Float64Array`) both work, and the arrays are kept by reference, not copied.
- `header.values`: one entry per column. An entry that is an array gives one value per header
  row, for multi-row headers (`[['Latency', 'p50'], ['', 'p95']]`). A cell column beyond the header
  gets an empty header. Without `header.values`, the table draws an empty 16 px header strip, as
  Plotly does.
- Values are shown as they are: strings as text, numbers with `String(value)` unless a `format`
  applies. `null` and `undefined` render as empty cells.
- Text accepts Plotly's pseudo-HTML: `<br>` breaks a line and entities are decoded. Other tags
  (`<b>`, `<i>`, `<span style>`) are stripped for now; styled runs arrive with the rich-text
  work (plan E2.10).
- A value written `$…$` (LaTeX) is shown as given, without prefix, suffix or format; it is not
  typeset.

## Variations

### Formats, per-column and per-row styles

`format` takes a [d3-format](https://d3js.org/d3-format) specifier (`',.2f'`, `'+.2%'`, `'.3s'`),
applied to numeric values with the same formatter as tick labels; non-numeric values are shown as
they are. `prefix` and `suffix` add text around each value (`'$'`, `' ms'`).

Every styling attribute takes one value for the whole block, one value per column, or, nested, one
array per column with a value per row. This is Plotly's `gridPick`: short arrays repeat their
last entry, so `align: ['left', 'right']` left-aligns the first column and right-aligns all the
others. Columns are counted in data order, before `columnorder`. Nested arrays give alternating
row fills, a highlighted column, or a font color per cell:

```ts
const change = [0.013, -0.024, 0.002];
const zebra = change.map((_, i) => (i % 2 ? '#12121a' : '#0a0a0f')); // one color per row
createChart(el, {
  data: [
    {
      type: 'table',
      header: { values: ['Ticker', 'Change'], font: { weight: 'bold' } },
      cells: {
        values: [['ACME', 'GLOBEX', 'INITECH'], change],
        format: ['', '+.2%'],
        align: ['left', 'right'],
        fill: { color: [zebra] }, // one column spec, repeated for every column
        font: { color: ['#eceef4', change.map((c) => (c < 0 ? '#ea2a37' : '#118e36'))] },
      },
    },
  ],
});
```

<Example id="table/styled" />

### Wide tables, column widths, and multi-row headers

`columnwidth` gives the columns **relative** widths: they share the domain width in proportion to
these values (one number for all, or one per column; a short array repeats its last entry). The
table always fills its domain and never scrolls horizontally, so a wide table needs a wide chart
or narrower columns.

String values with spaces wrap to the column width, and the row grows to fit them. Text that
doesn't fit and can't wrap (a long word, a number) is clipped at the column edge.

<Example id="table/wide" :height="400" />

### A table next to a chart

`domain.x` and `domain.y` (fractions of the plot area) place the table; give the chart's axes the
rest with `xaxis.domain`. With `layout.grid`, a table can also take a cell with `domain.row` and
`domain.column`, like a pie (see
[Layout, axes & subplots](/fundamentals/layout-axes-subplots#pies-and-other-domain-traces)).

<Example id="table/with-chart" :height="400" />

### 100,000 rows, virtualized

Only the rows on screen are laid out and drawn, and row heights are measured lazily as rows come
near the viewport. Scroll with the wheel, by dragging the rows, or with the scrollbar, which
appears right of the table while the pointer moves over it. The log below has 100,000 rows:

<Example id="table/virtualized" />

## Styling

`header` and `cells` take the same style attributes:

| Attribute                                         | Default (schema)        | Meaning                                                          |
| ------------------------------------------------- | ----------------------- | ---------------------------------------------------------------- |
| `format`                                          | none                    | d3-format specifier for numeric values                           |
| `prefix`, `suffix`                                | none                    | Text before and after each value                                 |
| `align`                                           | `'center'`              | `'left'`, `'center'` or `'right'`                                |
| `height`                                          | 28 (header), 20 (cells) | Row height in px; rows with wrapping text grow beyond it         |
| `fill.color`                                      | `'white'`               | Cell background                                                  |
| `line.color`, `line.width`                        | `'grey'`, 1             | Cell outlines, centered on the cell edges                        |
| `font.family`, `size`, `color`, `weight`, `style` | `layout.font`           | Text font; `weight` is a number (1–1000), `'normal'` or `'bold'` |

Each of them takes one value, one per column, or one per column and row (see
[per-column and per-row styles](#formats-per-column-and-per-row-styles)).

- **Default look.** The default `holochart` template styles tables to match the dark theme: a
  raised `#15151d` header with bright `#eceef4` text, cells in the `#0a0a0f` background color,
  faint 1 px rules (`#2c2c38` in the header, `#1a1a22` between cells), and 9 px text. Anything
  you set on the trace wins over it. `layout.template: 'plotly-classic'` gives Plotly's table:
  white cells, grey lines and 12 px `#444` text. See
  [Themes & templates](/customization/themes-templates#the-default-look).
- **Row heights.** A row grows to fit text that has a space, a `<br>`, or markup (including a
  prefix or suffix with a space): the text's height plus 8 px of padding above and below (Plotly's
  `cellPad`). Other cells never grow a row. Text is 8 px from the left and right edges.
- **Zebra rows and highlights.** Use nested `fill.color` arrays with one color per row:
  `[zebra]` alternates rows in every column, `[zebra, highlight, zebra]` highlights the second
  column. A row array shorter than the table repeats its last color, so `[['#111', '#222']]` does
  not alternate past the second row.
- **Conditional colors.** Compute a per-row array for one column's `font.color` (red for losses,
  green for gains), as in the styled example.
- The font fields `variant`, `textcase`, `lineposition` and `shadow` are not supported yet.

## Interactivity

- **Scrolling.** When the rows don't fit, the wheel scrolls them, as does dragging the rows up or
  down. The scrollbar right of the table shows while the pointer moves over the table and hides a
  second after it stops (as in Plotly); drag it, or click beside its thumb to jump there.
- **Reordering columns.** Drag a header cell sideways to move its column; the other columns make
  room as it passes them. A drag starts after 3 px of movement. On release the table restyles
  `columnorder` with the new order, which emits the chart's `restyle` event and is recorded as a
  user edit, so `uirevision` keeps it across `react`:

  ```ts
  chart.on('restyle', (e) => {
    if ('columnorder' in e.update) console.log('new order', e.update['columnorder'], e.traces);
  });
  ```

  `columnorder` lists, per data column, the position it is drawn at: `[2, 0, 1]` draws data column
  0 third. Set it yourself with `chart.restyle({ columnorder: [[2, 0, 1]] }, [0])`.

- **The chart around it.** A wheel or drag over a table never zooms or pans the chart. At the top
  or bottom of the rows the wheel lets the page scroll on.
- Like in Plotly, tables have no hover labels, no legend entries, and no click or selection
  events.

## Performance notes

- **Virtualized rows.** Only the visible rows become GPU instances and text; rows one screenful
  above and below are measured ahead so they rarely change height as they scroll in. A scroll
  re-draws only the visible window, so a 100k-row table costs about what its visible rows cost.
- **No per-row work up front.** `calc` keeps the cell arrays by reference and does nothing per
  row; a cell is formatted and measured the first time it comes near the screen. Pass typed arrays
  for numeric columns to save memory.
- **Row heights.** Rows with wrapping text are measured lazily, and the scroll position is kept
  on a row, so measuring rows above never makes the visible rows jump. Fixed-height rows (numbers
  and text without spaces) are cheapest.
- A restyle or resize re-measures the rows in view, not the whole table. Very long wrapped texts
  in many rows cost layout time as they scroll in; shorten them or widen the column.

## Accessibility notes

- **Screen readers:** the chart's hidden description (see the
  [accessibility guide](/guides/accessibility#the-hidden-description)) includes the table itself:
  a summary with the column names and row count, and a hidden `<table>` with the header and the
  cells, in display order and formatted as drawn (prefix, format, suffix). Large tables list the
  first rows only (as many as the description shows for any trace) and say how many there are.
- **Keyboard:** there is no keyboard scrolling or column reordering yet; the description table is
  the keyboard-accessible way to read the values.
- **Color:** don't rely on cell colors alone (red and green changes): keep the sign in the text
  with a `+` format (`'+.2%'`), and keep enough contrast between `font.color` and `fill.color`.

## Attribute reference

See the [table attribute reference](/reference/table) for every attribute, its type, and its
default. `layout.grid` for placing tables by row and column is in the
[layout reference](/reference/layout).

## Related charts

- [Bar](/charts/basic/bar): the same numbers compared visually, often next to a table
- [Pie](/charts/basic/pie): another domain trace, placed with `domain` or `layout.grid`
- [Gantt](/charts/basic/gantt): a schedule, when the rows of your table are tasks with dates

## Plotly migration notes

- Attribute names and defaults match Plotly's `table` trace: `header` and `cells` with `values`,
  `format`, `prefix`, `suffix`, `align`, `height`, `line`, `fill` and `font`, plus
  `columnwidth`, `columnorder` and `domain`, with the same `gridPick` rules for per-column and
  per-row styles. Plotly table figures carry over unchanged.
- Scrolling (wheel, drag, scrollbar) and dragging header cells to reorder columns work as in
  Plotly.
- Differences:
  - In a row that grew to fit wrapped text, every cell's text shares one baseline; Plotly leaves
    the cells that didn't grow higher up.
  - A first word wider than its column starts on the first line; Plotly puts an empty line
    before it.
  - `columnorder` in `fullData` is normalized to display ranks that cover every column
    (`[10, 5]` becomes `[1, 0]`); Plotly keeps the input and misplaces columns it doesn't list.
  - A column drag emits `restyle` only when the order changed (Plotly on every header drag end),
    and the new `columnorder` is kept in the figure.
  - `null` and `undefined` values render as empty cells.
  - A header drag starts after 3 px of movement.
  - The scrollbar is white at 40% on dark paper (Plotly: black at 40%, drawn the same on any
    paper); on light paper it is Plotly's black.
- Not supported yet:
  - Styled rich text in cells: tags are stripped (plan E2.10).
  - LaTeX: `$…$` values are shown as given.
  - The animated column-move and scrollbar fade transitions.
  - The font fields `variant`, `textcase`, `lineposition` and `shadow`.
- Holochart extension: rows are virtualized, so tables with hundreds of thousands of rows scroll
  smoothly.
