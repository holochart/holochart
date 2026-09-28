---
title: Per-point styling, style rules & style functions
description: Style individual points with arrays, serializable style rules, or JavaScript functions, and when to use each.
status: complete
---

# Per-point styling, style rules & style functions

A trace attribute usually takes one value for the whole trace: `marker: { color: 'red' }`. Many
attributes also take **one value per point**. Holochart gives you three ways to set them:

- **Per-point arrays**: you compute the values yourself and pass an array, as in Plotly.
- **Style rules** (`styleRules`): conditions and values written as plain JSON, such as "points
  with `y > 10` are gold".
- **Style functions**: a JavaScript function in place of the array, called once per point.

All three end up as the same thing: a plain array with one value per point, which the trace draws
the same way whichever way you wrote it. This page covers per-point arrays in depth, shows how
the three combine, and helps you choose. The full syntax of rules and functions is on the
[Conditional styling](/fundamentals/conditional-styling) page.

## Per-point arrays

An attribute that accepts an array of values is an **`arrayOk`** attribute. In the
[attribute reference](/reference/attributes/scatter), its "Array OK" row reads "yes (one value per
point)". Give it an array as long as the trace's data, and point `i` takes item `i`:

<Example id="recipes/ranked-bars" />

```ts
const sources = ['Other', 'Podcasts', 'Paid ads', 'Social networks', 'Search'];
const share = [1.7, 2.4, 5.2, 14.1, 38.2];

createChart(el, {
  data: [
    {
      type: 'bar',
      orientation: 'h',
      y: sources,
      x: share,
      marker: {
        // One color per bar: highlight one category, mute the rest.
        color: sources.map((s) => (s === 'Social networks' ? '#ea2a37' : '#3e4258')),
      },
    },
  ],
});
```

### Which attributes take arrays

Each trace type lists its own `arrayOk` attributes. The common ones on `scatter` and `bar`:

| Attribute                                                | Per point                                                         |
| -------------------------------------------------------- | ----------------------------------------------------------------- |
| `marker.color`                                           | CSS colors, or numbers mapped through the colorscale              |
| `marker.size`                                            | Marker size in px (scatter)                                       |
| `marker.symbol`, `marker.angle`, `marker.image`          | Shape, rotation in degrees, image sprite (scatter)                |
| `marker.opacity`                                         | Opacity, multiplied by the trace `opacity`                        |
| `marker.line.color`, `marker.line.width`                 | Outline color and width of each marker or bar                     |
| `text`, `hovertext`, `texttemplate`, `textposition`      | Labels and where they sit                                         |
| `textfont.color`, `textfont.size`, `textfont.family`     | The font of each label                                            |
| `width`, `base`, `offset`, `marker.pattern.shape` (bars) | Bar width, start and position, and [patterns](./markers-patterns) |

Attributes that shape the whole trace take one value: `mode`, `type`, the trace `opacity`, and the
connecting line of a scatter trace (`line.color`, `line.width`, `line.dash`). For outlines that
vary per point, use `marker.line.width` and `marker.line.color`.

### Colors: strings or numbers

`marker.color` takes an array of CSS colors, or an array of numbers. Numbers are mapped through
`marker.colorscale` (with `cmin`, `cmax`, `cmid` and an optional colorbar). On scatter markers the
mapping runs on the GPU: each point stores its number, and the shader looks its color up in the
colorscale. Use numbers when the color encodes a quantity:

<Example id="scatter/colorscale" />

