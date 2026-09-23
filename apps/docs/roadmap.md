---
title: Roadmap
description: Holochart's milestones from the foundation to 1.0 and beyond, and where the project is now.
status: complete
---

# Roadmap

Holochart is built in milestones. Each one ends with a release.

| Milestone                  | Version     | Theme                                                           | Status      |
| -------------------------- | ----------- | --------------------------------------------------------------- | ----------- |
| M0: Foundation             | 0.0.x       | Repo, spikes, figure model, schema, GPU primitives              | Closed      |
| M1: First Plot             | 0.1.0-alpha | Scatter, line, and bar with axes, legend, hover, and zoom       | In progress |
| M2: Basic Charts Complete  | 0.2.0       | Every basic chart type, themes, gallery                         | Planned     |
| M3: Statistical            | 0.3.0       | Distributions, multivariate charts, animation, Express          | Planned     |
| M4: Scientific & Financial | 0.4.0       | Heatmaps, contours, polar, financial charts                     | Planned     |
| M5: Hierarchical & Flow    | 0.5.0       | Sunburst, treemap, icicle, sankey                               | Planned     |
| M6: 3D                     | 0.6.0       | 3D scenes and all 3D traces, materials, extrusion               | Planned     |
| M7: Hardening to 1.0       | 1.0.0       | Performance, accessibility, export, wrappers, stable plugin API | Planned     |
| M8: Beyond 1.0             | 1.x         | Maps, WebGPU, notebooks                                         | Planned     |

M0 is internal and was never published. M1 ends with the first public alpha on npm and this
documentation site with the scatter, line, and bar pages and a generated attribute reference.

M6 (3D) can run in parallel with M4 and M5 once the shared infrastructure from M3 has landed.

The [chart types](/charts/) overview lists the milestone for every chart type. The full plan,
with every epic and story, is in
[plan.md](https://github.com/holochart/holochart/blob/main/plan.md).
