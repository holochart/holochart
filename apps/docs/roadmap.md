---
title: Roadmap
description: Holochart's milestones from the foundation to 1.0 and beyond, and where the project is now.
status: complete
---

# Roadmap

Holochart is built in milestones, each closed by an exit review against its criteria.

| Milestone                  | Version     | Theme                                                           | Status                  |
| -------------------------- | ----------- | --------------------------------------------------------------- | ----------------------- |
| M0: Foundation             | 0.0.x       | Repo, spikes, figure model, schema, GPU primitives              | Closed                  |
| M1: First Plot             | 0.1.0-alpha | Scatter, line, and bar with axes, legend, hover, and zoom       | Closed                  |
| M2: Basic Charts Complete  | 0.2.0       | Every basic chart type, themes, gallery                         | Closed                  |
| M3: Statistical            | 0.3.0       | Distributions, multivariate charts, animation, Express          | Closed                  |
| M4: Scientific & Financial | 0.4.0       | Heatmaps, contours, polar, financial charts                     | Closed                  |
| M5: Hierarchical & Flow    | 0.5.0       | Sunburst, treemap, icicle, sankey                               | Closed                  |
| M6: 3D                     | 0.6.0       | 3D scenes and all 3D traces, materials, extrusion               | In progress (last wave) |
| M7: Hardening to 1.0       | 1.0.0       | Performance, accessibility, export, wrappers, stable plugin API | Planned                 |
| M8: Beyond 1.0             | 1.x         | Maps, WebGPU, notebooks                                         | Planned                 |

## Where the project is now

M0 to M5 are done: the 2D chart types of Plotly's basic, statistical, scientific, financial and
hierarchical families, with themes, animation, controls, accessibility, locales and the
[Express API](/express/) for tabular data.

M6 has landed the [3D scene](/fundamentals/3d-scenes) and every [3D chart type](/charts/3d/):
`scatter3d`, `surface`, `mesh3d`, `cone`, `streamtube`, `isosurface`, `volume` (stacked
isosurfaces and ray-marched) and Holochart's `bar3d`, with camera animation,
[materials and lighting](/customization/materials-lighting), 3D lines as tubes and ribbons, and
Express `scatter3d` / `line3d`. Its last wave adds extrusion (2.5D bars and pies) and the exit
review.

Projected maps were moved ahead of 1.0 and are built: the [geo subplot](/fundamentals/maps) with
every Plotly projection, [`scattergeo`](/charts/maps/scattergeo) and
[`choropleth`](/charts/maps/choropleth), in a package of their own that the full bundle leaves
out. A 3D globe and tile maps are still planned.

[Network graphs](/fundamentals/graphs) are built too, ahead of 1.0 and outside Plotly's set of
traces: [`graph`](/charts/graphs/graph) with force-directed, layered, tree, circular, arc and
hive arrangements, [`chord`](/charts/graphs/chord) and [`graph3d`](/charts/graphs/graph3d), with
adapters for common graph formats, in a package of their own that the full bundle leaves out.

The [Python notebook bridge](/guides/notebooks), originally in M8, is implemented ahead of
1.0 as `holochart-py`: an anywidget plus a Plotly renderer that lets existing `fig.show()` calls
draw with Holochart. Its wheel embeds the browser bundles and fonts. It is not on PyPI yet;
publishing can follow the first npm release without waiting for the remaining M8 work.

Nothing is published to npm yet: the packages build and pass their bundle tests, and the first
release waits on the npm publishing setup. All packages share one version, so the first release
will be `0.1.0` or a pre-release rather than the milestone numbers above; the
[changelog](/changelog) will list it.

The [chart types](/charts/) overview lists the milestone for every chart type. The full plan,
with every epic and story, is in
[plan.md](https://github.com/holochart/holochart/blob/main/plan.md).
