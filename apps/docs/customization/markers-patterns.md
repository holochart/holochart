---
title: Patterns & textures
description: Hatch bars, histograms, polar bars, pie slices and filled areas with line and dot patterns, for print, grayscale and color-blind readers.
status: complete
---

# Patterns & textures

A pattern fill draws a hatch of lines or dots instead of a plain color. Patterns tell series apart
without relying on color alone, so charts survive black-and-white printing and photocopies, and
read for color-blind readers. Holochart draws Plotly's patterns:

- `marker.pattern` on `bar`, `histogram`, `barpolar`, `pie` and `funnelarea` (each bar, slice
  or stage can have its own), and on the sectors and tiles of `sunburst`, `treemap` and `icicle`,
- `fillpattern` on filled `scatter` traces (areas).

Legend entries show the patterns too. Express draws them from its `pattern` argument.

<Example id="bar/patterns" />

```ts
import { createChart } from '@mk7s/holochart';

createChart(el, {
  data: [
    {
      type: 'bar',
      x: ['none', '/', '\\', 'x', '-', '|', '+', '.'],
      y: [9, 14, 12, 17, 11, 15, 13, 16],
      marker: { pattern: { shape: ['', '/', '\\', 'x', '-', '|', '+', '.'] } },
    },
  ],
});
```

## Attributes

| Attribute   | Default     | What it does                                                                                                                                              |
| ----------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shape`     | `''`        | `'/'` and `'\'` (diagonal lines), `'x'` (both), `'-'` and `'\|'` (horizontal and vertical lines), `'+'` (both), `'.'` (dots). `''` draws the plain fill.  |
| `fillmode`  | `'replace'` | `'replace'`: the pattern replaces the fill. `'overlay'`: the pattern is drawn over the fill color.                                                        |
| `fgcolor`   | see below   | The color of the lines or dots.                                                                                                                           |
| `bgcolor`   | see below   | The color between them.                                                                                                                                   |
| `fgopacity` | 1 or 0.5    | Opacity of `fgcolor`: 1 with `'replace'`, 0.5 with `'overlay'`.                                                                                           |
| `size`      | 8           | The size of the pattern's tile in pixels: the spacing between lines or dots.                                                                              |
| `solidity`  | 0.3         | The fraction of the area the pattern covers, from 0 (only `bgcolor`) to 1 (only `fgcolor`). It sets the line width (`solidity × size`) or the dot radius. |

In `marker.pattern`, `shape`, `size`, `solidity`, `fgcolor` and `bgcolor` take one value for
every bar (or slice), or an array with one value per bar. `fillpattern` takes single values.

## Fill modes and colors

The two fill modes pick different default colors from the bar's color (`marker.color`, one per
bar, or the colorscale's color for numeric colors):

- `'replace'` (the default): the lines or dots take the bar's color, on a transparent
  background. The bar reads as a hatch; add `marker.line` to outline it. A pie's background is the
  paper color instead.
- `'overlay'`: the bar keeps its color as the background, and the lines or dots take its
  contrast color, white on dark colors and dark grey (`#444`) on light ones, at half opacity.

`fgcolor` and `bgcolor` override the defaults. `size` and `solidity` vary per bar here too:

<Example id="bar/pattern-fillmode" />

```ts
import { createChart } from '@mk7s/holochart';

createChart(el, {
  data: [
    { type: 'bar', name: 'replace', y: [20, 14, 23], marker: { pattern: { shape: '/' } } },
    {
      type: 'bar',
      name: 'overlay',
      y: [12, 18, 29],
      marker: { pattern: { shape: '/', fillmode: 'overlay' } },
    },
    {
      type: 'bar',
      name: 'size, solidity',
      y: [16, 11, 19],
      marker: {
        pattern: { shape: 'x', fillmode: 'overlay', size: [4, 8, 14], solidity: [0.2, 0.3, 0.6] },
      },
    },
  ],
  layout: { barmode: 'group' },
});
```

Plotly's templates (`plotly`, `plotly_white`, `simple_white` and the others Plotly ships) set
`fillmode: 'overlay'`, `size: 10` and `solidity: 0.2` for bars, histograms, polar bars and area
fills, as in Plotly. Holochart's default look and `plotly-classic` keep Plotly's attribute
defaults (`'replace'`, 8, 0.3).

## Print and grayscale

For a chart that must work in black and white, give every series its own shape and draw the
patterns in black on white. Set `fillmode: 'replace'` explicitly on templates that overlay
patterns:

<Example id="bar/pattern-print" />

