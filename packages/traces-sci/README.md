# @mk7s/holochart-traces-sci

The scientific trace types of Holochart: `heatmap`, `contour`, `image`, and the polar
`scatterpolar` and `barpolar` with their polar subplot. Part of
[Holochart](https://github.com/holochart/holochart), declarative GPU charts on three.js.

> **Alpha.** Released as `0.1.0-alpha` on the npm `alpha` tag; APIs can change between 0.x
> releases. Most apps should install the full bundle,
> [`@mk7s/holochart`](https://github.com/holochart/holochart/tree/main/packages/holochart), which
> includes this package.

## Install

```sh
pnpm add @mk7s/holochart-traces-sci@alpha three
```

`three` is a peer dependency, so your app and Holochart share one copy. ESM-only; Node 22 and
newer can also `require()` it.

## What it exports

- **`sciTraces`:** every trace module below plus the polar subplot, to register at once
- **Trace modules:** `heatmap`, `contour`, `image`, `scatterpolar`, `barpolar`
- **Polar subplot:** `polarComponent` (draws `layout.polar` axes; needed by the polar traces),
  `polarAttributes`
- **Attribute schemas** (experimental): `heatmapAttributes`, `contourAttributes`, `imageAttributes`,
  `scatterpolarAttributes`, `barpolarAttributes`

## Usage

```ts
import { createChart, register } from '@mk7s/holochart-runtime';
import { builtinComponents } from '@mk7s/holochart-components';
import { sciTraces } from '@mk7s/holochart-traces-sci';

register(...sciTraces, ...builtinComponents);

createChart(el, {
  data: [
    {
      type: 'heatmap',
      z: [
        [1, 2],
        [3, 4],
      ],
      colorscale: 'Viridis',
    },
  ],
});
```

## Docs

- [Chart types](https://mk7s.dev/holochart/charts/): [heatmap](https://mk7s.dev/holochart/charts/scientific/heatmap),
  [contour](https://mk7s.dev/holochart/charts/scientific/contour),
  [polar](https://mk7s.dev/holochart/charts/scientific/polar)
- Attribute reference: [heatmap](https://mk7s.dev/holochart/reference/heatmap),
  [contour](https://mk7s.dev/holochart/reference/contour),
  [scatterpolar](https://mk7s.dev/holochart/reference/scatterpolar)
- [Colors, colorscales & colorbars](https://mk7s.dev/holochart/fundamentals/colors-colorscales)
- [API reference](https://mk7s.dev/holochart/reference/api/)

## License

MIT (see [LICENSE](LICENSE)).
