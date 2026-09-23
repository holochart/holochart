---
title: Installation
description: Install Holochart from npm or a CDN, pick a bundle size, and use it with a framework.
status: complete
---

# Installation

::: warning Pre-alpha
Holochart is not published to npm yet. The commands below show how installation will work once
the first public alpha (`0.1.0-alpha`, milestone M1) ships. Until then, see
[Try it from the monorepo](#try-it-from-the-monorepo).
:::

## Install from npm

Holochart ships as `@mk7s/holochart`. It needs `three` as a peer dependency.

::: code-group

```sh [npm]
npm install @mk7s/holochart three
```

```sh [pnpm]
pnpm add @mk7s/holochart three
```

```sh [yarn]
yarn add @mk7s/holochart three
```

:::

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

Holochart supports `three` 0.180 or newer.

## Smaller bundles with partial packages

`@mk7s/holochart` registers every trace type and component. If you only need a few trace types,
install the runtime and the trace packages you use, then register them yourself:

```sh
pnpm add @mk7s/holochart-runtime @mk7s/holochart-traces-basic three
```

```ts
import { createChart, register } from '@mk7s/holochart-runtime';
import { scatter, bar } from '@mk7s/holochart-traces-basic';

register(scatter, bar);

const chart = createChart(el, { data: [{ type: 'scatter', x: [1, 2, 3], y: [3, 1, 2] }] });
```

The packages are:

| Package                        | Contents                                                              |
| ------------------------------ | --------------------------------------------------------------------- |
| `@mk7s/holochart`              | Full bundle: re-exports and registers everything                      |
| `@mk7s/holochart-runtime`      | `createChart`, `newPlot`, the update API, events, and registration    |
| `@mk7s/holochart-core`         | Figure model, attribute schema, validation, defaults, update planning |
| `@mk7s/holochart-render`       | three.js engine: renderer, viewports, GPU primitives, picking         |
| `@mk7s/holochart-components`   | Axes, legend, colorbar, annotations, shapes, hover labels, modebar    |
| `@mk7s/holochart-traces-basic` | Basic traces: scatter, bar, pie, table                                |
| `@mk7s/holochart-themes`       | Built-in templates, palettes, and colorscales                         |

More trace packages (statistical, scientific, financial, hierarchical, 3D) arrive with later
milestones. See the [roadmap](/roadmap).

## Use a script tag (CDN)

For pages without a build step, use the self-contained IIFE build,
`@mk7s/holochart/holochart.iife.min.js`. It exposes a global `window.Holochart`.

```html
<div id="chart" style="width: 600px; height: 400px"></div>
<script src="https://cdn.jsdelivr.net/npm/@mk7s/holochart/dist/holochart.iife.min.js"></script>
<script>
  const chart = Holochart.createChart(document.getElementById('chart'), {
    data: [{ type: 'scatter', x: [1, 2, 3], y: [4, 1, 7] }],
  });
</script>
```

The IIFE build bundles its own copy of three.js, because three no longer ships a global build.
Do not mix it with another copy of three on the same page: objects created with a separately
loaded `THREE` are different classes from the ones inside the bundle. If you need to add your own
three.js objects, use the npm packages with a bundler instead.

## Use with a framework

Official wrappers for React, Vue, Svelte, Angular, and a web component are planned for a later
milestone (see [Framework integration](/guides/frameworks)). Until then, create the chart when the
component mounts and destroy it when it unmounts. `chart.destroy()` releases the WebGL context and
GPU memory, so always call it.

React:

```tsx
import { useEffect, useRef } from 'react';
import { createChart, type Figure } from '@mk7s/holochart';

export function Chart({ figure }: { figure: Figure }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const chart = createChart(ref.current!, figure);
    return () => chart.destroy();
  }, [figure]);

  return <div ref={ref} style={{ width: '100%', height: 400 }} />;
}
```

Vue:

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { createChart, type Chart, type Figure } from '@mk7s/holochart';

const props = defineProps<{ figure: Figure }>();
const el = ref<HTMLDivElement>();
let chart: Chart | undefined;

onMounted(() => {
  chart = createChart(el.value!, props.figure);
});
onBeforeUnmount(() => chart?.destroy());
</script>

<template>
  <div ref="el" style="width: 100%; height: 400px" />
</template>
```

Holochart needs a browser with WebGL2, so in server-rendered apps create the chart only on the
client (the mount hooks above already do that).

## Requirements

- A browser with **WebGL2** (all current desktop and mobile browsers). Browsers without WebGL2
  are not supported.
- **ES modules.** The npm packages are ESM-only and target ES2022. Use a bundler such as Vite,
  webpack, or Rollup, or the IIFE build above.
- **TypeScript** types are included in every package. No `@types` package is needed. Types are
  generated from the attribute schema, so your editor autocompletes every trace and layout
  attribute.

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
example `?example=_dev/hello-cube`. The examples under `examples/_dev/` exercise the GPU
primitives directly. The chart runtime (`createChart`) is being built in M1, so chart-level
examples will appear there as it lands.

## License

Holochart is released under the
[MIT License](https://github.com/holochart/holochart/blob/main/LICENSE). Third-party components
and their licenses are listed in
[THIRD_PARTY_NOTICES.md](https://github.com/holochart/holochart/blob/main/THIRD_PARTY_NOTICES.md).
