# @mk7s/holochart-traces-stats

The statistical trace types of Holochart: `histogram`, `histogram2d`, `histogram2dcontour`, `box`,
`violin`, `splom`, `parcoords` and `parcats`. Part of
[Holochart](https://github.com/holochart/holochart), declarative GPU charts on three.js.

> **Alpha.** Released as `0.1.0-alpha` on the npm `alpha` tag; APIs can change between 0.x
> releases. Most apps should install the full bundle,
> [`@mk7s/holochart`](https://github.com/holochart/holochart/tree/main/packages/holochart), which
> includes this package.

## Install

```sh
pnpm add @mk7s/holochart-traces-stats@alpha three
```

`three` is a peer dependency, so your app and Holochart share one copy. ESM-only; Node 22 and
newer can also `require()` it.

## What it exports

- **`statsTraces`:** every trace module below, to register at once
- **Trace modules:** `histogram`, `histogram2d`, `histogram2dcontour`, `box`, `violin`, `splom`,
  `parcoords`, `parcats`
- **Attribute schemas:** `histogramAttributes`, `boxAttributes`, `violinAttributes`, and so on
- **`strip`:** builds a strip-plot figure (jittered points per category) from a table
- Grid and contouring helpers that `@mk7s/holochart-traces-sci` builds on

## Usage

```ts
import { createChart, register } from '@mk7s/holochart-runtime';
import { builtinComponents } from '@mk7s/holochart-components';
import { statsTraces } from '@mk7s/holochart-traces-stats';

register(...statsTraces, ...builtinComponents);

createChart(el, { data: [{ type: 'histogram', x: [1, 2, 2, 3, 3, 3, 4] }] });
```

## Docs

- [Chart types](https://mk7s.dev/holochart/charts/): [histogram](https://mk7s.dev/holochart/charts/statistical/histogram),
  [box](https://mk7s.dev/holochart/charts/statistical/box),
  [violin](https://mk7s.dev/holochart/charts/statistical/violin),
  [splom](https://mk7s.dev/holochart/charts/statistical/splom)
- Attribute reference: [histogram](https://mk7s.dev/holochart/reference/histogram),
  [box](https://mk7s.dev/holochart/reference/box), [violin](https://mk7s.dev/holochart/reference/violin),
  [parcoords](https://mk7s.dev/holochart/reference/parcoords)
- [API reference](https://mk7s.dev/holochart/reference/api/)

## License

MIT (see [LICENSE](LICENSE)).
