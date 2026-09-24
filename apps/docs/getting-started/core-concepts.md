---
title: Core concepts
description: The figure model, the attribute schema, defaults, updates, coordinate systems, and the rendering pipeline.
status: complete
---

# Core concepts

This page explains the ideas the rest of the docs build on. If you know Plotly, most of it will be
familiar: Holochart follows Plotly's figure model and attribute names wherever reasonable.

## The figure

A chart is described by a **figure**, a plain object with four parts:

```ts
const figure = {
  data: [{ type: 'scatter', x: [1, 2, 3], y: [4, 1, 7] }], // traces
  layout: { title: { text: 'Hello' } }, // axes, subplots, components
  config: { responsive: true }, // per-chart behavior
  frames: [], // animation frames
};
```

A figure is data, not code. It serializes to JSON and back, so you can store it, send it over the
network, or generate it on a server.

### Traces

`data` is a list of **traces**. A trace is one data series drawn one way. Its `type` picks the
trace type (`scatter`, `bar`, `pie`, ...), and the other attributes depend on that type. A line
chart is a `scatter` trace with `mode: 'lines'`, as in Plotly. See
[Traces & trace types](/fundamentals/traces) and the [chart types](/charts/) overview.

### Layout

`layout` holds everything that is not a trace:

- **Axes**: `xaxis`, `yaxis`, `xaxis2`, and so on, with range, type (linear, log, date,
  category), ticks, and titles.
- **Subplots**: each pair of axes forms a subplot. Axis `domain` places it in the figure.
- **Components**: title, legend, colorbars, annotations, shapes, hover labels, and the modebar.
- **Figure-wide style**: size, margins, fonts, colorway, and the template.

Positions in layout use **paper** coordinates (0 to 1 across the plot area) or **domain**
coordinates (0 to 1 within one subplot). See [Coordinate systems](#coordinate-systems) below.

### Config

`config` controls how one chart behaves, not how it looks: `responsive`, `scrollZoom`,
`displayModeBar`, `locale`, `pixelRatio`, `strict`, and so on. Config is not part of the visual
state, so the same figure can be shown with different config in different places. See the
[config reference](/reference/config).

### Frames

`frames` is a list of named figure snapshots for animation. `chart.animate('frame-2')` will
transition the chart to a frame; frame animation is planned for M3, so `frames` is not used yet.
See [Transitions & animation](/fundamentals/transitions-animation).

## The schema is the source of truth

Every attribute of every trace, of layout, and of config is declared once in a schema. Each
declaration records:

- `type`: the value type, such as `number`, `color`, `enumerated`, `flaglist`, or `data_array`
- `dflt`: the default value
- `editType`: which pipeline stages must re-run when it changes
- `arrayOk`: whether it accepts a per-point array as well as a single value
- `description`: the documentation text

TypeScript types, runtime validation, defaults, and the [attribute reference](/reference/) are all
generated from these declarations, so they cannot drift apart. The whole schema is published as
[plot-schema.json](/plot-schema.json) for editors and tools.

Invalid values are coerced where it is safe (numeric strings become numbers, colors are
normalized) and reported otherwise. Unknown attributes produce a warning with a "did you mean"
suggestion. Set `config.strict: true` to throw on the first error instead.

## Defaults, fullData, and fullLayout

You only write the attributes you care about. Before drawing, Holochart fills in every other
attribute from the schema defaults and the template. The result is `fullData` and `fullLayout`: a
complete version of your figure where every attribute has a value. Later stages read only these,
never your input.

Some defaults are conditional. For example, `marker.*` attributes exist on a scatter trace only
when `mode` includes `markers`.

## Templates

A **template** is a reusable set of defaults: layout values plus per-trace-type values. Set it
with `layout.template`, either by name or as an object:

```ts
// By name
const layout = { template: 'plotly_dark' };

// As an object
const branded = {
  template: {
    layout: { font: { size: 11 } },
    data: { scatter: [{ marker: { size: 8 } }], bar: [{ marker: { cornerradius: 4 } }] },
  },
};
```

Without `layout.template`, charts use `holochart`, Holochart's dark default look. A template you
set replaces it; `'plotly-classic'` gives Plotly's look. Named templates can be combined, as in
`'plotly_white+presentation'`, and [15 are built in](/customization/themes-templates). Values you
set on a trace or in layout always win over the template. Templates are the second layer of the
[customization cascade](/customization/), right above the schema defaults.

## Updates and edit types

Charts change after they are created. There are three ways to change them:

| Method                              | Plotly equivalent | Use it to                                   |
| ----------------------------------- | ----------------- | ------------------------------------------- |
| `chart.update(patch, { traces })`   | `restyle`         | Change trace data or style                  |
| `chart.relayout({ 'path': value })` | `relayout`        | Change layout: axes, titles, components     |
| `chart.react(figure)`               | `react`           | Pass a whole new figure; only diffs applied |

Each attribute's `editType` tells the update planner which stages a change affects. Changing
`marker.color` only restyles. Changing `x` recomputes that trace. Changing `xaxis.range`
recomputes ticks and redraws. You never choose the stages yourself. See
[Updating charts](/fundamentals/updating-charts).

## Coordinate systems

Positions in a figure are expressed in one of these spaces:

| Space      | Range                                    | Used by                                           |
| ---------- | ---------------------------------------- | ------------------------------------------------- |
| **Data**   | Raw values: numbers, dates, categories   | Trace coordinates, annotations with `xref: 'x'`   |
| **Domain** | 0 to 1 within one subplot's plot area    | `xref: 'x domain'`, axis `domain`                 |
| **Paper**  | 0 to 1 within the whole plot area        | Legend, title, `xref: 'paper'`                    |
| **Pixel**  | CSS pixels from the container's top left | Hover and click events, marker sizes, line widths |

3D scenes add a world space, the scene units after aspect-ratio normalization.

## The rendering pipeline

Every render goes through the same stages:

1. **Validate**: coerce values and report errors against the schema.
2. **Defaults**: merge the template and fill in defaults, producing `fullData` and `fullLayout`.
3. **Calc**: per-trace computation such as stacking, binning, and statistics.
4. **Layout**: subplot domains, autorange, ticks, and margins.
5. **Scene**: each trace builds or updates its GPU objects.
6. **Render**: draw the frame. Frames render only when something changed.
7. **Interaction**: hover, click, zoom, and selection produce events and updates.

The first four stages are pure functions with no WebGL, which is why they can run in tests and,
later, in a Web Worker. An update re-enters the pipeline at the earliest stage its edit type
requires.

All subplots of a figure share one canvas and one WebGL context. Each subplot draws into its own
viewport region.

## Escape hatches

The figure covers most needs. When it does not, the three.js objects are available directly:

```ts
chart.three.scene; // the THREE.Scene
chart.three.renderer; // the WebGLRenderer
chart.getTraceObjects(0); // the objects trace 0 created

chart.on('beforerender', ({ frame, delta }) => {
  // runs before each rendered frame; change chart.three.scene here
});
```

Changes made this way are not part of the figure and are not serialized. See
[Adding your own three.js objects](/customization/three-objects).
