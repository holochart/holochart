---
title: Funnel area
description: Show the stages of a process as stacked trapezoids whose areas are proportional to their values, like a pie in the shape of a funnel.
status: complete
chart: funnelarea
---

# Funnel area

## Overview

A funnel area draws the stages of a process as trapezoids stacked into a funnel, first stage on
top. Each stage's _area_ is proportional to its value, and the stages together fill the shape, so
it reads like a [pie](/charts/basic/pie) in the shape of a funnel: how a whole divides across the
stages, and roughly how much each one shrinks. It takes pie's data (`labels`, `values`) and has
no axes; the legend lists the stages. Use it for a customer journey, a marketing funnel or a
pipeline overview, where the shape matters more than exact comparisons.

Holochart draws every stage of a trace in one batched GPU polygon fill, the outlines in one line
primitive and the labels and title in one batched SDF text set.

Pick a different chart when:

- readers need to compare stage values precisely, or read percentages of the first or previous
  stage: use a [funnel](/charts/financial/funnel), whose bar lengths compare directly;
- the parts have no order: use a [pie](/charts/basic/pie);
- you compare the same stages across many groups: use grouped or stacked
  [bars](/charts/basic/bar), or funnels in `funnelmode: 'group'`.

## Minimal example

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'funnelarea',
      labels: ['Awareness', 'Interest', 'Consideration', 'Purchase'],
      values: [520, 310, 180, 40],
    },
  ],
});
```

The stages stack in data order, each labeled with its percent of the total, and the legend lists
one item per stage. The live example labels each stage with its name and value
(`textinfo: 'label+value'`) and adds a title above the funnel:

<Example id="funnelarea/basic" />

## Data format

- **`values`**: the size of each stage (numbers; typed arrays work). Negative and missing values
  are skipped, as in pies; a trace without a positive value is not drawn.
- **`labels`**: the name of each stage, shown in the legend, labels and hover. Stages with the
  same label are merged and their values added; the stages are then sorted by value, largest on
  top. Otherwise they keep the data order.
- Without `values`, each label counts once; without `labels`, stages are named `label0`,
  `label0 + dlabel`, … (defaults 0 and 1). The trace has as many stages as its shorter array.
- **`text`** and **`hovertext`**: extra per-stage strings for `textinfo: 'text'`, `%{text}` in
  templates, and hover.
- **Placement.** `domain.x` and `domain.y` (fractions of the plot area), or `domain.row` and
  `domain.column` in a [`layout.grid`](/fundamentals/layout-axes-subplots#pies-and-other-domain-traces).
  The funnel is centered in its domain.

## Variations

### Side by side with a shared scale

`layout.grid` splits the plot area and each trace picks a cell with `domain.column`. By default
each funnel area fills its cell; with the same `scalegroup` their areas follow their totals, so
the smaller year reads as smaller. Stage colors are shared by label, and one legend item hides a
stage in both:

<Example id="funnelarea/domains" />

### Aspect and base ratios

`aspectratio` sets the funnel's height relative to its width (default 1) and `baseratio` the
width of the narrow end relative to the wide end (default 0.333, at most 0.999). The stage areas
stay proportional to the values in every shape:

<Example id="funnelarea/ratios" />

### Labels and templates

`textinfo` combines `label`, `text`, `value` and `percent`, one per line. `texttemplate` gives
full control with `%{label}`, `%{value}`, `%{percent}`, `%{text}`, `%{color}`, `%{customdata}`
and `%{meta}`; without a format, `%{value}` and `%{percent}` are formatted like `textinfo`:

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'funnelarea',
      labels: ['Leads', 'Qualified', 'Proposal', 'Won'],
      values: [300, 180, 90, 30],
      texttemplate: '<b>%{label}</b><br>%{value:,} (%{percent})',
      textfont: { size: 13 },
    },
  ],
});
```

<Example id="funnelarea/texttemplate" />

### Stage colors

