---
title: Hierarchical charts
description: Sunburst, treemap and icicle charts from a table with hx.sunburst, hx.treemap and hx.icicle, building the tree from a path of columns.
status: complete
---

# Hierarchical charts

`sunburst`, `treemap` and `icicle` are `px.sunburst`, `px.treemap` and `px.icicle`: one
[sunburst](/charts/hierarchical/sunburst), `treemap` or `icicle` trace from a table. The tree
comes either from a `path` of columns, which Express turns into nodes for you, or from columns
that already name each row's parent (`names` and `parents`). The three functions take the same
options.

## From a path of columns

`path` lists columns from the root level down, one level per column. Every row is a leaf, and
every distinct path prefix is a node: `['continent', 'country']` makes a node per continent with
its countries below it. Values are summed up the tree, and the trace gets
`branchvalues: 'total'`, so each branch is exactly as big as its children.

<Example id="express/sunburst-path" :height="540" />

```ts
import hx from '@mk7s/holochart-express';

declare const rows: object[]; // [{ continent: 'Asia', country: 'Japan', pop: 1.27e8, lifeExp: 82.6 }, …]
hx.sunburst(rows, { path: ['continent', 'country'], values: 'pop', color: 'lifeExp' });
hx.treemap(rows, { path: ['continent', 'country'], values: 'pop' });
hx.icicle(rows, { path: ['continent', 'country'] }); // no values: sized by row counts
```

What Express builds, as plotly.py's `process_dataframe_hierarchy` does:

- **Nodes**, from the leaves up, each level in the order its values first appear. A node's
  `labels` entry is its value, its `ids` entry the path joined by `/` (`Asia/Japan`), and its
  `parents` entry its parent's id (`''` for the top level).
- **Values**: the `values` column summed per node, missing values counting as 0. Without `values`,
  each row counts 1, in a column named `count` (`count=%{value}` on hover).
- **Missing entries** end a row's path early, making it a leaf higher up: a row with a continent
  and `country: null` is a leaf on the first level. A missing entry can't have a present one after
  it, and a row can't stop at a node that other rows continue below; both throw.
- **Hover text** lists `labels`, the values column, `parent` and `id`, then the color and
  `hoverData` columns, as px writes it.

A column of the same value in every row puts one root above the first level (px's
`px.Constant('World')`); pass it as an array:

```ts
import hx from '@mk7s/holochart-express';

declare const rows: { continent: string; country: string; pop: number }[];
hx.icicle(rows, { path: [rows.map(() => 'World'), 'continent', 'country'], values: 'pop' });
```

<Example id="express/icicle-path" :height="500" />

## Colors

A numeric `color` goes through a colorscale: leaves take their row's value and every branch the
mean of its children's rows, weighted by `values` (by row count without `values`). The colorscale
(`colorContinuousScale`, `rangeColor`, `colorContinuousMidpoint`) and its colorbar, titled with
the column's label, are on the trace's `marker`.

Any other `color` column colors nodes by category, from the colorway (or
`colorDiscreteSequence`) or `colorDiscreteMap`. A branch takes its rows' value when they all
agree and `'(?)'` when they don't; give `'(?)'` its own color in `colorDiscreteMap`. The nodes are
sorted by color, so `'(?)'` takes the first color of the sequence when not mapped.

<Example id="express/treemap-path" :height="500" />

```ts
import hx from '@mk7s/holochart-express';

declare const tips: object[]; // [{ day: 'Fri', time: 'Lunch', sex: 'Male', total_bill: 16.99 }, …]
hx.treemap(tips, {
  path: ['day', 'time', 'sex'],
  values: 'total_bill',
  color: 'time',
  colorDiscreteMap: { '(?)': 'gray', Lunch: 'gold', Dinner: 'darkblue' },
});
```

The color column is added to the hover label (through `customdata`) unless `hoverData` hides it
(`hoverData: { lifeExp: false }`). `hoverName`, `hoverData` and `customData` columns are
aggregated like a categorical color: a branch shows the value its rows share, or `'(?)'`. A
`hoverData` column that is also `values` is summed.

Without `color`, the first level takes the colorway and deeper nodes their parent's color, as
the traces do; `colorDiscreteSequence` also becomes `layout.sunburstcolorway` (`treemapcolorway`,
`iciclecolorway`).

## From names and parents

When the table already names each row's parent, pass the columns through: `names` (the labels),
`parents`, and `ids` when labels repeat. `values` are taken as given, and `branchvalues` is the
trace's default (`'remainder'`) unless you set it.

<Example id="express/sunburst-parents" :height="500" />

```ts
import hx from '@mk7s/holochart-express';

const budget = [
  { item: 'Budget', parent: '', amount: 1000 },
  { item: 'Engineering', parent: 'Budget', amount: 520 },
  { item: 'Platform', parent: 'Engineering', amount: 240 },
  { item: 'Sales', parent: 'Budget', amount: 280 },
];
hx.sunburst(budget, { names: 'item', parents: 'parent', values: 'amount', branchvalues: 'total' });
```

`path` and `ids` / `parents` are exclusive: pass one or the other.

## Options

| Option                                      | px                                              | What it does                                                   |
| ------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------- |
| `path`                                      | `path`                                          | Columns of the levels, root first; builds ids, labels, parents |
| `names`, `parents`, `ids`                   | `names`, `parents`, `ids`                       | Columns of labels, parent ids and ids (without `path`)         |
| `values`                                    | `values`                                        | Node sizes; summed per node with `path`                        |
| `color`                                     | `color`                                         | Node colors: a colorscale when numeric, else categories        |
| `colorContinuousScale`, `rangeColor`, …     | `color_continuous_scale`, `range_color`, …      | The colorscale of a numeric `color`                            |
| `colorDiscreteSequence`, `colorDiscreteMap` | `color_discrete_sequence`, `color_discrete_map` | Category colors; `'(?)'` for mixed branches                    |
| `hoverName`, `hoverData`, `customData`      | `hover_name`, `hover_data`, `custom_data`       | Hover text and custom data, aggregated per node with `path`    |
| `branchvalues`                              | `branchvalues`                                  | `'total'` (default with `path`) or `'remainder'`               |
| `maxdepth`                                  | `maxdepth`                                      | Levels drawn from the root down                                |

Plus `labels`, `title`, `template`, `width` and `height`, as every function. Draw the figures with
traces-hier (`register(...hierTraces)`), or the `@mk7s/holochart` bundle.

## Differences from plotly.express

- The colorscale of a numeric `color` is on the trace's `marker` (`marker.colorscale`,
  `showscale`, `colorbar`) rather than `layout.coloraxis`: Holochart's hierarchy traces don't read
  `marker.coloraxis` yet.
- Aggregated `hoverName`, `hoverData` and `customData` values keep their type (numbers stay
  numbers, so hover formats apply); px turns them into strings.
- Without `values`, the count column is `count`, or `count_1`, … when the data has a `count`
  column (px joins the column names).
- `px.Constant` isn't offered: pass an array of one repeated value as a path column.
