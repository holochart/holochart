---
title: TypeScript
description: Typed figures, traces and layouts, narrowing by trace type, partial bundles, plugins and attribute-path updates.
status: complete
---

# TypeScript

Every package ships its type declarations; no `@types` package is needed. Figures are typed from
the same attribute schemas that drive validation and the [attribute reference](/reference/), so
editors autocomplete every trace and layout attribute and show its documentation, default and
range on hover.

## Figures

`@mk7s/holochart` exports the figure types of the full bundle:

- `Figure`: `{ data, layout, config, frames, datasets }`.
- `Data`: every trace type, a union discriminated on `type` (`ScatterTrace`, `BarTrace`,
  `Scatter3dTrace`, …). A trace without `type` is a scatter trace.
- `Layout`, with the layout attributes of every trace type and component (`legend`,
  `annotations`, `barmode`, 3D `scene`, …), and `Config`.
- `Frame`, an animation frame.

`createChart`, `newPlot`, `react`, `addTraces` and `toImage` check the figures they get:

```ts
import { createChart, type Figure } from '@mk7s/holochart';

const figure: Figure = {
  data: [
    {
      x: [1, 2, 3],
      y: [2, 1, 3],
      mode: 'lines+markers',
      marker: { color: ['red', 'teal', 'gold'] },
    },
    { type: 'bar', x: [1, 2, 3], y: [1, 3, 2], yaxis: 'y2' },
  ],
  layout: {
    title: { text: 'Typed figure' },
    yaxis2: { overlaying: 'y', side: 'right' },
  },
};
createChart(el, figure);

// @ts-expect-error: 'scater' is not a trace type.
createChart(el, { data: [{ type: 'scater', y: [1, 2] }] });
```

Per-point attributes (`arrayOk` in the reference, such as `marker.color` or `text`) take one value,
an array or typed array with one value per point, a [style function](/fundamentals/conditional-styling)
or a dataset column (`'@revenue'`). Data attributes (`x`, `y`, `z`, …) take arrays, typed arrays and
dataset columns. Enumerated attributes are unions of their values, so a typo is an error, and
`mode` lists its combinations (`'lines+markers'`, …).

Layouts type the numbered subplots up to 9 (`xaxis2` … `xaxis9`, `scene2`, `legend2`, …). Further
ones (`xaxis10`, …) are accepted but not checked.

## Narrowing by trace type

Check `type` to get one trace type's attributes:

```ts
import type { Data } from '@mk7s/holochart';

function label(trace: Data): string {
  if (trace.type === 'bar') return `bars (${trace.orientation ?? 'v'})`;
  if (trace.type === 'pie') return `pie (hole ${trace.hole ?? 0})`;
  return trace.type ?? 'scatter';
}
```

`Extract<Data, { type: 'violin' }>` picks one trace type from the union, and each trace type is
exported by name (`ViolinTrace`).

## Figures built in variables

TypeScript widens the strings of an object literal that has no type yet: `{ type: 'box' }` in a
variable is `{ type: string }`, which no trace type accepts. Give the variable or the helper that
builds it a type, or use `as const` or `satisfies`:

```ts
import { createChart, type BoxTrace, type LayoutAnnotation } from '@mk7s/holochart';

const box = (name: string, y: number[]): BoxTrace => ({ type: 'box', name, y, boxmean: 'sd' });
const notes: LayoutAnnotation[] = [{ text: 'Peak', x: 3, y: 9, showarrow: true }];

createChart(el, {
  data: [box('A', [1, 2, 9]), box('B', [2, 3, 4])],
  layout: { annotations: notes },
});
```

Write `type` in the literal itself when you spread a shared object into traces: TypeScript picks
the trace type from the literal's own `type`, so `{ type: 'surface', ...common, scene: 'scene2' }`
type-checks while `{ ...common, scene: 'scene2' }` widens `scene`.

## Untyped data

Figures from untyped sources still type-check: [Express](/express/) figures, `chart.data` and
`chart.layout`, or your own `Record<string, unknown>` objects. Their contents are checked when the
chart validates them (see [configuration](/fundamentals/configuration)).

## Partial bundles and plugins

The runtime (`@mk7s/holochart-runtime`) takes any trace: a partial bundle registers only some
trace types, and plugins add their own. Its `FigureInput` types the base layout and accepts any
trace. To type a partial bundle's traces, pass the union of its trace packages, exported by each
package (`TracesBasic`, `TracesStats`, …):

```ts
import { createChart, register, type FigureInput } from '@mk7s/holochart-runtime';
import { basicTraces, type TracesBasic } from '@mk7s/holochart-traces-basic';

register(...basicTraces);
const figure: FigureInput<TracesBasic> = { data: [{ type: 'bar', y: [3, 1, 2] }] };
createChart(el, figure);
```

A trace package's types describe its traces as that package registers them. The full bundle
extends some of them (2.5D `depth` on bars, pies, treemaps, …), and the plain names are its types:
`BarTrace` is the full bundle's bar trace, and the package's own type is `BaseBarTrace`
(`BaseScatterTrace`, `BasePieTrace`, `BaseHeatmapTrace`, …). In the same way the runtime's layout
type is `BaseLayout`, the layout attributes every bundle has, and `Layout` is the full bundle's.

A plugin that registers a trace type with the full bundle adds it to `TraceTypes`, the map behind
`Data`, so figures with it type-check:

```ts
import type { CommonTraceAttributes } from '@mk7s/holochart';

declare module '@mk7s/holochart' {
  interface TraceTypes {
    sparkline: CommonTraceAttributes & { type: 'sparkline'; values?: readonly number[] };
  }
}
```

## Updates and events

`restyle` and `relayout` take attribute paths such as `'marker.color'` or `'xaxis.range[0]'`, and
`restyle`'s array values hold one value per trace, so `restyle` updates are not typed against the
traces (`AttributeUpdate`, a `Record<string, unknown>`). `relayout` types whole layout attributes
and leaves paths open:

```ts
import { relayout, restyle } from '@mk7s/holochart';

await restyle(el, { 'marker.color': 'crimson', opacity: [0.5, 1] }, [0, 1]);
await relayout(el, { 'xaxis.range[0]': 2, title: { text: 'Zoomed in' } });
```

Event payloads are typed, under their Plotly names too:

```ts
chart.on('plotly_click', (event) => {
  const point = event.points[0];
  if (point) console.log(point.curveNumber, point.pointIndex, point.x, point.y);
});
```

## Script tags

For the script-tag build, `/// <reference types="@mk7s/holochart/global" />` types the
`window.Holochart` global; import the figure types from `@mk7s/holochart` as usual.
