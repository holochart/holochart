---
title: Custom markers
description: Register SVG paths as marker symbols, draw images or emoji at your data points, and how they render, load and export.
status: complete
---

# Custom markers

Besides Plotly's 55 marker symbols, Holochart draws markers you bring yourself:

- **Custom symbols**: register an SVG path with `symbols.register`, then use its name as
  `marker.symbol`, with the same `-open`, `-dot` and `-open-dot` variants as the built-in symbols.
- **Text glyphs**: `marker.symbol: 'text:🚀'` draws a character or emoji.
- **Image sprites**: `marker.image` draws an image (a URL or data URI) at each point.

Custom symbols and glyphs work wherever markers are drawn: `scatter` markers, `splom` cells, box
and violin points, and the legend. `marker.image` works on `scatter` and `splom`, and a scatter
trace's legend entry shows its first image. Hover and selection work the same as for built-in
symbols. The code that draws custom markers loads the first time a chart uses one, so charts with
only built-in symbols don't pay for it.

## Custom symbols

Register a symbol once, before you plot a figure that uses it. After that, its name is a
`marker.symbol` value like `'diamond'`:

<Example id="scatter/custom-symbols" />

```ts
import { symbols } from '@mk7s/holochart';

// A map pin on the common 24 × 24 icon grid, with its tip on the data point.
symbols.register('pin', {
  path: 'M12 1.5C7.9 1.5 4.75 4.65 4.75 8.75C4.75 14 12 22.5 12 22.5S19.25 14 19.25 8.75C19.25 4.65 16.1 1.5 12 1.5Z',
  anchor: [12, 22.5],
});
symbols.register('bolt', { path: 'M14 1L4 14H11L9 23L20 9H13L15 1Z' });

createChart(el, {
  data: [
    { y: [3, 4, 3.5], mode: 'markers', marker: { symbol: 'pin', size: 26 } },
    {
      y: [1, 2, 1.5],
      mode: 'markers',
      marker: { symbol: ['bolt', 'bolt-open', 'pin-open-dot'], size: 20, line: { width: 1 } },
    },
  ],
});
```

`symbols.register(name, definition)` takes:

| Field      | Default          | What it does                                                                                                                                                   |
| ---------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `path`     | (required)       | SVG path data, the `d` attribute of a `<path>`. Every command works: lines, curves, arcs and several subpaths.                                                 |
| `viewBox`  | `[0, 0, 24, 24]` | The box the path is drawn in, `[minX, minY, width, height]` or an SVG `viewBox` string. Its larger side spans the marker's `size`, like the built-in `square`. |
| `anchor`   | the box center   | The point of the box that sits on the data point, in path coordinates. Anchor a pin at its tip, or an arrow at its head.                                       |
| `fillRule` | `'nonzero'`      | `'evenodd'` punches holes wherever subpaths overlap, whichever way they are drawn.                                                                             |

Names are case-insensitive. Built-in names, numbers, `text:` names and names ending in `-open` or
`-dot` are rejected with a `TypeError`. `symbols.names()` lists what you registered, and
`symbols.has('pin-open')` tells you whether a value names a custom symbol.

### Variants, outlines and angles

A custom symbol behaves like a built-in one:

- **Filled** (`'pin'`): filled with `marker.color`, outlined with `marker.line.color` at
  `marker.line.width`.
- **`-open`** (`'pin-open'`): only the outline, in `marker.color`, at least 1 px wide.
- **`-dot`** and **`-open-dot`**: the same with a dot in the middle.
- **`marker.angle`** rotates the symbol clockwise around its anchor.
- **`marker.size`**, **`marker.opacity`** and colorscales work as usual, one value per point or per
  trace.

### When to register

`register` is synchronous: the name is valid at once. Holochart turns the path into a distance
field in the background, and a chart that uses the symbol waits for it before `chart.ready`
resolves.

A figure is checked against the symbols registered when you plot it. If you plot `'pin'` before
registering it, the chart warns about an invalid `marker.symbol` and draws circles, like for any
unknown symbol. Registering the name later doesn't change that chart; plot it again with
`react`.

