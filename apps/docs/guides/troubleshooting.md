---
title: Troubleshooting
description: What to check when a chart is blank, has no text, has the wrong size, loses its WebGL context, or reports an unknown trace type or a missing WebGL2.
status: complete
---

# Troubleshooting

Start with the browser console. Holochart reports problems in a figure as warnings that begin
with `[holochart]`, and the promise of the call that drew the chart rejects when the chart
could not be created at all. [Errors and warnings](/reference/errors) lists which is which.

## No WebGL2

**Symptom:** instead of a chart, the element shows "This chart needs WebGL2, which this browser
does not provide." followed by a short description of the chart, and `newPlot` rejects.

Holochart draws with WebGL2 and has no other renderer. When the browser cannot create a WebGL2
context:

- `newPlot`, `react` and `toImage` reject with a `WebGLUnavailableError`, and `createChart`
  throws it. Its `cause` is the renderer's own error.
- The element gets a note (`role="note"`, class `holochart-fallback`) with the chart's
  accessible name and one line per trace, so readers still learn what the chart was.
- No chart is registered: `getChart(el)` returns `undefined`. `purge(el)`, or a new chart in the
  element, removes the note.

Catch the error to show something of your own, such as a table or a static image:

```ts
import { newPlot, WebGLUnavailableError } from '@mk7s/holochart';

try {
  await newPlot(el, data, layout);
} catch (error) {
  if (!(error instanceof WebGLUnavailableError)) throw error;
  // The element already shows the note. Replace it or add to it here.
}
```

