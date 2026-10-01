# @mk7s/holochart-traces-hier

The hierarchical and flow trace types of Holochart: `sunburst`, `treemap`, `icicle` and `sankey`.
Part of [Holochart](https://github.com/holochart/holochart), declarative GPU charts on three.js.

> **Alpha.** Released as `0.1.0-alpha` on the npm `alpha` tag; APIs can change between 0.x
> releases. Most apps should install the full bundle,
> [`@mk7s/holochart`](https://github.com/holochart/holochart/tree/main/packages/holochart), which
> includes this package.

## Install

```sh
pnpm add @mk7s/holochart-traces-hier@alpha three
```

`three` is a peer dependency, so your app and Holochart share one copy. ESM-only; Node 22 and
newer can also `require()` it.

## What it exports

- **`hierTraces`:** every trace module below, to register at once
- **Trace modules:** `sunburst`, `treemap`, `icicle`, `sankey`
- **Attribute schemas:** `sunburstAttributes`, `treemapAttributes`, `icicleAttributes`,
  `sankeyAttributes`
- **Hierarchy helpers:** `buildHierarchy`, `partition`, `nodePath` (for preparing data or reading
  click payloads), and `sankeyLayout`

## Usage

```ts
import { createChart, register } from '@mk7s/holochart-runtime';
import { builtinComponents } from '@mk7s/holochart-components';
import { hierTraces } from '@mk7s/holochart-traces-hier';

register(...hierTraces, ...builtinComponents);

createChart(el, {
  data: [
    {
      type: 'sunburst',
      labels: ['root', 'a', 'b'],
      parents: ['', 'root', 'root'],
      values: [0, 2, 3],
    },
  ],
});
```

## Docs

- [Chart types](https://mk7s.dev/holochart/charts/): [sunburst](https://mk7s.dev/holochart/charts/hierarchical/sunburst),
  [treemap](https://mk7s.dev/holochart/charts/hierarchical/treemap),
  [sankey](https://mk7s.dev/holochart/charts/hierarchical/sankey)
- Attribute reference: [sunburst](https://mk7s.dev/holochart/reference/sunburst),
  [treemap](https://mk7s.dev/holochart/reference/treemap),
  [sankey](https://mk7s.dev/holochart/reference/sankey)
- [API reference](https://mk7s.dev/holochart/reference/api/)

## License

MIT (see [LICENSE](LICENSE)).
