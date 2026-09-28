---
'@mk7s/holochart-traces-hier': minor
'@mk7s/holochart-traces-basic': minor
'@mk7s/holochart-traces-sci': minor
'@mk7s/holochart-traces-stats': minor
'@mk7s/holochart-traces-finance': minor
'@mk7s/holochart-express': minor
'@mk7s/holochart': minor
---

M4/M5 carry-forward fixes.

- `sunburst`, `treemap` and `icicle` read `marker.coloraxis`: nodes are colored through the shared `layout.coloraxis` (its colorscale, cross-trace domain and one colorbar), by `values` (or counts) when they have no `marker.colors`, as in Plotly. The axis domain merges with other trace types on the same axis.
- `sunburst`, `treemap` and `icicle` honour `layout.uniformtext` (`mode`, `minsize`): label fonts are raised to `minsize`, every label is drawn at the smallest fitted size of its trace type across the chart (treemap and icicle headers and path bar labels included), and labels under `minsize` are hidden in `'hide'` mode. Drill-down clicks don't animate while it is on, as in Plotly. New examples `sunburst/uniformtext`, `treemap/uniformtext`, `icicle/uniformtext`.
- Visible data tables (`config.a11y.dataTable: 'visible'`) show every row of pie, funnelarea, funnel, waterfall, sankey (links), sunburst/treemap/icicle, scatterpolar/barpolar, splom, parcoords, parcats, the `table` trace, heatmap, contour and histogram2d/histogram2dcontour: their descriptions gain `table.row(i)`.
- Express: `sunburst`, `treemap` and `icicle` put a numeric color's colorscale and colorbar on `layout.coloraxis`, as px. `scatterPolar`, `linePolar` and `barPolar` with `animationFrame` fix the radial range across frames unless `rangeR` is given.
- `@mk7s/holochart-traces-basic` exports `negotiateUniformText`, `releaseUniformText` and `numericExtent` for other trace packages; color axes merge the extents other trace types record.
- Docs: the events reference lists every event, with the hierarchy click and sankey payloads.
