# @mk7s/holochart-locales

## 0.1.0-alpha.0

### Minor Changes

- 363a64c: Accessibility strings in ten locales. `de`, `es`, `fr`, `it`, `ja`, `ko`, `pt-BR`, `ru`, `tr` and `zh-CN` now translate Holochart's own strings, which plotly.js's locales don't have: the generated chart summaries (until now `de`, `es` and `fr` only), every keyboard announcement ("Revenue: (Mar 1, 2024, 11), point 3 of 6.", "Zoomed in.", "View rotated.", the row, level and category sentences of grids, hierarchies and parcats), the name of the legend's keyboard toolbar and the plot area's keyboard hint. Regional locales that fall back to one of them (`de-CH`, `es-AR`, `es-PE`, `fr-CH`) get its strings; every other locale falls back to English, sentence by sentence (`pt-PT`, `zh-TW` and `zh-HK` fall back to `pt-BR` and `zh-CN` first when those are registered too, as they already did for Plotly's UI strings).

  The same ten locales also fill gaps among the UI strings a chart looks up: the titles of the modebar's drawing buttons ("Draw line", "Erase active shape", …), and in `ko` and `pt-BR` the hover labels of box, violin, OHLC and candlestick (`open:`, `median:`, …), which plotly.js has under keys without the colon, plus the default trace name in `ko`.

  These are machine translations that no native speaker has reviewed; the locales guide and the accessibility guide say so, and say what is still English: the rest of the hidden description (chart type sentence, axis and trace lines, table captions) and a few control names ("Chart toolbar", "Menu 1", "Slider 1", "Range selector"). To correct a sentence, register the locale with your own entry for its English key.

  A parcoords dimension without a label is now named through the locale dictionary in its keyboard stops (`'Dimension {n}'`), instead of always in English.

  The ten locale modules grow by 1 to 2.5 kB each (gzipped), to 3 to 4 kB; nothing is added to the core bundles. The locales guide now also states the limits of right-to-left text: legends, menus and axes are not mirrored, and measuring text without a browser has no bidi or shaping.

- 0ef6845: More network graphs: two more trace types in `@mk7s/holochart-traces-graph`, interaction, accessibility and large graphs.

  - **`chord`**: a chord diagram, which Plotly does not have. Flows between nodes as ribbons inside a ring, from the `node` / `link` containers of `graph` and `sankey` or from a square `matrix` with `labels`. `directed` ribbons can end in an arrowhead (`link.arrowlen`), `node.group` adds an outer ring of groups, ribbons are colored by their source, their target or a gradient (`link.colorsource`), and a hover keeps the ribbons of one node. It is placed by `domain`.
  - **`graph3d`**: the `graph` model in a 3D `scene`: a force layout in three dimensions, `'layered'` with one plane per rank, or `'preset'` positions on the scene's axes. Nodes are lit spheres or sprites, links lines or tubes with cone arrowheads, parallel links fan out and a self-link is a ring. Nodes and links are picked on the GPU. Register it with `tracesGraph3d`, which brings the scene; `tracesGraph` alone bundles no 3D code. `import '@mk7s/holochart/graph'` registers both.
  - **Interaction** (`graph`): a hover highlights a node's neighbourhood (`highlight.hops`, `direction`, `dim`, `color`, `nodes`), and two selected nodes highlight a shortest path between them (`highlight.path`, `pathweight`, `pathdirected`; `graphPath(trace)` returns it). Nodes can be dragged under `'preset'` and `'force'` (`node.draggable`): the release restyles `node.x` / `node.y`, which pins a node of a force layout, and a double-click releases it; with `force.simulate` the layout reacts while a node is dragged. `force.start` continues a layout from given positions. Selection points list the links among the selected nodes, and `%{neighbors}` is a hover template variable.
  - **Large graphs** (`graph`): `worker: 'auto' | true` (or `config.worker`) runs the layout in the package's layout worker, `dist/layout-worker.js`, and draws the nodes while they settle; where a worker cannot start, the same code runs on the main thread in slices. `lod` leaves labels, arrowheads and node outlines out of a large graph until a zoom makes them readable, and fades links by how densely they cover the plot. `link.bundle` bundles links (`'hierarchical'` through the nodes' groups, `'force'` for graphs without groups). Exported for apps that lay graphs out themselves: `layoutInWorker`, `setGraphWorkerUrl`, `bundleLinks`.
  - **Accessibility**: the description of a graph names its most-connected nodes, its connected components and its groups, and its data table is the list of links. Arrow keys move from a node along its links (siblings, parent and child in a tree; rank by rank in a layered graph), and Enter folds a tree node. Five new announcement sentences and `Folded.` are translated in the ten locales.

  For trace authors (experimental): `TracePlotContext.recalc()` asks for a second calc pass without a change of the figure (a layout that arrived); `HoverPoint.selects` names the points a click on this one selects; `eventData` gets the selection as a fourth argument; `KeyboardPoint.click` lets Enter reach the click handling of a cartesian trace that handles clicks itself; `KeyboardStops.locate` re-finds the cursor in stops built on demand. `TraceAxisHints` gains `z`, and a 3D scene whose traces all hide their axes hides its own and starts with a closer camera.

- 7227276: First public alpha of Holochart: declarative, Plotly-compatible charts drawn on the GPU with three.js. Figures are Plotly's `{ data, layout, config, frames }`, with the same attribute names, defaults and events. All 16 packages share one version. This is an alpha on the `alpha` npm dist-tag: APIs may still change in any `0.x` minor.

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

- 7227276: Typed figures. `@mk7s/holochart` exports `Figure`, `Data` (every trace type, discriminated on
  `type`), `Layout`, `Config` and `Frame`, generated from the attribute schemas, and
  `createChart`, `newPlot`, `react`, `addTraces`, `relayout`, `update` and `toImage` check figures
  against them. Each trace package exports its trace types (`ScatterTrace`, …) and their union
  (`TracesBasic`, …); core's `FigureInput<D, L>` stays loose by default for partial bundles and
  plugins, and plugins add trace types to `TraceTypes`. `restyle` keeps untyped attribute paths.
  Published types now also compile under `exactOptionalPropertyTypes`.

### Patch Changes

- Updated dependencies [f257a14]
- Updated dependencies [0ef6845]
- Updated dependencies [0ef6845]
- Updated dependencies [0ef6845]
- Updated dependencies [7227276]
- Updated dependencies [7227276]
- Updated dependencies [e7c92ca]
- Updated dependencies [8f614fa]
- Updated dependencies [d708828]
  - @mk7s/holochart-core@0.1.0-alpha.0
