---
title: Exporting images & vectors
description: Export charts as PNG, JPEG or WebP images at any size and resolution, from code or the modebar.
status: complete
---

# Exporting images & vectors

`chart.toImage()` renders a chart to an image and resolves to a data URL, ready for an `<img>`, a
download or an upload. It works like Plotly's `toImage`, with the same options.

```ts
const url = await chart.toImage({ format: 'png', width: 1200, height: 600, scale: 2 });
document.querySelector('img')!.src = url; // 'data:image/png;base64,…'
```

<Example id="_dev/export-image" :height="520" />

## Options

| Option          | Default            | What it does                                                                                                           |
| --------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `format`        | `'png'`            | `'png'`, `'jpeg'` or `'webp'`.                                                                                         |
| `width`         | the chart's width  | Width in CSS px. The figure is laid out again at this size, not scaled: margins, ticks and legend adapt.               |
| `height`        | the chart's height | Height in CSS px, likewise.                                                                                            |
| `scale`         | `1`                | Pixels per CSS px: `scale: 2` gives a `2·width × 2·height` image with sharp text and lines. Independent of the screen. |
| `transparent`   | `false`            | Drop the background, for an image with an alpha channel (see below). Ignored for JPEG, which has no alpha.             |
| `imageDataOnly` | `false`            | Resolve to the base64 data only, without the `data:image/…;base64,` prefix (Plotly).                                   |

Out-of-range values reject the promise with a `RangeError`, as does an image larger than the GPU
can draw (browsers usually allow up to 8192 or 16384 px per side; lower `scale` then).

## What's in the image

The image is not a screenshot of the canvas. The figure is drawn again **offscreen** by a
temporary chart laid out at the requested size, rendered once at `scale`, read back when every
label, font and layout image is in, and thrown away. So:

- everything drawn in WebGL is included: traces, axes, text, the legend, annotations, shapes,
  layout images and colorbars, and the current selection (unselected points dimmed);
- the modebar, hover labels and the selection outline are not: they are page elements over the
  canvas;
- the chart on the page is not touched: no flicker, and hover, zoom and updates carry on during
  the export;
- the result is the same on every screen, whatever its pixel ratio.

The export code loads on first use, so pages that never export don't download it.

### Transparent background

The default look paints the paper and the plot area in `#0a0a0f`. With `transparent: true` both
are dropped, so the image sits on whatever background it is placed on. A `plot_bgcolor` your
figure sets itself is kept.

```ts
const url = await chart.toImage({ transparent: true }); // PNG or WebP with alpha
```

Text and grid colors stay as they are: for a light page, export a light theme
(`layout.template: 'plotly-classic'`, see [Themes & templates](/customization/themes-templates)).

## Downloading

`chart.downloadImage()` exports and saves the file through a download link. It takes the same
options plus `filename` (without extension, default `newplot`) and resolves to the file name.

```ts
await chart.downloadImage({ filename: 'revenue', format: 'jpeg', scale: 2 }); // 'revenue.jpeg'
```

### The modebar camera button

The camera button in the modebar calls `downloadImage` with
[`config.toImageButtonOptions`](/reference/config): `format`, `filename`, `width`, `height` and
`scale`. Unset fields use the defaults above.

```ts
createChart(el, {
  data,
  layout,
  config: { toImageButtonOptions: { format: 'png', filename: 'dashboard', scale: 2 } },
});
```

To remove the button, add `'toImage'` to `config.modeBarButtonsToRemove`.

## Plotly-style functions

The functional API takes the chart's element, like Plotly:

```ts
import { toImage, downloadImage } from '@mk7s/holochart';

const url = await toImage(el, { format: 'webp', width: 800, height: 400 });
await downloadImage(el, { filename: 'chart' });
```

`toImage` also accepts a figure object, `{ data, layout, config }`, and draws it offscreen without
a chart on the page, at `layout.width` × `layout.height` (default 700 × 450) unless the options say
otherwise:

```ts
import { toImage } from '@mk7s/holochart';

const url = await toImage({ data, layout: { width: 600, height: 300 } }, { scale: 2 });
```

## Exporting the figure as JSON

`chart.toJSON()` (or `JSON.stringify(chart)`) exports the figure itself, with typed arrays in
Plotly's base64 encoding; `fromJSON` loads it back. See [Plotly compatibility](/reference/plotly-compat).

## Coming later

- **Vector export** (SVG and PDF) of 2D charts, planned for M7 (plan E18.2).
- **Server-side image generation** with a headless browser (E18.6).
- **Clipboard** copy of the image and the data (E18.8).
