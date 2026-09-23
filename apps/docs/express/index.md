---
title: Express API
description: Build complete charts from tabular data in one call with the high-level hx.* API.
status: stub
milestone: M3
---

# Express API

The Express API (`@mk7s/holochart-express`) is a high-level layer modeled on `plotly.express`. It
takes tabular data and column mappings and builds a full figure in one call. This page will be its
reference and tutorial.

```ts
import hx from '@mk7s/holochart-express';

hx.scatter(el, df, { x: 'gdpPercap', y: 'lifeExp', color: 'continent', size: 'pop', logX: true });
```

Planned topics:

- Tabular data input: arrays of records, column objects, and Arrow tables
- Semantic mappings: `x`, `y`, `color`, `size`, `symbol`, `facetRow`, `facetCol`
- Faceting into subplot grids
- Animation frames from a data column
- Statistical helpers such as trendlines and marginal plots
- The full function catalogue (`hx.scatter`, `hx.line`, `hx.bar`, `hx.histogram`, ...)

The first Express release (alpha) is planned for M3, and the full catalogue for M5.
