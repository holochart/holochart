---
title: Installation
description: Build Holochart from source, set up Python and Jupyter, choose browser bundles, and check package availability.
status: complete
---

# Installation

<span id="install-from-npm"></span>

<InstallStatus />

Choose [Python / Jupyter development setup](#python-and-jupyter-from-source),
[JavaScript / TypeScript](#try-it-from-the-monorepo), or
[plain HTML](#browser-bundles-from-source). Source setup includes a one-time dependency install
and browser build. The [first-chart tutorial](/getting-started/first-chart) takes about five
minutes **after setup**; clone/install/build time is additional.

## Build from source today

Run these commands in a **terminal**, not a notebook cell. You need Git, Node.js **22 or newer**,
and the repository's pinned **pnpm 11.15.1**. Check `node --version` and `pnpm --version` first.
If pnpm is missing, install it:

```sh
npm install --global pnpm@11.15.1
```

An existing Corepack-managed pnpm can also use the repository's `packageManager` pin; enable
Corepack if needed. Then clone and build:

```sh
git clone https://github.com/holochart/holochart.git
cd holochart
pnpm install
pnpm build:packages
```

Keep this terminal in the repository root (`holochart/`) for every relative path below. This
public-main clone supplies the browser setup. **It does not currently include the Python
bridge**; the Python development workflow below requires a separate existing checkout that
contains `packages/holochart-py`. No public source revision containing that bridge has been
verified. The browser build creates both IIFEs; running a Python package install before building
its matching browser assets reports missing assets.

The public-main browser path below was verified with basic charts and includes the 3D bundle.
The map and graph extension imports described elsewhere on this site require a development
checkout containing `packages/traces-geo` and `packages/traces-graph`; those packages are not
currently on public `main` either. Check the package directory exists before using its imports.

## Try it from the monorepo

After the common source build above, start the browser sandbox from the repository root:

```sh
pnpm dev
```

Open the local URL printed by Vite. The sandbox has an example picker; append
`?example=scatter3d/basic` to its URL to open a specific example. The examples import
`@mk7s/holochart` through the workspace, so there is no registry install step. Use the
[first-chart tutorial](/getting-started/first-chart) to learn the browser API, then explore the
[gallery](/gallery/). Stop the development server with Ctrl+C.

## Python and Jupyter from source

::: warning Development checkout required
The bridge is currently local development work. A fresh clone of GitHub `main` cannot install
it because `packages/holochart-py` is absent. These instructions apply only when you already
have a development checkout containing that directory and its matching browser source.
A public Python source-install revision has not been verified.
:::

You need **Python 3.10 or newer**, Git, Node.js 22+ and pnpm 11.15.1. The following commands
are for macOS/Linux terminals. Replace the path with your existing development checkout and
confirm `packages/holochart-py/pyproject.toml` exists there before installing. Use a separate
virtual environment so the notebook kernel and package installation share one Python executable:

```sh
cd /absolute/path/to/development-checkout
pnpm install
pnpm build:packages
python3 -m venv .venv-holochart
source .venv-holochart/bin/activate
python -m pip install 'packages/holochart-py[plotly]' jupyterlab ipykernel
python -m ipykernel install --user --name holochart --display-name "Python (Holochart)"
python -m jupyterlab
```

On Windows PowerShell, create the environment with `py -3 -m venv .venv-holochart`, then
activate it with `.\.venv-holochart\Scripts\Activate.ps1` before running the remaining
`python` commands. Git and Node/pnpm are needed for the source build on either platform.

In JupyterLab, create a notebook and select **Python (Holochart)** as its kernel. In VS Code or
another notebook editor, select the same kernel or the `.venv-holochart` interpreter. Run this
in a **notebook cell** to check the environment:

```python
import sys
import holochart

print(sys.executable)  # Must be the .venv-holochart environment's Python.
print(holochart.__file__)
```

Then run the [notebook chart examples](/guides/notebooks#existing-plotly-figures). They need a
widget manager and a WebGL2-capable browser. Installing `holochart-py` does not change Plotly's
renderer automatically: register it once per kernel as shown in that guide.

### Install into an existing notebook kernel

Build the browser assets in a terminal first. For an existing kernel, use **`%pip` in a
notebook cell**; it installs into the active kernel rather than an unrelated shell Python.
This also requires the development checkout described above. Replace the absolute path with
that checkout's path:

```python
%pip install '/absolute/path/to/holochart/packages/holochart-py[plotly]'
```

Restart the kernel after this installation (or after reinstalling/upgrading the bridge), then
rerun imports and renderer registration. If the output is blank after an asset change, also
reload the notebook page and rerun the display cell. When frontend code changes, repeat
`pnpm build:packages` in the repository root and reinstall the Python package to embed the new
assets; restarting alone does not update an installed wheel.

### What a built Python wheel needs

A built wheel contains the matching browser scripts and default fonts. Installing that wheel
needs Python and a notebook widget manager; **it does not need npm, Node, or a CDN**. The source
build above needs Node/pnpm to create those assets once. A verified PyPI release will expose
its own quick-install command in the availability panel independently of npm.

## Browser package imports

Inside the source workspace, or after a verified npm release, import the full bundle:

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

The current package declares `three >=0.180.0 <0.187.0`. The repository install supplies its
tested version. Check the peer dependency in the selected release's `package.json` when
installing a published version.

## Smaller bundles with partial packages

`@mk7s/holochart` registers the built-in 2D and 3D traces, components and themes. If you only need a few trace
types, use the runtime, components and trace packages from the source workspace and register
them yourself. Standalone registry installation depends on a verified release of each package:

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

```ts
import { register } from '@mk7s/holochart-runtime';
import { registerBuiltinColors } from '@mk7s/holochart-core';
import { builtinThemes, defineTheme } from '@mk7s/holochart-themes';

register(defineTheme('plotly_dark')); // one theme, or all of them: register(...builtinThemes)
registerBuiltinColors(); // cmocean, CARTO and ColorBrewer colorscales, qualitative palettes
```

The packages are:

| Package                          | Contents                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@mk7s/holochart`                | Full bundle: re-exports and registers everything, 2D and 3D, with Express as `express`                                                                        |
| `@mk7s/holochart-runtime`        | `createChart`, `newPlot`, the update API, events, and registration                                                                                            |
| `@mk7s/holochart-core`           | Figure model, attribute schema, validation, defaults, update planning                                                                                         |
| `@mk7s/holochart-render`         | three.js engine: renderer, viewports, GPU primitives, picking                                                                                                 |
| `@mk7s/holochart-components`     | Axes, legend, colorbar, annotations, shapes, hover labels, modebar, sliders and menus (`builtinComponents`)                                                   |
| `@mk7s/holochart-traces-basic`   | Basic traces: scatter, bar, pie, table (`basicTraces`)                                                                                                        |
| `@mk7s/holochart-traces-stats`   | Statistical traces: histogram, histogram2d, histogram2dcontour, box, violin, splom, parcoords, parcats (`statsTraces`)                                        |
| `@mk7s/holochart-traces-sci`     | Scientific traces: heatmap, contour, image, and polar scatterpolar, barpolar (`sciTraces`)                                                                    |
| `@mk7s/holochart-traces-finance` | Financial traces: ohlc, candlestick, waterfall, funnel, funnelarea, indicator (`financeTraces`)                                                               |
| `@mk7s/holochart-traces-hier`    | Hierarchical and flow traces: sunburst, treemap, icicle, sankey (`hierTraces`)                                                                                |
| `@mk7s/holochart-traces-3d`      | The 3D scene and 3D traces: scatter3d, surface, mesh3d, cone, streamtube, isosurface, volume, bar3d (`traces3d`)                                              |
| `@mk7s/holochart-traces-geo`     | [Maps](/fundamentals/maps): the geo subplot, scattergeo, choropleth (`tracesGeo`). Not in the full bundle (see below)                                         |
| `@mk7s/holochart-traces-graph`   | [Network graphs](/fundamentals/graphs): graph, chord (`tracesGraph`), graph3d (`tracesGraph3d`), layouts and data helpers. Not in the full bundle (see below) |
| `@mk7s/holochart-express`        | [Express](/express/): Plotly Express-style charts from tabular data                                                                                           |
| `@mk7s/holochart-themes`         | Built-in templates, palettes, and colorscales                                                                                                                 |
| `@mk7s/holochart-locales`        | [Locales](/fundamentals/locales): UI strings, month names, number and date formats, one module per locale                                                     |

Each trace package exports its trace types one by one and as a list to register at once
(`register(...basicTraces, ...traces3d)`). The 3D traces also need the scene, which `traces3d`
includes.

Maps and network graphs are the two families the full bundle leaves out, so that apps without a
map or a network do not download them. With the full bundle, add one import for each; in a
partial bundle, register `tracesGeo` or `tracesGraph` like any other list:

```ts
import * as Holochart from '@mk7s/holochart';
import '@mk7s/holochart/geo'; // registers @mk7s/holochart-traces-geo
import '@mk7s/holochart/graph'; // registers @mk7s/holochart-traces-graph
```

The map data (coastlines, countries) is part of that package and loads on demand; see
[Maps](/fundamentals/maps#what-the-data-costs) for what it costs. The graph package has the
`graph`, `chord` and `graph3d` traces with their layouts; see
[Network graphs](/fundamentals/graphs#adding-the-package).

<span id="use-a-script-tag-cdn"></span>

## Browser bundles from source

For plain HTML, use the locally built self-contained IIFE. From the repository root after the
common source build, copy the **whole `dist` directory** so the default fonts stay alongside
the script:

```sh
mkdir -p preview
cp -R packages/holochart/dist/. preview/
```

Save this as `preview/index.html`:

```html
<!doctype html>
<html lang="en">
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Holochart from source</title>
  <div id="chart" style="width: 100%; height: 400px"></div>
  <script src="./holochart.iife.min.js"></script>
  <script>
    const chart = Holochart.createChart(document.getElementById('chart'), {
      data: [{ type: 'scatter', x: [1, 2, 3], y: [4, 1, 7] }],
      config: { responsive: true },
    });
  </script>
</html>
```

Serve the files over HTTP using Python 3 in a terminal:

```sh
python3 -m http.server 8000 --directory preview
```

Open the local server on port 8000 in your browser. Loading via `file://` can prevent font
requests. For [3D scenes](/fundamentals/3d-scenes), add this script **after the main IIFE** and
before your chart code:

```html
<script src="./holochart-3d.iife.min.js"></script>
```

Keep both scripts from the same build. The IIFE bundles its own three.js; use the ESM packages
with a bundler when your application needs to share three.js objects with Holochart. CDN URLs
become usable only after the corresponding npm artifact is published and verified.

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

## License

Holochart is released under the
[MIT License](https://github.com/holochart/holochart/blob/main/LICENSE). Third-party components
and their licenses are listed in
[THIRD_PARTY_NOTICES.md](https://github.com/holochart/holochart/blob/main/THIRD_PARTY_NOTICES.md).
