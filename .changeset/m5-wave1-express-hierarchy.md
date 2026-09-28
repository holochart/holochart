---
'@mk7s/holochart-express': minor
'@mk7s/holochart': minor
---

Express hierarchical charts (E13.1, E23.6): `sunburst`, `treemap` and `icicle` follow `px.sunburst`, `px.treemap` and `px.icicle`. `path` builds the tree from a list of columns as plotly.py's `process_dataframe_hierarchy` does — one node per distinct path prefix with `/`-joined ids, missing entries ending a path early, `values` (or a row count) summed with `branchvalues: 'total'`, a numeric `color` averaged weighted by values on a colorscale, a categorical `color`, `hoverName`, `hoverData` and `customData` kept where a branch's rows agree and `'(?)'` otherwise (mappable in `colorDiscreteMap`). Without `path`, `names`, `parents`, `ids` and `values` columns pass through; `branchvalues` and `maxdepth` are options. Express hover labels now name array columns given as `names`, `values`, `parents` or `ids` like px (`label=%{label}`, `value=%{value}`).