An array can mix both: CSS colors among the numbers are drawn as given, and only the numbers go
through the colorscale (as in Plotly). A [style rule](#style-rules) that sets a color on a
colorscaled trace gives such an array, so highlights keep their color over a colorscale:

<Example id="scatter/style-rules-colorscale" />

```ts
const n = 40;
const x = Float64Array.from({ length: n }, () => Math.random() * 10);
const y = Float64Array.from({ length: n }, () => Math.random() * 10);
const population = Float64Array.from({ length: n }, () => 5 + Math.random() * 95);
const growth = Float64Array.from({ length: n }, (_, i) => (x[i] ?? 0) * 0.8);

createChart(el, {
  data: [
    {
      type: 'scatter',
      mode: 'markers',
      x,
      y,
      marker: {
        size: population, // one size per point
        sizemode: 'area',
        sizeref: (2 * 100) / 40 ** 2,
        color: growth, // numbers: mapped through the colorscale
        colorscale: 'Viridis',
      },
    },
  ],
});
```

See [Colors & colorscales](/fundamentals/colors-colorscales) for color formats, colorscales and
colorbars.

### Symbols, angles and labels

Every marker attribute takes an array the same way. Here the cloud of markers cycles through five
symbols, one per point:

<Example id="scatter/basic" />

```ts
const symbols = ['circle', 'square', 'diamond', 'triangle-up', 'x'];

const trace = {
  type: 'scatter',
  mode: 'markers',
  x: [1, 2, 3, 4, 5, 6],
  y: [3, 1, 4, 1, 5, 9],
  marker: {
    size: 9,
    symbol: [0, 1, 2, 3, 4, 5].map((i) => symbols[i % symbols.length]),
    angle: [0, 15, 30, 45, 60, 75],
  },
};
```

Labels work the same way: `text`, `textposition` and each `textfont` field take one value per
point.

<Example id="scatter/text-labels" />

### Typed arrays and datasets

Numeric per-point attributes (`marker.size`, `marker.opacity`, `marker.line.width`, numeric
`marker.color`) accept typed arrays such as `Float64Array` as well as plain arrays. Arrays are
kept by reference: a million-point array is not copied or checked item by item when you pass it.
Items that can't be drawn (a string that isn't a color, a missing number) are handled when the
trace draws, and fall back to a default.

With [datasets](/fundamentals/data-formats), a per-point attribute can name a column instead of
holding an array: `marker: { color: '@region', size: '@population' }`. This works on attributes
where the `'@…'` string is not a valid value itself, so `text: '@name'` stays the text `@name`.

### Updating arrays

`chart.restyle` takes one value per listed trace, so wrap a per-point array in another array:

```ts
const colors = ['#ef4444', '#3e4258', '#3e4258', '#3e4258'];
await chart.restyle({ 'marker.color': [colors] }, 0);
```

