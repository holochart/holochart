# @mk7s/holochart-components

The figure components of Holochart: axes, titles, legend, colorbars, annotations, shapes, layout
images, the modebar, range sliders and selectors, update menus and sliders. Part of
[Holochart](https://github.com/holochart/holochart), declarative GPU charts on three.js.

> **Alpha.** Released as `0.1.0-alpha` on the npm `alpha` tag; APIs can change between 0.x
> releases. Most apps should install the full bundle,
> [`@mk7s/holochart`](https://github.com/holochart/holochart/tree/main/packages/holochart), which
> includes this package.

## Install

```sh
pnpm add @mk7s/holochart-components@alpha three
```

`three` is a peer dependency, so your app and Holochart share one copy. ESM-only; Node 22 and
newer can also `require()` it.

## What it exports

- **`builtinComponents`:** every component below, to register at once. Without them a chart draws
  its traces but no axes, titles, legend or modebar. (Hover labels come with the runtime.)
- **Components:** `axesComponent`, `titleComponent`, `legendComponent`, `colorbarComponent`,
  `annotationsComponent`, `shapesComponent`, `imagesComponent`, `selectionsComponent`,
  `rangesliderComponent`, `rangeselectorComponent`, `updatemenusComponent`, `slidersComponent`,
  `modebarComponent`
- **Shape helpers:** `addShape`, `addHline`, `addVline`, `addHrect`, `addVrect` (Plotly's
  `add_hline` and friends, on a chart)

## Usage

```ts
import { createChart, register } from '@mk7s/holochart-runtime';
import { addHline, builtinComponents } from '@mk7s/holochart-components';
import { basicTraces } from '@mk7s/holochart-traces-basic';

register(...basicTraces, ...builtinComponents);

const chart = createChart(el, { data: [{ type: 'bar', x: ['a', 'b'], y: [2, 3] }] });
await addHline(chart, 2.5, { line: { dash: 'dot' } });
```

## Docs

- [Layout, axes & subplots](https://mk7s.dev/holochart/fundamentals/layout-axes-subplots)
- [Shapes & images](https://mk7s.dev/holochart/fundamentals/shapes-images)
- [Buttons, dropdowns & sliders](https://mk7s.dev/holochart/fundamentals/controls)
- [Writing a component plugin](https://mk7s.dev/holochart/extending/component-plugin)
- [API reference](https://mk7s.dev/holochart/reference/api/)

## License

MIT (see [LICENSE](LICENSE)).
