---
title: Facets
description: Split an Express chart into a grid of subplots by column values, with linked axes and facet labels.
status: complete
---

# Facets

`facetRow` and `facetCol` split the rows into a grid of subplots, one per value: the same chart
drawn for each subset, on axes linked so the panels compare directly.

<Example id="express/facet-grid" :height="480" />

```ts
import hx from '@mk7s/holochart-express';

declare const tips: object[];
hx.scatter(tips, {
  x: 'total_bill',
  y: 'tip',
  color: 'smoker',
  facetRow: 'time',
  facetCol: 'day',
  categoryOrders: { day: ['Thu', 'Fri', 'Sat', 'Sun'], time: ['Lunch', 'Dinner'] },
});
```

## The grid

| Option            | px                  | What it does                                                              |
| ----------------- | ------------------- | ------------------------------------------------------------------------- |
| `facetRow`        | `facet_row`         | One row of subplots per value, the first at the top                       |
| `facetCol`        | `facet_col`         | One column per value, left to right                                       |
| `facetColWrap`    | `facet_col_wrap`    | Wrap the columns after this many, row by row from the top                 |
| `facetRowSpacing` | `facet_row_spacing` | Space between rows, as a fraction of the plot height (0.03; 0.07 wrapped) |
| `facetColSpacing` | `facet_col_spacing` | Space between columns, as a fraction of the plot width (0.02)             |

Values are ordered by first appearance, or by `categoryOrders`. As in px, a value listed in
`categoryOrders` without rows still gets its (empty) panel. The grid is built like plotly.py's
`make_subplots(start_cell='bottom-left')` (Holochart's [`makeSubplots`](/fundamentals/layout-axes-subplots)):
`xaxis` / `yaxis` belong to the bottom-left panel, and the axes are numbered row by row from the
bottom.

## Linked axes

Every panel has its own axis pair, and every axis `matches` the first (`xaxis2.matches: 'x'`,
`yaxis2.matches: 'y'`), as `make_subplots(shared_xaxes='all', shared_yaxes='all')` links them: the
panels share one scale, and zooming or panning one moves them all. Tick labels show only on the
outer axes (the bottom row and the first column), and so do the axis titles.

To give each panel its own scale, drop the links on the returned figure:

```ts
import hx from '@mk7s/holochart-express';

declare const tips: object[];
const figure = hx.histogram(tips, { x: 'total_bill', facetCol: 'day' });
for (const [key, axis] of Object.entries(figure.layout)) {
  if (key.startsWith('yaxis') && typeof axis === 'object' && axis) {
    delete (axis as Record<string, unknown>)['matches'];
    (axis as Record<string, unknown>)['showticklabels'] = true;
  }
}
```

## Facet labels

Each column is labelled `column=value` above its top panel, and each row at the right of its last
panel, rotated (px's `annotations`, with `labels` applied: `day=Sat`). The labels have no font of
their own, so they follow `layout.font` and the template, as px leaves them. They are named
`'facet label'` (`FACET_LABEL_NAME` from `@mk7s/holochart-core`), so a legend at the top, as in the
default look, sits above them instead of over them.

## Wrapping

`facetColWrap` lays one facet column out over several rows, filling them from the top:

<Example id="express/histogram-facets" :height="480" />

```ts
import hx from '@mk7s/holochart-express';

declare const tips: object[];
hx.histogram(tips, {
  x: 'total_bill',
  color: 'sex',
  facetCol: 'day',
  facetColWrap: 2,
  categoryOrders: { day: ['Thu', 'Fri', 'Sat', 'Sun'] },
});
```

Each panel is labelled on top. When the values don't fill the last row, its empty cells are left
out (px draws empty axes there), and the panels above them keep their x tick labels and titles.
Wrapping is ignored with `facetRow` or a marginal, as in px.

## With other options

- Colors and symbols are the same in every panel, and each group has one legend entry.
- `logX` / `logY`, `rangeX` / `rangeY` and `categoryOrders` apply to every panel.
- Marginals combine with facets along the other direction: `marginalX` with `facetCol`,
  `marginalY` with `facetRow` (the other combinations throw, as in px).
- Pies facet too: each value gets a pie in its own domain cell.
- Too many facets for the spacing (`spacing × (n − 1) ≥ 1`) throws; lower the spacing.
