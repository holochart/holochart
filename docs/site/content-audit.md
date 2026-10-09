# Website content audit

Generated with `node apps/docs/scripts/site-audit.ts` from the current working tree.
Re-run after changing pages, examples, or gallery metadata. The full inventory is in
[inventory.json](./inventory.json). Screenshot measurements describe the pre-Wave-1 site;
content counts below describe the current source tree. No registry or hosted-notebook support is inferred.

## Inventory

| Measure                                      | Count     |
| -------------------------------------------- | --------- |
| Public hand-written pages                    | 166       |
| Pages: complete                              | 152       |
| Pages: draft                                 | 4         |
| Pages: stub                                  | 10        |
| Excluded page templates                      | 1         |
| Gallery entries                              | 786       |
| All example sources (including internal)     | 952       |
| Internal example sources                     | 139       |
| Public examples excluded by tags             | 27        |
| Gallery entries embedded in a public guide   | 496       |
| Gallery entries without a guide embed        | 290       |
| Gallery harnesses importing internal helpers | 786       |
| Gallery entries with Python artifacts        | 24        |
| Downloadable notebooks under examples/       | 14        |
| Missing thumbnails / sources / embed IDs     | 0 / 0 / 0 |

Counts distinguish available TypeScript repository harnesses from complete independent user snippets.
A thumbnail proves browser rendering only; it does not prove Python execution or notebook-host compatibility.

## Family coverage

Examples cross-listed in multiple families count once per family; these totals intentionally overlap.
The chart-only column excludes complete demos and feature collections.

| Family                     | Primary | All including cross-listing | Chart-only |
| -------------------------- | ------- | --------------------------- | ---------- |
| Basic & comparison         | 139     | 151                         | 38         |
| Lines & time series        | 104     | 140                         | 47         |
| Scatter & relationships    | 83      | 139                         | 45         |
| Distributions & statistics | 61      | 72                          | 44         |
| Heatmaps & scientific      | 47      | 51                          | 32         |
| Part-to-whole & hierarchy  | 72      | 75                          | 52         |
| Financial & business       | 48      | 50                          | 33         |
| Polar & radial             | 26      | 26                          | 16         |
| Maps & geography           | 30      | 30                          | 28         |
| Networks & flows           | 74      | 84                          | 65         |
| 3D charts & fields         | 102     | 102                         | 73         |

## Family × subtype × language × level

Language counts describe registered artifacts. “Unassessed” is deliberately distinct from beginner.
Rendered TS variants target the repository sandbox, not a verified standalone install.

