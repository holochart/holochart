---
title: Size a chart for a dashboard tile
description: Give a six-panel chart an explicit container, responsive resizing and enough room for independent axes and labels.
status: complete
recipe-example: layout/grid-independent
---

<script setup>
import NotebookLinks from '../.vitepress/theme/components/NotebookLinks.vue';
</script>

# Size a chart for a dashboard tile

## Problem

A dashboard tile changes width with its parent layout. A chart needs a nonzero container size,
and its axes need enough space to remain readable. Responsive rendering can follow a container;
it cannot invent a usable dashboard layout or choose which metrics matter.

## Finished chart and complete source

<Example id="layout/grid-independent" :height="480" />

The example places six synthetic metrics in an independent two-by-three grid. Each panel has
its own axis pair and range; unlike units can therefore coexist without a shared misleading
scale. Open **Complete source** for the runnable browser module or exact verified Python
counterpart. The browser download mounts a sized container and exports `cleanup()`; the notebook
counterpart demonstrates the same figure, not automatic browser dashboard breakpoints.

[Complete browser source (.js)](/gallery/sources/layout/grid-independent.js) ·
[Example details and downloads](/gallery/example/layout/grid-independent)

<NotebookLinks slug="subplot-layouts" variant="layout-grid-independent" />

## Key choices

- `config.responsive: true` observes container resizing. The default responsive setting is
  false, so keep this opt-in when adapting the source.
- A CSS parent must supply width and height before rendering. The live example uses 480 pixels
  of height; its canonical screenshot is 800 by 480. Neither is a promise that six panels fit
  every phone viewport.
- `pattern: 'independent'` assigns `xy`, `x2y2`, through `x6y6` in row-major order. Every panel
  autoranges separately, preserving its numeric or category axis semantics.
- Independent grid gaps leave room for each panel's labels. `showlegend: false` reduces clutter
  in this sample; production tiles need visible metric titles and units.

## Adapt it

Use a grid item with `min-width: 0` to let the container shrink, and give it a deliberate height
or minimum height. Test actual label lengths at the smallest supported tile width. For phones,
change the figure to fewer columns or split metrics into separate tiles; responsive resizing
alone does not reflow this fixed two-by-three grid. Call the downloaded module's `cleanup()`
when removing a tile so its chart and container are released. Hidden tabs need a real size when
shown before readers can judge the result.

## Related families

[Basic comparisons](/gallery/basic/), [relationships](/gallery/relationships/),
[time series](/gallery/time-series/), [configuration](/fundamentals/configuration),
[subplot layout](/fundamentals/layout-axes-subplots), and
[the complete example](/gallery/example/layout/grid-independent).
