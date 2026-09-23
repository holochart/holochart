---
title: Bar
description: Compare values across categories with vertical or horizontal bars, grouped or stacked.
status: draft
chart: bar
---

# Bar

## Overview

A bar chart draws one rectangle per category, with length proportional to its value. Use it to
compare values across categories. Bars can be vertical or horizontal, and several bar traces can
be grouped side by side, stacked, or overlaid.

## Minimal example

```ts
import { createChart } from '@mk7s/holochart';

createChart(el, {
  data: [{ type: 'bar', x: ['A', 'B', 'C'], y: [20, 14, 23] }],
});
```

The live demo below is a placeholder. It shows the GPU rectangle primitive that bar traces are
built on, not a full chart. It will be replaced by chart-level examples when the M1 runtime lands.

<Example id="_dev/rects-bars" />

## Data format

- `x` and `y`: categories and values. For vertical bars, `x` holds categories and `y` holds
  values. For horizontal bars (`orientation: 'h'`), swap them.
- Values can be negative. Bars then extend below (or left of) the base.
- `base`, `width`, and `offset` set each bar's start, thickness, and position. Each accepts a
  single value or a per-bar array.
- `text` and `customdata`: per-bar labels and extra data for hover templates.

## Variations

TODO: add chart-level examples for horizontal bars, grouped bars, stacked bars, relative
(positive and negative) stacking, and bars with text labels once the M1 runtime lands.

## Styling

- `orientation`: `'v'` (vertical, default) or `'h'` (horizontal).
- `marker.color`: one color, per-bar colors, or numbers mapped through `marker.colorscale`.
- `marker.line.color` and `marker.line.width` for bar outlines.
- `marker.opacity` and `marker.cornerradius`.
- `layout.barmode`: `'group'`, `'stack'`, `'relative'`, or `'overlay'`, for how bar traces
  that share an axis combine.
- `layout.bargap` and `layout.bargroupgap`: spacing between bars and between groups.
- `layout.barnorm`: `'fraction'` or `'percent'` to normalize stacks.
- `textposition`: `'inside'`, `'outside'`, `'auto'`, or `'none'`.

## Interactivity

TODO: document hover per bar, selection, and click events once they land in M1.

## 3D-native options

TODO: document bar extrusion (`depth`, `bevel`, `material`) once it lands. See
[Materials & lighting](/customization/materials-lighting).

## Performance notes

TODO: document instanced bar rendering and the cost of outlines and text labels.

## Accessibility notes

TODO: document what the DOM mirror announces for bars, keyboard navigation, and hatch patterns
(`marker.pattern`) for print and color-blind readers.

## Attribute reference

See the [bar attribute reference](/reference/bar) for every attribute, its type, and its default.
Bar layout options such as `barmode` are in the [layout reference](/reference/layout#barmode).

## Related charts

- [Line](/charts/basic/line): trends over an ordered variable
- [Scatter](/charts/basic/scatter): relationships between two numeric variables

## Plotly migration notes

- Attribute names, `barmode` values, and `offsetgroup`/`alignmentgroup` behavior match Plotly.
- Bar extrusion (`depth`, `bevel`, `material`) is a Holochart extension with no Plotly equivalent.