| Family / subtype                 | Examples | TS  | JS  | Python | Beginner | Intermediate | Advanced | Unassessed |
| -------------------------------- | -------- | --- | --- | ------ | -------- | ------------ | -------- | ---------- |
| basic / bar                      | 137      | 137 | 0   | 9      | 3        | 0            | 1        | 133        |
| basic / horizontal-bar           | 17       | 17  | 0   | 1      | 0        | 0            | 0        | 17         |
| basic / grouped-bar              | 13       | 13  | 0   | 0      | 0        | 0            | 0        | 13         |
| basic / stacked-bar              | 7        | 7   | 0   | 1      | 1        | 0            | 0        | 6          |
| basic / dot                      | 1        | 1   | 0   | 0      | 0        | 0            | 0        | 1          |
| basic / lollipop                 | 1        | 1   | 0   | 0      | 0        | 0            | 0        | 1          |
| basic / dumbbell                 | 1        | 1   | 0   | 0      | 0        | 0            | 0        | 1          |
| basic / table                    | 12       | 12  | 0   | 0      | 0        | 0            | 0        | 12         |
| time-series / line               | 111      | 111 | 0   | 7      | 5        | 0            | 1        | 105        |
| time-series / area               | 28       | 28  | 0   | 0      | 0        | 0            | 0        | 28         |
| time-series / stacked-area       | 7        | 7   | 0   | 0      | 0        | 0            | 0        | 7          |
| time-series / step-line          | 1        | 1   | 0   | 1      | 1        | 0            | 0        | 0          |
| time-series / range-band         | 4        | 4   | 0   | 0      | 0        | 0            | 0        | 4          |
| relationships / scatter          | 104      | 104 | 0   | 6      | 2        | 0            | 1        | 101        |
| relationships / bubble           | 15       | 15  | 0   | 0      | 1        | 0            | 0        | 14         |
| relationships / splom            | 11       | 11  | 0   | 0      | 0        | 0            | 0        | 11         |
| relationships / parcoords        | 9        | 9   | 0   | 0      | 0        | 0            | 0        | 9          |
| statistical / histogram          | 23       | 23  | 0   | 2      | 1        | 0            | 0        | 22         |
| statistical / box                | 17       | 17  | 0   | 2      | 1        | 0            | 0        | 16         |
| statistical / violin             | 12       | 12  | 0   | 1      | 1        | 0            | 0        | 11         |
| statistical / strip              | 5        | 5   | 0   | 0      | 0        | 0            | 0        | 5          |
| statistical / histogram2d        | 8        | 8   | 0   | 0      | 0        | 0            | 0        | 8          |
| statistical / histogram2dcontour | 9        | 9   | 0   | 0      | 0        | 0            | 0        | 9          |
| statistical / ecdf               | 1        | 1   | 0   | 0      | 0        | 0            | 0        | 1          |
| scientific / heatmap             | 28       | 28  | 0   | 2      | 2        | 0            | 0        | 26         |
| scientific / contour             | 12       | 12  | 0   | 0      | 1        | 0            | 0        | 11         |
| scientific / image               | 7        | 7   | 0   | 0      | 0        | 0            | 0        | 7          |
| scientific / log                 | 4        | 4   | 0   | 0      | 0        | 0            | 0        | 4          |
| hierarchical / pie               | 22       | 22  | 0   | 0      | 1        | 0            | 0        | 21         |
| hierarchical / donut             | 7        | 7   | 0   | 0      | 0        | 0            | 0        | 7          |
| hierarchical / treemap           | 18       | 18  | 0   | 0      | 1        | 0            | 0        | 17         |
| hierarchical / sunburst          | 15       | 15  | 0   | 0      | 1        | 0            | 0        | 14         |
| hierarchical / icicle            | 11       | 11  | 0   | 0      | 0        | 0            | 0        | 11         |
| hierarchical / funnelarea        | 9        | 9   | 0   | 0      | 0        | 0            | 0        | 9          |
| financial / candlestick          | 7        | 7   | 0   | 0      | 0        | 1            | 0        | 6          |
| financial / ohlc                 | 7        | 7   | 0   | 0      | 0        | 0            | 0        | 7          |
| financial / waterfall            | 10       | 10  | 0   | 0      | 0        | 0            | 0        | 10         |
| financial / funnel               | 10       | 10  | 0   | 0      | 2        | 0            | 0        | 8          |
| financial / indicator            | 11       | 11  | 0   | 0      | 1        | 0            | 0        | 10         |
| financial / gantt                | 5        | 5   | 0   | 0      | 0        | 0            | 0        | 5          |
| polar / scatterpolar             | 5        | 5   | 0   | 0      | 1        | 0            | 0        | 4          |
| polar / polar-line               | 10       | 10  | 0   | 0      | 1        | 0            | 0        | 9          |
| polar / barpolar                 | 12       | 12  | 0   | 0      | 1        | 0            | 0        | 11         |
| maps / scattergeo                | 23       | 23  | 0   | 0      | 3        | 0            | 0        | 20         |
| maps / choropleth                | 11       | 11  | 0   | 0      | 0        | 1            | 0        | 10         |
| networks / graph                 | 41       | 41  | 0   | 0      | 0        | 1            | 1        | 39         |
| networks / chord                 | 11       | 11  | 0   | 0      | 0        | 0            | 0        | 11         |
| networks / sankey                | 12       | 12  | 0   | 0      | 2        | 0            | 0        | 10         |
| networks / parcats               | 10       | 10  | 0   | 0      | 1        | 0            | 0        | 9          |
| networks / adjacency-matrix      | 1        | 1   | 0   | 0      | 0        | 0            | 0        | 1          |
| 3d / scatter3d                   | 34       | 34  | 0   | 1      | 1        | 0            | 0        | 33         |
| 3d / bar3d                       | 10       | 10  | 0   | 0      | 1        | 0            | 0        | 9          |
| 3d / surface                     | 19       | 19  | 0   | 1      | 1        | 0            | 0        | 18         |
| 3d / mesh3d                      | 14       | 14  | 0   | 0      | 0        | 0            | 0        | 14         |
| 3d / cone                        | 6        | 6   | 0   | 0      | 0        | 0            | 0        | 6          |
| 3d / streamtube                  | 6        | 6   | 0   | 0      | 0        | 0            | 0        | 6          |
| 3d / volume                      | 6        | 6   | 0   | 0      | 0        | 0            | 0        | 6          |
| 3d / isosurface                  | 6        | 6   | 0   | 0      | 0        | 0            | 0        | 6          |
| 3d / graph3d                     | 9        | 9   | 0   | 0      | 0        | 0            | 0        | 9          |

