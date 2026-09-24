---
title: Coming from Plotly
description: How Plotly.js concepts, attributes, and APIs map to Holochart.
status: stub
milestone: M2
---

# Coming from Plotly

This page will help Plotly.js users move to Holochart. The figure model and most attribute names
are the same, so most of the work is in the few places where Holochart differs.

## Default look

Holochart has its own default look, so a plotly.js figure without `layout.template` renders
differently: dark (`#0a0a0f`) instead of white, 9 px Helvetica Neue text instead of 12 px Open
Sans, tighter margins, a horizontal legend above the plot instead of a vertical one on the right,
thinner lines, smaller markers, and bright-on-dark automatic colorscales. The colorway has 8
colors instead of category10's 10, so trace colors differ from the third trace on. Values your
figure sets explicitly are kept.

To match plotly.js, use the `plotly-classic` template, either for every chart or per figure:

```ts
import { setDefaultTemplate } from '@mk7s/holochart'; // or '@mk7s/holochart-runtime'

setDefaultTemplate('plotly-classic'); // once, before creating charts

// or per figure
createChart(el, { data, layout: { ...layout, template: 'plotly-classic' } });
```

`plotly-classic` renders the same as `template: 'none'` or `null`: Plotly's own defaults. Your
figure JSON is unaffected either way: `chartToJSON` exports the figure you gave, not the template.
A figure that names a template (`'plotly_white'`, …) gets that template instead of the default,
as in Plotly. See [The default look](/customization/themes-templates#the-default-look) for its
values.

## Planned topics

- What carries over unchanged: `{ data, layout, config, frames }`, attribute names, `hovertemplate`
  syntax, templates, and `restyle`/`relayout`/`react`
- The functional API (`Holochart.newPlot`, `restyle`, `relayout`, `react`) and the `plotly_*`
  event aliases
- The object API (`createChart`) and why the docs prefer it
- No `scattergl` split: every trace is GPU-rendered
- Deliberate semantic differences
- Importing existing Plotly JSON with the Plotly importer
- Holochart-only features: 3D-native options, style rules, materials, and shader hooks

See also [Core concepts](/getting-started/core-concepts) and the
[Plotly compatibility table](/reference/plotly-compat).
