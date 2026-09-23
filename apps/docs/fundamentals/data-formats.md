---
title: Data formats
description: Pass data as arrays, typed arrays, or column references into a dataset.
status: stub
milestone: M1
---

# Data formats

This page will list the data formats Holochart accepts and how to pick the fastest one.

Planned topics:

- Plain arrays and `Date` arrays
- Typed arrays (`Float32Array`, `Float64Array`, `Int32Array`, ...) and the zero-copy path
- Implicit coordinates with `x0`/`dx` and `y0`/`dy`
- Datasets and column references (`{ dataset: 'sales', x: '@date', y: '@revenue' }`)
- Missing values and gaps (`null`, `NaN`)
- Apache Arrow tables (planned)
