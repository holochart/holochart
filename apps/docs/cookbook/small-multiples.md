---
title: Compare measurements with small multiples
description: Build a four-panel scatter matrix with shared row and column axes, keeping units and comparisons consistent.
status: complete
recipe-example: layout/grid-coupled
---

<script setup>
import NotebookLinks from '../.vitepress/theme/components/NotebookLinks.vue';
</script>

# Compare measurements with small multiples

## Problem

You want to compare sales against two weather measurements. Putting temperature, humidity,
ice-cream sales and umbrella sales on one pair of axes would mix units and hide the relationships.
Use a panel for each pairing, with one x scale per column and one y scale per row.

## Finished chart and complete source

<Example id="layout/grid-coupled" />

The chart contains 60 seeded observations, reused in every panel. Temperature and humidity are
the columns; ice creams and umbrellas are the rows. Open **Complete source** to copy or download
the entire browser module, including the deterministic data generator. Its Python tab contains
the exact verified four-panel figure; the matching notebook also explains subplot layouts.

[Complete browser source (.js)](/gallery/sources/layout/grid-coupled.js) ·
[Example details and downloads](/gallery/example/layout/grid-coupled)

<NotebookLinks slug="subplot-layouts" variant="layout-grid-coupled" />

## Key choices

- `layout.grid` uses two rows, two columns and `pattern: 'coupled'`. The grid computes domains;
  you do not need four hand-written rectangles.
- Assign `xaxis: 'x2'` for humidity and `yaxis: 'y2'` for umbrella sales. The fourth panel uses
  both. The other panels inherit the first axis of their row or column.
- Shared scales make within-row and within-column comparisons meaningful. Temperature and
  humidity still have different x axes because their units differ.
- Six-pixel markers and partial opacity reveal dense areas; hiding the legend avoids repeating
  information already present in the axis titles.

## Adapt it

Replace the four arrays together so index `i` still describes the same observation. Check that
axis titles state units and that every paired array has the same length. Use independent
axes when panels have different measures, as in [dashboard sizing](./dashboard-sizing).
Keep a written takeaway beside the chart; the synthetic correlations here are not causal evidence.

## Related families

[Relationships](/gallery/relationships/), [basic comparisons](/gallery/basic/),
[subplot layout](/fundamentals/layout-axes-subplots), and
[the complete example](/gallery/example/layout/grid-coupled).
