# Chart guide launch coverage

47 public guides use one live minimal example, a compact overview, and linked variation thumbnails. The table counts unique **non-minimal** variation examples; it never counts duplicate embeds or source-language tabs as a variation. All original detailed data, styling, interaction, accessibility, reference and migration sections remain. Three existing performance cases (table/virtualized, graph3d/orbit, parcoords/large) retain repository instructions rather than linking to nonexistent gallery detail pages; they are excluded from published thumbnail counts.

## Launch-featured guides

| Guide                                                                   | Minimal example              | Substantive variations | Verified Python examples | Remaining variation gap |
| ----------------------------------------------------------------------- | ---------------------------- | ---------------------: | -----------------------: | ----------------------: |
| [Scatter3D](../../../apps/docs/charts/3d/scatter3d.md)                  | `scatter3d/basic`            |                     11 |                        1 |                       0 |
| [Surface](../../../apps/docs/charts/3d/surface.md)                      | `surface/basic`              |                      9 |                        1 |                       0 |
| [Bar](../../../apps/docs/charts/basic/bar.md)                           | `bar/basic`                  |                     10 |                        5 |                       0 |
| [Line](../../../apps/docs/charts/basic/line.md)                         | `line/basic`                 |                      7 |                        3 |                       0 |
| [Pie](../../../apps/docs/charts/basic/pie.md)                           | `pie/basic`                  |                      6 |                        0 |                       0 |
| [Scatter](../../../apps/docs/charts/basic/scatter.md)                   | `scatter/clusters`           |                      7 |                        2 |                       0 |
| [Candlestick](../../../apps/docs/charts/financial/candlestick.md)       | `candlestick/basic`          |                      5 |                        0 |                       0 |
| [Network graph](../../../apps/docs/charts/graphs/graph.md)              | `graph/force`                |                     33 |                        0 |                       0 |
| [Sankey](../../../apps/docs/charts/hierarchical/sankey.md)              | `sankey/basic`               |                      7 |                        0 |                       0 |
| [Choropleth maps](../../../apps/docs/charts/maps/choropleth.md)         | `choropleth/basic`           |                      7 |                        0 |                       0 |
| [Scatter & lines on maps](../../../apps/docs/charts/maps/scattergeo.md) | `scattergeo/basic`           |                      7 |                        0 |                       0 |
| [Heatmap](../../../apps/docs/charts/scientific/heatmap.md)              | `heatmap/basic`              |                      7 |                        2 |                       0 |
| [Polar & radar](../../../apps/docs/charts/scientific/polar.md)          | `polar/basic`                |                      5 |                        0 |                       0 |
| [Box plot](../../../apps/docs/charts/statistical/box.md)                | `box/basic`                  |                      6 |                        2 |                       0 |
| [Histogram](../../../apps/docs/charts/statistical/histogram.md)         | `histogram/notebook-starter` |                      7 |                        2 |                       0 |

## Beginner tasks by family

These selections describe specific tasks and are explicitly classified as beginner. Short lists expose editorial coverage gaps; intermediate and unassessed examples are not relabeled to satisfy a quota. Map and graph extension boundaries remain visible in the guides.

| Family                     | Reviewed tasks                                                                                                                                                 | Gap to three |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----------: |
| Basic & comparison         | `bar/basic`: Compare category totals; `bar/text`: Label values directly; `bar/stacked`: Show components of a total                                             |            0 |
| Lines & time series        | `line/basic`: Draw a trend; `line/gaps`: Expose missing observations; `line/step`: Show discrete state changes                                                 |            0 |
| Scatter & relationships    | `scatter/basic`: Compare two measurements; `bubble/basic`: Encode a third value by size; `scatter/text-labels`: Identify observations with labels              |            0 |
| Distributions & statistics | `histogram/notebook-starter`: Bin a small sample; `box/basic`: Summarize sample spread; `violin/basic`: Compare distribution shapes                            |            0 |
| Heatmaps & scientific      | `heatmap/basic`: Display a numeric matrix; `heatmap/uneven`: Represent uneven coordinate spacing; `contour/basic`: Draw levels of a field                      |            0 |
| Part-to-whole & hierarchy  | `pie/basic`: Show a part of a whole; `treemap/basic`: Compare nested amounts; `sunburst/basic`: Explore levels of a hierarchy                                  |            0 |
| Financial & business       | `funnel/basic`: Show stage conversion; `funnel/grouped`: Compare conversion between two cohorts; `indicator/number`: Present a formatted revenue metric        |            0 |
| Polar & radial             | `polar/basic`: Plot angular measurements; `polar/radar`: Compare category profiles; `polar/barpolar`: Stack values on a circular category axis                 |            0 |
| Maps & geography           | `scattergeo/basic`: Place measured cities on a world map; `scattergeo/europe`: Label capitals in a scoped map; `scattergeo/usa`: Display state-level locations |            0 |
| Networks & flows           | `sankey/basic`: Show energy flows; `sankey/vertical`: Explain a household budget; `parcats/basic`: Trace samples across categorical dimensions                 |            0 |
| 3D charts & fields         | `scatter3d/basic`: Compare spatial observations; `surface/basic`: Draw a grid height field; `bar3d/matrix`: Compare revenue across products and regions        |            0 |

## Practical priorities

| Task                   | Existing browser examples                                                      | Remaining work                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date handling          | `bar/period`, `heatmap/dates`, `histogram/date-months`, `scatter3d/axis-types` | Publish exact Python date-period counterparts; existing browser variations remain available.                                                         |
| Missing data           | `line/gaps`, `surface/connectgaps`, `contour/gaps`                             | Python gap source verified separately; remaining field-gap notebooks need exact counterparts.                                                        |
| Ordering and ranking   | `bar/sorted`, `recipes/ranked-bars`                                            | Reviewed raw-category Python ordering tutorial remains a proposed addition.                                                                          |
| Annotations and labels | `bar/text`, `scatter/text-labels`, `heatmap/annotated`                         | Label variants exist; annotation-specific notebook proof remains a gap.                                                                              |
| Error bands and errors | `area/band`, `recipes/error-bands`, `scatter/error-bars`                       | Point errors have a counterpart; interval-band Python recipe is not yet claimed.                                                                     |
| Normalization          | `area/percent`, `histogram/normalized`, `histogram/cumulative`                 | Cumulative tutorial exists; normalized area/probability notebook proofs remain proposed.                                                             |
| Subplots               | `layout/grid-independent`, `layout/grid-coupled`                               | Actual source variants included; host verification governs availability.                                                                             |
| Accessible colors      | `themes/high-contrast`, `bar/patterns`, `polar/barpolar-patterns`              | High-contrast counterpart exists; pattern-specific Python verification remains proposed.                                                             |
| Responsive sizing      | `bar/basic`, `layout/grid-independent`                                         | Browser responsive config is explicit. Notebook height and rerun cleanup are separately verified; responsive host resizing needs a focused tutorial. |

## Verification boundaries

Language availability comes from exact source metadata. A browser thumbnail is canonical-example evidence; a copied bundle has separate compile/render evidence. Python counterpart records include the literal figure SHA, standalone source SHA, canonical browser/helper SHAs, notebook-host proof and one-widget output expectation. Geographic and graph extension traces remain browser-only in the current Python bridge. Source tabs fetch a small per-example metadata file and then the selected complete source; no full source inventory is shipped in page metadata.
