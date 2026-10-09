---
title: Apply a consistent report theme
description: Use a layout template across bars, lines, markers and colorscales, then override only the choices that carry meaning.
status: complete
recipe-example: themes/plotly_white
---

<script setup>
import NotebookLinks from '../.vitepress/theme/components/NotebookLinks.vue';
</script>

# Apply a consistent report theme

## Problem

A report combines several trace types. Setting fonts, grid lines and automatic colors separately
in every chart makes the result inconsistent and difficult to maintain. Start with a registered
template, then make explicit overrides where a color or size has a specific meaning.

## Finished chart and complete source

<Example id="themes/plotly_white" />

This sampler applies `layout.template: 'plotly_white'` to grouped bars, a target line, colored
markers, a colorbar and a reference marker series across two panels. Open **Complete source**
for the complete browser module or the exact verified Python dictionary. The browser file
includes the shared sampler helper and seeded data; you do not need a private repository import.

[Complete browser source (.js)](/gallery/sources/themes/plotly_white.js) ·
[Example details and downloads](/gallery/example/themes/plotly_white)

<NotebookLinks slug="themes-labels" variant="themes-plotly_white" />

## Key choices

- The template supplies defaults for fonts, axis decoration and automatic colors. Switching
  the template does not change values, category order or the relationship between axes.
- Explicit subplot domains and axis titles remain part of this figure. Theme selection does
  not replace decisions about layout or measurement units.
- A horizontal legend sits above the plots. `automargin` lets axis labels and titles grow the
  small initial margins, while the colorbar keeps its score label.
- Marker values use the template's sequential colorscale. Reserve a sequential scale for
  ordered numeric values; do not use it as an unexplained category palette.

## Adapt it

Try the same figure with [high-contrast styling](/gallery/example/themes/high-contrast), then
check text, grid lines, hover labels and color distinctions against your embedding page. A white
chart inside a dark site is intentional in this sampler. Browser chart fonts need registered
font assets; an unregistered template font falls back to the renderer's shipped font.
Keep direct labels, marker shapes or written summaries so color is not the sole encoding.

## Related families

[Basic comparisons](/gallery/basic/), [relationships](/gallery/relationships/),
[themes and templates](/customization/themes-templates), and
[the complete example](/gallery/example/themes/plotly_white).
