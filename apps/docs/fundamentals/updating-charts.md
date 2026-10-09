---
title: Updating charts
description: Change a chart after it is created with restyle, relayout, update, react, the trace list functions and streaming appends, and know what each update costs.
status: complete
---

# Updating charts

A chart keeps the figure it draws. To change the chart, you edit that figure through the chart:
each call says what changed, and Holochart re-runs only the pipeline stages that change needs.
This page covers every update call, what it costs, and when its promise settles.

[Core concepts](/getting-started/core-concepts#updates-and-edit-types) has the short version.

## The calls

Every update exists as a method of the [`Chart`](/reference/api/holochart-runtime/classes/Chart)
object. Most also exist as a Plotly-style function that takes the chart's element first.

| Chart method                                                 | Function                                           | What it does                                         |
| ------------------------------------------------------------ | -------------------------------------------------- | ---------------------------------------------------- |
| `chart.restyle(update, traces?)`                             | `restyle(el, update, traces?)`                     | Sets trace attributes by path                        |
| `chart.relayout(update)`                                     | `relayout(el, update)`                             | Sets layout attributes by path                       |
| `chart.updateAttributes(traceUpdate, layoutUpdate, traces?)` | `update(el, traceUpdate?, layoutUpdate?, traces?)` | A `restyle` and a `relayout` in one step             |
| `chart.update(patch, { traces })`                            | none                                               | Deep-merges a partial figure into the current one    |
| `chart.react(figure)`                                        | `react(el, figure)`                                | Takes a whole new figure and applies the differences |
| `chart.addTraces(traces, newIndices?)`                       | `addTraces(el, traces, newIndices?)`               | Adds traces                                          |
| `chart.deleteTraces(indices)`                                | `deleteTraces(el, indices)`                        | Removes traces                                       |
| `chart.moveTraces(current, newIndices?)`                     | `moveTraces(el, current, newIndices?)`             | Reorders traces                                      |
| `chart.extendTraces(update, indices, maxPoints?)`            | `extendTraces(el, update, indices, maxPoints?)`    | Appends points                                       |
| `chart.prependTraces(update, indices, maxPoints?)`           | `prependTraces(el, update, indices, maxPoints?)`   | Inserts points at the start                          |
| `chart.resize()`                                             | none                                               | Measures the container again and lays the chart out  |

`chart.update` is not Plotly's `update`. Plotly's `update` is the `update` function, or
`chart.updateAttributes`. `chart.update` is Holochart's own call; see
[Merging a partial figure](#merging-a-partial-figure).

You get the chart object from `createChart`, from the promise of `newPlot`, or from the element
with `getChart(el)`:

```ts
import { getChart, newPlot, restyle } from '@mk7s/holochart';

const plotted = await newPlot(el, data, layout);
await plotted.restyle({ 'marker.color': 'crimson' });
await getChart(el)?.relayout({ 'title.text': 'Updated' });

// The same restyle, addressed by element.
await restyle(el, { 'marker.color': 'crimson' });
```

The functions look the chart up in the element. When the element has no chart, they reject with
`restyle: no chart in this element; call newPlot(el, …) first` (with their own name in front).
`react` is the exception: it creates the chart when there is none.

All of these return a promise that resolves with the chart once the change is drawn. See
[Batching and promises](#batching-and-promises).

## Attribute paths

`restyle` and `relayout` address attributes with **paths**: the attribute's keys joined with
dots, and array items in square brackets.

| Path                    | Addresses                                |
| ----------------------- | ---------------------------------------- |
| `'marker.color'`        | `marker: { color }` of a trace           |
| `'marker.line.width'`   | `marker: { line: { width } }` of a trace |
| `'xaxis.range'`         | `xaxis: { range }` of the layout         |
| `'xaxis.range[0]'`      | The first entry of that range            |
| `'annotations[2].text'` | The text of the third annotation         |

The attribute reference uses the same paths as anchors, for example
[`/reference/scatter#marker.color`](/reference/scatter#marker.color).

Three rules hold for every path edit:

- `null` resets the attribute to its default by removing it from the figure. `undefined` is
  ignored.
- A path that names a container replaces the whole container.
  `relayout({ xaxis: { range: [0, 1] } })` drops every other `xaxis` setting. Use
  `'xaxis.range'` to change one attribute, or [`chart.update`](#merging-a-partial-figure) to
  merge.
- The objects you passed to the chart are never mutated. An edit copies the containers along its
  path, so `chart.data` and `chart.layout` change and your original figure does not.

A malformed path (`'marker..color'`, `'[0].x'`) rejects the call with
`Invalid attribute path '…'`.

## Changing traces: `restyle`

```ts
// One value for every trace.
await chart.restyle({ 'marker.color': 'crimson' });

// Traces 0 and 2 only.
await chart.restyle({ 'line.width': 3, opacity: 0.6 }, [0, 2]);

// An array holds one value per listed trace: trace 0 turns red, trace 1 blue.
await chart.restyle({ 'marker.color': ['red', 'blue'] }, [0, 1]);

// So a data array goes inside an outer array.
await chart.restyle({ y: [[4, 1, 7]] }, 0);
await chart.restyle({ 'marker.color': [['red', 'green', 'blue']] }, 0); // one color per point

// A typed array is one value. It goes to every listed trace as it is.
await chart.restyle({ y: new Float64Array([4, 1, 7]) }, 0);

// null resets to the default.
await chart.restyle({ 'marker.color': null });
```

- `traces` is one index or a list. Negative indices count from the end. Without it, the update
  applies to every trace.
- A plain array value is spread over the listed traces, as in Plotly: entry `k` goes to the
  `k`-th listed trace, and a shorter array repeats. `restyle({ y: [4, 1, 7] }, 0)` therefore
  sets `y` to the number `4`, which is not a data array: the console shows
  `[holochart] data[0].y: invalid value 4; expected an array or typed array (ignored)`. Wrap
  data arrays.
- An `undefined` entry in the array skips that trace.
- An index outside the trace list rejects with a `RangeError`, and nothing is changed.

## Changing the layout: `relayout`

```ts
await chart.relayout({ 'title.text': 'Revenue', 'xaxis.range': [0, 10] });
await chart.relayout({ 'xaxis.range[1]': 20 }); // one end of the range
await chart.relayout({ 'xaxis.autorange': true }); // back to autorange
await chart.relayout({ 'annotations[0].text': 'Peak', showlegend: false });
```

Setting an axis range has two side effects, as in Plotly:

- `'xaxis.range'`, `'xaxis.range[0]'` or `'xaxis.range[1]'` also sets `'xaxis.autorange'` to
  `false`, unless the same update sets `autorange` itself.
- Setting one end of an axis that has no `range` in the figure yet fills the other end from the
  range the axis shows at that moment.

The `relayout` event reports the edits that were applied, including the implied ones. For the
first call above its payload is
`{ 'title.text': 'Revenue', 'xaxis.range': [0, 10], 'xaxis.autorange': false }`.

To return to autorange, set `'xaxis.autorange': true`. A `range` left in the figure is then
ignored.

`update(el, traceUpdate, layoutUpdate, traces?)` and
`chart.updateAttributes(traceUpdate, layoutUpdate, traces?)` do a `restyle` and a `relayout`
together.

<Example id="controls/buttons" :height="400" />

The buttons in this example run the same calls. The row on top restyles `visible`, with one
value per trace. The column on the right relayouts `yaxis.type`. See
[Buttons, dropdowns & sliders](/fundamentals/controls).

## Merging a partial figure

`chart.update(patch, { traces })` takes a piece of a figure and merges it into the current one.
You write nested objects instead of paths:

```ts
await chart.update(
  {
    data: [{ marker: { color: 'crimson' } }],
    layout: { xaxis: { title: { text: 'Week' } } },
  },
  { traces: [2] },
);
```

- Nested objects merge. Arrays and every other value replace what was there. `null` resets to
  the default.
- `patch.data[k]` goes to the `k`-th index in `traces`. Without `traces`, `patch.data[i]` goes
  to trace `i`. A `null` entry skips its trace.
- Arrays are not spread over traces here, so data arrays are written plainly:
  `chart.update({ data: [{ y: [4, 1, 7] }] })`.
- `patch.config` merges into the config and re-creates the chart's renderer, like any config
  change.

There is no function form of `chart.update`.

## Passing a whole figure: `react`

`react` takes the complete figure you want and works out what changed. It suits code that
derives the figure from application state, such as a framework component
(see [Framework integration](/guides/frameworks)).

```ts
import type { Figure } from '@mk7s/holochart';

const x = [1, 2, 3];
const y = [4, 1, 7];

function view(title: string): Figure {
  return {
    data: [{ type: 'scatter', uid: 'sales', x, y }],
    layout: { title: { text: title }, xaxis: { range: [0, 4] } },
  };
}

await chart.react(view('Sales'));
// Only the title differs. x and y are the same arrays, so the trace is not recalculated.
await chart.react(view('Sales, week 12'));
```

The function form accepts Plotly's two call styles, `react(el, data, layout?, config?)` and
`react(el, figure)`.

### How figures are compared

- **Data arrays compare by reference.** A data array, an array given to a per-point attribute
  such as `marker.color`, and a dataset column count as unchanged when they are the same array
  object. Their contents are never read, so the comparison costs the same for ten points and
  for ten million.
- **Everything else compares by value.** A fresh `range: [0, 4]` literal on every call is not a
  change.
- **Only the input is compared.** If you mutate a trace or layout object the chart already has
  and pass it again, `react` sees no difference. Pass new objects for what changed.
- **Nothing changed means nothing happens.** The promise resolves without a pipeline run or a
  frame.
- **`config` compares by value, and a change re-creates the renderer.** A figure without
  `config` after one with `config` is a change. Pass the same config every time.
- **`frames` are kept** unless the new figure brings its own.

### Data mutated in place

Appending to an array in place and calling `react` changes nothing on screen, because the array
is the same object. Either pass a new array, or change `layout.datarevision`: when its value
differs from the previous figure's, every data array counts as changed.

```ts
const x = [1, 2, 3];
const y = [4, 1, 7];
let revision = 0;

function draw() {
  return chart.react({
    data: [{ type: 'scatter', x, y }],
    layout: { datarevision: revision },
  });
}

await draw();
x.push(4);
y.push(9);
await draw(); // not redrawn: same arrays, same revision
revision += 1;
await draw(); // every trace is recalculated
```

For appending points, [`extendTraces`](#streaming-appends) is the cheaper call. Holochart has
no `redraw` function; `react` with a new [`datarevision`](/reference/layout#datarevision) takes
its place.

### Matching traces

`react` matches the traces of the new figure to the ones on screen, so that a matched trace
keeps its GPU objects:

- A trace with a [`uid`](/reference/scatter#uid) matches the trace with the same `uid`,
  wherever it is in `data`.
- Traces without a `uid` match by position among themselves: the first one without a `uid`
  matches the previous first one without a `uid`, and so on.
- A matched pair whose `type` differs is treated as one trace removed and one added.

Give traces a `uid` when their order or number changes between figures. Without one, removing
the first of three traces makes the remaining two look like changed versions of the first two.
Their data arrays differ from the ones they are compared with, so both are recalculated.

### Keeping interactions with `uirevision`

A new figure normally resets what the reader did, such as a zoom. Set
[`layout.uirevision`](/reference/layout#uirevision) to keep it:

```ts
declare const latest: number[];

await chart.react({
  data: [{ type: 'scatter', y: latest }],
  layout: { uirevision: 'sales' },
});
```

The rules are Plotly's:

- Interactions are kept while `uirevision` is set and equal in the old and the new figure.
  Changing it, or leaving it out, resets them.
- An attribute the new figure sets itself wins. If the reader zoomed and the new figure brings a
  different `xaxis.range`, the figure's range is used.
- What is kept: axis ranges from zoom, pan, double-click and the range selector, the 3D camera,
  the drag and hover modes chosen in the modebar, selections, edited shapes and annotations,
  slider positions and drill-down levels.
- Edits made through the API (`restyle`, `relayout`) are not interactions. A `react` after them
  shows what the new figure says.
- Trace edits use the trace's own `uirevision` when it has one, and `layout.uirevision`
  otherwise.

Two differences from Plotly:

- Hiding or showing a trace from the legend is not kept. After `react`, each trace's `visible`
  is what the new figure says.
- Only `layout.uirevision` and a trace's `uirevision` are read. `legend.uirevision`,
  `modebar.uirevision`, `scene.uirevision` and `polar.uirevision` are accepted and have no
  effect.

### Animating the change

A figure with `layout.transition` makes `react` animate from the old figure to the new one. Only
`react` transitions; the other calls apply at once. See
[Transitions & animation](/fundamentals/transitions-animation).

## Adding, deleting and moving traces

```ts
// At the end.
await chart.addTraces({ type: 'scatter', x: [1, 2, 3], y: [2, 3, 1], name: 'Target' });

// At given positions in the new trace list.
await chart.addTraces([{ type: 'bar', x: [1, 2, 3], y: [1, 2, 2] }], [0]);

await chart.moveTraces(0); // trace 0 to the end
await chart.moveTraces([0, 1], [2, 0]); // trace 0 to index 2, trace 1 to index 0
await chart.deleteTraces([0, -1]); // the first and the last
```

- `addTraces` takes one trace or a list. `newIndices` gives each new trace its index in the
  final list; it needs one valid index per new trace, or the call rejects with a `RangeError`.
- `moveTraces` without `newIndices` moves the traces to the end.
- Negative indices count from the end in all three.
- Traces that stay keep their GPU objects. A deleted trace frees its objects at once.
- A trace whose index changed is restyled, because default colors come from the colorway by
  trace index. A trace without an explicit color changes color when it moves.

These three calls emit no event of their own, only `afterplot`.

## Streaming appends

`extendTraces` appends points to data arrays that are already in the chart. `update` maps an
attribute path to a list with one array of new values per listed trace:

```ts
// Two new points for trace 0, one for trace 1.
await chart.extendTraces({ x: [[4, 5], [4]], y: [[2, 6], [3]] }, [0, 1]);

// A rolling window: keep the last 1,000 points.
await chart.extendTraces({ x: [[6]], y: [[1]] }, [0], 1000);
await chart.extendTraces({ x: [[7]], y: [[4]] }, [0], { maxPoints: 1000 });
await chart.extendTraces({ x: [[8]], y: [[2]] }, [0], { x: [1000], y: [1000] });

// Insert at the start instead.
await chart.prependTraces({ x: [[0]], y: [[5]] }, [0]);
```

`maxPoints` limits the length of the arrays after the insert. It has three forms: a number for
every attribute and trace, the options object `{ maxPoints: n }`, or an object with the same
keys as `update` and one number per listed trace. `extendTraces` keeps the last points and drops
from the start. `prependTraces` keeps the first points and drops from the end. A negative or
non-numeric limit means no limit.

What to know:

- **Extend every array of the trace that has one value per point.** Each key is extended on its
  own: `extendTraces({ y: [[4]] }, [0])` makes `y` one longer than `x`.
- **The attribute must already hold an array.** A missing or non-array attribute rejects with
  `cannot extend missing or non-array attribute: <path>`.
- **Your arrays are not mutated.** A plain array is replaced by a new array. A typed array is
  replaced by a typed array of the same type; plain values inserted into it are converted. With
  typed arrays the chart writes into a buffer with spare room, so a steady stream allocates only
  when that room runs out.
- **Malformed arguments reject and change nothing.** The messages are Plotly's, such as
  `attribute y must be an array of length equal to indices array length`.
- **A `redraw` event follows**, with `kind` (`'extend'` or `'prepend'`), `update`, `traces` and
  `maxPoints`. It answers to `plotly_redraw` as well.

For `scatter` traces, an append converts and uploads only the new points and merges them into
the autorange. Every other trace type recalculates the edited trace. The
[performance guide](/guides/performance#streaming) lists when a scatter trace falls back to a
full recalculation.

## What an update costs

Every attribute declares an **edit type** in the schema. The update planner reads the edit types
of the changed attributes and decides what each trace has to redo. There are four levels:

| Level         | What the trace redoes                                 | Typical edits                                       |
| ------------- | ----------------------------------------------------- | --------------------------------------------------- |
| **Transform** | Sets a transform. No buffer is uploaded               | `xaxis.range`, zoom and pan, a resize, `title.text` |
| **Style**     | Rewrites colors, widths or opacity in place           | `marker.color`, `line.width`, `opacity`             |
| **Plot**      | Reads the trace again and rebuilds what it draws      | `text`, `line.shape`, `name`, `marker.maxdisplayed` |
| **Calc**      | Recalculates the trace from its data, then replots it | `x`, `y`, `marker.size`, `mode`, `visible`          |

A higher level includes the ones below it. Layout edits work the same way: `xaxis.range`
recomputes ticks and gives traces a new transform, `xaxis.type` recalculates every trace, and
`dragmode` touches no trace at all.

Some edit types of common attributes, as the schema declares them:

| Attribute                                              | Edit type                                |
| ------------------------------------------------------ | ---------------------------------------- |
| scatter `x`, `y`, `mode`, `visible`, `marker.size`     | `calc`                                   |
| scatter `text`, `line.simplify`, `marker.maxdisplayed` | `plot`                                   |
| scatter `marker.color`, `marker.symbol`, `line.color`  | `style`                                  |
| scatter `hovertemplate`                                | `none` (nothing is redrawn)              |
| heatmap `z`                                            | `calc`                                   |
| heatmap `colorscale`, `zmin`, `zmax`                   | `style`                                  |
| layout `xaxis.range`                                   | `ticks`, `plot`                          |
| layout `title.text`                                    | `layout`, `plot`                         |
| layout `width`, `height`, `margin.l`                   | `layout`                                 |
| layout `xaxis.type`, `barmode`, `template`             | `calc` (every trace)                     |
| layout `colorway`                                      | `style`, `legend` (every trace restyles) |
| layout `dragmode`, `hovermode`                         | `modebar`                                |

The attribute reference lists the edit type of every attribute, and
[plot-schema.json](/plot-schema.json) has them in machine-readable form.

Details that follow from this:

- A data edit recalculates only the edited trace. Traces that stack or group with it, such as
  bars, are stacked again. The other traces only get a new transform.
- Zoom and pan are transform-only for most traces. Lines that are decimated or drawn as splines
  rebuild their path when the zoom changes the scale; see
  [long lines](/guides/performance#long-lines).
- A path that names a container takes the edit types of everything inside it. `restyle` with
  `marker: { … }` plans a recalculation; `'marker.color'` plans a restyle.
- An attribute the schema does not know plans a recalculation.
- Hiding a trace (`visible: false` or `'legendonly'`) frees its GPU objects. Showing it again
  recalculates it and builds them again.
- Adding, deleting or moving traces runs layout again. Only new traces are calculated.
- Changing `config` re-creates the renderer and redraws everything.

You never pick the level yourself. To make an update cheap, change the smallest thing: one path
instead of a container, and data arrays only when the data changed. The
[performance guide](/guides/performance#keep-updates-small) has more.

## Batching and promises

An update call does two things. It edits the figure at once: `chart.data` and `chart.layout`
show the change as soon as the call returns. And it schedules one pipeline run in a microtask.
Calls made before that microtask share the run:

```ts
const done = Promise.all([
  chart.restyle({ 'marker.color': 'crimson' }, 0),
  chart.restyle({ y: [[4, 1, 7]] }, 1),
  chart.relayout({ 'yaxis.range': [0, 10] }),
]);

console.log(chart.layout['yaxis']); // { range: [0, 10], autorange: false }
await done; // one pipeline run and one frame for the three calls
```

`chart.fullData` and `chart.fullLayout`, the figure after defaults, change when the run
happens, not when the call returns.

**When a promise resolves.** It resolves with the chart once the result is fully drawn: the
frame is rendered, text that is typeset asynchronously (tick labels, titles, legend) has
arrived and been drawn, and layout passes that followed from measuring that text have run.
`chart.ready` is the same signal for the first draw. After the promise it is safe to take a
screenshot or call [`toImage`](/guides/export).

**When a promise rejects.**

- Bad arguments reject the call that made them: an out-of-range trace index, a malformed path,
  malformed `extendTraces` arguments. Other calls in the same batch are not affected.
- An error during the pipeline run rejects every call that shared the run. With
  `config.strict: true`, a validation error is such an error.
- Any call on a destroyed chart rejects with `holochart: this chart has been destroyed`.

**Validation of updates.** The figure is validated on `react`, on `addTraces`, and on every
update that plans a recalculation. An update that plans none, such as a color restyle, is not
validated: an invalid value falls back to the default without a warning, also in strict mode.
A rejected update is not rolled back, so `chart.data` keeps the value that failed. See
[Configuration options](/fundamentals/configuration) for strict mode.

## Events after an update

| Event       | Emitted by                                                                                  | Payload                                    |
| ----------- | ------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `restyle`   | `restyle`, the trace part of `update(el, …)` and `chart.updateAttributes`                   | `update` and `traces` (the indices it hit) |
| `relayout`  | `relayout`, the layout part of `update(el, …)`, `chart.updateAttributes` and `chart.update` | The applied edits, with implied ones       |
| `redraw`    | `extendTraces`, `prependTraces`                                                             | `kind`, `update`, `traces`, `maxPoints`    |
| `resize`    | An update that changed the figure size                                                      | `width`, `height`                          |
| `afterplot` | Every update that ran the pipeline                                                          | none                                       |

```ts
chart.on('relayout', (edits) => console.log(edits));
chart.on('afterplot', () => console.log('drawn'));
```

- Events fire after the frame of the update is rendered and before the promise resolves. The
  specific event comes first, `afterplot` last.
- Calls batched into one run give one `afterplot`.
- The trace part of `chart.update` emits no `restyle` event. `react`, `addTraces`,
  `deleteTraces` and `moveTraces` emit only `afterplot`.
- Zoom, pan and other interactions go through the same calls, so they emit `relayout` or
  `restyle` too.
- A `react` with `layout.transition` emits the transition events. `afterplot` is not emitted
  for the in-between frames of a transition.

[Events](/reference/events) has every event and payload.

## Which call to use

- **One or two attributes changed:** `restyle` or `relayout` with paths. It is the most direct
  and plans the least work.
- **A nested piece of the figure changed:** `chart.update`, to avoid writing paths.
- **The figure is derived from state:** `react`. Keep data arrays by reference, give traces a
  `uid`, and set `uirevision` to keep the reader's zoom.
- **New points arrive over time:** `extendTraces`, with `maxPoints` for a rolling window.
- **A different chart altogether:** `newPlot` on the same element destroys the old chart and
  builds a new one, with a new renderer. Prefer `react` when the chart type stays the same.

When a chart leaves the page, call `purge(el)` or `chart.destroy()`. See
[Dashboards](/guides/dashboards#always-call-purge).

## Differences from Plotly

- `chart.update(patch)` is a deep merge of a partial figure. Plotly's `update` is the `update`
  function and `chart.updateAttributes`.
- There is no `redraw` function. Use `react` with a new `layout.datarevision`.
- `extendTraces` and `prependTraces` emit `redraw`, which also answers to `plotly_redraw`.
- `extendTraces` converts plain values inserted into a typed array, where Plotly throws.
- `uirevision` does not keep legend visibility toggles, and the per-component `uirevision`
  attributes have no effect. See [above](#keeping-interactions-with-uirevision).
- Every update returns a promise that waits for text, so it can be awaited before an export.
