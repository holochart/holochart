# @mk7s/holochart-traces-sci

## 0.1.0-alpha.0

### Minor Changes

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

- f576f33: Keyboard navigation reaches every chart family. With the plot area focused, the arrow keys now step through histogram bins, the statistics of each box and violin, heatmap, contour and histogram2d cells (a cell cursor: ← / → along the row, ↑ / ↓ along the column), funnelarea stages, sunburst, treemap and icicle nodes (← / → siblings, ↑ the parent, ↓ the first child; Enter drills and the cursor stays on its node), sankey nodes and links (↓ downstream, ↑ upstream), parcats categories, parcoords lines on each axis, polar points and bars, and scatter3d points. Every stop shows the hover label a pointer would get there and announces what it says, with its place in the chart ("row 2 of 3, column 1 of 4", "level 2, 1 of 5, children: 2").

  3D scenes take the view keys: Shift + arrows orbit the camera in 15° steps, `+` / `-` move it in and out and `0` resets it, each as one `relayout` of `scene.camera`.

  `bar3d`, `cone`, `streamtube`, `isosurface`, `volume` and `mesh3d` describe themselves to assistive technology (what is drawn, the box it spans, and a headline value), like `scatter3d` and `surface`.

  The code for all of this loads on first use, in one small chunk per trace package: the keyboard stops on a chart's first keyboard focus, the 3D descriptions right after a chart with a 3D trace is first described (it shows the generic line until then, and `chart.describe()` waits for it). The descriptions of `scatter3d` and `surface` moved into that chunk too. The script-tag build (`holochart.iife.min.js`) does not include the 2D families' stops yet; its 3D add-on includes the 3D chunk.

  Announcements read the lines of a hover label as a list, so a pie slice is now "Share: Alpha, 40, 40%, point 1 of 5." instead of "Share: Alpha 40 40%, point 1 of 5."

  For trace module authors: `keyboardPoints` may return stops that say where the arrows lead (`KeyboardPoint.nav`), show several labels (`more`) and bring their own announcement (`say`), or a list that builds its stops on demand (`KeyboardStops`); cartesian modules may have stops too. `TraceModule.a11y` loads a module's `keyboardPoints`, `describe` and `keyboardView` (view keys of a trace that is not on cartesian axes) from a chunk of its own. `sceneA11y` gives a trace built on the 3D scene its view keys, and `HoverContext.height` is the figure height for domain traces.

- 7227276: Typed figures. `@mk7s/holochart` exports `Figure`, `Data` (every trace type, discriminated on
  `type`), `Layout`, `Config` and `Frame`, generated from the attribute schemas, and
  `createChart`, `newPlot`, `react`, `addTraces`, `relayout`, `update` and `toImage` check figures
  against them. Each trace package exports its trace types (`ScatterTrace`, …) and their union
  (`TracesBasic`, …); core's `FigureInput<D, L>` stays loose by default for partial bundles and
  plugins, and plugins add trace types to `TraceTypes`. `restyle` keeps untyped attribute paths.
  Published types now also compile under `exactOptionalPropertyTypes`.
