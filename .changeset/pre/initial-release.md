---
'@mk7s/holochart': minor
'@mk7s/holochart-core': minor
'@mk7s/holochart-render': minor
'@mk7s/holochart-runtime': minor
'@mk7s/holochart-components': minor
'@mk7s/holochart-traces-basic': minor
'@mk7s/holochart-traces-stats': minor
'@mk7s/holochart-traces-sci': minor
'@mk7s/holochart-traces-finance': minor
'@mk7s/holochart-traces-hier': minor
'@mk7s/holochart-traces-3d': minor
'@mk7s/holochart-themes': minor
'@mk7s/holochart-express': minor
'@mk7s/holochart-locales': minor
---

First public alpha of Holochart: declarative, Plotly-compatible charts drawn on the GPU with three.js. Figures are Plotly's `{ data, layout, config, frames }`, with the same attribute names, defaults and events. All 16 packages share one version. This is an alpha on the `alpha` npm dist-tag: APIs may still change in any `0.x` minor.

#### Install

- `npm i @mk7s/holochart three` gives the full bundle. TypeScript users also add `@types/three`. The individual packages (`-core`, `-runtime`, `-traces-*`, …) build smaller bundles with `register(...)`.
- `three` is a peer dependency, `>=0.180.0 <0.187.0`. The upper bound is the next three.js minor after the newest one tested in CI, and it is widened per release. `@types/three` is an optional peer with the same range for the packages whose types expose three's (`@mk7s/holochart`, `-render`, `-runtime`, `-components`, `-traces-3d`).
- ESM-only. Every export has a `default` condition after `import`, so Node 22's `require(esm)` and tools that only know `default` can load the packages. The browsers supported have WebGL 2 and ES2022. Node ≥ 22 runs the renderer-free parts (`@mk7s/holochart-core`).
- Locales are a separate install: `@mk7s/holochart-locales`.

#### Chart types

35 trace types, each with Plotly's attributes, defaults, hover and events:

