---
title: Performance guide
description: How Holochart keeps large and fast-changing charts responsive, what you control, how to measure a chart, and the measurements recorded so far.
status: complete
---

# Performance guide

This guide explains what Holochart does to stay fast, what it leaves to you, and how to measure
a chart. It names the public settings. The chart pages have a "Performance notes" section each
for what is specific to a trace type.

## What is fast by design

- **Frames render on demand.** A chart draws a frame when something changed and is idle
  otherwise. During a transition, a drag or a 3D camera motion it draws one frame per animation
  frame.
- **Point count does not add draw calls.** The markers of a `scatter` trace are one instanced
  draw call, and its line is one more, whatever the number of points. Bars are instanced
  rectangles, a heatmap is one textured quad, a candlestick trace is two draw calls. Draw calls
  grow with the number of traces and their parts, not with the data.
- **Zoom and pan move a transform.** Trace positions are uploaded in axis coordinates, not in
  pixels. A zoom or pan gives each trace a new transform and redraws the ticks. Buffers are not
  uploaded again. [Decimated lines](#long-lines) and splines are the exception.
- **Updates redo only what changed.** Each attribute declares what a change to it invalidates,
  so a color change does not recalculate data. See
  [What an update costs](/fundamentals/updating-charts#what-an-update-costs).
- **Hover does not scan the data on every move.** A scatter trace builds a spatial index on the
  first hover after its data changed. The index is in axis coordinates, so zoom and pan never
  rebuild it. 3D scenes pick on the GPU, in a small window around the pointer.

Because a trace costs draw calls and a point does not, prefer few large traces over many small
ones. A line breaks at `null` and `NaN` values, so segments with the same style can share one
trace.

## Pass typed arrays

Data arrays can be plain arrays or typed arrays (`Float64Array`, `Float32Array`, `Int32Array`
and the others, except the BigInt ones). For large data, typed arrays are the faster input:

- Validation and defaults keep every data array by reference. They do not copy or walk it.
- For a `scatter` trace on a linear or date axis, a typed array is copied into the calculated
  coordinates with one native call. A plain array is read element by element: each value is
  checked, numeric strings are converted, and on a date axis date strings are parsed.
- A typed array always gets a `linear` axis when the axis type is detected. For timestamps,
  pass milliseconds since the epoch and set the axis type yourself.

```ts
const n = 1_000_000;
const x = new Float64Array(n); // milliseconds since the epoch
const y = new Float64Array(n);

createChart(el, {
  data: [{ type: 'scatter', mode: 'lines', x, y }],
  layout: { xaxis: { type: 'date' } },
});
```

Typed arrays are not uploaded to the GPU as they are. For a scatter trace, the calc stage
writes coordinates into a `Float64Array` of its own, and the renderer encodes those into 32-bit
buffers. Holochart has no zero-copy path from your array to the GPU, so plan for the data to
exist more than once in memory: your arrays, the calculated coordinates, and the renderer's
buffers, which are kept on the CPU side as well so that the chart can redraw after a lost WebGL
context.

[Data formats](/fundamentals/data-formats) covers the accepted formats.

## Keep updates small

[Updating charts](/fundamentals/updating-charts) describes every update call. For performance,
these are the points that matter:

- **Change one attribute by its path.** `chart.restyle({ 'marker.color': 'crimson' })` restyles.
  `chart.restyle({ marker: { color: 'crimson' } })` replaces the whole `marker` container, which
  plans a recalculation.
- **Leave data arrays alone unless the data changed.** `x`, `y`, `z` and `marker.size` are
  `calc` edits: the trace is recalculated and its geometry is uploaded again. Colors, widths
  and opacity are `style` edits.
- **Make several changes in one tick.** Update calls made in the same synchronous stretch of
  code share one pipeline run and one frame. Awaiting each call before the next gives one run
  and one frame per call.
- **With `react`, reuse data arrays.** `react` compares data arrays by reference. A new array
  with the same contents is a data change and recalculates the trace. Give traces a `uid` when
  their order changes, so that they keep their GPU objects.
- **Keep `config` constant.** A changed `config` re-creates the renderer and rebuilds
  everything.
- **Use `react`, not `newPlot`, to change a chart.** `newPlot` on an element that has a chart
  destroys it and builds a new one with a new renderer.
- **Hiding is not free for large traces.** `visible: false` and `'legendonly'` free the trace's
  GPU objects. Showing the trace recalculates it and builds them again.

Transitions run the update pipeline on every animation frame. See
[what animates](/fundamentals/transitions-animation#what-animates) for when to keep them short.

## Streaming

For live data, append with `extendTraces` instead of replacing arrays, and set `maxPoints` to
keep a rolling window. The call is described in
[Streaming appends](/fundamentals/updating-charts#streaming-appends).

For `scatter` traces an append takes a streaming path: only the new points are converted and
uploaded, and the autorange is updated from the points that came and went. Every other trace
type recalculates the edited trace on each append.

The main cases in which a scatter trace falls back to a full recalculation of that trace:

- the trace is stacked (`stackgroup`), uses `xperiod` or `yperiod`, or has multicategory
  coordinates;
- retained points move (a `prependTraces`, or a `maxPoints` that drops points) and a per-point
  array of the trace was not extended in the same call. That covers `text`, `customdata`,
  `ids`, array-valued `marker.color` or `marker.size`, and `x` or `y` left implicit;
- `maxPoints` trims the edited arrays by different amounts, which happens when they had
  different lengths;
- the same tick also extends and prepends the trace, changes its data with another call, or
  adds, deletes or moves traces.

**Append once per animation frame.** Every tick with update calls runs the pipeline and renders
a frame. If samples arrive faster than the display refreshes, collect them and make one call
per frame:

```ts
const pendingX: number[] = [];
const pendingY: number[] = [];
let scheduled = false;

// Call for every sample, at any rate.
function onSample(t: number, value: number) {
  pendingX.push(t);
  pendingY.push(value);
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    const update = { x: [pendingX.splice(0)], y: [pendingY.splice(0)] };
    chart.extendTraces(update, [0], 10_000).catch(console.error);
  });
}
```

**Start from typed arrays.** When the trace's `x` and `y` are typed arrays, appends write into
a buffer with spare room and allocate only when the room runs out. Plain arrays are replaced by
a new array on every append.

## Long lines

A dense line is decimated before it is drawn. This is
[`line.simplify`](/reference/scatter#line.simplify), which is on by default:

- Per pixel column, the line keeps the first, lowest, highest and last point, so at most four
  vertices per column. Each column keeps its vertical extent and the points where the line
  enters and leaves it.
- It applies to a run of points between gaps whose x values go in one direction and that has
  more than four points per pixel column. A line that goes back and forth in x is drawn whole.
- Only drawing is decimated. Hover, selection, autorange and markers use every point.
- The decimated path depends on the zoom, so it is rebuilt when the zoom changes the scale.
- Lines of 100,000 points or more read their columns from a multi-resolution pyramid that is
  built once per data set, and upload only the view plus a margin. A zoom or pan then reads the
  entries in view instead of the whole trace. The pyramid is not used for dashed lines,
  `line.shape: 'spline'` and stacked traces; those are decimated over the whole trace.
- Step shapes (`'hv'`, `'vh'`, `'hvh'`, `'vhv'`) are decimated only through the pyramid, so
  not below 100,000 points.

<Example id="timeseries/minute-bars" />

The interaction test suite checks this on a 300,000-point line with gaps. It draws the line
decimated and with `line.simplify: false`, and requires the same pixels within one pixel, from
fewer than a twentieth of the segments, at the full view, zoomed in, and after streaming points
in.

[Long and dense series](/fundamentals/dates-time-series#long-and-dense-series) has the details
for time series.

Dashed lines cost more than solid ones. Keep dashes for a few series. `line.shape: 'spline'` is
tessellated on the CPU, so it costs more than straight lines on large data.

## Many markers

Markers are not decimated. Every marker is drawn, and overlapping markers are filled again and
again, so the cost of a dense cloud grows with the marker size as well as the count.

- Keep markers small on large traces.
- [`marker.maxdisplayed`](/reference/scatter#marker.maxdisplayed) draws at most that many
  markers, taken at an even stride over the data. `0`, the default, draws all.
- Holochart does not resample or aggregate the points of a scatter trace. For a density view
  of very many points, bin them with a [2D histogram](/charts/statistical/histogram2d) or a
  [heatmap](/charts/scientific/heatmap).

In 3D, translucent markers are depth-sorted as the camera moves, for traces of up to 200,000
points. Larger translucent traces are not sorted. See
[3D scatter](/charts/3d/scatter3d#performance-notes).

## Pixels

Fill cost grows with the number of device pixels, which grows with the square of the pixel
ratio. Four config options set what the renderer is asked for. A change to any of them
re-creates the renderer, so set them when the chart is created.

| Option                                                 | Default     | Effect                                                                                               |
| ------------------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------- |
| [`pixelRatio`](/reference/config#pixelRatio)           | `'auto'`    | `'auto'` follows `window.devicePixelRatio`, up to `maxPixelRatio`. A number from 0.25 to 8 fixes it. |
| [`maxPixelRatio`](/reference/config#maxPixelRatio)     | `2`         | The cap for `'auto'`. A 3× phone screen renders at 2× by default.                                    |
| [`antialias`](/reference/config#antialias)             | `true`      | Requests a multisampled WebGL context. `false` requests one without multisampling.                   |
| [`powerPreference`](/reference/config#powerPreference) | `'default'` | A hint to the browser: `'high-performance'` or `'low-power'`. Browsers may ignore it.                |

```ts
// One device pixel per CSS pixel: a quarter of the pixels of a 2× screen, and less sharp.
createChart(el, { ...figure, config: { pixelRatio: 1 } });
```

Two more options change how much work a chart does:

- [`staticPlot: true`](/reference/config#staticPlot) draws the chart without interaction. No
  hover layer and no pointer or keyboard handling are attached.
- [`responsive: true`](/reference/config#responsive) watches the container with a
  `ResizeObserver`. A resize runs layout again and gives traces a new transform. It does not
  recalculate them.

## Many charts

Browsers limit the number of WebGL contexts per page. Holochart gives the first 4 charts on a
page a context each and draws every further chart through one shared renderer, which copies
each frame into that chart's canvas. [Dashboards](/guides/dashboards) explains the budget and
[`config.sharedRenderer`](/guides/dashboards#choosing-per-chart).

- Subplots of one figure share one canvas and one context, and are drawn in one frame.
- A chart on the shared renderer pays one copy per frame. For a chart that animates
  continuously at a large size, `sharedRenderer: false` avoids it.
- Call `purge(el)` or `chart.destroy()` when a chart leaves the page. It frees the chart's GPU
  resources, listeners and DOM nodes, and releases its WebGL context or its place on the shared
  renderer. A chart that is only removed from the DOM keeps all of them.

## Text

Text is drawn on the GPU from glyphs that are typeset asynchronously, in a web worker by
default. The promise of an update resolves after its text has arrived.

- Per-point text costs more than markers. Thousands of labels take noticeably longer to appear
  than the marks they belong to. Keep `mode: 'text'`, bar `text` and heatmap `texttemplate` for
  small data.
- `config.textRenderer` is accepted, and its `'dom'` value has no effect.
- The worker and the fonts are configured with `render.configureText`, for every chart on the
  page. See [Content Security Policy](/guides/csp).

## What Holochart does not do

- **No calculation in a Web Worker.** `config.worker` is accepted and has no effect. Every
  pipeline stage runs on the main thread, so a large calculation blocks the page while it runs.
  Text typesetting is the one step that uses a worker.
- **No zero-copy upload** of typed arrays, as described [above](#pass-typed-arrays).
- **No downsampling other than line decimation.** Apart from `marker.maxdisplayed`, every
  marker, bar and other mark is drawn.
- **No debug log.** `config.debug` is accepted and has no effect.

## Measuring

Three things can be measured from the page: whether the chart is idle, how long an update
takes, and what a frame draws.

```ts
// Rendered frames. An idle chart renders none.
let frames = 0;
chart.on('afterrender', () => {
  frames += 1;
});

// Time until an update is drawn.
const start = performance.now();
await chart.restyle({ 'marker.color': 'crimson' });
console.log(`restyle: ${(performance.now() - start).toFixed(1)} ms, ${frames} frames`);

// What the last frame drew, and what the renderer holds.
const { render, memory } = chart.three.renderer.info;
console.log(render.calls, render.triangles, memory.geometries, memory.textures);
```

- The promise resolves when the frame has been submitted. The GPU may still be working on it.
- `chart.three.renderer.info` is three.js' `WebGLRenderer.info`. Holochart resets its `render`
  counters at the start of each frame, so they describe the most recent frame. On the
  [shared renderer](/guides/dashboards) they describe the last chart it drew, and `memory`
  counts every chart on it.
- `afterrender` and `beforerender` carry `time`, `delta`, `frame` and `continuous`. See
  [Events](/reference/events).
- Measure on the hardware your readers use. A browser's performance panel shows where the time
  of an update goes.

### The benchmark script

The Holochart repository has a benchmark for contributors, `pnpm bench:gpu` (`tools/bench`). It
opens examples in headless Chromium on the machine's real GPU, and refuses to run on a software
renderer. For each example it records:

- the first draw: from just before `createChart` to `chart.ready`, plus the GPU work still
  queued at that point;
- frame rate and frame times (median, 95th percentile, maximum) during a pan and a zoom sweep,
  or a camera orbit in 3D;
- the CPU time of the update and of the render call, the GPU time per frame, and the draw
  calls;
- the JavaScript heap.

Continuous integration renders with a software renderer, so it does not measure GPU speed. The
benchmark runs by hand.

## Recorded measurements

Performance depends on the GPU, the browser, the size of the canvas and the pixel ratio. The
numbers below are the ones recorded in the repository, with the conditions they were measured
under. They are not guarantees for other hardware.

The project's targets are a 1,000,000-point scatter that pans at 50 fps or more on an M1-class
laptop, and a first render of 100,000 points in under 300 ms. Both are targets. What has been
measured against them is the marker renderer on its own, without a chart around it. No recorded
measurement times a complete 100,000-point scatter chart from `createChart` to `ready`.

### Marker renderer

Measured on 2026-09-23 on an Apple M1 Max (64 GB, macOS) in headless Chromium (Playwright) with
ANGLE on Metal, on a 1024 × 640 canvas at device pixel ratio 1. Frames were rendered back to
back, so these frame rates are throughput and are not capped by the display.
[Source](https://github.com/holochart/holochart/blob/main/docs/spikes/a-markers.md).

| Measurement                                               | Target   | Measured           |
| --------------------------------------------------------- | -------- | ------------------ |
| 100,000 markers: new renderer, marker set and first frame | < 300 ms | 24 ms (50 ms cold) |
| 1,000,000 markers of 3 px, pan (two point distributions)  | ≥ 50 fps | 119 and 160 fps    |
| 1,000,000 markers of 8 px, pan (the same distributions)   | ≥ 50 fps | 70 and 77 fps      |

### Charts

The results of the latest `pnpm bench:gpu` run are kept in the repository as a generated
report:
[docs/perf/gpu-benchmarks.md](https://github.com/holochart/holochart/blob/main/docs/perf/gpu-benchmarks.md).
It names the machine, the browser, the date and the commit of the run, and lists each scenario
with its target, the measured value and whether the target was met, for large line, heatmap,
candlestick, treemap, marker, 3D scatter, surface and volume charts. Read the numbers there
instead of a copy here: the report changes with every run, and not every target is met.

Two things to know when reading it. Headless Chromium paces frames at 60 Hz, so 60 fps is the
ceiling of the benchmark, and a frame-rate target counts as met at 95 % of its value. A first
draw is timed from just before `createChart` to `chart.ready`, plus the GPU work still queued at
that point.
