---
title: Indicator
description: Show one value as a big number, its change from a reference, and an angular or bullet gauge with steps and a threshold.
status: complete
chart: indicator
---

# Indicator

<ChartOverview />

## Overview

An indicator shows a **single value** the way a dashboard tile does, with up to three elements
picked by `mode`:

- **`number`**: the value as big text, with a prefix, a suffix and a d3 format;
- **`delta`**: its difference to `delta.reference`, absolute or relative, with ▲ / ▼ in the
  rising or falling color;
- **`gauge`**: the value on a half-ring (**angular**) or horizontal bar (**bullet**) gauge with an
  axis, colored `steps` (ranges such as "good" and "bad") and a `threshold` line.

Use it for KPIs: revenue to date, a conversion rate against last week, server load against a
limit. Several indicators placed by `domain` make a dashboard.

Holochart draws an angular gauge as one instanced GPU arc set (background, steps, value bar,
threshold, outline and tick marks) and a bullet gauge as one instanced rect set; all the text of an
indicator is one batched SDF text draw.

Pick a different chart when:

- you want the value's history, not just its latest reading: use a
  [line chart](/charts/basic/line) (with the indicator beside it);
- you compare a few values with each other: use a [bar chart](/charts/basic/bar);
- you show the parts of a whole: use a [pie chart](/charts/basic/pie).

## Minimal example

The figure sketch below shows the essential data shape. Open **Complete source** on the live
example for a runnable module with setup, dependencies and cleanup.

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [{ type: 'indicator', mode: 'number', value: 450, title: { text: 'Orders' } }],
});
```

Without a `number.font.size`, the number is sized to fit its domain (never above 80 px) and the
title takes a quarter of that size. The live example adds a `$` prefix and a thousands format:

<Example id="indicator/number" />

## Data format

- **`value`**: the number to show. Without it the number reads `-` and the gauge has no bar.
- **`mode`**: any combination of `'number'`, `'delta'` and `'gauge'` joined with `+`
  (default `'number'`). The order doesn't matter.
- **`delta.reference`**: what the delta is computed from (default: `value`, so no change). The
  delta is `value − reference`, or `(value − reference) / reference` with `delta.relative: true`.
- **`gauge.axis.range`**: the values at the start and end of the gauge. The default is
  `[0, 1.5 × value]`; a `null` end keeps its default (`[null, 500]` starts at 0).
- **`domain`**: where the indicator goes in the plot area, as fractions (`x: [0, 0.5]`), or a cell
  of `layout.grid` (`row`, `column`), like [pie charts](/charts/basic/pie). Indicators have no
  axes and no legend entries.
- **Formats.** Without `number.valueformat`, the number is rounded like a tick label of an axis
  from 0 to 1.5 times the value (so `123.456` shows as `123.5` and `1234567` as `1.235M`): set a [d3 format](/fundamentals/hover-text-templates) such as `',.0f'` or `'.1%'`
  for exact control. A relative delta defaults to `'2%'` (a percentage, trailing zeros trimmed).

## Variations

<ChartVariations />

### Number and delta

`delta.position` puts the delta `'bottom'` (default), `'top'`, `'left'` or `'right'` of the
number; `delta.relative` shows a percentage change, `delta.valueformat`, `prefix` and `suffix`
format it. Number and delta are scaled together to fit the domain:

<ExampleLink id="indicator/delta" />

### Angular gauge with steps and a threshold

`gauge.steps` color ranges of the ring under the value bar; `gauge.threshold` draws a line at a
value across `thickness` of the ring. The number and delta sit in the ring's hole, and the axis
ticks and labels go around its outer edge:

<ExampleLink id="indicator/gauge" />

### Bullet gauges

`gauge.shape: 'bullet'` draws a horizontal gauge over the domain's height with the axis along its
bottom edge, the title to its left (outside the domain, right-aligned) and the number in the right
quarter of the domain. Stack several with `domain.y`:

<ExampleLink id="indicator/bullet" />

### A KPI dashboard

Cards, angular and bullet gauges on a `layout.grid`, each placed by `domain.row` and
`domain.column` (or explicit `domain.x` / `domain.y`), each fitting its number to its own cell:

<ExampleLink id="indicator/dashboard" />

### Counting up with a transition

`value` and `delta.reference` animate: `react` with a
[`layout.transition`](/fundamentals/transitions-animation) counts the number up (formatted every
frame), moves the delta and sweeps the gauge bar. With `prefers-reduced-motion: reduce` the change
snaps:

<ExampleLink id="indicator/count-up" />

```ts
import { createChart, type Figure } from '@mk7s/holochart';

const figure = (value: number): Figure => ({
  data: [{ type: 'indicator', mode: 'gauge+number', value, gauge: { axis: { range: [0, 500] } } }],
  layout: { transition: { duration: 800, easing: 'cubic-in-out' } },
});

const chart = createChart(document.getElementById('chart')!, figure(120));
// `react` returns a promise that resolves when the transition ends.
void chart.react(figure(385));
```

## Styling

- **Number.** `number.font` (family, size, color, weight, style), `number.prefix`,
  `number.suffix`, `number.valueformat`. Setting `number.font.size` (or `delta.font.size`) turns
  fitting off.
- **Delta.** `delta.increasing` / `delta.decreasing` `.symbol` (`▲` / `▼`) and `.color` (Plotly's
  `#3D9970` / `#FF4136`), `delta.font` (half the number's size by default), `delta.prefix`,
  `delta.suffix`. Swap the colors when a fall is good news (costs, churn).