- **Basic:** `scatter` (markers, lines, splines, steps, text, error bars, areas with `fill` / `stackgroup` / `groupnorm`, bubbles), `bar` (grouped, stacked, relative, horizontal, `base`, periods), `pie` and donuts, `table` (virtualized rows, wrapped text, draggable column order), and a `timeline()` helper for Gantt charts.
- **Statistical** (`-traces-stats`): `histogram` (Plotly's auto-binning, every `histfunc` / `histnorm`, cumulative), `histogram2d`, `histogram2dcontour`, `box`, `violin`, `splom`, `parcoords` (brushing, axis reordering) and `parcats`, plus a `strip()` helper.
- **Scientific** (`-traces-sci`): `heatmap` (one GPU texture, `zsmooth`, annotated cells), `contour` (every `contours.coloring`, constraint contours, labels placed like Plotly's), `image`, and polar subplots with `scatterpolar` (radar charts) and `barpolar` (wind roses).
- **Financial** (`-traces-finance`): `ohlc` and `candlestick` (range slider by default, `%{change}` in hover), `waterfall`, `funnel`, `funnelarea` and `indicator` (numbers, deltas, angular and bullet gauges).
- **Hierarchical and flow** (`-traces-hier`): `sunburst`, `treemap` and `icicle` with Plotly's 750 ms drill-down transitions and path bar, and `sankey` (d3-sankey layout, draggable nodes, loops, and the `link.flow` particle extension).
- **3D** (`-traces-3d`): scene subplots (`layout.scene`, cameras, turntable / orbit / pan / zoom, touch, 3D hover with spikes, `scene.annotations`) with `scatter3d` (1M points in one draw call), `surface`, `mesh3d` (Delaunay, convex hull, alpha shapes), `cone`, `streamtube`, `isosurface` and `volume` (Plotly's stacked isosurfaces or GPU ray marching). Holochart extensions: `bar3d`, tube and ribbon lines, lit spheres, three.js materials and scene lights, `chart.animateCamera` and `scene.autorotate`.
- **2.5D** (full bundle): `layout.view3d` tilts cartesian subplots in perspective. `depth`, `bevel` and `material` extrude bars, funnels, waterfalls, heatmaps, filled areas, pies, treemaps and icicles, and hover, click and zoom stay exact on the tilted plane.

Not yet supported Plotly traces: tile-based maps (`scattermap`, `choroplethmap`, `densitymap`, and their Mapbox variants), `carpet` / `scattercarpet` / `contourcarpet`, `scatterternary`, and the quiver and streamline figure factories.

#### Layout and components

- **Axes:** linear, log, date and category / multicategory, with Plotly's tick generation and `tickformat`. Also `rangebreaks`, linked axes (`matches`), `scaleanchor` aspect locks, overlaying and shifted axes, spikelines, automargin, `layout.grid` and `makeSubplots()`.
- **Legends:** multiple legends (`legend2`, …), group titles, scrolling past `maxheight`, and click / double-click toggling as in Plotly.
- **Colorbars, annotations** (with arrows, rich text, drag and `clicktoshow`), **shapes** (drawing and editing, `addHline` / `addVrect` helpers), **layout images**, `updatemenus`, `sliders`, the range slider and range selector, `layout.selections`, and the **modebar** with Plotly's buttons, custom buttons and the 3D group.
- **Rich text:** Plotly's pseudo-HTML (`<b>`, `<i>`, `<sup>`, `<span style>`, links, …) in every text attribute. Text is drawn as SDF glyphs on the GPU.
- **Styling:** `marker.pattern` fills, custom SVG-path marker symbols (`symbols.register`), emoji and image markers, `styleRules` (JSON conditions that style points by their data) and per-point style functions.

#### Runtime API

- **Plotly's functional API:** `newPlot`, `react`, `restyle`, `relayout`, `update`, `addTraces`, `deleteTraces`, `moveTraces`, `extendTraces`, `prependTraces`, `purge`, `addFrames`, `deleteFrames`, `animate`, `toImage` and `downloadImage`. There is also an object API (`createChart(el, figure)`, `getChart(el)`) with `chart.ready` and update promises.
- **Events:** Plotly's events (`hover`, `click`, `selected`, `relayout`, `restyle`, `legendclick`, `sunburstclick`, `animatingframe`, …), also under their `plotly_*` names. A listener that throws no longer stops the chart or the other listeners.
- **Interaction:** hover modes (including unified hover), zoom, pan, box and lasso selection (on polar subplots too), scroll zoom, touch with pinch-zoom, and keyboard navigation between data points.
- **Animation:** `react` with `layout.transition` and `figure.frames` with `animate`. Every Plotly easing is supported, points are matched by `ids`, and Plotly's Play / Pause buttons and frame sliders work.
- **Big data:** streaming with `extendTraces`, min/max level of detail for lines of millions of points, and typed-array data.
- **Export:** `toImage` / `downloadImage` to PNG, JPEG or WebP at any size and scale. `chartToJSON` / `fromJSON` round-trip figures.
- **Errors:** without WebGL 2, `newPlot` rejects with `WebGLUnavailableError` and the container shows a note and the chart's text description. Errors extend `HolochartError`.

#### Themes and the default look

- New charts use the dark, dense `holochart` template, drawn with the bundled TeX Gyre Heros font. The font is loaded lazily and nothing is fetched from a CDN. Use `layout.template: 'plotly-classic'` (or `setDefaultTemplate('plotly-classic')`) for Plotly's own look.
- 16 built-in themes: `holochart`, `plotly-classic`, `high-contrast`, `high-contrast-dark`, `neon`, and plotly.py's `plotly`, `plotly_white`, `plotly_dark`, `ggplot2`, `seaborn`, `simple_white`, `presentation`, `xgridoff`, `ygridoff`, `gridon` and `none`. `holochart-dark` is a deprecated alias of `holochart`.
- Every plotly.py palette and colorscale, plus `colors.register`, `colorways.register`, `fonts.register` and `defineTemplate`.

#### Express

`@mk7s/holochart-express` builds figures from row objects, column objects, Apache Arrow tables or CSV, following Plotly Express (camelCase). The functions are `scatter`, `line`, `area`, `bar`, `timeline`, `pie`, `histogram`, `box`, `violin`, `strip`, `ecdf`, the density charts, `imshow`, `scatterMatrix`, the parallel charts, `funnel`, the polar charts, `sunburst`, `treemap`, `icicle`, `scatter3d` and `line3d`. They support facets, `animationFrame`, marginals, trendlines (OLS, LOWESS, rolling, expanding, EWM) and `ff.distplot`.

#### Locales and accessibility

- **Locales:** `config.locale` translates the UI and formats numbers and dates. `@mk7s/holochart-locales` ships plotly.js's 76 locales as ES modules and `<script>` files, and plotly.js locale modules register as they are. Arabic and Hebrew text is laid out right to left.
- **Accessibility:** charts are `role="figure"` with a generated description, summaries of trends and extremes, and data tables (`chart.describe()`, `config.a11y`). There is keyboard access to points, legends, menus, sliders and the modebar. Also a high-contrast theme, the colorblind-safe `Safe` colorway, automatic patterns (`a11y.patterns`) and reduced-motion support.

#### Script-tag builds

- `@mk7s/holochart/dist/holochart.iife.min.js` defines `window.Holochart`, with three.js bundled. It is everything but 3D, and the bare jsDelivr / unpkg URL serves it. Types for the global are in `@mk7s/holochart/global`.
- `holochart-3d.iife.min.js` is a 3D add-on, loaded after the main script of the same version. It adds 3D scenes, 3D traces and 2.5D, and reuses the main script's three.js.
- Each locale is a script: `@mk7s/holochart-locales/dist/scripts/holochart-locale-<code>.js`.

#### Known limitations

- **WebGL 2 only.** There is no Canvas 2D or SVG fallback, and no SVG or PDF export (`toImage` gives raster images only).
- **Tested in Chromium.** Visual and interaction tests run in headless Chromium. Firefox and Safari should work but aren't tested in CI.
- **Missing features:** the Plotly traces listed under Chart types, non-Gregorian calendars, LaTeX, and keyboard navigation for most 3D traces.
- **Experimental APIs:** the low-level `render` namespace and the trace and component contracts in `@mk7s/holochart-runtime` may change in any minor release.
