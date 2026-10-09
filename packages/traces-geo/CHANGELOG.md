# @mk7s/holochart-traces-geo

## 0.1.0-alpha.0

### Minor Changes

- 0ef6845: Maps. The new package `@mk7s/holochart-traces-geo` has the `geo` subplot (`layout.geo`, `geo2`, …) and the `scattergeo` and `choropleth` traces: Plotly's projections, scopes, `fitbounds`, graticule and base layers (land, ocean, coastlines, countries, lakes, rivers, subunits) at `resolution` 110 or 50; pan, zoom and rotate with Plotly's relayout keys; markers, great-circle lines, text and `fill: 'toself'` at `lon` / `lat` or at `locations`; and regions colored by value, from the basemap (`locationmode` `'ISO-3'`, `'USA-states'`, `'country names'`) or from your own `geojson` with `featureidkey`. Express gains `hx.scatterGeo`, `hx.lineGeo` and `hx.choropleth`.

  A 3D globe, which Plotly does not have: `projection.type: 'globe3d'` is the orthographic view drawn as a lit sphere, with the same rotation, scale, gestures and relayout keys. It turns by a matrix, so a rotation projects nothing at any resolution. On it `scattergeo` lines are arcs lifted above the surface (`line.lift`), and a choropleth's regions can rise as prisms by a second value (`elevation`, `elevationscale`), picked on the GPU so that nothing behind the globe or behind a prism is hit. These three attributes are Holochart's own and are ignored on a flat map. The globe's code is a lazy chunk, loaded when a figure has one.

  The full bundle does not include it, so an app without a map downloads no map code. Add it with one import; `@mk7s/holochart` depends on the package, so there is nothing more to install:

  ```ts
  import * as Holochart from '@mk7s/holochart';
  import '@mk7s/holochart/geo';
  ```

  `@mk7s/holochart/geo` registers the package and re-exports it. A partial bundle registers it like any trace package: `register(...tracesGeo)`. A `scattergeo` or `choropleth` trace, or `layout.geo`, on a chart without the package is ignored, and the warning now names the package and that import. The script-tag build has no maps yet.

  The basemap is Natural Earth 5.1.2 (public domain), built into the package as lazy chunks, two per resolution (about 40 kB gzipped for 1:110m, 285 kB for 1:50m), loaded when a map first needs them: a map makes no request outside the app's own bundle and works offline. Disputed boundaries are drawn by de facto control. The 15 projections of d3-geo are in the package's own code, and the country-name table of `'country names'` is a lazy chunk of its own; Plotly's other projection types load d3-geo-projection in one lazy chunk the first time a figure names one.

  New `config.topojsonURL` (core), with Plotly's meaning: when set, basemap files are fetched from `<url>/world_110m.json` and so on instead of the bundled data. Unlike Plotly it defaults to empty, which fetches nothing. The `holochart` template has a `geo` block, so maps match the dark look (land a step above the background, lakes cut out of it).

  For subplot authors (runtime, experimental): `SubplotViewportOptions.kind: '2d'` gives a non-cartesian subplot a pixel-space viewport like a cartesian subplot's instead of a 3D camera; `DomainLayoutContext.chart` is the chart, for subplots that keep state from one layout pass to the next; and a component view with `clickThrough` lets a press it took for dragging become a click on the point under it. A hover label now goes away when a component drag starts, and no longer appears under a finger lifted after a touch pan.

  Render (experimental): `MeshData.depthTest` and `depthWrite`, for a mesh that lies on a surface already drawn; `loadPicker()` and `loadFillTriangulation()`, which give lazy code the pickers and the polygon triangulation without bringing them into an app's initial chunk.

### Patch Changes

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
  - @mk7s/holochart-runtime@0.1.0-alpha.0
  - @mk7s/holochart-core@0.1.0-alpha.0
  - @mk7s/holochart-render@0.1.0-alpha.0
  - @mk7s/holochart-traces-basic@0.1.0-alpha.0