`marker.colors` sets one color per stage. Without it, stages take `layout.funnelareacolorway`
(default: the `colorway`) by label, so a label keeps its color in every funnel area of the figure:

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'funnelarea',
      labels: ['Seen', 'Clicked', 'Signed up', 'Paid'],
      values: [60, 25, 10, 5],
      marker: { line: { width: 2 } },
    },
  ],
  layout: { funnelareacolorway: ['#5e74d5', '#9962c0', '#b8267e', '#ea2a37'] },
});
```

<Example id="funnelarea/colors" />

### Pattern fills

`marker.pattern` hatches the stages as it does pie slices: `shape`, `size`, `solidity`, `fgcolor`
and `bgcolor` take one value per stage. With the default `fillmode: 'replace'` each hatch is drawn
in its stage color on the paper color; with `'overlay'` it is drawn over the stage color in a
contrasting color (see [Patterns & textures](/customization/markers-patterns)). The legend shows
the patterns too:

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'funnelarea',
      labels: ['Leads', 'Qualified', 'Proposal', 'Won'],
      values: [300, 180, 90, 30],
      marker: { pattern: { shape: ['/', '.', 'x', '+'], solidity: 0.45 } },
    },
  ],
});
```

<Example id="funnelarea/patterns" />

### Uniform text

