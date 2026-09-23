---
title: Chart name
description: One sentence on what this chart shows and when to use it.
status: draft
chart: tracetype
---

<!--
Chart page template (plan E19.4). Copy this file to charts/<family>/<chart>.md and fill it in.
This file is excluded from the site build.

- Keep the H2 sections below, in this order.
- "3D-native options" may be omitted when not applicable.
- A page marked `status: complete` must have all other sections and at least 5
  <Example id="…" /> embeds (Variations needs at least 4).
- `pnpm --filter @mk7s/holochart-docs lint:pages` enforces this.
- `chart` in the frontmatter is the trace type the page documents (a line chart uses `scatter`).
-->

# Chart name

## Overview

<!-- What the chart shows, when to use it, and when to pick a different chart instead. -->

## Minimal example

<!-- The smallest useful figure, as one <Example id="…" /> embed plus a short explanation. -->

## Data format

<!-- Which attributes carry the data (x, y, values, ...), accepted types, and how missing values behave. -->

## Variations

<!-- At least 4 <Example id="…" /> embeds, each with a heading and one or two sentences. -->

## Styling

<!-- The main style attributes (marker, line, fill, text) and how they combine with themes. -->

## Interactivity

<!-- Hover behavior, selection, click events, and any chart-specific interaction. -->

## 3D-native options

<!-- Optional: extrusion (depth), materials, lighting, and 2.5D view options for this chart. -->

## Performance notes

<!-- Data sizes that stay interactive, fast paths (typed arrays), and settings that cost GPU time. -->

## Accessibility notes

<!-- What the DOM mirror announces, keyboard behavior, and color and pattern advice. -->

## Attribute reference

<!-- Link to the generated reference: [Attribute reference](/reference/<chart>). -->

## Related charts

<!-- Links to similar chart pages and when to choose each. -->

## Plotly migration notes

<!-- Differences from the Plotly.js trace of the same name: renamed, unsupported, or extra attributes. -->
