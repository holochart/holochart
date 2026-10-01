# @mk7s/holochart-themes

The built-in templates of Holochart: plotly.py's `plotly_dark`, `seaborn`, `ggplot2` and the
others, plus Holochart's `neon` and high-contrast themes. Part of
[Holochart](https://github.com/holochart/holochart), declarative GPU charts on three.js.

> **Alpha.** Released as `0.1.0-alpha` on the npm `alpha` tag; APIs can change between 0.x
> releases. Most apps should install the full bundle,
> [`@mk7s/holochart`](https://github.com/holochart/holochart/tree/main/packages/holochart), which
> includes this package.

## Install

```sh
pnpm add @mk7s/holochart-themes@alpha
```

No peer dependencies. ESM-only; Node 22 and newer can also `require()` it.

## What it exports

- **`builtinThemes`:** every theme as a registrable module, for `register(...builtinThemes)`
- **`defineTheme(name)`:** one theme as a registrable module
- **Templates:** `plotly`, `plotly_white`, `plotly_dark`, `simple_white`, `ggplot2`, `seaborn`,
  `presentation`, `xgridoff`, `ygridoff`, `gridon`, `none`, `holochart`, `plotlyClassic`, `neon`,
  `highContrast`, `highContrastDark`
- **`THEMES`, `THEME_NAMES`:** the templates by registered name (`'plotly_dark'`,
  `'high-contrast'`, …)

The runtime already registers `holochart` (the default), `plotly-classic` and `none`. Named
palettes and colorscales live in `@mk7s/holochart-core` (`registerBuiltinColors`).

## Usage

```ts
import { createChart, register } from '@mk7s/holochart-runtime';
import { builtinComponents } from '@mk7s/holochart-components';
import { defineTheme } from '@mk7s/holochart-themes';
import { basicTraces } from '@mk7s/holochart-traces-basic';

register(...basicTraces, ...builtinComponents, defineTheme('plotly_dark'));

createChart(el, {
  data: [{ type: 'bar', x: ['a', 'b'], y: [2, 3] }],
  layout: { template: 'plotly_dark' },
});
```

## Docs

- [Themes & templates](https://mk7s.dev/holochart/customization/themes-templates)
- [Styling & themes](https://mk7s.dev/holochart/fundamentals/styling-themes)
- [API reference](https://mk7s.dev/holochart/reference/api/)

## License

MIT (see [LICENSE](LICENSE)).
