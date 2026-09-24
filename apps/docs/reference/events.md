---
title: Events
description: Every event a Holochart chart emits, when it fires, and what its payload contains.
status: draft
---

# Events

Subscribe to chart events with `chart.on` and unsubscribe with `chart.off`:

```ts
import type { PointerEventData } from '@mk7s/holochart';

function onClick(event: PointerEventData) {
  for (const point of event.points) {
    console.log(point.curveNumber, point.pointNumber, point.x, point.y);
  }
}

chart.on('click', onClick);
// later
chart.off('click', onClick);
```

## Event list

::: warning Provisional
The event names are fixed. The payload summaries below are provisional and may change before the
first alpha. The [API reference](/reference/api/) has the exact types once the runtime ships.
:::

| Event                  | When it fires                                         | Payload (provisional)                                    |
| ---------------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| `click`                | A data point is clicked                               | `points[]`, original pointer event                       |
| `doubleclick`          | The plot area is double-clicked                       | none                                                     |
| `hover`                | The pointer moves onto one or more points             | `points[]`, pointer position                             |
| `unhover`              | The pointer leaves the hovered points                 | `points[]` that were hovered                             |
| `selecting`            | During a box or lasso selection drag                  | `points[]`, `range` or `lassoPoints`                     |
| `selected`             | A box or lasso selection completes                    | `points[]`, `range` or `lassoPoints`                     |
| `deselect`             | The selection is cleared                              | none                                                     |
| `relayout`             | Layout changed (zoom, pan, `chart.relayout`)          | The changed layout paths and values                      |
| `relayouting`          | Continuously during a zoom or pan drag                | The changing layout paths and values                     |
| `restyle`              | Trace attributes changed (`chart.update`)             | The changed paths and values, and trace indices          |
| `legendclick`          | A legend item is clicked                              | Trace index; return `false` to cancel the default toggle |
| `legenddoubleclick`    | A legend item is double-clicked                       | Trace index; return `false` to cancel the default        |
| `sliderchange`         | A layout slider changes step                          | Slider, new step, previous active step                   |
| `buttonclicked`        | An update-menu button is clicked                      | Menu, button, and button index                           |
| `animated`             | An animation finishes                                 | none                                                     |
| `animatingframe`       | An animation frame starts                             | Frame name and frame                                     |
| `transitioning`        | A transition starts                                   | none                                                     |
| `afterplot`            | After each full plot or replot                        | none                                                     |
| `beforerender`         | Before each rendered frame                            | three.js `scene`, `camera`, and `renderer`               |
| `afterrender`          | After each rendered frame                             | three.js `scene`, `camera`, and `renderer`               |
| `webglcontextlost`     | The browser dropped the WebGL context                 | Original context event                                   |
| `webglcontextrestored` | The WebGL context came back and the chart re-rendered | none                                                     |

Each entry in `points[]` describes one point: `curveNumber` (trace index), `pointNumber`, `x`, `y`
(and `z` in 3D), `customdata`, the trace's `data` and `fullData`, and the point's bounding box in
pixels.

Frames render only when something changes, so `beforerender` and `afterrender` do not fire on
every browser animation frame.

## Plotly event names

The Plotly-style functional API (`newPlot`, `restyle`, `relayout`) also emits every event under its
Plotly name with a `plotly_` prefix, such as `plotly_click` and `plotly_relayout`. Code written for
Plotly event handlers keeps working. The object API (`createChart`) uses the short names only.

See also [Interaction & events](/fundamentals/interaction-events).