- **Title.** `title.text` (rich text such as `<br>` and `<span style="font-size:0.7em">` works),
  `title.font`, `title.align`; `align` places the number and delta left, center or right (not on
  angular gauges, which center them).
- **Gauge.** `gauge.bgcolor` (default: the paper color), `gauge.bordercolor`,
  `gauge.borderwidth`; `gauge.bar.color`, `.thickness` (a fraction of the gauge: 0.5, or 0.25 on
  bullets) and `.line`; `steps[i].color`, `.thickness`, `.line`, `.range`;
  `threshold.value`, `.thickness` and `.line.color` / `.line.width`.
- **Axis.** `gauge.axis` takes the cartesian tick attributes: `tickmode`, `nticks`, `dtick`,
  `tickvals` / `ticktext`, `ticks`, `ticklen`, `tickcolor`, `tickfont`, `tickformat`,
  `tickprefix` / `ticksuffix`, `exponentformat`, …; `visible: false` hides ticks and labels.
- **Default look.** In the default `holochart` template the number is bright (`#eceef4`), deltas
  use the colorway's emerald and red, the gauge has a faint track (`#1a1a22`) and outline, a blue
  value bar (`#5e74d5`), a bright threshold and 8 px tick labels with 3 px ticks.
  `layout.template: 'plotly-classic'` gives Plotly's look: a white gauge, a green bar and `#444`
  lines ([themes and templates](/customization/themes-templates)).

Outlined bars and steps, a border, a `dtick` axis with a percent format, a delta on the left with
custom symbols, and named bullet ticks:

<ExampleLink id="indicator/styled" />

```ts
import { createChart } from '@mk7s/holochart';

createChart(document.getElementById('chart')!, {
  data: [
    {
      type: 'indicator',
      mode: 'gauge+number',
      value: 68,
      number: { suffix: '%', font: { color: '#3fd0e0' } },
      gauge: {
        axis: { range: [0, 100], dtick: 25, tickfont: { size: 10 } },
        bar: { color: '#3fd0e0', thickness: 0.3 },
        steps: [{ range: [80, 100], color: 'rgba(234, 42, 55, 0.3)' }],
        threshold: { value: 90, thickness: 1, line: { color: '#ea2a37', width: 2 } },
        borderwidth: 0,
      },
    },
  ],
});
```

## Interactivity

- **No hover.** Indicators show their value already; like Plotly, they have no hover labels,
  selection or legend entries.
- **Updates.** `react`, `restyle` and `update` redraw an indicator in place; a `layout.transition`
  (or `animate` with frames) animates `value` and `delta.reference`.
- **Stable size while counting.** When the number is fitted, its scale only shrinks between
  redraws of the same indicator (Plotly keeps it too), so a counting-up number doesn't jump in
  size as digits appear; changing the format, fonts or domain starts over.

## Performance notes

- An indicator is at most two draw calls for its gauge and text, whatever its steps and ticks.
- Every update rebuilds its handful of instances in place; transitions re-lay out and re-upload
  one indicator per frame, which is cheap even for dashboards of dozens.

## Accessibility notes

- **Screen readers:** the hidden description (see the [accessibility guide](/guides/accessibility))
  reads the title (or name), the value with its prefix and suffix, the change from the reference
  (absolute and relative) and the gauge range and threshold.
- **Color:** the delta's direction is shown by its symbol as well as its color; keep the symbols
  when you change the colors.
- **Motion:** transitions snap with `prefers-reduced-motion: reduce`.

## Attribute reference

See the [indicator attribute reference](/reference/indicator) for every attribute, its type, and
its default.

## Related charts

- [Pie](/charts/basic/pie): the other domain-placed trace, often next to indicators on dashboards
- [Candlestick](/charts/financial/candlestick) and [OHLC](/charts/financial/ohlc): the price
  history behind a KPI
- [Dashboards guide](/guides/dashboards): laying out several charts
- [Transitions and animation](/fundamentals/transitions-animation): how values animate

## Plotly migration notes

- Attribute names and defaults match Plotly's `indicator`: `mode`, `value`, `align`, `domain`,
  `title` (`text`, `align`, `font`), `number` (`valueformat`, `font`, `prefix`, `suffix`), `delta`
  (`reference`, `position`, `relative`, `valueformat`, `increasing`, `decreasing`, `font`, `prefix`,
  `suffix`) and `gauge` (`shape`, `bar`, `bgcolor`, `bordercolor`, `borderwidth`, `axis`, `steps`,
  `threshold`). The layout of each mode combination, the font fitting (and its kept scale), the
  default number formatting, the delta symbols and colors, and the angular and bullet gauge
  geometry follow Plotly's `plot.js`.
- Transitions interpolate `value` every frame through the chart's animation engine, so the number
  is laid out (and fitted) for each in-between value; Plotly fits it to the final value once.
  An unformatted number without a gauge range is also rounded for each in-between value's own
  `[0, 1.5 × value]` axis, so it may show a decimal while counting (set `number.valueformat` for
  steady digits). Transitions also animate a changed `delta.reference`, which Plotly snaps.
- A gauge step's outline is drawn right after its fill, as in Plotly, but on angular gauges the
  outline stroke's ends are radial rather than parallel to the edge (sub-pixel at usual widths).
- `labelalias` on the gauge axis is not supported yet; the 3D-native gauge (`depth`, `material`)
  is planned.
- The default look restyles the gauge and delta colors; `template: 'plotly-classic'` gives
  Plotly's.