## Stub and draft pages

- `apps/docs/cookbook/index.md`: stub.
- `apps/docs/customization/extrusion-2-5d.md`: draft.
- `apps/docs/customization/index.md`: stub.
- `apps/docs/customization/three-objects.md`: stub.
- `apps/docs/extending/component-plugin.md`: stub.
- `apps/docs/extending/custom-trace.md`: stub.
- `apps/docs/extending/trace-module-contract.md`: stub.
- `apps/docs/getting-started/from-chartjs.md`: stub.
- `apps/docs/getting-started/from-d3.md`: stub.
- `apps/docs/guides/dashboards.md`: draft.
- `apps/docs/guides/frameworks.md`: draft.
- `apps/docs/guides/ssr.md`: draft.
- `apps/docs/migration.md`: stub.
- `apps/docs/playground/index.md`: stub.

## Priority gaps

- Python cells in a guide are not downloadable notebook artifacts. Deliver the notebook collection and
  tested Python gallery variants in Waves 2–3; leave Python variant availability false until verified.
- Separate reusable beginner variations from complete demos. A large demo collection must not dominate
  curated family previews or inflate beginner coverage.
- Assess uncurated learning levels and source completeness before featuring them as quick starts.
- Add contextual explanations to examples without guide embeds and complete the cookbook stub.
- Keep source-install status visible until the corresponding registry artifact is verified.
- The Python bridge currently requires a development checkout; a public source revision is
  a separate release dependency. See [install-verification.md](./install-verification.md).

## Prioritized starter tasks

| Task                         | Existing example to reuse                 | Next deliverable                                                                     |
| ---------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------ |
| Notebook scatter             | `scatter/basic`                           | Python quick start and executable notebook; no Python artifact currently registered. |
| Grouped comparison           | `bar/grouped`                             | Complete browser snippet plus supported Python counterpart.                          |
| Time series with gaps        | `line/gaps`, `timeseries/date-formatting` | Dates, missing data, and units recipe.                                               |
| Distribution comparison      | `violin/grouped`, `box/basic`             | Notebook explaining groups and interpretation.                                       |
| Labeled matrix               | `heatmap/annotated`                       | NumPy/DataFrame notebook with data-shape explanation.                                |
| Browser-only geographic view | `choropleth/basic`                        | Map quick path with extension requirement; no Python claim.                          |

These selections reuse real example IDs. Their future language variants still require execution tests.

## Visual baseline and journey observations

Captured 2026-10-09 on Chromium with SwiftShader and reduced motion, before modifying existing
site templates. Screenshots show the initial viewport, not the full page. Measurements are in
[baseline/viewports.json](./baseline/viewports.json).

- Desktop: 1440 × 900. Tablet: 820 × 1180. Mobile: 390 × 844.
- The desktop homepage shows one hero chart. The desktop gallery shows no fully visible cards:
  category and trace filter chips occupy the initial screen.
- At 820 px all four baseline pages have a 921 px document width, indicating shared navigation overflow.
- Starting from home, the existing notebook path requires opening Guide, expanding Guides, then selecting
  Python notebooks. There is no direct Python homepage action or primary navigation item.
- Chart discovery requires opening Gallery and navigating a long folder-derived chip list before
  selecting a preview; users must distinguish API/demo categories from chart types themselves.
- Time to first runnable chart has not been measured with users. The current browser tutorial states
  about five minutes, excluding clone/build/install setup. The notebook guide has no timed trial.
  Record actual task times during SITE-25; do not treat a source-build estimate as observed performance.

| Surface   | Desktop                                        | Tablet                                        | Mobile                                        |
| --------- | ---------------------------------------------- | --------------------------------------------- | --------------------------------------------- |
| home      | [Screenshot](./baseline/home-desktop.png)      | [Screenshot](./baseline/home-tablet.png)      | [Screenshot](./baseline/home-mobile.png)      |
| gallery   | [Screenshot](./baseline/gallery-desktop.png)   | [Screenshot](./baseline/gallery-tablet.png)   | [Screenshot](./baseline/gallery-mobile.png)   |
| chart     | [Screenshot](./baseline/chart-desktop.png)     | [Screenshot](./baseline/chart-tablet.png)     | [Screenshot](./baseline/chart-mobile.png)     |
| notebooks | [Screenshot](./baseline/notebooks-desktop.png) | [Screenshot](./baseline/notebooks-tablet.png) | [Screenshot](./baseline/notebooks-mobile.png) |