Registering a name again replaces its shape in every chart that uses it, including charts
already on screen.

## Text and emoji glyphs

A `marker.symbol` of `'text:'` followed by one or more characters draws them as the marker, with
no registration:

```ts
createChart(el, {
  data: [
    { x: [1, 2, 3], y: [2, 3, 1], mode: 'markers', marker: { symbol: 'text:🚀', size: 24 } },
    { x: [1, 2, 3], y: [1, 2, 3], mode: 'markers', marker: { symbol: 'text:★', color: '#f2b134' } },
  ],
});
```

The glyph is scaled so its ink fits the `size` square. Color emoji keep their colors. Glyphs that
come out in one color, like `★`, take `marker.color`. `-open` and `-dot` variants don't apply to
glyphs, and neither does `marker.line`.

Glyphs come from the fonts on the viewer's system: the system emoji fonts first, then the default
sans-serif font. The same emoji looks different on macOS, Windows and Linux.

## Image sprites

`marker.image` draws an image at each point instead of the symbol. Give one URL or data URI for
the whole trace, or one per point. Points whose entry is empty or `null` keep their symbol:

<Example id="scatter/image-sprites" />

```ts
const sun = 'data:image/svg+xml,' + encodeURIComponent('<svg …>…</svg>');

createChart(el, {
  data: [
    {
      x: [1, 2, 3],
      y: [24, 26, 21],
      mode: 'lines+markers',
      marker: { image: [sun, sun, '/icons/cloud.png'], size: 34 },
    },
  ],
});
```

- **Size**: the image fits a `size` × `size` square around the point, keeping its aspect ratio.
- **Opacity and angle**: `marker.opacity` fades the image and `marker.angle` rotates it.
- **Color and outline**: `marker.color` and `marker.line` are ignored. Images keep their own
  colors.
- **Formats**: anything the browser decodes as an image works, including PNG, JPEG, WebP, GIF (the
  first frame) and SVG. An SVG needs `width` and `height` attributes.
- **Other servers**: images from another origin need CORS headers
  (`Access-Control-Allow-Origin`). Holochart requests them with `crossOrigin = 'anonymous'`. An
  image that fails to load, or that the browser won't let Holochart read, is not drawn, and the
  console shows a warning. Data URIs always work.

### Loading, `ready` and export

Images load in the background. Until an image has arrived, its markers are hidden rather than
drawn as placeholders. `chart.ready`, the promise an update returns, and `chart.toImage` all wait
for the images the chart uses, so screenshots and exported images always include them. Each
distinct URL loads once per page, however many points or charts use it.

## How custom markers render

Built-in symbols are exact shapes computed in the marker shader. Custom markers take one texture
lookup each:

- A **custom symbol** is filled on a canvas once, at 128 × 128 pixels. That fill is turned into a
  _signed distance field_: for every pixel, the distance to the nearest edge of the shape. The
  field goes into a shared texture atlas. The marker shader reads the distance instead of computing
  it, so fills, open outlines, dots and anti-aliasing work as for built-in symbols, at any size or
  angle.
- An **image** or **glyph** is scaled into a 112 × 112 pixel cell of a second atlas, with smaller
  copies for markers drawn small.

Both atlases are shared by every chart on the page, and markers stay one draw call per trace.

Limits:

- A page can hold 256 custom symbols and 256 distinct images and glyphs.
- Symbols larger than about 70 px lose some sharpness at corners. So do images drawn larger than
  their 112 px cell.
- A path is drawn at its `viewBox` scale: a detail much smaller than a few percent of the box may
  vanish.

## Differences from Plotly

Plotly has neither custom symbols nor image markers. Its `marker.symbol` accepts only its built-in
names and codes, and people draw icons with `layout.images` placed at each point.

In Holochart, `symbols.register`, `text:` glyphs and `marker.image` are extensions. A figure that
uses them doesn't render the same in Plotly: Plotly draws circles for unknown symbols and ignores
`marker.image`.
