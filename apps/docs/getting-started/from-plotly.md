---
title: Coming from Plotly
description: Move a plotly.js chart to Holochart — the same figure and functions, what changes in the API and the events, what is missing, and how to get Plotly's look back.
status: complete
---

# Coming from Plotly

Holochart reads the same figure as plotly.js: `data`, `layout`, `config` and `frames`, with
Plotly's attribute names, `hovertemplate` syntax and templates. Its functional API has Plotly's
function names and argument order. For most charts, moving over is a change of import and of a
few lines around the chart; this page lists those lines.

It describes plotly.js 4. The [compatibility table](/reference/plotly-compat) has the attribute
by attribute detail.

## The same chart, side by side

::: code-group

```js [plotly.js]
import Plotly from 'plotly.js-dist-min';

const gd = document.getElementById('chart');

await Plotly.newPlot(
  gd,
  [{ type: 'scatter', mode: 'lines+markers', x: [1, 2, 3], y: [2, 1, 3] }],
  { title: { text: 'Hello' } },
  { responsive: true },
);

gd.on('plotly_click', (event) => console.log(event.points[0].x));

await Plotly.restyle(gd, { 'marker.color': 'crimson' }, [0]);
await Plotly.relayout(gd, { 'xaxis.range': [0, 4] });
Plotly.purge(gd);
```

```ts [Holochart]
import * as Holochart from '@mk7s/holochart';

const el = document.getElementById('chart')!;

const chart = await Holochart.newPlot(
  el,
  [{ type: 'scatter', mode: 'lines+markers', x: [1, 2, 3], y: [2, 1, 3] }],
  { title: { text: 'Hello' } },
  { responsive: true },
);

chart.on('plotly_click', (event) => console.log(event.points[0]?.x));

await Holochart.restyle(el, { 'marker.color': 'crimson' }, [0]);
await Holochart.relayout(el, { 'xaxis.range': [0, 4] });
Holochart.purge(el);
```

:::

