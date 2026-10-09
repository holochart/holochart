---
title: Draw a confidence or forecast interval band
description: Shade the region between paired lower and upper bounds while keeping history, mean, and interval meaning explicit.
status: complete
recipe-example: area/band
---

# Draw a confidence or forecast interval band

## Problem

A forecast mean alone hides uncertainty. Show its lower and upper bounds as a band, then draw
the mean above it. The same drawing pattern can display a confidence interval when your own
analysis supplies confidence bounds; those are different statistical quantities.

## Finished chart and complete source

<Example id="area/band" />

This deterministic example has 60 weeks of synthetic history and a 30-week forecast horizon,
including the shared starting point. Its label says **80% interval**. The bounds are illustrative:
the source computes a widening spread from `1.28 * 1.4 * Math.sqrt(i)`, not a fitted statistical
model or a calibrated coverage test. Open **Complete source** for the entire browser module.
No verified exact Python counterpart is offered for this example.

[Complete browser source (.js)](/gallery/sources/area/band.js) ·
[Example details and downloads](/gallery/example/area/band)

## Key choices

- Put the lower-bound trace immediately before the upper-bound trace. The upper trace's
  `fill: 'tonexty'` fills toward that preceding trace, so trace order determines the band.
- Both bounds use identical x values and a zero-width boundary line. Their translucent red
  fill communicates the interval without competing with the history and mean.
- A shared `legendgroup: 'interval'` and one visible legend entry keep the interval together
  when toggled. `hoverinfo: 'skip'` prevents unlabeled bound traces from dominating hover.
- History and dashed forecast traces follow the bounds in the data array, keeping the main
  lines visible above the shaded area.

## Adapt it

Supply lower and upper bounds from your model, with units, coverage level and interval type
stated next to the chart. Check `lower[i] <= upper[i]`, sorted x coordinates and equal array
lengths. Do not reuse the example's spread formula as a statistical procedure. Use error bars
for sparse point estimates and a band for an ordered, sufficiently sampled series.

## Related families

[Time series](/gallery/time-series/), [statistical charts](/gallery/statistical/),
[area guide](/charts/basic/area), [error bars](/charts/basic/scatter#error-bars), and
[the complete example](/gallery/example/area/band).
