# @mk7s/holochart-traces-basic

The basic trace types of Holochart: `scatter` (lines, markers, areas, bubbles), `bar`, `pie` and
`table`. Part of [Holochart](https://github.com/holochart/holochart), declarative GPU charts on
three.js.

> **Alpha.** Released as `0.1.0-alpha` on the npm `alpha` tag; APIs can change between 0.x
> releases. Most apps should install the full bundle,
> [`@mk7s/holochart`](https://github.com/holochart/holochart/tree/main/packages/holochart), which
> includes this package.

## Install

```sh
pnpm add @mk7s/holochart-traces-basic@alpha three
```

`three` is a peer dependency, so your app and Holochart share one copy. ESM-only; Node 22 and
newer can also `require()` it.

## What it exports

- **`basicTraces`:** every trace module below, to register at once
- **Trace modules:** `scatter`, `bar`, `pie`, `table`
- **Attribute schemas:** `scatterAttributes`, `barAttributes`, `pieAttributes`, `tableAttributes`
- **`timeline`:** builds a Gantt figure (horizontal bars on a date axis) from a table
- Shared helpers (colorscales, bar stacking, slice labels) that the other trace packages build on

## Usage

```ts
import { createChart, register } from '@mk7s/holochart-runtime';
import { builtinComponents } from '@mk7s/holochart-components';
import { basicTraces } from '@mk7s/holochart-traces-basic';

register(...basicTraces, ...builtinComponents);

createChart(el, { data: [{ type: 'bar', x: ['a', 'b'], y: [2, 3] }] });
```

Register single modules (`register(scatter, bar)`) to bundle only those.

## Docs

- [Chart types](https://mk7s.dev/holochart/charts/): [scatter](https://mk7s.dev/holochart/charts/basic/scatter),
  [bar](https://mk7s.dev/holochart/charts/basic/bar), [pie](https://mk7s.dev/holochart/charts/basic/pie),
  [table](https://mk7s.dev/holochart/charts/basic/table)
- Attribute reference: [scatter](https://mk7s.dev/holochart/reference/scatter),
  [bar](https://mk7s.dev/holochart/reference/bar), [pie](https://mk7s.dev/holochart/reference/pie),
  [table](https://mk7s.dev/holochart/reference/table)
- [API reference](https://mk7s.dev/holochart/reference/api/)

## License

MIT (see [LICENSE](LICENSE)).