With a script tag, `window.Holochart` takes the place of `window.Plotly`; see
[Installation](./installation#use-a-script-tag-cdn).

Three things changed:

- **The element is an element.** Plotly also accepts the element's `id` as a string. Holochart
  takes the `HTMLElement` only.
- **The promise resolves to a chart.** `newPlot` and the other functions resolve to a
  [`Chart`](/reference/api/holochart-runtime/classes/Chart) object, not to the element. Nothing
  is attached to the element: there is no `gd.data`, `gd.layout` or `gd.on`. Use the chart, which
  `getChart(el)` returns at any time.
- **Events are on the chart.** `chart.on('plotly_click', …)` replaces `gd.on('plotly_click', …)`.

## Functions

These work as in Plotly, with the element as the first argument:

`newPlot`, `react`, `restyle`, `relayout`, `update`, `addTraces`, `deleteTraces`, `moveTraces`,
`extendTraces`, `prependTraces`, `addFrames`, `deleteFrames`, `animate`, `purge`, `toImage`,
`downloadImage`, `Fx.hover` and `Fx.unhover`.

| plotly.js                               | Holochart                                                 |
| --------------------------------------- | --------------------------------------------------------- |
| `Plotly.newPlot('chart', data)`         | `newPlot(document.getElementById('chart'), data)`         |
| `gd.data`, `gd.layout`                  | `chart.data`, `chart.layout`                              |
| `gd._fullData`, `gd._fullLayout`        | `chart.fullData`, `chart.fullLayout`                      |
| `gd.on('plotly_click', fn)`             | `chart.on('plotly_click', fn)` or `chart.on('click', fn)` |
| `gd.removeAllListeners('plotly_click')` | `chart.off('click')`                                      |
| `Plotly.Plots.resize(gd)`               | `chart.resize()`                                          |
| `Plotly.toImage(gd, { format: 'svg' })` | Not available: PNG, JPEG and WebP only                    |

Every function also exists as a method of the chart (`chart.restyle(…)`, `chart.react(figure)`,
`chart.toImage(…)`), and `createChart(el, figure)` creates a chart without the promise. The rest
of these docs use that form; both are the same chart. See
[Core concepts](./core-concepts).

## Events

Every Holochart event answers to its Plotly name: `plotly_click`, `plotly_hover`,
`plotly_relayout`, `plotly_selected`, `plotly_legendclick`, `plotly_sunburstclick` and the rest
subscribe to `click`, `hover`, `relayout` and so on. The payloads have Plotly's fields
(`points[]` with `curveNumber`, `pointNumber`, `x`, `y`, `customdata`, `data`, `fullData`). The
[event reference](/reference/events) lists them all.

Differences:

- `unhover` carries an empty `points` list. Plotly sends the points that were hovered.
- Plotly emits these and Holochart does not: `plotly_autosize` (listen to `resize`),
  `plotly_react`, `plotly_update`, `plotly_beforeexport`, `plotly_afterexport`,
  `plotly_exportfail` and `plotly_framework`.
- Holochart adds `resize`, `destroy`, `webglcontextrestored`, `beforerender` and `afterrender`.
- A `click` listener that returns `false` cancels a sunburst, treemap or icicle drill-down, as
  the `sunburstclick` listener does.

## What to change in the figure

- **`scattergl` and `scatterpolargl`**: rename them to `scatter` and `scatterpolar`. Every
  Holochart trace is drawn on the GPU, so there is no separate WebGL trace type. A trace with an
  unknown type is hidden, with a warning in the console that names the nearest type.
- **`Date` objects**: Holochart shows a `Date` at its UTC time; Plotly shows it at the browser's
  local time. Date strings without a UTC offset are read the same way in both, without a time
  zone; Holochart converts a string with an offset (`Z`, `+01:00`) to UTC. If your data are
  `Date` objects and you want local times on the axis, pass date strings instead.
- **Fonts**: text is drawn from font files, not from the fonts installed on the computer. A
  `font.family` that isn't registered is drawn with the built-in font. See
  [Web fonts](/fundamentals/styling-themes#web-fonts).

An attribute or value that Holochart doesn't have is ignored with a console warning, and the
chart still draws. Set `config.strict: true` while migrating to turn those warnings into
[errors](/reference/errors).

## What is missing

Not available in Holochart:

- **Maps and geographic charts**: `scattergeo`, `choropleth`, `scattermap`, `choroplethmap`,
  `densitymap`, and the `layout.geo` and `layout.map` subplots.
- **Ternary, Smith and carpet plots**: `scatterternary`, `scattersmith`, `carpet`,
  `scattercarpet`, `contourcarpet`.
- **`quiver`** traces.
- **Vector export**: `toImage` makes PNG, JPEG and WebP images, not SVG.
- **LaTeX** (`$…$`) in text, and non-Gregorian **calendars** (`xcalendar`, `layout.calendar`).
- **Element ids** as the first argument, and data on the element (`gd.data`).

The [compatibility table](/reference/plotly-compat) lists every trace type, attribute, layout
key and config option, and the [known deviations](/reference/plotly-compat#known-deviations)
where Holochart draws or behaves differently on purpose.

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

## Saved figures

A figure saved from Plotly as JSON loads as it is. `fromJSON(el, json)` creates the chart, and
decodes the base64 typed arrays (`{ dtype, bdata }`) that plotly.py writes:

```ts
import { fromJSON } from '@mk7s/holochart';

const chart = fromJSON(el, await (await fetch('/figures/sales.json')).text());
await chart.ready;
```

## What Holochart adds

Plotly ignores these, so a figure that uses them still loads there, without them:

- [3D-native options](/customization/extrusion-2-5d) for 2D charts: extruded bars, pies and
  treemaps, and a tilted 2.5D view.
- [Materials, lighting and shadows](/customization/materials-lighting) in 3D scenes.
- [Style rules and style functions](/fundamentals/conditional-styling) for conditional styling.
- [Custom marker symbols and image markers](/customization/custom-markers).
- The [`bar3d`](/charts/3d/bar3d) trace.
- [Accessibility](/guides/accessibility): a screen-reader description, data tables and keyboard
  navigation on every chart.
