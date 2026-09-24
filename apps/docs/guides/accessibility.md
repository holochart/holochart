---
title: Accessibility guide
description: How Holochart describes a canvas chart to screen readers, and how to name and describe your charts.
status: complete
---

# Accessibility guide

A chart is drawn on a WebGL canvas, which assistive technology cannot see into. Holochart keeps a
**DOM mirror** next to the canvas: an ARIA role and name on the chart element, and a visually hidden
description of the chart that screen readers read like any other page content. You get it on every
chart without doing anything; this guide shows what it contains and how to make it better.

<Example id="_dev/a11y-description" :height="400" />

The chart above draws nothing extra. Open your browser's accessibility inspector on it, or run
`__interaction.chart.description` in the console of the sandbox, to see what a screen reader gets.

## What the chart element gets

The element you pass to `createChart` gets three attributes:

| Attribute          | Interactive chart                              | Static chart (`config.staticPlot`) |
| ------------------ | ---------------------------------------------- | ---------------------------------- |
| `role`             | `figure`                                       | `img`                              |
| `aria-label`       | the chart's accessible name (see below)        | the same                           |
| `aria-describedby` | the hidden description's summary, axes, traces | the same                           |

**Why `figure`, not `application`.** `role="application"` tells a screen reader to stop its
browse mode and hand every key to the page. That only helps widgets that implement their whole
keyboard model, and it would stop users from reading the description and data tables line by
line. A `figure` keeps its content browsable: the description, the tables and the modebar
toolbar. A static chart has no controls, so it is exposed as one image with a long description.

The canvas and the hover labels are `aria-hidden`: the canvas has no content of its own, and hover
labels come and go with the mouse. Everything they show is in the description.

If your page already sets `role`, `aria-label` or `aria-describedby` on the element, Holochart
leaves that attribute alone, and when the chart is destroyed every attribute it set is removed.

## The accessible name

The name is the first thing a screen reader announces. It comes from, in order:

1. [`config.ariaLabel`](/reference/config), when set;
2. `layout.meta.description`, when `layout.meta` is an object with a `description` string;
3. the figure title followed by an automatic summary: "Revenue and costs, H1 2024. Line and bar
   chart with 2 traces."

```ts
createChart(el, {
  data,
  layout: { title: { text: 'Revenue and costs' } },
  config: { ariaLabel: 'Revenue grew 58% in the first half of 2024' },
});
```

A name that states the takeaway is better than one that states the chart type. `layout.meta` is
Plotly's free-form data for text templates (`%{meta.unit}`); Holochart only reads its
`description` key, so templates keep working, and a `meta` array or string is ignored for the name.

## The hidden description

The description is plain DOM inside the chart element, hidden with the usual "visually hidden"
CSS (clipped to one pixel, not `display: none`, which would hide it from screen readers too). It
never changes the layout or a single pixel of the chart. It has:

- **A summary**: the chart types and trace count ("Line and bar chart with 2 traces.").
- **Axes**: title, type and the range in view, formatted like the axis' tick labels
  (`X axis "Month": date axis from Dec 2023 to Jun 2024.`). Category axes list their categories.
- **Traces**: one sentence or two per trace, written by the trace type:
  - scatter: its kind (line, area, bubble or scatter), point count, x extent, and where y is lowest
    and highest;
  - bar: bar count and the largest and smallest bar with their positions;
  - pie: slice count, total and the largest slices with their shares;
  - traces hidden from the legend (`visible: 'legendonly'`) say so; other trace types get their
    type, name and point count.
- **Data tables**: one hidden `<table>` per trace with column headers from the axis titles. Tables
  show the first 100 rows, with "first 100 of 5,000 rows" in the caption, so large datasets stay
  cheap.

Read it from code with `chart.description`: the same text, as data.

```ts
await chart.ready;
chart.description?.label; // 'Revenue and costs, H1 2024. Line and bar chart with 2 traces.'
chart.description?.traces;
// ['Line "Revenue": 6 points. x from Jan 1, 2024 to Jun 1, 2024. Lowest y 11 at x = Mar 1, 2024,
//   highest 21 at x = May 1, 2024.', 'Bar "Costs": 6 bars. Largest 12 at May 1, 2024, …']
```

### Keeping it in sync

The description follows the chart without costing frames:

- data, trace and layout changes (`restyle`, `relayout`, `react`, adding traces, …) rebuild it
  right away, so it is current when their promise resolves;
- zooming, panning and resizing only change the axis ranges: the description follows 300 ms after
  the last change;
- streaming (`extendTraces`, `prependTraces`) updates it at most twice a second;
- hover and selection never touch it.

Nothing is rewritten when the text did not change.

## Make your charts easier to understand

- **Give every chart a title and axis titles.** They become the accessible name, the axis
  descriptions and the table headers.
- **Name your traces.** `Line "Revenue"` tells more than `Line "trace 0"`.
- **Put the conclusion in `config.ariaLabel`** when the chart makes a point.
- **Don't rely on color alone**: vary marker symbols or line dashes, and label lines directly
  with annotations where you can.

## Writing a description for a custom trace type

Trace modules describe themselves with `describe()`, which gets the trace, its calc and its axes
and returns a summary, an optional `kind` ("line", "donut", …) and an optional table. Format values
with the axes, so the description reads like the chart:

<!-- docs-gates: no-typecheck -->

```ts
import { countText, formatAxisValue, traceNameText, type TraceModule } from '@mk7s/holochart';

export const myTrace: TraceModule<MyCalc> = {
  // …
  describe({ trace, calc, index, xaxis, yaxis, maxRows }) {
    const name = traceNameText(trace['name'], index);
    const rows = [];
    for (let i = 0; i < Math.min(calc.length, maxRows); i++) {
      rows.push([formatAxisValue(xaxis, calc.x[i]), formatAxisValue(yaxis, calc.y[i])]);
    }
    return {
      kind: 'ribbon',
      summary: `Ribbon "${name}": ${countText(calc.length, 'point')}.`,
      table: { columns: ['x', 'y'], rows, total: calc.length },
    };
  },
};
```

Build at most `maxRows` rows and report the full count as `total`. A `describe()` that throws is
logged and replaced by the generic line, so it can never break the chart.

## What's next

Keyboard navigation of points and legend items with focus and live announcements (plan E6.5,
E17.4), trend summaries ("rises from 1.2 M in January to 3.4 M in December", E17.2), a visible data
table option (E17.3), a high-contrast theme and patterns (E17.5), and locales (E17.6) come in later
milestones.
