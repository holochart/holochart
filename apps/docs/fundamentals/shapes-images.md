---
title: Shapes & images
description: Lines, rectangles, ellipses and SVG paths in data or paper coordinates, threshold helpers, editing and drawing shapes, and layout images such as logos and backgrounds.
status: complete
---

# Shapes & images

`layout.shapes` draws lines, rectangles, ellipses and SVG paths over (or under) your data: thresholds,
highlighted ranges, callouts, regions of interest. `layout.images` places pictures such as logos,
watermarks and backgrounds. Both follow Plotly's attributes, so a Plotly figure's `shapes` and
`images` work unchanged, apart from the [differences](#differences-from-plotly) below.

## Shapes

A shape has a `type` and a position in the coordinates of its references:

| `type`   | Position                                      |
| -------- | --------------------------------------------- |
| `line`   | from (`x0`, `y0`) to (`x1`, `y1`)             |
| `rect`   | the box between (`x0`, `y0`) and (`x1`, `y1`) |
| `circle` | the ellipse inscribed in that box             |
| `path`   | an SVG path in `path`                         |

Without `type`, a shape is a `path` when `path` is set and a `rect` otherwise.

Style it with `line.color`, `line.width` (0 hides the outline), `line.dash`, `fillcolor`
(transparent by default) and `opacity`. The outline defaults to Plotly's 2 px `#444`; the
default look sets 1 px in the text color through `template.layout.shapedefaults`.
`visible: false` hides a shape.

The example has a rectangle, an ellipse and a line in data coordinates, two labeled threshold
lines across the subplot, and a frame and a banner in paper coordinates:

<Example id="shapes/basic" :height="440" />

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

Missing positions default to 25% and 75% of the reference. A shape whose reference names an axis
that does not exist is not drawn.

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

| Helper                              | Adds                                            |
| ----------------------------------- | ----------------------------------------------- |
| `addHline(chart, y, options?)`      | a horizontal line at `y`                        |
| `addVline(chart, x, options?)`      | a vertical line at `x`                          |
| `addHrect(chart, y0, y1, options?)` | a horizontal band from `y0` to `y1`             |
| `addVrect(chart, x0, x1, options?)` | a vertical band from `x0` to `x1`               |
| `addShape(chart, shape)`            | any shape, appended to `layout.shapes` as given |

Each returns the `relayout` promise. `options` takes any shape attribute except the positions
the helper sets. Pass `xref` / `yref` to target another subplot (`{ xref: 'x2', yref: 'y2' }`).
Holochart does not support plotly.py's `row` / `col` and `annotation_*` arguments: name the axes
with `xref` / `yref`, and use `label` for text.

### Layers

`layer` decides what a shape covers, with Plotly's semantics:

- `'above'` (default): over the traces.
- `'below'`: under the traces **and** the grid lines.
- `'between'`: over the grid lines, under the traces.

Shapes with a `paper` reference and `layer: 'below'` or `'between'` draw under every subplot (and
can extend into the margins). Within a layer, shapes draw over images.

The example draws one band per layer across bars and a strong grid, and a `paper` band with
`layer: 'below'` that reaches into the right margin:

<Example id="shapes/layers" :height="420" />

### SVG paths

`path` takes an SVG path whose coordinates are in the shape's references: `M`, `L`, `H`, `V`,
`C`, `S`, `Q`, `T`, `A`, `Z` and their relative (lowercase) forms, with implicit repetition.
Curves are flattened adaptively, finer as you zoom in. `fillrule` (`'evenodd'`, the default, or
`'nonzero'`) decides how overlapping subpaths fill; open paths are closed for filling, as in SVG.

On date axes write dates with `_` between date and time (`M 2024-01-05_12:00 10`); relative
commands and arcs need numbers. Arc radii are in the path's units and the sweep flag follows the
data's y-up orientation (`1` = counter-clockwise on screen, on axes that are not reversed). A path
with a syntax error is drawn up to the error.

The example has cubic, quadratic and arc commands, relative forms, both fill rules, an open path,
and a path on a log axis (right), whose y values are data values:

<Example id="shapes/paths" :height="420" />

### Pixel-sized shapes

With `xsizemode: 'pixel'` (or `ysizemode`), `x0` / `x1` and path x values are **px offsets** from
`xanchor` (a position in `xref` units; y offsets are positive up). The shape keeps its size when
you zoom: callouts, rings around points, markers of your own. The two dimensions are independent,
so a shape can be data-sized along x and pixel-sized along y. Unset offsets default to 0 and
10 px, and an unset anchor to the middle of the reference.

The example has rings, a callout box and a triangle anchored to data points, and a strip that is
16 px tall at any zoom. The box on the right shows the nine label positions:

<Example id="shapes/pixel-size" :height="420" />

### Labels

`label` puts text on a shape: `text` (`<br>` breaks lines), `font`, `padding` (3 px by default),
`textangle`, `xanchor` / `yanchor` and `textposition`: `'start'`, `'middle'` (the default) or
`'end'` along a line, where the text follows the line's angle unless `textangle` is set, or one
of 9 box positions (`'top left'` … `'bottom right'`, default `'middle center'`) for other shapes.

`texttemplate` replaces `text` on lines, rectangles and circles (not on paths). Its variables
are `%{x0}`, `%{x1}`, `%{y0}`, `%{y1}`, `%{xcenter}`, `%{ycenter}`, `%{dx}`, `%{dy}`, then
`%{width}` and `%{height}` for rectangles and circles, or `%{length}` and `%{slope}` for lines.
They take d3 formats: `'x = %{x0:.1f}'`.

### Editing

With `config.editable`, `config.edits.shapePosition` or a shape's own `editable: true`, users can
drag a shape to move it, drag a rectangle's or ellipse's edge or corner to resize it, and drag a
line's end. A rectangle or ellipse smaller than 18 px on a side can only be moved. Each drag
previews the shape and, on release, emits one `relayout` event with Plotly's attribute strings
(`shapes[0].x0`, …). Dragging a path moves all its points and rewrites it with absolute commands;
its vertices cannot be dragged one by one. Dragging a pixel-sized shape moves its `xanchor` /
`yanchor`.

`config.edits.shapePosition: false` turns shape editing off while `config.editable` is on, except
for shapes with their own `editable: true`; see
[`editable` and `edits`](/fundamentals/configuration#editable-and-edits).

### Drawing

With a draw `dragmode`, a drag on a cartesian subplot draws a new shape:

| `dragmode`       | A drag draws                                                     |
| ---------------- | ---------------------------------------------------------------- |
| `drawline`       | a line from the press to the release                             |
| `drawrect`       | a rectangle between the two points                               |
| `drawcircle`     | an ellipse centered on the press that passes through the release |
| `drawopenpath`   | a freeform path along the pointer                                |
| `drawclosedpath` | a freeform path along the pointer, closed back to its start      |

Set the mode in the layout, with `chart.setDragmode('drawrect')`, or let users pick it in the
modebar. The modebar shows the drawing buttons only when you add them by name, with
`config.modeBarButtonsToAdd` or [`layout.modebar.add`](/reference/layout#modebar.add):
`drawline`, `drawopenpath`, `drawclosedpath`, `drawcircle`, `drawrect` and `eraseshape`. They join
the zoom / pan group in the order you list them.

```ts
createChart(el, {
  data,
  layout: {
    dragmode: 'drawrect',
    newshape: { line: { color: '#5e74d5', width: 3 }, fillcolor: 'rgba(94, 116, 213, 0.25)' },
  },
  config: {
    modeBarButtonsToAdd: [
      'drawline',
      'drawopenpath',
      'drawclosedpath',
      'drawcircle',
      'drawrect',
      'eraseshape',
    ],
  },
});
```

The shape previews at half of `newshape.opacity` while the pointer moves, clamped to the
subplot. On
release it is appended to `layout.shapes` in the subplot's data coordinates (`xref` / `yref` are
its axes) with `editable: true`, and one `relayout` event carries the whole new list:

```ts
chart.on('relayout', (update) => {
  if ('shapes' in update) console.log('shapes are now', update['shapes']);
});
```

A press without a drag stays a click and draws nothing. A drag that starts on an editable shape
moves that shape instead of drawing.

[`layout.newshape`](/reference/layout#newshape) styles the shapes users draw: `line`
(4 px by default, in a color that contrasts with `plot_bgcolor`), `fillcolor` (transparent by
default; open paths are never filled), `fillrule`, `opacity`, `layer`, `label` and `visible`.
`newshape.drawdirection` constrains `drawline`, `drawrect` and `drawcircle`: `'diagonal'` (the
default) is free, `'ortho'` makes lines horizontal or vertical, `'vertical'` spans the plot's
height and `'horizontal'` its width.

To erase a shape, click it, then press the `eraseshape` button. A click on a shape with
`editable: true` (every drawn shape has it) makes it the active shape, shown with
[`layout.activeshape`](/reference/layout#activeshape)'s `fillcolor` (`rgb(255,0,255)` by
default; lines and open paths stay unfilled) and `opacity` (0.5). A press elsewhere on the plot
deactivates it.
`eraseshape` removes the active shape with one `relayout` of `shapes`, and does nothing when no
shape is active.

What Holochart does not support here:

- Shapes cannot be activated while `config.editable` or `config.edits.shapePosition` lets users
  move every shape, so `eraseshape` has nothing to remove in such a chart. Set a new `shapes`
  list with `relayout` instead.
- There is no API to read or set the active shape.
- Drawing and activating a shape need a pointer; there are no keys for them.
- Drawing works on cartesian subplots only.

## Images

`layout.images` places pictures: `source` is a URL or a data URI, and an image without one is
not drawn. The box is `sizex` × `sizey` in the references' units, anchored at `x` / `y` by
`xanchor` (`'left'` default) and `yanchor` (`'top'` default). `sizex` and `sizey` default to 0,
so set both. `xref` / `yref` take the same references as shapes and default to `'paper'`; on a
log axis, `x`, `y` and the sizes are exponents. `sizing` decides how the picture fills its box:

- `'contain'` (default): fit inside, keeping the aspect ratio, aligned by the anchors.
- `'fill'`: cover the box, keeping the aspect ratio (cropped).
- `'stretch'`: fill the box exactly.

The example places one logo in three boxes in paper coordinates, one per `sizing` value (the
dotted outlines are shapes), and a translucent copy in the top-right margin:

<Example id="layout-images/logo" :height="400" />

`layer: 'below'` puts an image under the traces and the grid (with axis references it is clipped to
the subplot and follows zoom), the default `'above'` over them. Images have no `'between'` layer.
`opacity` fades an image. Unlike shapes, images do not extend an axis's autorange.

```ts
createChart(el, {
  data,
  layout: {
    xaxis: { range: [0, 10] },
    yaxis: { range: [0, 8] },
    images: [
      {
        source: '/img/terrain.png',
        xref: 'x',
        yref: 'y',
        x: 0,
        y: 8, // top-left corner, in data units
        sizex: 10,
        sizey: 8,
        sizing: 'stretch',
        layer: 'below',
      },
    ],
  },
});
```

The example stretches a picture over the plot area in data coordinates under the grid and the
trace, and centers a logo on a data point above them:

<Example id="layout-images/background" :height="400" />

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
  coordinate counts, control points included); `paper` and `domain` references don't. In a
  figure without traces, shapes do not set the axis ranges.
- Holochart does not support legend entries for shapes. `showlegend` and `legendgroup` (on
  shapes and on `newshape`) are accepted and have no effect, and `visible: 'legendonly'` hides
  the shape.
- An active shape cannot be reshaped: Holochart does not support dragging the vertices of a
  path. Shapes are moved and resized as described under [Editing](#editing).
- Plotly paths accept only absolute `M L H V Q C T S Z`; Holochart also accepts relative commands
  and arcs.

See the attribute reference for [`shapes`](/reference/layout#shapes),
[`newshape`](/reference/layout#newshape), [`activeshape`](/reference/layout#activeshape) and
[`images`](/reference/layout#images).
