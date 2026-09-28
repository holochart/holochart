# Third-party notices

Holochart is MIT-licensed (see [LICENSE](LICENSE)). It depends on the following third-party
software. The npm packages list these as dependencies (or, for `three`, a peer dependency), so
their own license files ship with them. The self-contained CDN build
(`@mk7s/holochart/holochart.iife.min.js`) bundles copies of them, so a copy of this file ships in that package (`packages/holochart/THIRD_PARTY_NOTICES.md`; keep the two in sync).

## Runtime dependencies

| Package                                                                                                                                                                                                                                                                                    | License | Used by                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ---------------------------------------- |
| [three](https://github.com/mrdoob/three.js)                                                                                                                                                                                                                                                | MIT     | render (peer); bundled in the IIFE build |
| [troika-three-text](https://github.com/protectwise/troika), troika-three-utils, troika-worker-utils                                                                                                                                                                                        | MIT     | render (SDF text)                        |
| [webgl-sdf-generator](https://github.com/lojjic/webgl-sdf-generator)                                                                                                                                                                                                                       | MIT     | render (via troika)                      |
| [bidi-js](https://github.com/lojjic/bidi-js)                                                                                                                                                                                                                                               | MIT     | render (via troika)                      |
| [require-from-string](https://github.com/floatdrop/require-from-string)                                                                                                                                                                                                                    | MIT     | render (via troika)                      |
| [earcut](https://github.com/mapbox/earcut)                                                                                                                                                                                                                                                 | ISC     | render (polygon fills)                   |
| [flatbush](https://github.com/mourner/flatbush), [flatqueue](https://github.com/mourner/flatqueue)                                                                                                                                                                                         | ISC     | render (spatial index)                   |
| [d3-array](https://github.com/d3/d3-array), [d3-color](https://github.com/d3/d3-color), [d3-format](https://github.com/d3/d3-format), [d3-time](https://github.com/d3/d3-time), [d3-time-format](https://github.com/d3/d3-time-format), [internmap](https://github.com/mbostock/internmap) | ISC     | core (scales, formats, colors)           |

## Bundled data and ported code

Holochart implements the Plotly figure format, and parts of its behavior follow plotly.js closely
(attribute defaults, pie layout, shapes, autorange, stacking, hover). The color data is taken
from plotly.py's `plotly.colors`, which collects it from the sources below.

| Work                                                                                                                                | License      | Where                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------- |
| [plotly.js](https://github.com/plotly/plotly.js), [plotly.py](https://github.com/plotly/plotly.py)                                  | MIT          | behavior and algorithms ported; color lists (`core/colors`); locale data (`locales`, see its THIRD_PARTY_NOTICES.md) |
| [ColorBrewer](https://colorbrewer2.org) by Cynthia Brewer, Mark Harrower and Penn State                                             | Apache-2.0   | `core/colors/data/colorbrewer.ts`, `qualitative.ts`                                                                  |
| [CARTOColors](https://github.com/CartoDB/CartoColor) by CARTO                                                                       | CC BY 3.0    | `core/colors/data/carto.ts`, `qualitative.ts`                                                                        |
| [cmocean](https://matplotlib.org/cmocean/) by Kristen Thyng et al.                                                                  | MIT          | `core/colors/data/cmocean.ts`                                                                                        |
| matplotlib colormaps (Viridis, Cividis, Inferno, Magma, Plasma, Twilight)                                                           | CC0          | `core/colors/data/sequential.ts`, `cyclical.ts`                                                                      |
| [Turbo](https://research.google/blog/turbo-an-improved-rainbow-colormap-for-visualization/) by Google                               | Apache-2.0   | `core/colors/data/sequential.ts`                                                                                     |
| [seaborn](https://github.com/mwaskom/seaborn) IceFire                                                                               | BSD-3-Clause | `core/colors/data/cyclical.ts`                                                                                       |
| [d3-hierarchy](https://github.com/d3/d3-hierarchy) by Mike Bostock                                                                  | ISC          | partition and treemap tilings ported in `traces-hier` (`hierarchy/levels.ts`, `treemap/tiling.ts`)                   |
| [d3-sankey](https://github.com/d3/d3-sankey) by Mike Bostock, as forked in [@plotly/d3-sankey](https://github.com/plotly/d3-sankey) | BSD-3-Clause | sankey layout ported in `traces-hier/sankey/layout.ts`                                                               |
| [d3-sankey-circular](https://github.com/tomshanley/d3-sankey-circular) by Tom Shanley                                               | MIT          | circular link routing ported in `traces-hier/sankey/layout.ts`                                                       |
| [statsmodels](https://github.com/statsmodels/statsmodels)                                                                           | BSD-3-Clause | LOWESS ported and its R reference fixtures (`express/stats/lowess.ts`, `__fixtures__/lowess.ts`)                     |
| [pandas](https://github.com/pandas-dev/pandas)                                                                                      | BSD-3-Clause | rolling / expanding / ewm semantics ported (`express/stats/window.ts`)                                               |

## Bundled fonts

Holochart draws text that names no registered font with its built-in default font, TeX Gyre
Heros, a Helvetica-style family. The unmodified font files ship with the library, each folder
with a copy of the license:

| Font                                                                                                                                                                                               | License                                               | Where                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [TeX Gyre Heros](https://www.gust.org.pl/projects/e-foundry/tex-gyre/heros) 2.004 (regular, bold, italic, bold italic), © 2006, 2009 B. Jackowski and J.M. Nowacki (on behalf of TeX users groups) | GUST Font License (LaTeX Project Public License 1.3c) | `@mk7s/holochart-render`: `fonts/*.otf` and, as `data:` URLs, the lazy `dist/texgyreheros-*.js` chunks; `@mk7s/holochart`: `dist/fonts/*.otf` for the IIFE build. License: `GUST-FONT-LICENSE.txt` next to the files |

## Repository-only assets (not published to npm)

| Asset                                                  | License                   | Where                                                                                   |
| ------------------------------------------------------ | ------------------------- | --------------------------------------------------------------------------------------- |
| [Inter](https://github.com/rsms/inter) v4.1 font files | SIL Open Font License 1.1 | `examples/_lib/fonts/` (license in `OFL.txt`), used by examples, docs, and visual tests |
| plotly.js test mocks (planned, E20.7)                  | MIT                       | test corpus only                                                                        |

Regenerate the dependency list with `pnpm licenses list --prod` when dependencies change.
