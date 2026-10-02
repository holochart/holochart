---
title: Dashboards
description: Build pages with many charts without running out of WebGL contexts, using the shared renderer.
status: draft
milestone: M7
---

# Dashboards

A page can hold any number of Holochart charts. This guide covers the one browser limit that
many-chart pages run into, and how Holochart stays inside it.

## WebGL contexts

Every WebGL canvas needs a **context**, and browsers keep only so many alive per page: about 16
on desktop and 8 on mobile Chrome. When a page asks for one more, the browser drops the oldest,
and that canvas goes blank. Chrome logs "Too many active WebGL contexts. Oldest context will be
lost."

Holochart keeps a page within a fixed budget instead:

- The first **4** charts on a page each get a context of their own.
- Every chart after that draws through one **shared renderer**: a single context that renders
  each chart in turn and copies the frame into that chart's canvas.
- [Image export](./export) always uses the shared renderer.
- Text uses one more context per page to generate glyphs.

So a page uses at most 6 contexts for 5 charts or 500. Nothing to configure: a chart on the
shared renderer draws the same pixels, hovers, zooms and exports like any other.

```ts
import { newPlot } from '@mk7s/holochart';

// 40 charts, 6 WebGL contexts.
for (const [el, figure] of panels) await newPlot(el, figure.data, figure.layout);
```

### Choosing per chart

`config.sharedRenderer` overrides the default for one chart:

| Value              | Behavior                                                                               |
| ------------------ | -------------------------------------------------------------------------------------- |
| `'auto'` (default) | A context of its own while fewer than 4 charts have one, the shared renderer otherwise |
| `true`             | Always the shared renderer                                                             |
| `false`            | Always a context of its own                                                            |

Use `true` when the page has other WebGL content (a map, another library) and you want
Holochart to take as few contexts as possible: with it on every chart, the page uses two.

Use `false` for a chart that animates continuously at a large size, such as a full-screen 3D
scene, if it would otherwise land on the shared renderer: a chart with its own context skips
the copy into its canvas each frame. Keep the number of such charts well under the browser's
limit; beyond it the oldest chart loses its context and emits `webglcontextlost`.

Changing `config` re-creates the chart's renderer, so set `sharedRenderer` when the chart is
created.

### What sharing changes

- Shared charts must agree on `config.antialias` and `config.powerPreference` to use the same
  context. Each distinct combination gets a shared renderer of its own.
- `chart.three.renderer` is the shared `WebGLRenderer`. Its `domElement` is not the chart's
  canvas; use `chart.three.root.canvas`. Renderer-wide settings you change through it apply to
  every chart on that renderer.
- If the shared context is lost (a GPU reset), every chart on it emits `webglcontextlost`, and
  each redraws when it is restored.

### Always call `purge`

A chart holds its context, or its place on the shared renderer, until it is destroyed. Call
`purge(el)` (or `chart.destroy()`) when a chart leaves the page, for example in a framework's
unmount hook. A chart that is removed from the DOM without it keeps its context alive.

## Still to come

- Subplots in one chart versus many separate charts
- The grid layout helper
- Linked interactions across charts (shared zoom, cross-filtering)
- Responsive sizing
- Real-time dashboards with streaming data
