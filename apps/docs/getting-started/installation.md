---
title: Installation
description: Install Holochart from npm or a CDN, pick a bundle size, and use it with a framework.
status: complete
---

# Installation

::: warning Alpha
Holochart is not published to npm yet. The commands below show how installation works once the
first release, `0.1.0-alpha`, ships (see the [roadmap](/roadmap)). Until then, see
[Try it from the monorepo](#try-it-from-the-monorepo).
:::

## Install from npm

Holochart ships as `@mk7s/holochart`. It needs `three` as a peer dependency.

::: code-group

```sh [npm]
npm install @mk7s/holochart@alpha three
```

```sh [pnpm]
pnpm add @mk7s/holochart@alpha three
```

```sh [yarn]
yarn add @mk7s/holochart@alpha three
```

:::

While Holochart is in alpha, releases are published under the `alpha` dist-tag, so `@alpha` gets
the newest one. Once a stable version is out, drop the tag.

Then import it:

```ts
import { createChart } from '@mk7s/holochart';
```

### Why three is a peer dependency

Holochart renders with [three.js](https://threejs.org), and it does not bundle its own copy
([ADR-003](https://github.com/holochart/holochart/blob/main/docs/adr/003-three-peer-dependency.md)).
Your app keeps a single `three` instance. That matters for two reasons:

- Your bundle does not carry two copies of three.
- three.js objects you create (meshes, materials, vectors) are the same classes Holochart uses, so
  you can add them to a chart's scene without `instanceof` checks failing.

Holochart supports `three` 0.180 and newer, up to the newest minor version tested in CI; the
exact range is the `three` peer dependency in each package's `package.json`.

## Smaller bundles with partial packages

`@mk7s/holochart` registers every trace type, component and theme. If you only need a few trace
types, install the runtime, the components and the trace packages you use, then register them
yourself:

```sh
pnpm add @mk7s/holochart-runtime@alpha @mk7s/holochart-components@alpha @mk7s/holochart-traces-basic@alpha three
```

```ts
import { createChart, register } from '@mk7s/holochart-runtime';
import { builtinComponents } from '@mk7s/holochart-components';
import { bar, scatter } from '@mk7s/holochart-traces-basic';

// The trace types you use, plus the components that draw axes, titles, legends, colorbars,
// annotations, shapes, the modebar, sliders and menus.
register(scatter, bar, ...builtinComponents);

const chart = createChart(el, {
  data: [
    { type: 'scatter', x: [1, 2, 3], y: [3, 1, 2], name: 'A' },
    { type: 'bar', x: [1, 2, 3], y: [1, 2, 1.5], name: 'B' },
  ],
  layout: { title: { text: 'A partial bundle' } },
});
```

Without `builtinComponents` the traces still draw, with hover labels, but there are no axes,
title or legend. To save more, register single components instead (`axesComponent`,
`legendComponent`, `titleComponent`, …).

The default look (the `holochart` template), `plotly-classic` and `none` are built in. Other named
themes and the extra named colorscales and palettes are opt-in:

```sh
pnpm add @mk7s/holochart-themes@alpha @mk7s/holochart-core@alpha
```

```ts
import { register } from '@mk7s/holochart-runtime';
import { registerBuiltinColors } from '@mk7s/holochart-core';
import { builtinThemes, defineTheme } from '@mk7s/holochart-themes';

register(defineTheme('plotly_dark')); // one theme, or all of them: register(...builtinThemes)
registerBuiltinColors(); // cmocean, CARTO and ColorBrewer colorscales, qualitative palettes
```

The packages are:

| Package                          | Contents                                                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `@mk7s/holochart`                | Full bundle: re-exports and registers everything, 2D and 3D, with Express as `express`                                 |
| `@mk7s/holochart-runtime`        | `createChart`, `newPlot`, the update API, events, and registration                                                     |
| `@mk7s/holochart-core`           | Figure model, attribute schema, validation, defaults, update planning                                                  |
| `@mk7s/holochart-render`         | three.js engine: renderer, viewports, GPU primitives, picking                                                          |
| `@mk7s/holochart-components`     | Axes, legend, colorbar, annotations, shapes, hover labels, modebar, sliders and menus (`builtinComponents`)            |
| `@mk7s/holochart-traces-basic`   | Basic traces: scatter, bar, pie, table (`basicTraces`)                                                                 |
| `@mk7s/holochart-traces-stats`   | Statistical traces: histogram, histogram2d, histogram2dcontour, box, violin, splom, parcoords, parcats (`statsTraces`) |
| `@mk7s/holochart-traces-sci`     | Scientific traces: heatmap, contour, image, and polar scatterpolar, barpolar (`sciTraces`)                             |
| `@mk7s/holochart-traces-finance` | Financial traces: ohlc, candlestick, waterfall, funnel, funnelarea, indicator (`financeTraces`)                        |
| `@mk7s/holochart-traces-hier`    | Hierarchical and flow traces: sunburst, treemap, icicle, sankey (`hierTraces`)                                         |
| `@mk7s/holochart-traces-3d`      | The 3D scene and 3D traces: scatter3d, surface, mesh3d, cone, streamtube, isosurface, volume, bar3d (`traces3d`)       |
| `@mk7s/holochart-express`        | [Express](/express/): Plotly Express-style charts from tabular data                                                    |
| `@mk7s/holochart-themes`         | Built-in templates, palettes, and colorscales                                                                          |
| `@mk7s/holochart-locales`        | [Locales](/fundamentals/locales): UI strings, month names, number and date formats, one module per locale              |

Each trace package exports its trace types one by one and as a list to register at once
(`register(...basicTraces, ...traces3d)`). The 3D traces also need the scene, which `traces3d`
includes.

## Use a script tag (CDN)

For pages without a build step, use the self-contained IIFE build,
`@mk7s/holochart/holochart.iife.min.js`. It exposes a global `window.Holochart`.

```html
<div id="chart" style="width: 600px; height: 400px"></div>
<script src="https://cdn.jsdelivr.net/npm/@mk7s/holochart@0.1/dist/holochart.iife.min.js"></script>
<script>
  const chart = Holochart.createChart(document.getElementById('chart'), {
    data: [{ type: 'scatter', x: [1, 2, 3], y: [4, 1, 7] }],
  });
</script>
```

For [3D scenes](/fundamentals/3d-scenes), add the 3D add-on after it. The main script is 2D only,
so pages without 3D charts don't download the 3D code:

```html
<script src="https://cdn.jsdelivr.net/npm/@mk7s/holochart@0.1/dist/holochart.iife.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@mk7s/holochart@0.1/dist/holochart-3d.iife.min.js"></script>
```

The add-on registers the 3D scene and traces into `window.Holochart` (`Holochart.traces3d`, and the
exports of `@mk7s/holochart-traces-3d`). It uses the main script's three.js, so load both from the
same version, and the main script first.

The URLs pin the `0.1` release line, so a new minor version (which may change APIs before 1.0)
never reaches your page unannounced. jsDelivr version ranges skip pre-releases: during the alpha,
pin the exact version instead, for example `@mk7s/holochart@0.1.0-alpha.0`.

The IIFE build bundles its own copy of three.js, because three no longer ships a global build.
Do not mix it with another copy of three on the same page: objects created with a separately
loaded `THREE` are different classes from the ones inside the bundle. If you need to add your own
three.js objects, use the npm packages with a bundler instead.

## Use with a framework

Official wrappers for React, Vue, Svelte, Angular, and a web component are planned for a later
milestone (see [Framework integration](/guides/frameworks)). Until then, create the chart when the
component mounts, pass new figures to `react()`, which redraws only what changed, and destroy the
chart when the component unmounts. Destroying (`purge(el)` or `chart.destroy()`) releases the
WebGL context and GPU memory, so always do it.

React:

```tsx
import { useEffect, useRef } from 'react';
import { newPlot, purge, react, type Figure } from '@mk7s/holochart';

export function Chart({ figure }: { figure: Figure }) {
  const ref = useRef<HTMLDivElement>(null);

  // Create the chart once, and destroy it on unmount.
  useEffect(() => {
    const el = ref.current!;
    void newPlot(el, figure);
    return () => purge(el);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Later figures update the chart in place (on mount this is a no-op).
  useEffect(() => {
    void react(ref.current!, figure);
  }, [figure]);

  return <div ref={ref} style={{ width: '100%', height: 400 }} />;
}
```

Pass a new figure object to trigger an update: like Plotly's `react`, unchanged data arrays are
compared by reference, so replace an array instead of mutating it.

Vue:

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { createChart, type Chart, type Figure } from '@mk7s/holochart';

const props = defineProps<{ figure: Figure }>();
const el = ref<HTMLDivElement>();
let chart: Chart | undefined;

onMounted(() => {
  chart = createChart(el.value!, props.figure);
});
watch(
  () => props.figure,
  (figure) => void chart?.react(figure),
);
onBeforeUnmount(() => chart?.destroy());
</script>

<template>
  <div ref="el" style="width: 100%; height: 400px" />
</template>
```

Holochart needs a browser with WebGL2, so in server-rendered apps create the chart only on the
client (the mount hooks above already do that).

## Requirements

- A browser with **WebGL2**. Browsers without WebGL2 are not supported; see
  [Supported browsers](#supported-browsers).
- **ES modules.** The npm packages are ESM-only and target ES2022. Use a bundler such as Vite,
  webpack, or Rollup, or the IIFE build above. Node 22 and newer can also `require()` them.
- **TypeScript** types are included in every package. No `@types` package is needed. Figures are
  typed: `Figure`, `Data` (every trace type, discriminated on `type`) and `Layout` autocomplete
  every attribute with its documentation, and `createChart`, `newPlot` and `react` check the
  figures they get. See [TypeScript](/guides/typescript).

## Supported browsers

Holochart draws with WebGL2 only: there is no SVG, Canvas 2D or WebGL1 fallback. Without WebGL2,
`createChart` throws a `WebGLUnavailableError`, `newPlot` rejects with one, and the container
shows a text fallback (see
[When WebGL2 is unavailable](/getting-started/first-chart#when-webgl2-is-unavailable)).

| Browser                       | Status                                                                 |
| ----------------------------- | ---------------------------------------------------------------------- |
| Chrome and Edge, desktop      | Tested on every change (headless Chromium)                             |
| Firefox, desktop              | Tested nightly; it logs two harmless WebGL warnings with 3D meshes     |
| Safari, macOS                 | Its engine (WebKit) is tested nightly; Safari itself is not tested yet |
| Safari on iOS, Chrome Android | Expected to work; not tested yet                                       |

No minimum browser versions have been established. Two differences are known: Safari cannot
export WebP (`toImage({ format: 'webp' })` rejects; PNG and JPEG work), and in Safari the range
selector's buttons are not reached with Tab.

## Try it from the monorepo

Until the first alpha is published, you can run Holochart from source. You need Node 22 or newer
and pnpm (via Corepack).

```sh
git clone https://github.com/holochart/holochart.git
cd holochart
corepack enable
pnpm install
pnpm dev
```

`pnpm dev` starts the sandbox, a small Vite app with an example picker. Open an example by id, for
example `?example=scatter3d/basic`: every example in the [gallery](/gallery/) is there, and the
internal test pages under `examples/_dev/` too.

## License

Holochart is released under the
[MIT License](https://github.com/holochart/holochart/blob/main/LICENSE). Third-party components
and their licenses are listed in
[THIRD_PARTY_NOTICES.md](https://github.com/holochart/holochart/blob/main/THIRD_PARTY_NOTICES.md).
