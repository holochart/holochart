# @mk7s/holochart-core

The figure model of Holochart: the attribute schema system, validation, defaults, templates,
named colors, scales and update planning. Pure and renderer-free (it never imports three.js). Part
of [Holochart](https://github.com/holochart/holochart), declarative GPU charts on three.js.

> **Alpha.** Released as `0.1.0-alpha` on the npm `alpha` tag; APIs can change between 0.x
> releases. Most apps should install the full bundle,
> [`@mk7s/holochart`](https://github.com/holochart/holochart/tree/main/packages/holochart), which
> includes this package.

## Install

```sh
pnpm add @mk7s/holochart-core@alpha
```

No peer dependencies. ESM-only; Node 22 and newer can also `require()` it.

## What it exports

- **Schema and validation:** `attr`, `layoutSchema`, `configSchema`, `plotSchema`, `validate`,
  `ValidationError`, `HolochartError`
- **Defaults and templates:** `createRegistry`, `supplyDefaults`, `composeTemplates`,
  `resolveTemplate`, and the built-in `holochartTemplate`, `plotlyClassicTemplate`, `noneTemplate`
- **Subplots:** `makeSubplots`
- **Colors:** `colors`, `getColorscale`, `getColorway`, `registerColorscale`,
  `registerBuiltinColors` (opts a partial bundle in to every named palette and colorscale)
- **Updates and data:** `planUpdate`, `planRestyle`, `planRelayout`, `diffFigures`, `parseDate`,
  `encodeFigure` / `decodeFigure`

## Usage

```ts
import { makeSubplots, registerBuiltinColors } from '@mk7s/holochart-core';

registerBuiltinColors(); // makes names like 'tempo' or 'Safe' resolvable in a partial bundle

const sp = makeSubplots({ rows: 1, cols: 2, subplotTitles: ['Sales', 'Costs'] });
const figure = {
  data: [sp.place({ type: 'bar', x: ['a', 'b'], y: [2, 3] }, 1, 1)],
  layout: { ...sp.layout },
};
```

## Docs

- [Core concepts](https://mk7s.dev/holochart/getting-started/core-concepts)
- [Colors & colorscales](https://mk7s.dev/holochart/fundamentals/colors-colorscales)
- [Layout, axes & subplots](https://mk7s.dev/holochart/fundamentals/layout-axes-subplots)
- [API reference](https://mk7s.dev/holochart/reference/api/holochart-core/)

## License

MIT (see [LICENSE](LICENSE)). The named palettes and colorscales include data from plotly.py,
ColorBrewer (Apache-2.0), CARTOColors (CC BY 3.0), cmocean and matplotlib; their licenses are
listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
