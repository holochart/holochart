---
title: Give hover labels useful context
description: Add stable point identifiers and formatted numeric values to marker hover labels with customdata and hovertemplate.
status: complete
recipe-example: scatter/interactive
---

# Give hover labels useful context

## Problem

A marker's coordinates alone do not tell a reader which observation they found. Store a stable
identifier alongside each point, then include it with formatted values in the hover label.
Keep the label short enough to scan without obscuring nearby marks.

## Finished chart and complete source

<Example id="scatter/interactive" />

Hover a marker to see x, y, its point ID and the series name. The three series each contain ten
points; the regular grid also makes zoom and selection easy to inspect. Open **Complete source**
for the runnable browser module, including all 30 values, point IDs and the exact template.
No verified exact Python counterpart is offered for this example.

[Complete browser source (.js)](/gallery/sources/scatter/interactive.js) ·
[Example details and downloads](/gallery/example/scatter/interactive)

## Key choices

- Each trace's `customdata` array follows its x/y order, with IDs such as `p0-3`. Preserve that
  alignment if you filter, sort or replace observations.
- `hovertemplate` uses `%{x}`, `%{y:.1f}` and `%{customdata}`. The numeric format controls display
  precision; it does not round or mutate the stored y values.
- `<extra>%{fullData.name}</extra>` puts the series name in the secondary label area. Use an
  empty `<extra></extra>` when that repetition is unnecessary.
- `showlegend: false` keeps this interaction sample compact. In a real report, provide another
  visible explanation of the three series instead of making hover the only route to context.

## Adapt it

Choose meaningful identifiers and state units directly in the template. Use `customdata[0]`,
`customdata[1]`, and so on for row-like metadata, keeping the array shape consistent. Put the
key conclusion and an accessible data summary outside the chart: hover is supplemental and
cannot be the only way to understand a report. Zooming or selecting here does not filter a
second chart; that coordination would need a separate interaction design.

## Related families

[Relationships](/gallery/relationships/), [scatter guide](/charts/basic/scatter),
[hover configuration](/fundamentals/hover-text-templates), and
[the complete example](/gallery/example/scatter/interactive).
