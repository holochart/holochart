---
title: Bubble
description: Scatter points sized by a third variable, and optionally colored by a fourth.
status: complete
chart: scatter
---

# Bubble

## Overview

A bubble chart is a scatter plot whose marker sizes encode a third variable. Use it to compare
items on two measures at once while showing how big each one is, such as countries by income and
life expectancy sized by population. A numeric `marker.color` adds a fourth variable. A bubble
chart is a [scatter](/charts/basic/scatter) trace with one `marker.size` value per point.

Pick a different chart when:

- the size values need to be compared precisely: people judge areas poorly, so use a
  [bar chart](/charts/basic/bar) for the third variable, or a second chart;
- you have thousands of points: large bubbles overlap into a blob. Use a plain
  [scatter plot](/charts/basic/scatter) with small markers;
- the x values are ordered and the trend matters: use a [line chart](/charts/basic/line).

## Minimal example

```ts
import { bubbleSizeref, createChart } from '@mk7s/holochart';

const size = [120, 480, 60, 950];
const chart = createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'scatter',
      mode: 'markers',
      x: [1, 2, 3, 4],
      y: [10, 14, 9, 16],
      marker: { size, sizemode: 'area', sizeref: bubbleSizeref(size, 60) },
    },
  ],
});
```

`sizemode: 'area'` makes each bubble's area proportional to its value, and `bubbleSizeref(size, 60)`
scales the sizes so that the largest bubble is 60 px across. The live example has three groups
sharing one scale:

<Example id="bubble/basic" />

## Data format

