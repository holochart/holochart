---
title: Errors and warnings
description: Which Holochart calls reject, which only warn, and the error classes you can catch.
status: complete
---

# Errors and warnings

Holochart follows one rule: **a problem in the figure is a warning, a problem in the call is an
error.** A chart with a mistyped attribute still draws; a call that cannot do what it was asked
rejects.

## What happens when

| Situation                                                               | Result                                                                                                                                     |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Unknown attribute, invalid or out-of-range value, bad container         | Console warning, once per attribute path. The default (or the clamped value) is used and the chart draws.                                  |
| Unknown trace type                                                      | Console warning, once. That trace is hidden; the rest of the chart draws.                                                                  |
| Deprecated attribute                                                    | Console warning, once. The attribute still works.                                                                                          |
| Any of the above with `config.strict: true`                             | The call rejects with a `ValidationError` for the first problem (deprecations still only warn).                                            |
| The browser has no WebGL2                                               | The call rejects with a `WebGLUnavailableError`, and the element shows a text description of the chart.                                    |
| A trace index out of range, mismatched `newIndices`                     | The call rejects with a `RangeError`.                                                                                                      |
| `extendTraces` on an attribute that is missing or not an array          | The call rejects with an `Error`.                                                                                                          |
| `toImage` with an invalid size, scale or format                         | Rejects with a `RangeError` (size, scale, image larger than the GPU can draw) or an `Error` (format).                                      |
| A functional call (`react`, `restyle`, …) on an element with no chart   | Rejects with an `Error` that says to call `newPlot` first.                                                                                 |
| An update or export on a destroyed chart                                | Rejects with an `Error` ("this chart has been destroyed").                                                                                 |
| A grid larger than the GPU's textures (heatmap, image, surface, volume) | Console warning, once. That trace is not drawn.                                                                                            |
| An event listener or callback of yours throws                           | Reported like an uncaught error (`reportError`), so it reaches the console and error trackers. The chart and the other listeners carry on. |
| The WebGL context is lost                                               | No error. The chart emits `webglcontextlost`, and redraws itself after `webglcontextrestored`.                                             |

Every call that draws returns a promise, and that promise is where errors arrive:

```ts
import { newPlot, ValidationError, WebGLUnavailableError } from '@mk7s/holochart';

try {
  await newPlot(el, data, layout, { strict: true });
} catch (error) {
  if (error instanceof WebGLUnavailableError) {
    // The element already shows the fallback text; offer a table or an image instead.
  } else if (error instanceof ValidationError) {
    console.error(error.issue.path, error.issue.message);
  } else {
    throw error;
  }
}
```

`createChart` is the one synchronous entry point. It throws `WebGLUnavailableError` directly,
because there is no chart to return; a strict-mode `ValidationError` rejects `chart.ready`.

## Error classes

All of Holochart's own errors extend `HolochartError`, so one `instanceof` check tells them apart
from everything else.

| Class                   | Thrown when                                         | Extra fields                                              |
| ----------------------- | --------------------------------------------------- | --------------------------------------------------------- |
| `HolochartError`        | Base class.                                         |                                                           |
| `ValidationError`       | `config.strict` is on and the figure has a problem. | `issue`: `path`, `message`, `code`, `value`, `suggestion` |
| `WebGLUnavailableError` | No WebGL2 context could be created.                 | `cause`: the renderer's own error                         |

Argument errors use the built-in `RangeError` and `Error`.

## Strict mode in development

Warnings are easy to miss. Turn `config.strict` on in development and in tests so that a typo
fails loudly, and leave it off in production so that a bad value in user data cannot take a chart
down:

```ts
import { newPlot } from '@mk7s/holochart';

// Your bundler's development flag, e.g. `import.meta.env.DEV` in Vite.
declare const DEV: boolean;

await newPlot(el, data, layout, { strict: DEV });
```

## Unknown trace types

When a trace type is one of Holochart's own but its package was not registered (a
[partial bundle](../getting-started/installation), or the script build without the 3D add-on),
the warning names the package:

```text
[holochart] data[0].type: unknown trace type 'sankey': `sankey` is in
@mk7s/holochart-traces-hier; import it from there and call `register(sankey)` (the trace is hidden)
```

For any other name it suggests the nearest registered type.
