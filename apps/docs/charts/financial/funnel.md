---
title: Funnel
description: Show how many items make it through each stage of a process, as bars centered on the value axis with connector regions between stages.
status: complete
chart: funnel
---

# Funnel

## Overview

A funnel chart shows the stages of a process, one bar per stage, each as long as the number of
items that reached it: website visits, sign-ups, trials, orders. Bars are centered on the value
axis, so the shape narrows like a funnel, and shaded connector regions join each stage to the
next. Labels can show each stage's share of the first stage, of the previous stage or of the
total. Use it for sales pipelines, conversion and recruiting funnels, or any process where items
drop out step by step.

Holochart lays funnels out like bars and draws them with bar's renderer: the bars of a trace are
one instanced GPU rect set, the connector regions one batched polygon fill, their edges one line
primitive and the labels one batched SDF text set, so zooming or panning only updates a
transform.

Pick a different chart when:

- you want each stage's area, not its length, to carry the value, in a pie-like shape without
  axes: use a [funnel area](/charts/financial/funnelarea);
- the stages are not a sequence that items drop out of, just categories to compare: use a sorted
  [horizontal bar chart](/charts/basic/horizontal-bar);
- you show how a total is built from gains and losses: use a
  [waterfall chart](/charts/financial/waterfall).

## Minimal example

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'funnel',
      y: ['Visits', 'Sign-ups', 'Trials', 'Orders'],
      x: [4000, 1600, 700, 240],
    },
  ],
});
```

A funnel is horizontal by default: one bar per `y` stage, first stage on top, each labeled with its
value. As in Plotly, the value axis is hidden and the stage axis reversed. The live example labels
six sales stages with their value and their share of the first stage
(`textinfo: 'value+percent initial'`):

<Example id="funnel/basic" />

## Data format

- **Stages and values.** A horizontal funnel (the default) takes the stages in `y` (usually
  categories) and one value per stage in `x` (numbers; typed arrays work). With
  `orientation: 'v'` (the default when only `y` is given) the funnel is vertical: stages in `x`,
  values in `y`. Without stages, bars sit at `y0`, `y0 + dy`, … (`x0`, `x0 + dx`, … when vertical;
  defaults 0 and 1). The trace has as many stages as its shorter array.
- **Missing values.** Negative, missing or non-numeric values (`null`, `NaN`) are treated as
  missing, as in Plotly: the stage has no bar and no connectors, and the others keep their places.
- **Percentages** are computed per trace: _percent initial_ is a stage's value relative to the
  first stage, _percent previous_ relative to the previous stage with a value (100% for the first),
  and _percent total_ relative to the sum of the trace's values.
- **Axes.** The value axis defaults to `visible: false`, and a horizontal funnel's stage axis to
  `autorange: 'reversed'` (first stage on top), unless a trace of another type uses that axis or
  you set the axis' `range` or `visible` yourself. Periods (`xperiod`, `yperiod` and their `0` /
  `alignment` companions) work as for [bars](/fundamentals/dates-time-series#period-alignment).

## Variations

### Stacked funnels

Funnel traces that share their stages stack per stage (`layout.funnelmode: 'stack'`, the
default), and the whole stack is centered on the value axis. Each trace keeps its own connector
regions, labels and percentages; the legend toggles each trace and the stacks re-center:

<Example id="funnel/stacked" />

### Labels, percentages and vertical funnels

`textinfo` combines `label`, `text`, `value` and the three percentages; when a label shows several
percentages, each says which it is (`of initial`, `of previous`, `of total`). On the left,
per-stage colors and outlined, tinted connectors; on the right a vertical funnel
(`orientation: 'v'`) with labels outside the bars:

<Example id="funnel/textinfo" />

### Grouped and overlaid funnels

`funnelmode: 'group'` puts the traces of a stage side by side, each bar centered on zero;
`'overlay'` draws them over each other (lower `opacity` or put the smaller trace last to see
both). `funnelgap` sets the gap between stages (default 0.2) and `funnelgroupgap` the gap between
the bars of one stage (default 0):

```ts
import { createChart } from '@mk7s/holochart';

