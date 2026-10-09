---
title: Configuration options
description: The config object — how to pass and change it, the options for size, interaction, the modebar and rendering, strict mode for development, and the options that have no effect.
status: complete
---

# Configuration options

`config` is the third part of a figure, next to `data` and `layout`. It holds settings of one
chart that are not part of what the chart shows: whether it follows its container, what the
mouse wheel and a double-click do, which modebar buttons there are, how the WebGL context is
created. The same figure can be shown with a different config in different places.

This page explains the options by topic. The [config reference](/reference/config) lists every
option with its type and default.

## Passing config

`config` is the fourth argument of `newPlot` and `react`, and a key of the figure everywhere a
figure is taken:

```ts
import { newPlot } from '@mk7s/holochart';

await newPlot(el, data, layout, { responsive: true, scrollZoom: true });

// The same chart, from a figure:
createChart(el, { data, layout, config: { responsive: true, scrollZoom: true } });
```

Config is validated and defaulted like `data` and `layout`. `chart.config` is the config you
gave, and `chart.fullConfig` is the config in use, with every default filled in. A mistyped
option is reported in the console:

```text
[holochart] config.responsve: unknown attribute 'responsve'; did you mean 'responsive'?
```

Option names are Plotly's where Plotly has the option (`scrollZoom`, `displayModeBar`). Options
that exist only in Holochart are camelCase too (`sharedRenderer`, `maxPixelRatio`). See
[Attribute names](/fundamentals/traces#attribute-names).

Templates do not apply to config, and there is no global config: every chart takes its own.

<Example id="embedding/station-widget" :height="480" />

## Changing config

A change of config re-creates the chart's renderer and redraws everything. The `Chart` object,
its listeners and its figure stay.

- `chart.update({ config: { … } })` merges the given options into the current config.
- `chart.react(figure)` replaces the whole figure, config included. A figure without `config`
  resets every option to its default, so pass the config again with each `react`:

```ts
const config = { responsive: true, scrollZoom: true };

const sales = createChart(el, { data, layout, config });
await sales.react({ data, layout: { ...layout, title: { text: 'Updated' } }, config });
```

`restyle` and `relayout` do not change config. `react` compares config by value, so an equal
config in a new object does not re-create anything. Functions are the exception: `renderHover`
and a custom button's `click` are compared by reference, so keep the same function between
`react` calls.

## Size

A chart takes the size of its element for each dimension that `layout.width` and `layout.height`
leave open. When the element has no size, the chart uses 700 × 450 px.

| Option       | Default | What it does                                                    |
| ------------ | ------- | --------------------------------------------------------------- |
| `responsive` | `false` | Follow the element: the chart resizes whenever the element does |

Without `responsive`, the chart keeps the size it was created with. There is one exception: a
chart created in an element that had no size yet, such as a closed tab or dialog, takes the
element's size once, when it first has one. `chart.resize()` measures the element again at any
time. A dimension set in `layout` never follows the element. See
[Hidden and zero-size containers](/guides/troubleshooting#hidden-and-zero-size-containers).

## Interaction

| Option             | Default            | What it does                                                     |
| ------------------ | ------------------ | ---------------------------------------------------------------- |
| `staticPlot`       | `false`            | Turn every interaction off                                       |
| `scrollZoom`       | `'scene+geo+map'`  | Which subplots zoom with the mouse wheel                         |
| `doubleClick`      | `'reset+autosize'` | What a double-click on the plot area does                        |
| `doubleClickDelay` | `300`              | The longest time between the two clicks of a double-click, in ms |
| `editable`         | `false`            | Let users drag annotations and shapes                            |
| `renderHover`      | none               | A function that builds the hover label                           |

### `staticPlot`

With `staticPlot: true` the chart has no hover, click, selection, zoom or pan, no keyboard
navigation and no modebar. The legend does not toggle traces, and range selector buttons are
disabled. The element gets `role="img"` instead of `role="figure"`; see
[Accessibility](/guides/accessibility#what-the-chart-element-gets). Updates from code still work.

### `scrollZoom`

`scrollZoom` is `true`, `false`, or kinds of subplot joined with `+`:

- `'cartesian'`: x/y subplots. A wheel step zooms the axes around the pointer. It does nothing
  when `layout.dragmode` is `false`.
- `'scene'`: [3D scenes](/fundamentals/3d-scenes#controls).
- `'geo'`: [maps](/fundamentals/maps#interactions). A wheel step zooms the map around the
  pointer, when `layout.dragmode` is `'pan'` or `'zoom'`.

The default has `'scene'` and `'geo'` and not `'cartesian'`: the wheel zooms 3D scenes and maps,
and over a cartesian chart it scrolls the page. `scrollZoom: true` turns wheel zoom on for all
of them, and `false` for none. `'map'` is accepted for Plotly compatibility; Holochart has no
tile maps. Plotly's `'gl3d'` and `'mapbox'` are not accepted: write `'scene'`.

`scrollZoom` is about the mouse wheel only. Pinch zoom on touch screens works whatever it says.

### `doubleClick`

| Value              | A double-click on the plot area                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| `'reset'`          | Returns every axis to the range it had when the figure was first drawn, or last passed to `react` |
| `'autosize'`       | Autoranges every axis                                                                             |
| `'reset+autosize'` | Resets, or autoranges when the axes are already at those ranges                                   |
| `false`            | Does nothing                                                                                      |

Axes with `fixedrange` are left alone. In the `'select'` and `'lasso'` drag modes, a
double-click clears the selection when there is one. The `doubleclick` event is emitted in every
case. In a 3D scene, a double-click returns the camera to its first view unless `doubleClick` is
`false`.

### `editable` and `edits`

`editable: true` lets users drag annotations and shapes. `edits` turns the parts on one by one,
or switches a part off while `editable` is on:

| `edits` key          | What users can do                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| `annotationPosition` | Drag the text of an annotation without an arrow, or the head of an arrow, to move the annotation's `x` and `y` |
| `annotationTail`     | Drag the text of an annotation with an arrow, to move the arrow's tail (`ax` and `ay`)                         |
| `shapePosition`      | Move and resize shapes; see [Shapes](/fundamentals/shapes-images#editing)                                      |

```ts
// Shapes can be dragged, annotations cannot.
createChart(el, {
  data,
  layout,
  config: { editable: true, edits: { annotationPosition: false, annotationTail: false } },
});
```

Each drag emits a `relayout` event with the new values.

Holochart does not support editing text in place or dragging the legend and colorbars. The
other `edits` keys of Plotly (`annotationText`, `axisTitleText`, `titleText`, `legendText`,
`colorbarTitleText`, `legendPosition`, `colorbarPosition`) are accepted and have no effect.

### `renderHover`

`renderHover` replaces the built-in hover labels with an element of your own. It is called with
the hovered points and returns an `HTMLElement`, which Holochart places beside the first point.
When it returns `null` or `undefined`, or throws, the built-in labels are shown.

```ts
import type { ChartPoint } from '@mk7s/holochart';

createChart(el, {
  data,
  layout,
  config: {
    renderHover: (points: readonly ChartPoint[]) => {
      const label = document.createElement('div');
      label.textContent = points.map((point) => `${point.x}: ${point.y}`).join(', ');
      return label;
    },
  },
});
```

A function is not JSON: `chartToJSON(chart)` leaves `renderHover` out.

## Modebar

| Option                   | Default   | What it does                                                                                                           |
| ------------------------ | --------- | ---------------------------------------------------------------------------------------------------------------------- |
| `displayModeBar`         | `'hover'` | `'hover'`: shown while the pointer is over the chart. `true`: always. `false`: never                                   |
| `modeBarButtonsToRemove` | `[]`      | Names of buttons to remove                                                                                             |
| `modeBarButtonsToAdd`    | `[]`      | Names of built-in buttons to add, and custom buttons                                                                   |
| `toImageButtonOptions`   |           | Format, file name, size and scale of the camera button's image; see [Export](/guides/export#the-modebar-camera-button) |

A chart with x/y axes gets these buttons, in three groups:

- `toImage`
- `zoom2d`, `pan2d`, and `select2d` and `lasso2d` when a trace has points that can be selected
- `zoomIn2d`, `zoomOut2d`, `autoScale2d`, `resetScale2d`

These are added by name only: `hoverClosestCartesian`, `hoverCompareCartesian`,
`toggleSpikelines`, and the drawing buttons `drawline`, `drawopenpath`, `drawclosedpath`,
`drawcircle`, `drawrect` and `eraseshape`. Charts with 3D scenes get a group of
[camera buttons](/fundamentals/3d-scenes#controls).

Names are matched without regard to case. A name that matches no button is ignored.

A custom button is an object with a `name` and a `click` function. `title` is its tooltip and
accessible name, and `icon` one of `modebarIcons`:

```ts
import { modebarIcons, type Chart } from '@mk7s/holochart';

createChart(el, {
  data,
  layout,
  config: {
    displayModeBar: true,
    modeBarButtonsToRemove: ['zoomIn2d', 'zoomOut2d'],
    modeBarButtonsToAdd: [
      'toggleSpikelines',
      {
        name: 'summer',
        title: 'Show June to August',
        icon: modebarIcons.expand,
        click: (target: Chart) => {
          void target.relayout({ 'xaxis.range': ['2025-06-01', '2025-09-01'] });
        },
      },
    ],
  },
});
```

The figure can add and remove buttons too, with
[`layout.modebar.add`](/reference/layout#modebar.add) and
[`layout.modebar.remove`](/reference/layout#modebar.remove). `layout.modebar` also holds the
modebar's orientation and colors.

Differences from Plotly:

- `displaylogo` is accepted and ignored: Holochart's modebar has no logo.
- `modeBarButtons`, which replaces the whole set in Plotly, is not supported. Use the two lists
  above.

## Rendering

| Option            | Default     | What it does                                                                          |
| ----------------- | ----------- | ------------------------------------------------------------------------------------- |
| `pixelRatio`      | `'auto'`    | Device pixels per CSS pixel: `'auto'`, or a number from 0.25 to 8                     |
| `maxPixelRatio`   | `2`         | The most that `'auto'` takes from the screen, from 0.25 to 8                          |
| `antialias`       | `true`      | Ask for an antialiased WebGL context                                                  |
| `powerPreference` | `'default'` | The GPU hint of the WebGL context: `'default'`, `'high-performance'` or `'low-power'` |
| `sharedRenderer`  | `'auto'`    | Whether the chart shares one WebGL context with other charts                          |

With `pixelRatio: 'auto'` the chart renders at the screen's `devicePixelRatio`, up to
`maxPixelRatio`, and follows it when it changes, for example when the window moves to another
screen. A number fixes the ratio. On a screen with a ratio of 3, the default renders at 2: raise
`maxPixelRatio` for full sharpness, or lower the ratio to draw fewer pixels. Image export is not
affected: [`toImage`](/guides/export) renders at its own `scale`.

`antialias` and `powerPreference` are attributes of the WebGL context, which the browser fixes
when the context is created.

`sharedRenderer` decides whether a chart gets a WebGL context of its own. Browsers keep a limited
number of contexts per page; [Dashboards](/guides/dashboards#webgl-contexts) explains the default
and when to change it.

## Locale and accessibility

| Option               | Default    | See                                                                                    |
| -------------------- | ---------- | -------------------------------------------------------------------------------------- |
| `locale`             | `'en-US'`  | [Locales](/fundamentals/locales)                                                       |
| `locales`            | `{}`       | [Per-chart locales](/fundamentals/locales#per-chart-locales)                           |
| `ariaLabel`          | `''`       | [The accessible name](/guides/accessibility#the-accessible-name)                       |
| `a11y.summaries`     | `true`     | [Generated summaries](/guides/accessibility#generated-summaries)                       |
| `a11y.dataTable`     | `'hidden'` | [Data tables](/guides/accessibility#data-tables)                                       |
| `a11y.keyboard`      | `true`     | [Keyboard access](/guides/accessibility#keyboard-access)                               |
| `a11y.patterns`      | `false`    | [Patterns as redundant encoding](/guides/accessibility#patterns-as-redundant-encoding) |
| `a11y.reducedMotion` | `'auto'`   | [Reduced motion](/guides/accessibility#reduced-motion)                                 |

## Strict mode for development

Holochart checks every figure against the attribute schema. By default, a problem in the figure
is a console warning and the chart still draws:

| Problem                                                            | What happens                                                                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Unknown attribute                                                  | Ignored. The warning suggests the nearest name                                                               |
| Invalid value                                                      | Ignored. The default is used                                                                                 |
| Unknown trace type                                                 | That trace is hidden                                                                                         |
| Unknown template name                                              | That name is skipped. With no other template, the chart gets the schema defaults, as with `template: 'none'` |
| Dataset or column that does not exist                              | The attribute falls back to its default                                                                      |
| Invalid [style rule](/fundamentals/conditional-styling#validation) | The rule is ignored                                                                                          |

This applies to `data`, `layout` and `config` alike. A value that can be converted safely, such
as the string `'0.5'` for a number, is not a problem. Each warning is logged once per attribute
path, even when several charts on the page have the same problem.

Warnings are easy to miss. With `strict: true`, the first problem makes the call fail instead:

```ts
import { newPlot, ValidationError, type Figure } from '@mk7s/holochart';

// A figure that TypeScript did not check, here parsed from JSON. `mode` should be 'lines'.
const saved = JSON.parse('{"data":[{"type":"scatter","y":[1,2,3],"mode":"line"}]}') as Figure;

try {
  await newPlot(el, { ...saved, config: { strict: true } });
} catch (error) {
  if (!(error instanceof ValidationError)) throw error;
  console.error(error.message);
  // data[0].mode: invalid value 'line'; expected any combination of 'lines', 'markers', 'text'
  // joined with '+', or 'none' (ignored)
  console.error(error.issue.path); // 'data[0].mode'
}
```

What strict mode does:

- `newPlot` rejects with a [`ValidationError`](/reference/errors#error-classes), and nothing is
  drawn. `createChart` returns the chart, and `chart.ready` rejects. `react` and the other
  update calls reject in the same way.
- The error carries the first problem as `error.issue`: its `path`, `message`, `code`, `value`,
  and a `suggestion` when there is one.
- Deprecation notices never reject. They stay warnings.
- A mistyped option in `config` rejects as well, since config is validated with the figure.

The figure is validated when the chart is created, on `react`, when traces are added, and when
an update recalculates a trace or the layout. An update that only restyles, such as a `restyle`
of `marker.color`, is not validated again: it neither warns nor rejects.

In TypeScript, a figure typed as `Figure` already fails to compile with a mistake like this one.
Strict mode is for the figures the compiler does not see: saved JSON, figures built from user
input, figures from another tool.

Turn strict mode on in development and in tests, and leave it off in production, where a bad
value in user data should cost one attribute and not the whole chart:

```ts
import { newPlot } from '@mk7s/holochart';

// Your bundler's development flag, e.g. `import.meta.env.DEV` in Vite.
declare const DEV: boolean;

await newPlot(el, data, layout, { strict: DEV });
```

To check a figure without drawing it, call `validate`. It returns every problem instead of the
first one, and needs no browser, so it runs in unit tests and in Node:

```ts
import { registry, validate } from '@mk7s/holochart';

const issues = validate(figure.data, figure.layout, registry.core, { config: figure.config });
for (const issue of issues) console.warn(`${issue.path}: ${issue.message}`);
```

`validate` does not check style rules, which the chart validates when it draws.
[Errors and warnings](/reference/errors) lists everything that warns and everything that
rejects.

## Options without effect

These options are in the schema, so they are accepted without a warning, and nothing reads them:

| Option          | Note                                                                        |
| --------------- | --------------------------------------------------------------------------- |
| `displaylogo`   | For Plotly compatibility. The modebar has no logo                           |
| `worker`        | The calc stage does not run in a Web Worker                                 |
| `textRenderer`  | Chart text is drawn with WebGL. `'dom'` does not change that                |
| `hoverRenderer` | Its only value is `'dom'`: hover labels are HTML elements over the canvas   |
| `debug`         | Nothing is logged                                                           |
| `edits`         | Every key except `annotationPosition`, `annotationTail` and `shapePosition` |

## Plotly options that are missing

A Plotly config option that Holochart does not have, such as `modeBarButtons`,
`plotGlPixelRatio`, `showTips` or `watermark`, is an unknown attribute: a console warning, or an
error in strict mode. The [compatibility table](/reference/plotly-compat#config) lists every
option of Plotly's config with its status.