- e7c92ca: A curated export surface. Nothing changes at runtime; this is about which names are API.

  BREAKING: `@mk7s/holochart` exports a list of names instead of everything its packages export. It keeps the chart API, typed figures, the trace and component modules, themes, errors, the documented helpers and the experimental plugin API. The plumbing the packages share with each other is gone from it (`layoutBars`, `calcBar`, `supplyColorscaleDefaults`, `stashSplomAxis`, `RANGESELECTOR_Y_PAD`, `stripInternal`, `editDistance`, `warnOnce` and about 600 more), and so is `setBarExtruder`. Those names stay exported from their `@mk7s/holochart-*` packages, tagged `@internal`: not API, no compatibility promise. The script-tag global `window.Holochart` has the same names as `@mk7s/holochart`.

  BREAKING: exports that were stable by default are now tagged. `@internal`: what only sibling packages import (in core, components and the trace packages). `@experimental`: what a plugin is written with, namely core's schema DSL (`attr`, the schema types and schema objects), color and date parsing and update planning, the trace packages' attribute schemas and calc types, the 3D scene API, and the `Chart` members `emit`, `getCalcdata`, `previewRanges`, `commitRanges` and `refreshHover`. The `Chart` constructor is `@internal`; use `createChart`.

  BREAKING: names that meant different things in different packages were renamed on the less public side.

  - core and runtime: `Layout` is now `BaseLayout`, `Frame` is `FrameInput`; core: `LayoutTitle` is `BaseLayoutTitle`. The plain names are the full bundle's types.
  - traces-basic, traces-finance, traces-hier, traces-sci: `BarTrace`, `PieTrace`, `ScatterTrace`, `FunnelTrace`, `WaterfallTrace`, `IcicleTrace`, `TreemapTrace` and `HeatmapTrace` are now `BaseBarTrace`, `BasePieTrace` and so on. The plain names are the full bundle's types, which add the 2.5D attributes.
  - traces-basic: `TimelineOptions` is `TimelineFigureOptions`; traces-stats: `StripOptions` is `StripFigureOptions`; express: `AnimationOptions` is `AnimationFrameOptions`.
  - Experimental names: core's `TraceModule` and `ComponentModule` are `CoreTraceModule` and `CoreComponentModule`, its `RGBA` and `Primitive` are `RGBAColor` and `PrimitiveValue`; the runtime's `pointInPolygon` is `polygonContains`; render's `LineOptions` is `LinePrimitiveOptions`.

  Types that leaked into the declarations under bundler-made names have real ones: core's `AttrBuilders` (the type of `attr`), the runtime's `TraceIndices`, and render's `MeshLazy`, `LinesMarkers3DLazy`, `ExtrusionLazy` and `PatternCode` namespaces (type-only).

  Migration: import the figure types of the full bundle from `@mk7s/holochart` as before (`BarTrace`, `Layout`, `Frame` are unchanged there). In a partial bundle, rename the types above. If you imported an `@internal` name, copy the code you need. See "Unreleased: a curated export list" in the migration guide.

### Patch Changes

- f257a14: A chart created in a hidden or unsized element (an inactive tab, a closed dialog) no longer stays at 700 × 450: without `config.responsive` it now takes the element's size once, the first time the element has one.

  New `config.maxPixelRatio` (default 2): the upper limit of the pixel ratio that `pixelRatio: 'auto'` takes from the display.

  Polar zoom-box drags work for charts in another window's document (an iframe or popup created by the page's script).

  An unknown trace type that is one of Holochart's own now says which package to register: "`sankey` is in @mk7s/holochart-traces-hier; import it from there and call `register(sankey)`". Core exports `tracePackage`, and the warn-once helpers `warnOnce` and `deprecate`. The new "Errors and warnings" reference page lists which calls reject and which warn.

- 3a7fb9b: Large heatmaps draw sooner and lines cost less GPU time, with the same pixels.

  A 4096 × 4096 heatmap's first draw takes about half as long. Its values go to the GPU as one float per cell (`R32F`, 67 MB) instead of a value and a validity flag (`RG32F`, 134 MB), calc reads the rows once instead of twice, and the accessible description no longer scans all 16.7 million cells after every pipeline run. `packHeatmapValues` now returns one float per texel, with cells without a value stored as the largest float32.

  On a 1M-segment pan, a solid line costs 2.1 to 2.6 times three's `Line2` instead of 3 to 4 times, and a dashed one 2.4 to 3 times instead of 8. A line with one color keeps it in a uniform instead of a per-vertex buffer (28 bytes per vertex instead of 44), a dashed line no longer recomputes and re-uploads its dash phase while panning, and each segment's quad ends where the pixels it draws end. New in `@mk7s/holochart-render`: `quadReach`, `QUAD_FRINGE` and `QUAD_SLACK` (the CPU mirror of the quad's extent).

- Updated dependencies [363a64c]
- Updated dependencies [2e457f5]
- Updated dependencies [f257a14]
- Updated dependencies [d68fbf4]
- Updated dependencies [44953a7]
- Updated dependencies [0ef6845]
- Updated dependencies [0ef6845]
- Updated dependencies [0ef6845]
- Updated dependencies [7227276]
- Updated dependencies [f576f33]
- Updated dependencies [3a7fb9b]
- Updated dependencies [7227276]
- Updated dependencies [e7c92ca]
- Updated dependencies [8f614fa]
- Updated dependencies [0ef6845]
- Updated dependencies [d708828]
  - @mk7s/holochart-traces-stats@0.1.0-alpha.0
  - @mk7s/holochart-runtime@0.1.0-alpha.0
  - @mk7s/holochart-core@0.1.0-alpha.0
  - @mk7s/holochart-render@0.1.0-alpha.0
  - @mk7s/holochart-traces-basic@0.1.0-alpha.0