```ts
import { createChart } from '@mk7s/holochart';

const shapes = ['', '/', 'x', '.'] as const;
createChart(el, {
  data: shapes.map((shape, k) => ({
    type: 'bar' as const,
    name: `Series ${k + 1}`,
    x: ['North', 'South', 'East'],
    y: [20 + k, 15 + 2 * k, 12 + k],
    marker: {
      color: k === 0 ? '#bbbbbb' : '#000000',
      line: { color: '#000000', width: 1 },
      pattern: { shape, fillmode: 'replace', bgcolor: '#ffffff', size: 7 },
    },
  })),
  layout: { template: 'simple_white', barmode: 'stack' },
});
```

## Histograms, polar bars and pies

Histograms and polar bars take bar's `marker.pattern`. Overlaid histograms hatched in opposite
directions cross-hatch where they overlap:

<Example id="histogram/patterns" />

<Example id="polar/barpolar-patterns" />

Pie slices take one pattern each, in the slice colors. By default they are drawn on the paper
color:

<Example id="pie/patterns" />

Funnel area stages take pie's `marker.pattern`, with the same defaults: one pattern per stage, on
the paper color unless `fillmode` is `'overlay'`:

<Example id="funnelarea/patterns" />

## Filled areas

`fillpattern` hatches a scatter fill (`fill: 'tozeroy'`, stacked areas, `'toself'`…). The
pattern's default color is `fillcolor`, which is the line color at half opacity unless you set
it. A `fillpattern` with a shape is drawn instead of a `fillgradient`.

<Example id="area/pattern" />

```ts
import { createChart } from '@mk7s/holochart';

createChart(el, {
  data: [
    {
      type: 'scatter',
      y: [21, 22, 20, 23],
      stackgroup: 'energy',
      fillpattern: { shape: '|', solidity: 0.25 },
    },
    {
      type: 'scatter',
      y: [4, 6, 9, 13],
      stackgroup: 'energy',
      fillpattern: { shape: 'x', fillmode: 'overlay', size: 10, solidity: 0.2 },
    },
  ],
});
```

## Express

In Express, `pattern` names a column: each of its values gets a pattern shape, from
`patternShapeSequence` (default `''`, `/`, `\`, `x`, `+`, `.`) or `patternShapeMap`, like
`pattern_shape` in Plotly Express. It works with `bar`, `histogram` and `timeline`:

<Example id="express/bar-pattern" />

```ts
import hx from '@mk7s/holochart-express';

const figure = hx.bar(
  [
    { nation: 'South Korea', medal: 'gold', count: 24 },
    { nation: 'South Korea', medal: 'silver', count: 13 },
    { nation: 'China', medal: 'gold', count: 10 },
    { nation: 'China', medal: 'silver', count: 15 },
  ],
  { x: 'nation', y: 'count', color: 'nation', pattern: 'medal', patternShapeSequence: ['.', 'x'] },
);
```

## How patterns render

Patterns are computed in the fragment shader: no textures, and no extra draw calls. Bars, wedges
and fills keep drawing each trace in one call.

- **Screen pixels.** Tiles are `size` CSS pixels, as in Plotly's SVG patterns, so the spacing
  stays the same when you zoom, and patterns stay sharp at any device pixel ratio. Lines and dots
  are anti-aliased over one device pixel; lines thinner than a pixel draw fainter instead of
  disappearing.
- **Anchoring.** Tiles line up with the top-left corner of the plot area for bars, histograms and
  areas, with the top-left corner of the chart for funnel area stages, and with the center of the
  pie (or of the polar subplot) for pie slices and polar bars on circular grids. Sunburst sectors
  are anchored like pie slices, treemap and icicle tiles like bars. Neighboring bars and stacked
  areas continue the same pattern.
- **Loading.** The pattern code is about 2 kB and loads the first time a chart draws a pattern;
  charts without patterns never load it. Until it arrives, patterned items draw their plain fill
  for a frame. `chart.ready`, the promise an update returns, and image export wait for it.

## Differences from Plotly

- `pattern.path` (a custom SVG path as the tile) is not supported yet. Neither is Holochart's
  planned image texture fill, `marker.texture`.
- Plotly computes the default `fgcolor`, `bgcolor` and `fgopacity` when it fills in the figure's
  defaults. Holochart computes them per bar when drawing, so they don't appear in `chart.fullData`
  unless you set them. With `fillmode: 'overlay'` and per-bar colors each bar gets its own contrast
  color (Plotly uses white for all of them), and a pie's slices overlay their own colors (Plotly
  draws white on the paper color).
- The contrast color is picked over the plot's background, so translucent fill colors get a
  readable pattern on dark templates too. Plotly always composites over white.
- Legend glyphs use Plotly's legend sizes (tiles at 80 %, at most 10 px) for pie slices too.