Current desktop and mobile browsers have WebGL2 (see
[Supported browsers](/getting-started/installation#supported-browsers)). When it is missing,
the usual causes are:

- hardware acceleration switched off in the browser's settings;
- a GPU or driver on the browser's blocklist, a remote desktop session, or a virtual machine
  without GPU support;
- a headless browser started without a GL backend. In headless Chromium, the flags
  `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` give a software WebGL2,
  which is what Holochart's own tests run on.

## Blank chart

**Symptom:** the element is empty, or shows the chart's background and nothing else.

Work through these in order:

1. **Is there an error or a warning in the console?** An unknown trace type hides that trace
   (see [below](#unknown-trace-type)). An invalid value falls back to the default. Add
   `config: { strict: true }` to make the first such problem reject the call instead.
2. **Did the promise reject?** `newPlot(el, …)` without `await` or `catch` hides a rejection as
   an "Uncaught (in promise)" line in the console.
3. **Is the chart dark on a dark page?** The default look draws on a near-black background
   (`#0a0a0f`). A figure made for Plotly's white background, with dark text or line colors of
   its own, can be nearly invisible on it. Use `layout: { template: 'plotly-classic' }` to get
   Plotly's look; see [Default look](/getting-started/from-plotly#default-look).
4. **Are the traces there but without text?** Then the text engine or its font is blocked; see
   [Fonts and text](#fonts-and-text).
5. **Was the element hidden or empty-sized when the chart was created?** See
   [Hidden and zero-size containers](#hidden-and-zero-size-containers).
6. **Was the chart destroyed?** `purge(el)`, `chart.destroy()` and a second `newPlot` on the same
   element all destroy the chart that was there. Calls on a destroyed chart reject with "this
   chart has been destroyed". In React, check that the cleanup of one effect doesn't purge a
   chart that another effect just created; the [recipe](./frameworks#react) shows the order.
7. **Did the canvas lose its WebGL context?** See the next section.

`getChart(el)` tells you whether the element has a chart, and `chart.fullData` what Holochart
made of your traces: a trace with `visible: false` there was hidden.

## Too many active WebGL contexts

**Symptom:** Chrome logs "Too many active WebGL contexts. Oldest context will be lost.", and
the oldest canvases on the page go blank.

Browsers keep only a limited number of WebGL contexts alive per page. Holochart stays within a
budget of its own: the first 4 charts on a page get a context each, and every further chart
draws through one shared renderer, so Holochart alone does not reach the limit.
[Dashboards](./dashboards#webgl-contexts) explains the budget and
[`config.sharedRenderer`](./dashboards#choosing-per-chart).

If you see the warning anyway:

- **Charts are not purged.** A chart removed from the DOM without `purge(el)` keeps its context
  until the page is closed. Call `purge` in every unmount path; see
  [Framework integration](./frameworks#the-rules).
- **Other WebGL content shares the page**: a map, a 3D viewer, another chart library. Set
  `config: { sharedRenderer: true }` on every Holochart chart so that they take as few contexts
  as possible.
- **Charts set `sharedRenderer: false`.** Each of those takes a context of its own, whatever
  the budget.

A chart that loses its context emits `webglcontextlost`. If the browser gives the context back,
the chart emits `webglcontextrestored` and redraws by itself; you don't need to create it again.

```ts
chart.on('webglcontextlost', () => console.warn('chart lost its WebGL context'));
chart.on('webglcontextrestored', () => console.info('chart is back'));
```

## Unknown trace type

**Symptom:** a trace is missing, and the console has a warning such as:

```text
[holochart] data[0].type: unknown trace type 'scattergl'; did you mean 'scatter'? (the trace is hidden)
```

The chart draws without that trace. The cause is one of three:

- **A typo.** The warning suggests the nearest registered type.
- **A Plotly trace type that Holochart doesn't have.** `scattergl` and `scatterpolargl` are
  `scatter` and `scatterpolar` here. Maps, ternary, Smith and carpet traces are not available;
  the [compatibility table](/reference/plotly-compat#trace-types) lists every type.
- **A trace type that isn't registered.** `@mk7s/holochart` registers every type. With a
  [partial bundle](/getting-started/installation#smaller-bundles-with-partial-packages) you
  register the ones you use, and the warning names the package of a built-in type that is
  missing. With the script-tag build, the 3D trace types need the 3D add-on script.

In TypeScript, a figure typed as `Figure` rejects an unknown `type` at compile time.

## Fonts and text

**No text at all, and the promise of `newPlot` stays pending.** The text engine could not start
or could not load its font. The usual cause is a Content Security Policy that blocks `blob:`
URLs: the console then shows the blocked worker or font. See
[Content Security Policy](./csp).

**Text in Cyrillic, Arabic, CJK or another non-Latin script is missing.** The built-in font
covers Latin text. For other scripts the text engine downloads a fallback font from
`cdn.jsdelivr.net` on first use, which fails offline, behind a firewall, or under a policy that
blocks that host. Register a font that has the script and use it in the figure; see
[Locales](/fundamentals/locales).

**My font is not used.** Holochart draws text from font files, not from the fonts installed on
the computer, so `font.family: 'Inter'` only works after
[`fonts.register('Inter', { … })`](/fundamentals/styling-themes#web-fonts). A family that isn't
registered is drawn with the built-in font, TeX Gyre Heros, a Helvetica-style family.

**A registered font does not load.** Font files have to be TTF, OTF or WOFF. WOFF2 is not
supported. The URL has to be reachable from the page with CORS, since the file is fetched with
`XMLHttpRequest`; a failure is logged as "Failure loading font" with the URL.

**Bold or italic text looks regular.** Bold and italic are separate font files and are not
synthesized. Register the `bold`, `italic` and `boldItalic` faces of your family as well as the
regular one.

**Labels are cut off, or shift after a moment.** Text is measured with the font that draws it.
When a web font finishes loading after the first draw, the chart lays itself out again by
itself. Under a policy without `font-src blob:` the built-in font cannot be measured and labels
are placed with a system font's metrics; see [Content Security Policy](./csp).

## Hidden and zero-size containers

**Symptom:** a chart created inside a closed tab, dialog or accordion has the wrong size, or a
chart doesn't follow its container.

A chart takes the width and height of its element, for each dimension that `layout.width` and
`layout.height` leave open. An element that is not displayed (`display: none`, or not in the
document yet) has no size. Then:

- The chart is drawn at the default size, 700 × 450 px.
- When the element first gets a size, the chart takes it and redraws, once. You don't have to
  call anything when the tab or dialog opens.
- After that, the chart keeps its size unless `config.responsive` is `true`.

So a chart that should follow its container at all times needs `config: { responsive: true }`,
and a chart with a fixed layout size (`layout.width` and `layout.height`) never follows it.

Other cases:

- **An element with a width but no height** gets the default height, 450 px. Give the element a
  height in CSS, or set `layout.height`.
- **A size animation**, such as a panel sliding open: with `responsive`, the chart follows the
  element while it moves. To draw once at the end instead, leave `responsive` off and call
  `chart.resize()` when the animation finishes.
- **`visibility: hidden` and off-screen elements** have a size, and the chart is drawn at it.

```ts
import { getChart } from '@mk7s/holochart';

// After a layout change that the chart does not follow by itself:
await getChart(el)?.resize();
```

## Blurry or slow on high-density screens

By default a chart renders at the screen's pixel ratio, up to 2. On a screen with a pixel ratio
of 3 that is slightly softer than native, and it draws less than half the pixels.

- For full sharpness on such screens, raise the cap: `config: { maxPixelRatio: 3 }`.
- To trade sharpness for speed, for example for many charts on a phone, lower it, or fix the
  ratio with `config: { pixelRatio: 1 }`.

Image export is not affected: [`toImage`](./export) renders at its own `scale`.

## Still stuck

- `chart.fullData` and `chart.fullLayout` show the figure after defaults, which is what was
  drawn.
- The [playground](/playground/) runs a figure in isolation, which separates a figure problem
  from a page problem.