Stage labels shrink to fit their stage, so the narrow stages end up with smaller labels.
`layout.uniformtext` draws every stage label of every funnel area in the chart at one size, the
size of the smallest label that still fits, as in Plotly (and as for
[bars and pies](/fundamentals/hover-text-templates#uniform-text-size)). With `mode: 'hide'`,
labels that would have to shrink below `minsize` to fit are hidden; with `'show'` they are drawn
at the common size. `minsize` also raises smaller label fonts:

<Example id="funnelarea/uniformtext" />

## Styling

- **Colors.** `marker.colors` (one per stage) or `layout.funnelareacolorway` by label. With
  `layout.extendfunnelareacolors` (default `true`) the colorway is extended to three times its
  length, every color 20% lighter then every color 20% darker, before colors repeat. Colors from
  `marker.colors` are never extended.
- **Outlines.** `marker.line.color` (default: `layout.paper_bgcolor`, which separates the stages)
  and `marker.line.width` (default 1 px, centered on the edges); both take one value per stage too.
- **Shape.** `aspectratio` and `baseratio`; the funnel is centered in its `domain`.
- **Labels.** `textinfo` (default `'percent'`, or `'text+percent'` when `text` is an array),
  `texttemplate`, and `textposition`: `'inside'` (the default: centered in the largest rectangle
  inside the stage, shrunk to fit) or `'none'`. `textfont` and `insidetextfont` style them; unless
  you set a text color, labels take a color that contrasts with their stage.
  `layout.uniformtext` draws them all at one size.
- **Patterns.** `marker.pattern` hatches the stages: `shape`, `size`, `solidity` and colors per
  stage, and `fillmode` (see [Patterns & textures](/customization/markers-patterns)).
- **Title.** `title.text` and `title.font`, and `title.position`: `'top left'`,
  `'top center'` (the default) or `'top right'`. The title sits above the funnel and shrinks to
  fit the domain's width.
- **Default look.** Stages take the template's colorway and are outlined in its paper color, so
  they follow the theme in use ([themes and templates](/customization/themes-templates)).

## Interactivity

- **Hover.** Hovering a stage shows pie's label beside the middle of the stage's right edge: the
  label, `text`, value and percent of the total, picked with `hoverinfo` (`label`, `text`,
  `value`, `percent`, `name`). The stage under the pointer is found exactly, inside its trapezoid,
  whatever `hovermode` says. `hovertemplate` takes pie's variables: `%{label}`, `%{value}`,
  `%{percent}` (already formatted, such as `'41.7%'`), `%{text}`, `%{color}` and `%{customdata}`.
- **Legend.** One item per stage label, not per trace. A click hides that stage in every funnel
  area and pie of the figure, and the other stages fill the funnel, with percentages recomputed
  over the visible stages; a double-click shows only that label. The hidden labels are kept in
  `layout.hiddenlabels` (shared with pies), so you can set them yourself:

  ```ts
  import { createChart } from '@mk7s/holochart';

  const chart = createChart(document.getElementById('chart')!, {
    data: [{ type: 'funnelarea', labels: ['A', 'B', 'Other'], values: [50, 30, 20] }],
  });
  await chart.relayout({ hiddenlabels: ['Other'] });
  ```

- **Events.** `hover`, `unhover` and `click` carry Plotly-shaped points: `curveNumber`,
  `pointNumber`, `label`, `value`, `percent` (a fraction, `0.25`), `text` and `color`.
  `legendclick` and `legenddoubleclick` carry the item's `label`.
- Funnel areas have no axes, so zoom, pan and box or lasso selection don't apply to them.

## Performance notes

- A funnel area draws in a constant number of draw calls whatever its stage count: one batched
  polygon fill for the stages (the fill primitive is loaded on first use), one line primitive for
  the outlines and one batched SDF text set for the labels and the title.
- Stages are few, so every update rebuilds the small buffers in place; restyles re-upload colors.
- Hiding a stage from the legend is a `relayout` of `hiddenlabels`: the funnel re-flows without
  re-sending the data.
- As with pies, readability is the limit: past about eight stages, merge the tail or use a
  [funnel](/charts/financial/funnel).

## Accessibility notes

- **Screen readers:** the hidden description (see the [accessibility guide](/guides/accessibility))
  reads `Funnel area "name": N stages, total X.` (and how many stages are hidden); its table
  lists each visible stage with its value and percent.
- **Keyboard:** Tab moves into the plot area; the arrow keys then step through the stages, each
  showing its hover label. See [the keys by chart
  family](/guides/accessibility#keys-by-chart-family). The script-tag build leaves these stops out
  for now.
- **Color:** the stages are in order from top to bottom, so label them directly
  (`textinfo: 'label+percent'`) rather than asking readers to match legend colors, and keep the
  outlines in the background color to separate neighbors. Pattern fills (`marker.pattern`) tell
  stages apart in print and for color-blind readers.

## Attribute reference

See the [funnelarea attribute reference](/reference/funnelarea) for every attribute, its type,
and its default. [`funnelareacolorway`](/reference/layout#funnelareacolorway),
[`extendfunnelareacolors`](/reference/layout#extendfunnelareacolors) and
[`hiddenlabels`](/reference/layout#hiddenlabels) are in the layout reference.

## Related charts

- [Funnel](/charts/financial/funnel): stages as centered bars on a value axis, with percentages
  of the first and previous stage
- [Pie](/charts/basic/pie): the same data as slices of a circle, without an order
- [Bar](/charts/basic/bar): exact comparisons across stages and groups

## Plotly migration notes

- Attribute names and defaults match Plotly's `funnelarea`: `labels`, `values`, `label0` /
  `dlabel`, `text`, `hovertext`, `marker.colors`, `marker.line`, `marker.pattern`, `scalegroup`,
  `textinfo`, `texttemplate`, `textposition`, `textfont`, `insidetextfont`, `title` (`text`,
  `font`, `position`), `domain`, `aspectratio`, `baseratio`, `hoverinfo`, `hovertemplate`, and
  the layout's `funnelareacolorway`, `extendfunnelareacolors`, `hiddenlabels` and `uniformtext`.
  Plotly funnel area figures carry over unchanged.
- The stage geometry, the order (sorted only when labels were merged), shared colors by label,
  `scalegroup` sizing, legend toggling, hover text and `uniformtext` sizing (negotiated among
  funnel areas only, not with pies, as in Plotly) follow Plotly.
- Patterns differ from Plotly's as pie's do: default colors are computed per stage when drawing
  (so they don't appear in `chart.fullData`), and with `fillmode: 'overlay'` each stage overlays
  its own color (see [the differences](/customization/markers-patterns#differences-from-plotly)).
- Not supported yet: `marker.pattern.path`, `texttemplatefallback` / `hovertemplatefallback`.
- An extruded 3D pyramid (`depth`, `shape`) is a planned Holochart extension.