const stages = ['Applied', 'Screened', 'Interviewed', 'Hired'];
createChart(document.getElementById('chart')!, {
  data: [
    { type: 'funnel', name: '2024', y: stages, x: [480, 300, 120, 40] },
    { type: 'funnel', name: '2025', y: stages, x: [620, 350, 160, 55] },
  ],
  layout: { funnelmode: 'group', funnelgap: 0.3, funnelgroupgap: 0.1 },
});
```

<Example id="funnel/grouped" />

### Colors from a colorscale

`marker.color` takes one color per stage, or numbers mapped through `marker.colorscale`, with a
colorbar when `marker.showscale` is on. With per-stage colors the connector regions default to
translucent black, so set `connector.fillcolor` to match your palette:

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'funnel',
      y: ['Seen', 'Clicked', 'Signed up', 'Paid'],
      x: [9000, 2600, 800, 190],
      textinfo: 'value+percent previous',
      marker: { color: [9000, 2600, 800, 190], colorscale: 'Viridis' },
      connector: { fillcolor: 'rgba(128, 131, 143, 0.25)' },
    },
  ],
});
```

<Example id="funnel/colorscale" />

## Styling

- **Bars.** `marker.color` (one color, one per stage, or numbers with `marker.colorscale`,
  `cmin` / `cmax` and a colorbar via `showscale`), `marker.opacity` and `marker.line.color` /
  `marker.line.width`. Each trace takes the next colorway color by default.
- **Connectors.** `connector.visible` (default `true`); `connector.fillcolor`, whose default is
  the marker color at half its opacity (black at half opacity when `marker.color` is an array);
  and `connector.line.color`, `.width` and `.dash` for lines along the slanted edges of each region
  (default width 0: no lines). Connectors draw under the bars.
- **Default look.** In the default `holochart` template, bars are borderless and connector edges,
  when given a width, use the tick-label gray (`#80838f`).
  `layout.template: 'plotly-classic'` gives Plotly's look
  ([themes and templates](/customization/themes-templates)).
- **Labels.** `textinfo` picks what each bar says, in a fixed order, one per line: `label` (the
  stage), `text`, `value`, `percent initial`, `percent previous` and `percent total`. The default is
  `'value'`, or `'text+value'` when `text` is an array. Percentages in labels are rounded to whole
  percents. `texttemplate` overrides it with `%{value}`, `%{percentInitial}`,
  `%{percentPrevious}`, `%{percentTotal}` (shown as percentages without a format, or with one such
  as `%{percentInitial:.1%}`), `%{label}`, `%{x}`, `%{y}`, `%{text}`, `%{customdata}` and
  `%{meta}`.
- **Label placement.** Labels are centered by default (`insidetextanchor: 'middle'`,
  `textangle: 0`, `textposition: 'auto'`); `'inside'`, `'outside'` and `'none'`, the label fonts
  and `constraintext` work as for bars.
- **Extent and order.** `width` and `offset` (one number each, in position-axis units),
  `offsetgroup` and `alignmentgroup`, trace `opacity` and `zorder`.
- **Legend.** Each trace shows a bar glyph in its marker color.

## Interactivity

- **Hover.** Hovering a bar shows the stage's value and the stage, then Plotly's percentage lines
  with one decimal: `50% of initial`, `50% of previous`, `30.8% of total`. `hoverinfo` picks the
  parts: `name`, `x`, `y`, `text`, `percent initial`, `percent previous` and `percent total`.
- **Templates.** `hovertemplate` takes `%{value}`, `%{percentInitial}`, `%{percentPrevious}` and
  `%{percentTotal}` (formatted as percentages without a format) besides `%{x}`, `%{y}`, `%{text}`
  and `%{customdata}`:

  ```ts
  import { createChart } from '@mk7s/holochart';

  createChart(document.getElementById('chart')!, {
    data: [
      {
        type: 'funnel',
        y: ['Visits', 'Sign-ups', 'Orders'],
        x: [4000, 1600, 240],
        hovertemplate: '%{y}: %{x:,}<br>%{percentPrevious} of the stage before<extra></extra>',
      },
    ],
  });
  ```

