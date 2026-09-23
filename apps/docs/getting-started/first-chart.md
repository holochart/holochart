---
title: Your first chart
description: A five-minute tutorial that builds a line and bar chart, updates it, and handles clicks.
status: complete
---

# Your first chart

This tutorial builds a small chart with a line trace and a bar trace, then updates it and listens
for clicks. It takes about five minutes.

::: info Status
`createChart` is the chart runtime being built in milestone M1. The code on this page shows the
API as it will ship in the first alpha. See [Installation](/getting-started/installation) for how
to try Holochart from source today.
:::

## 1. Add a container

Holochart draws into an element you provide. Give it a size: the chart fills its container.

```html
<div id="chart" style="width: 640px; height: 400px"></div>
```

## 2. Create a chart

Call `createChart` with the element and a figure. A figure is a plain object with `data` (a list
of traces), `layout`, and `config`. All three are optional except `data`.

```ts
import { createChart } from '@mk7s/holochart';

const el = document.getElementById('chart')!;

const chart = createChart(el, {
  data: [
    {
      type: 'scatter',
      x: [1, 2, 3, 4, 5],
      y: [3, 1, 4, 2, 5],
      mode: 'lines+markers',
      name: 'Visits',
    },
  ],
});
```

`mode: 'lines+markers'` draws a line through the points and a marker at each one. Use `'markers'`
for a scatter plot or `'lines'` for a plain line chart.

## 3. Add a bar trace

Traces in `data` share the same axes by default. Add a `bar` trace next to the scatter trace:

```ts
const chart = createChart(el, {
  data: [
    {
      type: 'scatter',
      x: [1, 2, 3, 4, 5],
      y: [3, 1, 4, 2, 5],
      mode: 'lines+markers',
      name: 'Visits',
    },
    { type: 'bar', x: [1, 2, 3, 4, 5], y: [2, 2, 3, 1, 4], name: 'Signups' },
  ],
});
```

Because both traces have a `name`, the legend shows both.

## 4. Add titles

Titles and axes live in `layout`:

```ts
const chart = createChart(el, {
  data: [/* the two traces from step 3 */],
  layout: {
    title: { text: 'Weekly traffic' },
    xaxis: { title: { text: 'Week' } },
    yaxis: { title: { text: 'Count' } },
  },
  config: { responsive: true },
});
```

`config: { responsive: true }` resizes the chart when its container changes size. Config controls
behavior, not appearance. See [Core concepts](/getting-started/core-concepts) for the difference
between layout and config.

## 5. Update the chart

Change trace data or style with `chart.update`. The second argument picks which traces to change:

```ts
chart.update({ data: [{ y: [4, 2, 5, 3, 6] }] }, { traces: [0] });
```

Change layout with `chart.relayout`, using dotted attribute paths:

```ts
chart.relayout({ 'xaxis.range': [0, 6], 'title.text': 'Weekly traffic (updated)' });
```

Holochart works out which stages of its pipeline an update touches and re-runs only those. A
color change restyles the existing GPU buffers. A data change recomputes that trace.

## 6. Listen for clicks

Subscribe to events with `chart.on`. A `click` event carries the points under the cursor:

```ts
chart.on('click', (event) => {
  for (const point of event.points) {
    console.log(point.curveNumber, point.x, point.y);
  }
});
```

See the [events reference](/reference/events) for every event and its payload.

## 7. Clean up

When you remove the chart from the page, call `destroy`. It releases the WebGL context and all GPU
memory the chart used.

```ts
chart.destroy();
```

## What is underneath

Every chart is drawn with a small set of GPU primitives: instanced markers, screen-space lines,
rectangles, arcs, fills, and text. The demo below shows the marker primitive on its own, with
different symbols. It is what the GPU marker primitive underneath looks like; chart-level live
examples arrive with the M1 runtime.

<Example id="_dev/markers-symbols" />

## Next steps

- [Core concepts](/getting-started/core-concepts): the figure model, schema, and pipeline
- [Scatter](/charts/basic/scatter), [Line](/charts/basic/line), and [Bar](/charts/basic/bar)
  chart pages
- [Layout attribute reference](/reference/layout) and [config reference](/reference/config)