- `x` and `y`: the bubble centers, as for any [scatter](/charts/basic/scatter#data-format) trace.
- `marker.size`: one number per point. The values are scaled to pixels with `marker.sizemode` and
  `marker.sizeref`, exactly as in Plotly:
  - `sizemode: 'area'`: a value `v` draws a bubble `2·sqrt(v / 2 / sizeref)` px across, so the
    area is proportional to the value.
  - `sizemode: 'diameter'` (the default): the bubble is `v / sizeref` px across.
  - `sizeref` defaults to 1. `sizemin` (px) sets a lower bound on the drawn size, so tiny values
    stay visible.
- `marker.color`: one color, one CSS color per point, or numbers mapped through
  `marker.colorscale`.
- Zero, negative, `null`, or `NaN` sizes draw no bubble. Points are drawn in array order, so sort
  them largest first if small bubbles should be drawn on top of large ones.
- Several traces don't share a scale on their own. Give them the same `sizeref`, computed over all
  their sizes, so bubble sizes compare across traces.

## Variations

### Color by value

A numeric `marker.color` maps through `marker.colorscale`, so one bubble shows two values: size and
color. `marker.showscale: true` draws a colorbar; `marker.colorbar` takes a title and the axis tick
API (`ticksuffix`, `dtick`, `tickformat`, …).

<Example id="bubble/colorscale" />

### Scaling large values with `bubbleSizeref`

Data such as populations runs far beyond pixel sizes. `bubbleSizeref(sizes, maxPx)` returns the
`sizeref` that draws the largest value `maxPx` px across. For `sizemode: 'area'` that is Plotly's
documented `2 · max(size) / maxPx²`; pass `{ sizemode: 'diameter' }` for diameter scaling. It
ignores non-numeric and non-positive sizes. Import it from `@mk7s/holochart` (or
`@mk7s/holochart-traces-basic`).

<Example id="bubble/sizeref" />

### Area vs diameter

With `sizemode: 'diameter'`, a value twice as large draws a bubble twice as wide, which is four
times the area, so large values look far larger than they are. Use `'area'` for data. The default
stays `'diameter'` for Plotly compatibility.

<Example id="bubble/sizemode" />

### Labels inside bubbles

`mode: 'markers+text'` with `textposition: 'middle center'` centers each `text` label on its
bubble. Choose `sizeref` and `sizemin` so the smallest bubble fits its label, and a `textfont.color`
that contrasts with the fill.

<Example id="bubble/labels" />

### Bubbles with a diverging scale

Bubbles combine with everything else a scatter trace does. This example pairs area-scaled bubbles
with a second trace colored on a diverging scale around `cmid: 0`.

<Example id="scatter/colorscale" />

## Styling

- `marker.size`, `marker.sizemode`, `marker.sizeref`, and `marker.sizemin`, as above.
- `marker.opacity`: bubbles default to 0.7, so overlapping bubbles stay visible.
- `marker.line.color` / `marker.line.width`: bubbles default to a 1 px white outline, which
  separates overlapping bubbles. Set `marker.line.width: 0` to remove it.
- `marker.color`, `marker.colorscale`, `cmin`, `cmax`, `cmid`, and `reversescale` for numeric
  colors; `marker.coloraxis` shares one scale and colorbar between traces.
- `marker.symbol` works too, though circles are the norm for bubbles.
- Every marker attribute accepts per-point arrays. See the
  [scatter styling section](/charts/basic/scatter#styling).

## Interactivity

- **Hover.** Hovering anywhere over a bubble picks it, not only its center. `%{marker.size}` and
  `%{marker.color}` in `hovertemplate` show the raw values, for example
  `'%{text}: %{marker.size:,} people<extra></extra>'`.
- **Selection.** Box and lasso select bubbles by their center. Selected and unselected styles work
  as on the [scatter page](/charts/basic/scatter#interactivity).
- **Zoom and pan** keep the bubble sizes in pixels: zooming spreads bubbles apart without growing
  them.
- **Events.** `hover`, `click`, and `selected` events carry `pointNumber`, `x`, `y`, and
  `customdata`. See the [events reference](/reference/events).

## Performance notes

- Bubbles are instanced markers on the GPU, like every scatter marker. The cost grows with the
  pixels they cover, so thousands of large, overlapping, semi-transparent bubbles cost more fill
  time than the same number of small markers.
- Changing `marker.size` or `sizeref` recomputes the trace, because sizes pad the axis autorange.
  Changing `marker.color` only rewrites a color buffer.
- Pass typed arrays (`Float64Array`) for `x`, `y`, and `marker.size` with large data.

## Accessibility notes

- **Screen readers:** a chart is a single `<canvas>`, and the DOM mirror that describes points to
  assistive technology is not built yet (planned for M2, see the
  [accessibility guide](/guides/accessibility)). Add a caption or `aria-label`, and a table with
  the size values: they are the hardest part of a bubble chart to read.
- **Keyboard:** there is no keyboard navigation between points yet.
- **Color and size:** don't encode the key message in bubble size alone. Label the important
  bubbles, state the size scale in a caption, and pick a colorscale that reads in grayscale (such as
  `'Viridis'`).

## Attribute reference

Bubble charts use the scatter trace. See the [scatter attribute reference](/reference/scatter),
especially [`marker.size`](/reference/scatter#marker.size),
[`marker.sizemode`](/reference/scatter#marker.sizemode),
[`marker.sizeref`](/reference/scatter#marker.sizeref), and
[`marker.sizemin`](/reference/scatter#marker.sizemin). `bubbleSizeref` is documented in the
[API reference](/reference/api/holochart/functions/bubbleSizeref).

## Related charts

- [Scatter](/charts/basic/scatter): the same trace with a fixed marker size
- [Line](/charts/basic/line): ordered data where the trend matters
- [Bar](/charts/basic/bar): when the size values need a precise comparison

## Plotly migration notes

- A Plotly bubble chart is a `scatter` trace with array `marker.size`, and carries over unchanged.
  `sizemode`, `sizeref`, and `sizemin` use Plotly's exact formula.
- `bubbleSizeref(sizes, maxPx)` is a Holochart helper for Plotly's documented recipe
  `sizeref = 2 · max(size) / maxPx²`.
- As in Plotly, bubbles (array `marker.size`) default to `marker.opacity: 0.7` and a 1 px white
  outline.
- Not supported yet: a size legend (`marker.sizelegend`).
