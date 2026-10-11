---
title: Roadmap
description: What Holochart has released, what it is working on next, and what is planned after that.
status: complete
---

# Roadmap

Holochart is in alpha. `0.1.0-alpha.0` is on npm under the `alpha` tag, as 16 packages that share
one version; the [changelog](/changelog) lists what each release contains.

## What is released

| Area              | In the alpha                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chart types       | 40 trace types: Plotly's basic, statistical, scientific, financial, hierarchical and 3D families                                                                    |
| Maps              | The [geo subplot](/fundamentals/maps) with every Plotly projection, [`scattergeo`](/charts/maps/scattergeo), [`choropleth`](/charts/maps/choropleth) and a 3D globe |
| Network graphs    | [`graph`](/charts/graphs/graph), [`chord`](/charts/graphs/chord) and [`graph3d`](/charts/graphs/graph3d), which Plotly does not have                                |
| 3D                | The [3D scene](/fundamentals/3d-scenes), [materials and lighting](/customization/materials-lighting), extruded 2.5D bars and pies                                   |
| API               | Plotly's functional API and events, typed figures, the [Express API](/express/) for tabular data                                                                    |
| Around the charts | Themes, animation, controls, accessibility, 76 locales, PNG, JPEG and WebP export                                                                                   |
| Python            | The [notebook bridge](/guides/notebooks), `holochart-py`. It is built and tested but not on PyPI yet                                                                |

Maps and network graphs are in packages of their own that the full bundle leaves out, so an app
that draws neither pays nothing for them.

Holochart draws with WebGL 2 only. It has no SVG or PDF export, no tile maps, and no ternary,
Smith, carpet or quiver charts yet.

## What comes next

The work is ordered in
[backlogv2.md](https://github.com/holochart/holochart/blob/main/backlogv2.md). In short:

| Step                   | What it means for users                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Close out the alpha    | Known bugs fixed, the documents and decisions brought up to date, one written bar for beta and for 1.0                     |
| A stable plugin API    | Calc off the main thread for large data, custom scales, and contracts third-party chart types can rely on                  |
| Frameworks             | A `<holo-chart>` web component and wrappers for React, Vue, Svelte and Angular                                             |
| Output beyond a canvas | SVG and PDF export, and rendering without a browser window for servers and command lines                                   |
| More chart types       | Tile maps first, then ternary and vector-field charts; closer attribute parity, measured against Plotly's own test figures |
| Python                 | A release on PyPI, events from the browser back to Python, and binary transfer for large arrays                            |
| Scale                  | Benchmarks in CI, density aggregation for very large scatters, and faster first draws                                      |

Nothing above has a date. APIs can change between 0.x releases; the
[versioning policy](https://github.com/holochart/holochart/blob/main/docs/release/versioning.md)
says how.

## How it got here

Holochart was built in milestones, each closed by a review against its criteria. The milestone
numbers below are not version numbers: all packages share one version, which started at
`0.1.0-alpha.0`.

| Milestone                  | Theme                                                     | Status |
| -------------------------- | --------------------------------------------------------- | ------ |
| M0: Foundation             | Repo, spikes, figure model, schema, GPU primitives        | Closed |
| M1: First Plot             | Scatter, line, and bar with axes, legend, hover, and zoom | Closed |
| M2: Basic Charts Complete  | Every basic chart type, themes, gallery                   | Closed |
| M3: Statistical            | Distributions, multivariate charts, animation, Express    | Closed |
| M4: Scientific & Financial | Heatmaps, contours, polar, financial charts               | Closed |
| M5: Hierarchical & Flow    | Sunburst, treemap, icicle, sankey                         | Closed |
| M6: 3D                     | 3D scenes and all 3D traces, materials, extrusion         | Closed |

Projected maps, network graphs and the Python bridge were planned for after 1.0 and were built
ahead of it. The original plan, with every epic and story, is in
[plan.md](https://github.com/holochart/holochart/blob/main/plan.md).