A new color, symbol, opacity or outline array only restyles: the trace keeps its positions and
re-uploads the changed values. A new `marker.size` array recomputes the trace, since marker sizes
widen the axis autorange. See
[Core concepts](/getting-started/core-concepts#updates-and-edit-types) for edit types.

## Style rules

When the values follow from the data by a condition, you can describe the condition instead of
computing the array. `styleRules` is a list of `{ when, set }` rules: points matching `when` get
the per-point values in `set`, over the trace's own value. Rules are plain JSON, so they survive
`chart.toJSON()`, can be stored or sent from a server, and are validated like the rest of the
figure:

<Example id="scatter/style-rules" />

```ts
const n = 400;
const x = Float64Array.from({ length: n }, (_, i) => i);
const y = Float64Array.from({ length: n }, (_, i) => Math.sin(i / 40) * 1.2);

createChart(el, {
  data: [
    {
      type: 'scatter',
      mode: 'markers',
      x,
      y,
      marker: { size: 5, color: '#64748b' },
      styleRules: [
        { when: { y: { gt: 1 } }, set: { 'marker.color': '#ef4444', 'marker.size': 10 } },
        { when: { pointNumber: { lt: 10 } }, set: { 'marker.color': '#facc15' } },
      ],
    },
  ],
});
```

Conditions test any per-point field (`y`, `text`, `customdata[1]`, `marker.size`, `pointNumber`)
with operators such as `gt`, `between`, `in` and `regex`, combined with `and`, `or` and `not`.
Later rules win. The operators, how rules merge and how mistakes are reported are covered in
[Conditional styling: style rules](/fundamentals/conditional-styling#style-rules).

## Style functions

A style function goes where the array would, and returns the value of one point. It is called
with the point (its value in each data array, such as `p.x`, `p.y` and `p.customdata`), its index
and the trace:

<Example id="bar/style-functions" />

```ts
createChart(el, {
  data: [
    {
      type: 'bar',
      x: ['Jan', 'Feb', 'Mar', 'Apr'],
      y: [12, -8, 31, -2],
      marker: { color: (p: { y: number }) => (p.y < 0 ? '#ef4444' : '#10b981') },
      text: (p: { y: number }, i: number) => (i % 2 === 0 ? `${p.y}` : ''),
    },
  ],
});
```

A function behaves exactly like the array of its results, but it can't be saved as JSON:
`chart.toJSON()` stores the evaluated array instead, with a warning. See
[Conditional styling: style functions](/fundamentals/conditional-styling#style-functions).

## Combining them

A trace can use all three at once, on the same or different attributes. They apply in this
order:

1. **Functions** are evaluated first, on the trace as you gave it. The result replaces the
   function, as if you had passed that array.
2. **Defaults** fill what you left out: the template, the colorway color, attribute defaults.
3. **Rules** apply last, over the result: a rule's `set` replaces the value of the points it
   matches, and every other point keeps its array, function or default value.

So a rule wins over an array or a function on the points it matches. Conditions see the values of
step 2: `when: { 'marker.size': { gt: 30 } }` tests the sizes a function returned. In the bar
example above, a function colors the bars and a rule outlines the best months:

```ts
const trace = {
  type: 'bar',
  x: ['Jan', 'Feb', 'Mar', 'Apr'],
  y: [12, -8, 42, -2],
  marker: {
    color: (p: { y: number }) => (p.y < 0 ? '#ef4444' : '#10b981'),
    line: { color: '#facc15', width: 0 },
  },
  styleRules: [{ when: { y: { gte: 40 } }, set: { 'marker.line.width': 3 } }],
};
```

## How points reach the GPU

Markers, bars and other instanced shapes are drawn in one draw call per trace, and each shape
already stores its own copy of every style value: color, size, outline, symbol, opacity, angle.
A single value is written into every point's slot. A per-point array costs no more to draw than
a single value.

What differs is the work on the CPU before the values reach the GPU:

- **Numeric arrays** (sizes, widths, opacities) are copied into the GPU buffers as floats.
- **Numeric colors** on scatter markers are stored as numbers and mapped to colors in the shader,
  through the colorscale. Other traces map them on the CPU, and so do scatter markers whose
  colors mix CSS colors among the numbers.
- **CSS color strings** are parsed once per point each time the colors change. For a million
  points with colors that encode a value, numbers and a colorscale are cheaper than strings.
- **Mixed symbols** switch the marker shader to its general version. A trace whose markers share
  one symbol (and have no rotation or outline) gets a leaner shader. The pixels are the same.

The buffers are split by kind (positions, sizes, fill colors, outline colors, other styles), so a
restyle re-uploads only the buffers whose values changed.

## When to use which

| Option          | Serializable                  | Cost                                                                    | Best for                                                                   |
| --------------- | ----------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Per-point array | Yes (typed arrays compactly)  | None beyond drawing: goes straight to the trace                         | Values you already have, or compute once; large data; Plotly compatibility |
| `styleRules`    | Yes, as plain JSON            | One compiled test per rule and point; loads the style code on first use | Highlights from thresholds, categories, dates or labels that must be saved |
| Style function  | No: saved as evaluated arrays | One JavaScript call per point, whenever the trace changes               | Anything a function can compute (scales, lookups, formatting) in app code  |

Some guidance:

- **Start with arrays** when you already compute per-point values in your own code, or the data
  is large. They are what Plotly figures use, so they move between Holochart, plotly.js and
  plotly.py unchanged.
- **Use `styleRules`** when the figure is stored, shared or built on a server: a dashboard saved
  as JSON, a figure spec sent over the wire. Rules also keep working when the data changes, with
  no code to re-run: new `y` values are tested against the same conditions.
- **Use a function** for logic that doesn't fit a condition (a lookup table, a computed scale, a
  formatted label) in an app that doesn't need to save the figure.

Rules and functions are resolved when their trace changes, and cached: zoom, pan, hover and layout
updates reuse the arrays already computed. The code that runs them is loaded the first time a
figure uses one, so charts that only use arrays never download it. The numbers behind this are in
[Conditional styling: performance](/fundamentals/conditional-styling#performance).

See also [Customization](/customization/) for the other layers of styling, from themes to shader
hooks, and [Custom markers](/customization/custom-markers) for symbols and image sprites of your
own.
