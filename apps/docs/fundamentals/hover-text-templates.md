---
title: Hover, text & templates
description: Hover modes and hover labels, hovertemplate and texttemplate syntax, text labels, Plotly's rich-text tags, and one label size for bars and pies with uniformtext.
status: complete
---

# Hover, text & templates

This page covers the text a chart shows: [hover labels](#hover-labels) and how to write them
with [templates](#templates), [text labels](#text-labels) on points, bars and slices, the
[rich-text markup](#rich-text) every label accepts, and
[uniform text size](#uniform-text-size).

## Hover labels

Moving the pointer over a chart shows a label for the data under it and emits a
[`hover` event](/reference/events). The layout decides which points get a label (`hovermode`);
each trace decides what its labels say (`hoverinfo`, `hovertext` or a
[`hovertemplate`](#templates)).

### Hover modes

[`layout.hovermode`](/reference/layout#hovermode) takes:

| Value                        | Labels                                                                                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'closest'` (default)        | One label, for the point nearest the pointer: `(x, y)`, then the point's text.                                                                     |
| `'x'`                        | One label per trace, for its point nearest the pointer along x. Each label shows the y value; the x value is shown once, in a label on the x axis. |
| `'y'`                        | The same along y: each label shows the x value, and the y value is shown once, beside the y axis.                                                  |
| `'x unified'`, `'y unified'` | One box for all traces: the x (or y) value as its title, then a row per trace with a color swatch and `name : value`, or the text of its template. |
| `false`                      | No hover labels. The chart then emits no `hover` and no `click` events; see [Click](/fundamentals/interaction-events#click-and-double-click).      |

- A point is hovered when it is within [`layout.hoverdistance`](/reference/layout#hoverdistance)
  pixels of the pointer (default 20; `-1` for no limit).
- x and y values are written as the axis writes its ticks, with more digits. An axis
  [`hoverformat`](/reference/layout#xaxis.hoverformat) sets another format, also for the axis
  label of the `'x'` and `'y'` modes and the title of a unified box.
- When the figure has more than one trace, the trace name is shown in a box beside the label.
  [`hoverlabel.namelength`](/reference/layout#hoverlabel.namelength) (default 15) is the number of
  characters shown: a longer name is cut and ends with `...`. `-1` shows the whole name and `0`
  none.
- Pie slices and other traces drawn without axes get one label of their own in every mode except
  `false`.
- A label sits to the right of its point, or to the left when it would leave the figure. Several
  labels are stacked so that they don't overlap.

The example uses `'x unified'` with an `xaxis.hoverformat` for the title and a `hovertemplate`
for each row:

<Example id="timeseries/unified-hover" />

Lines from the hovered point to the axes are set per axis: see
[Spike lines](/fundamentals/layout-axes-subplots#spike-lines).

### What a label says

Without a template, [`hoverinfo`](/reference/scatter#hoverinfo) lists the parts of the label,
joined with `+`:

- `'x'`, `'y'`, `'z'`, `'text'` and `'name'` are the parts of traces on axes. Pie, sunburst,
  treemap and other traces without axes have parts of their own, such as `'label'`, `'value'` and
  `'percent'`: see the trace's attribute reference.
- `'all'` shows every part. It is the default of traces on axes.
- `'none'` shows no label. The `hover` and `click` events are still emitted.
- `'skip'` takes the trace out of hover: no label, and no `hover` or `click` events for its
  points.

The text part is the point's [`hovertext`](/reference/scatter#hovertext), or its
[`text`](/reference/scatter#text) where `hovertext` is empty. Both take one string for the whole
trace or an array with one entry per point. `text` is shown on hover whether or not the trace
draws it as a [text label](#text-labels).

```ts
createChart(el, {
  data: [
    {
      type: 'scatter',
      mode: 'markers',
      x: [1, 2, 3],
      y: [4, 1, 3],
      text: ['A', 'B', 'C'],
      hovertext: ['Alpha', '', 'Gamma'],
      // Two lines per label: "4" and "Alpha", "1" and "B", "3" and "Gamma".
      hoverinfo: 'y+text',
    },
  ],
});
```

`hoverinfo` and `hovertext` can't format values or read `customdata`. For that, use a
[template](#templates).

### Label style

[`layout.hoverlabel`](/reference/layout#hoverlabel) styles every label. A trace's `hoverlabel`
overrides it for that trace, and takes arrays for one value per point.

| Attribute     | Default                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------- |
| `bgcolor`     | The color of the point. For a unified box, `layout.paper_bgcolor`.                       |
| `bordercolor` | White on a dark background, `#444` on a light one. For a unified box, `#444`.            |
| `font`        | `layout.font` at 13 px, in white on a dark background and `#444` on a light one.         |
| `align`       | `'auto'`, which aligns the lines of a label left, like `'left'`. `'right'` aligns right. |
| `namelength`  | `15`: the number of characters of the trace name that are shown.                         |
| `showarrow`   | `true`: the label has an arrow that points at its point. Set it in the layout.           |

```ts
chart.relayout({
  hoverlabel: { bgcolor: '#15151d', bordercolor: '#3e3e4c', font: { size: 12, color: '#fff' } },
});
```

The template of a [theme](/fundamentals/styling-themes) can set `hoverlabel` too.
`hoverlabel.grouptitlefont` is accepted and has no effect: the title of a unified box is drawn in
the label font, in bold.

To build the label yourself, as an HTML element, use
[`config.renderHover`](/fundamentals/configuration#renderhover).

### Hover from code

`chart.hover` shows the labels of points you name, or of a position in data units, and emits
`hover`. `chart.unhover` hides them:

```ts
// Points by trace index and point index.
chart.hover([{ curveNumber: 0, pointNumber: 2 }]);

// A position in data units, resolved with the current hovermode. `subplot` defaults to 'xy'.
chart.hover({ xval: 2.5, yval: 10 });

chart.unhover();
```

A label shown from code stays when the pointer leaves the chart, and is replaced when the pointer
moves over the plot. Its `hover` event has no `event` field.

## Templates

A `hovertemplate` replaces what `hoverinfo` builds. A `texttemplate` does the same for the
[text labels](#text-labels) a trace draws. Both are strings with variables in `%{…}`:

| In a template                          | Becomes                                                                                 |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| `%{x}`, `%{y}`                         | The value, written as the axis writes it in a hover label                               |
| `%{y:.2f}`                             | The value as a number, in a [d3-format](https://d3js.org/d3-format) format              |
| `%{x\|%b %d, %Y}`                      | The value as a date, in a [d3-time-format](https://d3js.org/d3-time-format) format      |
| `%{text}`                              | In a `hovertemplate`: the point's `hovertext`, or its `text` where `hovertext` is empty |
| `%{customdata}`                        | The point's entry in the trace's `customdata` array                                     |
| `%{customdata[0]}`, `%{customdata.id}` | An item or a key of that entry                                                          |
| `%{marker.size}`                       | An attribute of the trace; the point's entry when the attribute is an array             |
| `%{fullData.name}`                     | An attribute of the trace after defaults; `%{data.name}` reads the trace as you gave it |
| `%{meta}`, `%{meta[0]}`                | The trace's `meta`, or an item of it                                                    |
| `%{pointNumber}`, `%{curveNumber}`     | In a `hovertemplate`: the index of the point in the trace, and of the trace in `data`   |

```ts
createChart(el, {
  data: [
    {
      type: 'scatter',
      mode: 'markers',
      name: 'Stations',
      x: ['2025-03-01', '2025-03-02', '2025-03-03'],
      y: [12.25, 14.5, 9.75],
      customdata: [
        { id: 'ST-1', readings: 96 },
        { id: 'ST-2', readings: 88 },
        { id: 'ST-3', readings: 91 },
      ],
      hovertemplate:
        '<b>%{customdata.id}</b><br>' +
        '%{x|%a %d %b}: %{y:.1f} °C<br>' +
        '%{customdata.readings} readings' +
        '<extra>%{fullData.name}</extra>',
    },
  ],
});
```

- **Formats.** After `:` comes a number format: `.2f` (two decimals), `,` (thousands
  separators), `.0%` (percent), `.3s` (SI prefix: `12.3k`), `$,.2f`. After `|` comes a date
  format: `%Y-%m-%d`, `%b %d`, `%H:%M`. Dates are formatted in UTC. Besides d3's codes there are
  Plotly's `%3f` (fractional seconds, here with three digits) and `%h` (the half of the year, `1`
  or `2`). Separators and month and day names follow the chart's
  [locale](/fundamentals/locales). A number format on a value that isn't a number shows the value
  as it is.
- **Variables of the trace type.** Trace types add their own variables: pie slices have
  `%{label}`, `%{value}` and `%{percent}`, and bar labels (`texttemplate`) have `%{value}`,
  `%{label}` and `%{base}`.
- **Missing values.** A variable that has no value for the point shows `-` in a hover label and
  nothing in a scatter or bar text label.
- **Markup.** Templates may contain [rich text](#rich-text): `<b>`, `<br>`, `<span style="…">`.
- **Per point.** `hovertemplate` and `texttemplate` take an array, with one template per point.
  A point whose `hovertemplate` is empty gets the `hoverinfo` label.

### The name box

In a `hovertemplate`, the text inside `<extra>…</extra>` goes in the box beside the label, which
shows the trace name by default. `<extra></extra>` removes the box. With a `hovertemplate` the
box shows on single-trace figures too, so templates for a single trace usually end with
`<extra></extra>`.

## Text labels

`text` also draws labels on the chart:

- **Scatter**: add `'text'` to `mode` (`'markers+text'`). `textposition` places the label around
  the point (`'top center'`, `'middle right'`, …; default `'middle center'`) and `textfont` sets
  its font, both per point when given arrays. See [Scatter](/charts/basic/scatter#text-labels).
- **Bar**: `text` or `texttemplate` labels each bar. `textposition` is `'auto'` (default: inside
  when the label fits, else outside), `'inside'`, `'outside'` or `'none'`. See
  [Bar](/charts/basic/bar#labels-on-bars).
- **Pie**: `textinfo` picks the parts of each slice's label (`'label+percent'`), or
  `texttemplate` writes it. See [Pie](/charts/basic/pie#text-info-templates-and-orientation).

A `texttemplate` wins over `text`. Labels inside bars and slices shrink to fit; see
[Uniform text size](#uniform-text-size) to keep them at one size.

## Rich text

Titles, axis titles and tick labels, legend items, colorbar titles, annotations, shape labels,
trace text labels and hover labels accept the same small HTML-like markup as Plotly, so the
strings of an existing Plotly figure render the same way.

| Markup                                    | Effect                                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------- |
| `<b>…</b>`                                | bold (`<strong>` too, a Holochart addition)                                         |
| `<i>…</i>`                                | italic                                                                              |
| `<em>…</em>`                              | bold italic, as in Plotly                                                           |
| `<u>…</u>`, `<s>…</s>`                    | underline, strike-through                                                           |
| `<sup>…</sup>`, `<sub>…</sub>`            | 70% size, raised by 0.6 em / lowered by 0.3 em; they nest                           |
| `<br>`                                    | line break (`<br/>` and `<br />` too)                                               |
| `<span style="…">…</span>`                | `color`, `font-size`, `font-family`, `font-weight`, `font-style`, `text-decoration` |
| `<a href="…" target="…">…</a>`            | a link (see below)                                                                  |
| `&amp;` `&lt;` `&gt;` `&quot;` `&nbsp;` … | entities, plus numeric ones (`&#176;`, `&#x2192;`)                                  |

The named entities are `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`, `&nbsp;`, `&mu;`, `&times;`,
`&plusmn;` and `&deg;`. Any other name is shown as written: use the character itself or a numeric
entity.

Any tag can carry a `style` attribute (`<b style="color:#ea2a37">`). Styles apply to everything
inside the tag, across `<br>` line breaks. `font-size` takes `px`, `pt`, `em`, `rem` or `%`;
properties other than the six above are ignored.

The example has markup in the title and subtitle, the axis titles, the tick labels, the legend,
four annotations and a shape label:

<Example id="text/rich-text" :height="500" />

```ts
createChart(el, {
  data: [{ x: [1, 2, 3], y: [2, 3, 5], name: 'CO<sub>2</sub> <i>(ppm)</i>' }],
  layout: {
    title: { text: '<b>Rich</b> <i>text</i>, E = mc<sup>2</sup>' },
    yaxis: { title: { text: 'Forcing (W m<sup>−2</sup>)' } },
    annotations: [
      {
        x: 2,
        y: 3,
        text: 'peak: <b>3</b><br><span style="color:#ea2a37">+12%</span>',
      },
    ],
  },
});
```

Trace text works the same way: `text` and `texttemplate` of scatter, bar and pie traces, where
templates can wrap values in tags (`'<b>%{y}</b><br>%{x}'`). Here a bar `texttemplate` puts a bold
value over an italic unit, and scatter `text` mixes styles:

<Example id="text/rich-text-labels" :height="420" />

### How it is drawn

Text is drawn with WebGL (signed-distance-field glyphs). A label with mixed styles is split into
runs, one per style, which are measured with the font each run is drawn with and positioned like
Plotly's SVG `<tspan>`s; bold and italic runs use the font's bold and italic faces (the bundled
default font loads each face the first time a run needs it). Labels styled as a whole
(`<b>Total</b>`) and plain strings are drawn as one piece of text.

Hover labels are the exception: they are HTML elements placed over the canvas, built from the same
parsed markup.

### Links

`<a href="https://…">` makes the text clickable: the cursor becomes a pointer over it and a click
opens the URL in `target` (`_blank`, a new tab, by default; `_self`, `_top` or a window name
otherwise), without giving the opened page access to yours (`noopener`). Only `http:`, `https:`,
`mailto:` and relative URLs are kept; anything else (`javascript:`, `data:`, …) is drawn as plain
text without a link, as in Plotly.

Links work in titles, axes, legends, colorbars, annotations, shape labels, the text labels of
scatter, bar and pie traces, and table cells. A click on a link doesn't zoom, toggle a legend item
or emit a chart `click` event. A link in a hover label is drawn as a link but can't be clicked:
hover labels don't take pointer events.

## Uniform text size

Labels inside bars, pie slices and funnel area stages, and the labels of sunburst, treemap and
icicle traces, shrink to fit, so neighbors end up with different sizes.
[`layout.uniformtext`](/reference/layout#uniformtext) draws them all at one size per trace type
(every bar trace together, every pie trace together, and so on): the smallest size among the
labels that fit at `minsize` or more.

```ts
chart.relayout({ uniformtext: { mode: 'hide', minsize: 8 } });
```

- `mode: 'hide'`: labels that would be smaller than `minsize` are hidden; the others are drawn at
  the smallest remaining size.
- `mode: 'show'`: those labels are drawn at the uniform size anyway, even if they overflow.
- `mode: false`, the default, lets every label shrink on its own.
- `minsize` (default 0) also raises trace fonts that are smaller than it.

Both examples have `mode: 'hide'` on the left and `mode: 'show'` on the right, with a `minsize`
of 9 for the bars and 10 for the pies:

<Example id="bar/uniformtext" :height="420" />

<Example id="pie/uniformtext" :height="420" />

With `uniformtext` on, a click on a sunburst, treemap or icicle drills down without the animation.

## Differences from Plotly

- Unknown tags (`<img>`, `<script>`, `<div>`) are shown literally, never interpreted. A closing
  tag closes the innermost open tag, and stray closing tags are dropped, like Plotly.
- `<strong>` is bold and `<br/>` breaks the line; Plotly shows both as written.
- In layout text (titles, annotations, legend, axes) and in bar and pie labels, a raw newline
  (`\n`) breaks the line; Plotly shows it as a space. Scatter text labels, table cells and hover
  labels follow Plotly and only break lines at `<br>`.
- Update menu buttons, slider labels and range selector buttons show plain text: tags are removed.
  See [Controls](/fundamentals/controls#differences-from-plotly).
- Holochart does not support LaTeX (`$…$`): the text is shown as written.
- Hover labels are HTML elements over the canvas, so `toImage` and `downloadImage` don't include
  them.
- `unhover` carries an empty `points` list; Plotly sends the points that were hovered.
- Holochart does not support `layout.hoversubplots`, `layout.hoversort`, `layout.hoveranywhere`,
  `xaxis.unifiedhovertitle`, or `texttemplatefallback` on traces. Scatter and bar traces have no
  `xhoverformat` and `yhoverformat`: set the format on the axis (`hoverformat`) or in the
  template.

See also [Interaction & events](/fundamentals/interaction-events) and the
[events reference](/reference/events).
