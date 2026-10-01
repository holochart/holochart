# @mk7s/holochart-runtime

The Holochart chart runtime: `createChart`, the pipeline from figure to pixels, the update API,
events and the module registry. It is the entry point of a partial bundle. Part of
[Holochart](https://github.com/holochart/holochart), declarative GPU charts on three.js.

> **Alpha.** Released as `0.1.0-alpha` on the npm `alpha` tag; APIs can change between 0.x
> releases. Most apps should install the full bundle,
> [`@mk7s/holochart`](https://github.com/holochart/holochart/tree/main/packages/holochart), which
> includes this package.

## Install

```sh
pnpm add @mk7s/holochart-runtime@alpha three
```

`three` is a peer dependency, so your app and Holochart share one copy. ESM-only; Node 22 and
newer can also `require()` it.

## What it exports

- **Charts:** `createChart` (returns a `Chart` with `react`, `relayout`, `restyle`, `update`,
  `on`, `destroy`), `getChart`
- **Plotly-style API:** `newPlot`, `react`, `restyle`, `relayout`, `update`, `addTraces`,
  `extendTraces`, `animate`, `purge`, `toImage`, `downloadImage`, `fromJSON`, `chartToJSON`
- **Registration:** `register`, `registry`, `createChartRegistry`, `defineTemplate`,
  `setDefaultTemplate`. The `holochart`, `plotly-classic` and `none` templates are registered
  already.
- **Contracts:** the `TraceModule` and `ComponentModule` types that trace packages and plugins
  implement. These are **experimental** until the plugin API stabilises.

The runtime registers no trace types and no components but hover labels: register the ones you
use.

## Usage

```ts
import { createChart, register } from '@mk7s/holochart-runtime';
import { builtinComponents } from '@mk7s/holochart-components';
import { basicTraces } from '@mk7s/holochart-traces-basic';

register(...basicTraces, ...builtinComponents);

const chart = createChart(el, { data: [{ type: 'bar', x: ['a', 'b'], y: [2, 3] }] });
chart.on('click', ({ points }) => console.log(points));
await chart.relayout({ 'yaxis.range': [0, 5] });
```

## Docs

- [Installation: smaller bundles](https://mk7s.dev/holochart/getting-started/installation#smaller-bundles-with-partial-packages)
- [Updating charts](https://mk7s.dev/holochart/fundamentals/updating-charts)
- [Interaction & events](https://mk7s.dev/holochart/fundamentals/interaction-events)
- [Trace module contract](https://mk7s.dev/holochart/extending/trace-module-contract)
- [API reference](https://mk7s.dev/holochart/reference/api/holochart-runtime/)

## License

MIT (see [LICENSE](LICENSE)).
