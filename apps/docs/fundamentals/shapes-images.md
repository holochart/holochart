---
title: Shapes & images
description: Lines, rectangles, ellipses and SVG paths in data or paper coordinates, threshold helpers, editable shapes, and layout images such as logos and backgrounds.
status: draft
---

# Shapes & images

`layout.shapes` draws lines, rectangles, ellipses and SVG paths over (or under) your data: thresholds,
highlighted ranges, callouts, regions of interest. `layout.images` places pictures such as logos,
watermarks and backgrounds. Both follow Plotly's attributes, so a Plotly figure's `shapes` and
`images` work unchanged.

## Shapes

A shape has a `type` and a position in the coordinates of its references:

| `type`   | Position                                                      |
| -------- | ------------------------------------------------------------- |
| `line`   | from (`x0`, `y0`) to (`x1`, `y1`)                             |
| `rect`   | the box between (`x0`, `y0`) and (`x1`, `y1`)                 |
| `circle` | the ellipse inscribed in that box                             |
| `path`   | an SVG path in `path` (the default `type` when `path` is set) |

Style it with `line.color`, `line.width` (0 hides the outline), `line.dash`, `fillcolor` and
`opacity`.

<Example id="_dev/shapes-basic" :height="440" />

### Coordinates: `xref` and `yref`

Each dimension has its own reference, so a shape can mix them:

- **An axis** (`'x'`, `'y2'`, the default `'x'` / `'y'`): data units. The shape follows zoom and
  pan and is clipped to the subplot along that axis. On category axes use category names or
  fractional indices; on date axes dates or milliseconds; on **log axes use data values** (not
  exponents: `y0: 1000`, unlike `annotations` and `images`, which take exponents, as in Plotly).
- **`'x domain'` / `'y domain'`**: 0–1 across that axis' domain, i.e. the subplot's width or
  height. A line from `x0: 0` to `x1: 1` in `'x domain'` spans the subplot at any zoom.
- **`'paper'`**: 0–1 across the whole plot area (inside the margins). Values outside 0–1 reach into
  the margins, e.g. a banner above the plot.

Missing positions default to 25% and 75% of the reference.

### Thresholds and bands: `addHline`, `addVline`, `addHrect`, `addVrect`

Like plotly.py's `add_hline` and friends, these helpers append a line or band that spans the whole
subplot (using the axis' `domain` reference) with one `relayout`:

```ts
import { addHline, addVrect, createChart } from '@mk7s/holochart';

const chart = createChart(el, figure);
await addHline(chart, 50, { line: { dash: 'dash', color: '#d62728' }, label: { text: 'target' } });
await addVrect(chart, '2024-03-01', '2024-03-15', {
  fillcolor: 'rgba(99, 110, 250, 0.2)',
  line: { width: 0 },
  layer: 'below',
});
```

The last argument takes any shape attribute. Pass `xref` / `yref` to target another subplot
(`{ xref: 'x2', yref: 'y2' }`).

### Layers

`layer` decides what a shape covers, with Plotly's semantics:

- `'above'` (default): over the traces.
- `'below'`: under the traces **and** the grid lines.
- `'between'`: over the grid lines, under the traces.

Shapes with a `paper` reference and `layer: 'below'` or `'between'` draw under every subplot (and
can extend into the margins).

<Example id="_dev/shapes-layers" :height="420" />

### SVG paths

`path` takes an SVG path whose coordinates are in the shape's references: `M`, `L`, `H`, `V`,
`C`, `S`, `Q`, `T`, `A`, `Z` and their relative (lowercase) forms, with implicit repetition.
Curves are flattened adaptively, finer as you zoom in. `fillrule` (`'evenodd'`, the default, or
`'nonzero'`) decides how overlapping subpaths fill; open paths are closed for filling, as in SVG.

On date axes write dates with `_` between date and time (`M 2024-01-05_12:00 10`); relative
commands and arcs need numbers. Arc radii are in the path's units and the sweep flag follows the
data's y-up orientation (`1` = counter-clockwise on screen).

<Example id="_dev/shapes-paths" :height="420" />

### Pixel-sized shapes

With `xsizemode: 'pixel'` (or `ysizemode`), `x0` / `x1` and path x values are **px offsets** from
`xanchor` (a position in `xref` units; y offsets are positive up). The shape keeps its size when
you zoom: callouts, rings around points, markers of your own.

<Example id="_dev/shapes-pixel" :height="420" />

### Labels

`label` puts text on a shape: `text` (or `texttemplate` with `%{x0}`, `%{x1}`, `%{y0}`, `%{y1}`,
`%{xcenter}`, `%{ycenter}`, `%{dx}`, `%{dy}`, `%{width}`, `%{height}`, and `%{length}` /
`%{slope}` for lines), `font`, `padding`, `textangle`, `xanchor` / `yanchor` and `textposition`:
`'start'`, `'middle'` or `'end'` along a line (the text follows the line's angle), or one of 9 box
positions (`'top left'` … `'bottom right'`) for other shapes.

### Editing

With `config.editable`, `config.edits.shapePosition` or a shape's own `editable: true`, users can
drag a shape to move it, drag a rectangle's or ellipse's edge or corner to resize it, and drag a
line's end. Each drag emits one `relayout` event with Plotly's attribute strings
(`shapes[0].x0`, …). Dragging a path moves all its points and rewrites it with absolute commands.

## Images

`layout.images` places pictures from a URL or a data URI. The box is `sizex` × `sizey` in the
references' units, anchored at `x` / `y` by `xanchor` (`'left'` default) and `yanchor` (`'top'`
default). `xref` / `yref` default to `'paper'`. `sizing` decides how the picture fills its box:

- `'contain'` (default): fit inside, keeping the aspect ratio, aligned by the anchors.
- `'fill'`: cover the box, keeping the aspect ratio (cropped).
- `'stretch'`: fill the box exactly.

<Example id="_dev/images-logo" :height="400" />

`layer: 'below'` puts an image under the traces and the grid (with axis references it is clipped to
the subplot and follows zoom), the default `'above'` over them. `opacity` fades it.

<Example id="_dev/images-background" :height="400" />

Images load asynchronously: `chart.ready` (and every update promise) resolves once they are
drawn, so exports and screenshots include them. A picture that fails to load logs one warning and
is skipped. Cross-origin URLs need CORS headers, because WebGL cannot draw images from other
origins without them; data URIs and same-origin files always work.

## Differences from Plotly

- `above` shapes and images cover the traces but not the axis lines, tick labels, legend or
  annotations, which Holochart draws on top of them (Plotly draws `above` shapes over axis lines
  and tick labels).
- `below` / `between` shapes with an axis-domain reference are clipped to the plot area.
- Within one layer, all fills draw before all outlines, so an outline of one shape can show over
  the fill of a later overlapping shape.
- As in Plotly, shapes referenced to a data axis extend that axis's autorange (every path
  coordinate counts, control points included); `paper` and `domain` references don't.
- Shape legend entries (`showlegend`, `legendgroup`) and the modebar's drawing tools (`drawline`,
  `drawrect`, `eraseshape`, …, `newshape`) are not available yet.
- Plotly paths accept only absolute `M L H V Q C T S Z`; Holochart also accepts relative commands
  and arcs.

See the attribute reference for [`shapes` and `images`](/reference/layout).