- **Events.** `hover` and `click` points carry `x`, `y`, `percentInitial`, `percentPrevious` and
  `percentTotal` (ratios, `0.5`), `curveNumber` and `pointNumber`.
- **Selection.** Box and lasso select bars as for [bar charts](/charts/basic/bar#interactivity);
  unselected bars dim.
- **Legend.** A click hides a trace; stacked funnels re-center without it.

## 3D-native options

Holochart extensions (full bundle), see [Extrusion & 2.5D](/customization/extrusion-2-5d#funnels-and-waterfalls):

- `depth`: extrusion of the stages toward the viewer in px, a percentage of the stage thickness
  (`'70%'`), or one number per stage. `0` (default) draws a flat funnel.
- `bevel.size` and `bevel.segments`: rounded front and side edges.
- `material`: Plotly's lighting model (default), `flat`, or a three.js material type.
- `layout.view3d`: the plot area in perspective, with hover and click still exact on the stages.

The connector regions and their outlines lie on the plane of the stages' front faces, so the
stages read as one continuous funnel; labels sit on the front faces.

<Example id="funnel/depth" />

## Performance notes

- A funnel draws in a constant number of draw calls whatever its stage count: one instanced rect
  set for the bars, one batched polygon fill for the connector regions (the fill primitive is
  loaded on first use), one line primitive for their edges and one batched SDF text set for the
  labels.
- Geometry is uploaded once per data change; zoom and pan only update transforms.
- Restyling colors and selections re-upload colors only.
- Funnels have few stages: readability, not rendering, is the limit.

## Accessibility notes

- **Screen readers:** the hidden description (see the [accessibility guide](/guides/accessibility))
  reads `Funnel "name": N bars.`; its table lists each stage with its value and its percentage of
  the first stage.
- **Keyboard:** Tab moves into the plot area; the arrow keys along the stage axis then step through
  the stages (↑ / ↓ in the usual horizontal funnel) and the other two move between traces, each stop
  showing its hover label. See [the keys](/guides/accessibility#keys-in-the-plot-area).
- **Color:** stages are told apart by position and label, not color, so a single color per trace
  works well. Label the percentages (`textinfo: 'value+percent initial'`) so readers don't have to
  compare bar lengths across the gaps.

## Attribute reference

See the [funnel attribute reference](/reference/funnel) for every attribute, its type, and its
default. [`funnelmode`](/reference/layout#funnelmode), [`funnelgap`](/reference/layout#funnelgap)
and [`funnelgroupgap`](/reference/layout#funnelgroupgap) are in the layout reference.

## Related charts

- [Funnel area](/charts/financial/funnelarea): the same stages as stacked trapezoids whose areas
  carry the values
- [Horizontal bar](/charts/basic/horizontal-bar): ranked categories that are not a process
- [Waterfall](/charts/financial/waterfall): how a total is built from gains and losses
- [Pie](/charts/basic/pie): how a whole splits into parts

## Plotly migration notes

- Attribute names and defaults match Plotly's `funnel`: `x`, `y`, `orientation`, `marker` (bar's
  marker without `cornerradius` and `pattern`, as in Plotly), `connector` (`visible`,
  `fillcolor`, `line`), `text`, `textinfo`, `texttemplate`, `textposition`, the label fonts,
  `insidetextanchor`, `textangle`, `constraintext`, `width`, `offset`, `offsetgroup`,
  `alignmentgroup`, `hoverinfo`, `hovertemplate`, `zorder`, and the layout's `funnelmode`,
  `funnelgap` and `funnelgroupgap`. Funnels never share slots with bars or waterfalls, as in
  Plotly.
- The hidden value axis, the reversed stage axis, the centered stacks, the percentages and the
  label and hover text follow Plotly.
- `marker.opacity` is applied (Plotly's funnel ignores it).
- `%{percentTotal}` in `texttemplate` is formatted as a percentage like the other two (Plotly's
  shows the raw ratio).
- Not supported yet: `xhoverformat` / `yhoverformat` (bar has none either),
  `texttemplatefallback` / `hovertemplatefallback`.
