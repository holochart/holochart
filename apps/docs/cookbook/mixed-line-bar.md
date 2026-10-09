---
title: Compare a line with bars
description: Combine visits and signups on one count axis while preserving trace names, aligned x values, and responsive behavior.
status: complete
recipe-example: line/with-bars
---

<script setup>
import NotebookLinks from '../.vitepress/theme/components/NotebookLinks.vue';
</script>

# Compare a line with bars

## Problem

You need a compact comparison of weekly activity and outcomes. A line emphasizes the trend in
visits; bars show signup counts for the same five weeks. Both measurements are counts, so one
y axis keeps the comparison straightforward.

## Finished chart and complete source

<Example id="line/with-bars" />

Open **Complete source** for the runnable browser module or its verified Python counterpart.
The file includes the five values for each series, named traces, axis titles, responsive config,
container setup and cleanup. The Python notebook uses the same figure dictionary with graph
objects; it does not convert this example into a live data feed.

[Complete browser source (.js)](/gallery/sources/line/with-bars.js) ·
[Example details and downloads](/gallery/example/line/with-bars)

<NotebookLinks slug="graph-objects" variant="line-with-bars" />

## Key choices

- A line is a `scatter` trace with `mode: 'lines+markers'`; the second trace is `type: 'bar'`.
  Markers show the five observations rather than implying a continuously sampled signal.
- Both traces use `x: [1, 2, 3, 4, 5]`. Preserve this alignment when inserting new periods.
- Trace names, `Visits` and `Signups`, populate the legend. Axis titles distinguish the week
  number from the count; neither series has a hidden second scale.
- `config.responsive: true` follows changes to the sized container. It does not decide how a
  surrounding dashboard should arrange its tiles.

## Adapt it

Keep the shared axis for comparable units. If you want a rate such as signup percentage, compute
it explicitly and label it; do not place that percentage on the count axis. For unlike units,
use [small multiples](./small-multiples) or explain any secondary axis clearly. Numeric weeks in
this example are not dates; see [date axes](./date-axes) for calendar observations.

## Related families

[Time series](/gallery/time-series/), [basic comparisons](/gallery/basic/),
[line guide](/charts/basic/line), [bar guide](/charts/basic/bar), and
[the complete example](/gallery/example/line/with-bars).
