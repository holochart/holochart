---
title: Data formats
description: What trace data arrays accept — plain arrays, typed arrays, dates, categories, 2D grids, missing values, implicit coordinates, datasets with column references, and saved figures.
status: complete
---

# Data formats

A trace takes its data as **columns**: one array per coordinate, such as `x` and `y`, with one
item per point. This page lists what those arrays may hold. To plot a table of rows, a CSV file
or an Apache Arrow table directly, use [Express](/express/data), which builds the columns for you.

## Arrays

A data array is a plain array or a [typed array](#typed-arrays). Its items are numbers, strings,
`Date` objects or `null`:

```ts
createChart(el, {
  data: [
    { type: 'bar', x: ['Mon', 'Tue', 'Wed'], y: [120, 90, 150] },
    { type: 'scatter', x: ['Mon', 'Tue', 'Wed'], y: [95, null, 140] },
  ],
});
```

Arrays are kept by reference. Holochart does not clone them when the chart is created:
`chart.data[0].x` is the array you passed. For the same reason, an array changed in place looks
unchanged to `react`, which compares data arrays by reference. Pass a new array, or change
[`layout.datarevision`](/reference/layout#datarevision); see
[Updating charts](/fundamentals/updating-charts).

`scatter` and `bar` traces draw as many points as the shorter of `x` and `y`. A trace with `y`
alone puts its points at x = 0, 1, 2, … (see [Implicit coordinates](#implicit-coordinates)).

Anything that is not an array is rejected with a console warning and the attribute is ignored:

```text
[holochart] data[0].y: invalid value 'abc'; expected an array or typed array (ignored)
```

## Numbers, dates and categories

What an array's items mean depends on the type of the axis they are plotted on. An axis whose
`type` is not set takes its type from the first trace that has data on it. Holochart samples up
to about 1000 items of that array and counts the distinct ones, as Plotly does:

| The array holds                                                        | Axis type       |
| ---------------------------------------------------------------------- | --------------- |
| Numbers, or strings that are numbers (`'12.5'`)                        | `linear`        |
| `Date` objects or ISO date strings, more than twice as many as numbers | `date`          |
| Other strings or booleans, more than twice as many as numbers          | `category`      |
| Two rows, `[[group, …], [item, …]]`                                    | `multicategory` |
| A typed array                                                          | `linear`        |

Set [`xaxis.type`](/reference/layout#xaxis.type) to choose the type yourself. A log axis is
always chosen that way: `type: 'log'`.

### Numbers

On a linear or log axis, a number is used as it is, and a numeric string is parsed. Currency
signs, thousands separators and percent signs around the digits are ignored, so `'$1,200'` is
the number 1200. With
[`autotypenumbers: 'strict'`](/reference/layout#xaxis.autotypenumbers) on the axis, numeric
strings count as categories when the axis type is detected.

### Dates

On a date axis, each item is one of:

- an ISO date string: `'2025-03-01'`, `'2025-03'`, `'2025-03-01 14:30'`,
  `'2025-03-01T14:30:05.250'`. A string without an offset is read as UTC. A string with one
  (`Z`, `+02:00`) is converted to UTC;
- a `Date` object, taken at its instant and shown in UTC. Plotly shows a `Date` in the browser's
  local time; see [Coming from Plotly](/getting-started/from-plotly#what-to-change-in-the-figure);
- a number: milliseconds since 1970-01-01 UTC.

Formats such as `'03/01/2025'` or `'Mar 1 2025'` are not dates: an array of them makes a category
axis. [Dates & time series](/fundamentals/dates-time-series) covers date axes in full.

### Categories

On a category axis, every distinct value is one category, compared by its string form: `1` and
`'1'` are the same category. Categories are placed in the order they first appear, across traces
in trace order. `null`, `undefined` and `''` are not categories. Change the order with
[`categoryorder`](/reference/layout#xaxis.categoryorder) and
[`categoryarray`](/reference/layout#xaxis.categoryarray).

Two rows of the same length make a two-level category axis: the first row is the group of each
point, the second its item.

```ts
createChart(el, {
  data: [
    {
      type: 'bar',
      x: [
        ['2024', '2024', '2025', '2025'],
        ['H1', 'H2', 'H1', 'H2'],
      ],
      y: [12, 15, 14, 19],
    },
  ],
});
```

## Typed arrays

Every data array may be a typed array: `Float64Array`, `Float32Array`, `Int8Array`, `Int16Array`,
`Int32Array`, `Uint8Array`, `Uint8ClampedArray`, `Uint16Array` or `Uint32Array`. So may numeric
per-point attributes such as `marker.size` and a numeric `marker.color`.

```ts
const count = 100_000;
const x = new Float64Array(count);
const y = new Float32Array(count);
for (let i = 0; i < count; i++) {
  x[i] = Date.UTC(2025, 0, 1) + i * 60_000;
  y[i] = Math.sin(i / 500);
}

createChart(el, {
  data: [{ type: 'scatter', mode: 'lines', x, y }],
  layout: { xaxis: { type: 'date' } },
});
```

<Example id="timeseries/minute-bars" />

What to know:

- **A typed array is numbers only**, so the detected axis type is always `linear`. For
  timestamps, set `type: 'date'` on the axis, as above.
- **Conversion is one native copy.** On a linear or date axis, a typed array is copied into the
  axis's coordinates in one step. A plain array is read item by item, because each item may be a
  number, a string, a `Date` or `null`.
- **Use `Float64Array` for timestamps.** A `Float32Array` holds about 7 significant digits, and a
  millisecond timestamp has 13.
- **`NaN` marks a missing value** in a float array. A typed array cannot hold `null`.
- **`BigInt64Array` and `BigUint64Array` are not supported.** Convert them to a `Float64Array`
  first.

## Implicit coordinates

Evenly spaced data does not need an `x` array. Without `x`, point `i` is at `x0 + i·dx`. `x0`
defaults to `0` and `dx` to `1`, so a trace with only `y` is plotted against 0, 1, 2, ….
`y0` and `dy` do the same for a trace without `y`.

```ts
createChart(el, {
  data: [
    // One reading per day from 1 January 2025: on a date axis, dx is in milliseconds.
    { type: 'scatter', y: [3.1, 3.4, 2.9, 3.8], x0: '2025-01-01', dx: 86_400_000 },
  ],
});
```

A date in `x0` makes the axis a date axis. `scatter`, `bar`, `waterfall`, `funnel`, `heatmap`,
`contour` and `image` have `x0`, `dx`, `y0` and `dy`; see for example
[`x0`](/reference/scatter#x0) on scatter.

## Grids

`heatmap`, `contour` and `surface` take `z` as an array of rows, `z[row][column]`, with the rows
along y. In a heatmap, a row may be a plain array or a typed array, and a row shorter than the
others is padded with gaps:

```ts
createChart(el, {
  data: [
    {
      type: 'heatmap',
      z: [
        [1, 2, 3],
        [4, null, 6],
      ],
      x: ['Mon', 'Tue', 'Wed'],
      y: ['Morning', 'Evening'],
    },
  ],
});
```

Each trace type's page says what else it takes: a [heatmap](/charts/scientific/heatmap), for
example, also takes `z` as one flat array with `x` and `y` columns of the same length.

## Missing values

A value that cannot be placed on its axis is a missing value. On a linear axis that is `null`,
`undefined`, `NaN`, an infinite number, `''`, a boolean, and a string that is not a number. On a
date axis it is anything that is not one of the [date values](#dates) above, and on a category
axis `null`, `undefined` and `''`.

On a log axis, zero and negative values are missing too, and the console gets a warning:

```text
[holochart] Non-positive values cannot be shown on a log axis and were left out.
```

In a `scatter` trace, a point with a missing coordinate is not drawn, and the line breaks there.
Set [`connectgaps: true`](/reference/scatter#connectgaps) to draw the line across the gap
instead. `scatterpolar` and `scatter3d` have the same attribute.

<Example id="line/gaps" />

In a `heatmap`, `contour` or `surface`, a missing `z` is a gap in the grid. There, `connectgaps`
fills the gaps by interpolating their neighbours.

## Datasets

A figure can hold its columns once, in `datasets`, and let traces refer to them by name. A trace
names its dataset with `dataset`, and an attribute names a column with `'@column'`:

```ts
const sales = {
  month: ['2025-01', '2025-02', '2025-03', '2025-04'],
  revenue: Float64Array.of(120, 135, 160, 150),
  cost: Float64Array.of(80, 95, 90, 110),
  status: ['#22c55e', '#22c55e', '#22c55e', '#ef4444'],
};

createChart(el, {
  datasets: { sales },
  data: [
    {
      type: 'bar',
      dataset: 'sales',
      x: '@month',
      y: '@revenue',
      marker: { color: '@status' },
      name: 'Revenue',
    },
    { type: 'scatter', dataset: 'sales', x: '@month', y: '@cost', name: 'Cost' },
  ],
});
```

`datasets` maps a name to an object of columns. Each column is a plain array or a typed array.
A column is used by reference, and any number of traces and attributes may use the same one.

A string that starts with `@` is a column reference in two places:

- on **data arrays**: `x`, `y`, `z`, `customdata`, `ids` and the others;
- on **per-point attributes whose values cannot start with `@`**, such as `marker.color` and
  `marker.size`.

On attributes that take any string, it stays text: `text: '@handle'` and `name: '@handle'` show
`@handle`, as they do in Plotly. To label points from a column, pass the array itself:
`text: sales.month`.

A reference that cannot be resolved is reported like any other invalid value, and the attribute
falls back to its default:

```text
[holochart] data[0].dataset: unknown dataset 'sale'; did you mean 'sales'?
[holochart] data[1].x: dataset 'sales' has no column 'mont'; did you mean '@month'?
[holochart] data[2].x: column reference '@month' needs a `dataset` on the trace
```

More to know:

- `datasets` is a key of the figure, next to `data` and `layout`. With `newPlot` and `react`, use
  the figure form, `newPlot(el, { data, layout, datasets })`: the form with separate arguments
  has none for datasets.
- `chart.data` keeps the references as you wrote them. `chart.fullData[i].x` is the column, and
  `chart.datasets` returns the datasets.
- To change a column, give `react` a figure whose dataset has a new array for it. Only the
  traces that read that column are recalculated. A column changed in place is not noticed, as
  with any data array.
- `chartToJSON(chart)` writes the datasets once and keeps the references in the traces.

Datasets are a Holochart addition: Plotly has no `datasets` key.

## Saved figures

`chartToJSON(chart)` returns the figure as JSON-safe data. Typed arrays are written in Plotly's
base64 form, `{ dtype, bdata }`, with a `shape` for a grid of typed rows, and `Date` objects as
ISO strings.
`fromJSON` and `figureFromJSON` turn that form back into typed arrays, in figures saved by
Holochart or by Plotly:

```ts
import { chartToJSON, fromJSON } from '@mk7s/holochart';

const saved = JSON.stringify(chartToJSON(chart));

// Later, or on another page:
const restored = fromJSON(el, saved);
await restored.ready;
```

`createChart`, `newPlot` and `react` do not decode `{ dtype, bdata }`. A figure that still has
such objects in it must go through `fromJSON` or `figureFromJSON` first. Passed directly, the
object is reported as an invalid value and the attribute is ignored. plotly.js decodes them in
`newPlot`.

See [Exporting the figure as JSON](/guides/export#exporting-the-figure-as-json).

## What traces do not accept

- **Rows of objects** (`[{ day: 'Sat', tip: 3.5 }, …]`). Map them to columns, or pass them to
  [Express](/express/data).
- **Apache Arrow tables.** [Express](/express/data#arrow-tables) reads them. Without Express, pass
  each column as an array.
- **CSV text.** Express has [`fromCSV`](/express/data#csv).
- **`BigInt64Array` and `BigUint64Array`.**

## Which format to use

- Small data: plain arrays. They are the easiest to read and to write.
- Long numeric series: typed arrays, with `Float64Array` timestamps on date axes.
- Evenly spaced series: `x0` and `dx`, with no `x` array at all.
- Several traces over the same columns: a dataset.

[Performance](/guides/performance) has more on large data.
