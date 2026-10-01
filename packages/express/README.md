# @mk7s/holochart-express

Plotly Express-style charts for Holochart: one call turns rows, columns, an Arrow table or CSV into a
complete figure, with grouping, facets, animation frames, trendlines and marginals. Part of
[Holochart](https://github.com/holochart/holochart), declarative GPU charts on three.js.

> **Alpha.** Released as `0.1.0-alpha` on the npm `alpha` tag; APIs can change between 0.x
> releases. Most apps should install the full bundle,
> [`@mk7s/holochart`](https://github.com/holochart/holochart/tree/main/packages/holochart), which
> includes this package (as the `express` namespace).

## Install

```sh
pnpm add @mk7s/holochart-express@alpha three
```

`three` is a peer dependency, so your app and Holochart share one copy. ESM-only; Node 22 and
newer can also `require()` it.

## What it exports

- **Default export `hx`:** every function below as one namespace (`hx.scatter(…)`)
- **Charts:** `scatter`, `line`, `area`, `bar`, `timeline`, `pie`, `histogram`, `box`, `violin`,
  `strip`, `ecdf`, `densityHeatmap`, `densityContour`, `imshow`, `scatterMatrix`,
  `parallelCoordinates`, `parallelCategories`, `funnel`, `funnelArea`, `sunburst`, `treemap`,
  `icicle`, `scatterPolar`, `linePolar`, `barPolar`, `scatter3d`, `line3d`
- **Data and stats:** `data` (`fromCSV`, `toTable`, …), `ff.distplot`, `getTrendlineResults`, `ols`,
  `lowess`, `rolling`

Each function returns a plain figure (`{ data, layout, frames? }`) for `createChart`, or renders it
when given an element first. Rendering needs the figure's trace types and components registered.

## Usage

```ts
import { createChart, register } from '@mk7s/holochart-runtime';
import { builtinComponents } from '@mk7s/holochart-components';
import { basicTraces } from '@mk7s/holochart-traces-basic';
import hx from '@mk7s/holochart-express';

register(...basicTraces, ...builtinComponents);

const rows = [
  { country: 'Chile', continent: 'Americas', gdpPercap: 13172, lifeExp: 78.6 },
  { country: 'Japan', continent: 'Asia', gdpPercap: 31656, lifeExp: 82.6 },
  { country: 'Kenya', continent: 'Africa', gdpPercap: 1463, lifeExp: 54.1 },
];
const figure = hx.scatter(rows, { x: 'gdpPercap', y: 'lifeExp', color: 'continent', logX: true });
createChart(el, figure);
```

## Docs

- [Express API](https://mk7s.dev/holochart/express/)
- [Data input](https://mk7s.dev/holochart/express/data)
- [Facets](https://mk7s.dev/holochart/express/facets)
- [API reference](https://mk7s.dev/holochart/reference/api/holochart-express/)

## License

MIT (see [LICENSE](LICENSE)).
