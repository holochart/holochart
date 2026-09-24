---
title: Hover, text & templates
description: Configure hover labels and text labels, style any label with Plotly's rich-text tags, and keep bar and pie labels at one size with uniformtext.
status: draft
---

# Hover, text & templates

Every piece of text in a chart (titles, axis titles and tick labels, legend items, annotations,
shape labels, point, bar and pie labels, and hover labels) accepts the same small HTML-like
markup as Plotly, so the strings of an existing Plotly figure render the same way.

## Rich text

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

Any tag can carry a `style` attribute (`<b style="color:#ea2a37">`). Styles apply to everything
inside the tag, across `<br>` line breaks.

<Example id="_dev/richtext-components" :height="500" />

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
templates can wrap values in tags (`'<b>%{y}</b><br>%{x}'`).

<Example id="_dev/richtext-traces" :height="420" />

### How it is drawn

Text is drawn with WebGL (signed-distance-field glyphs). A label with mixed styles is split into
runs, one per style, which are measured with the font each run is drawn with and positioned like
Plotly's SVG `<tspan>`s; bold and italic runs use the font's bold and italic faces (the bundled
default font loads each face the first time a run needs it). Labels styled as a whole
(`<b>Total</b>`) and plain strings are drawn as one piece of text.

### Links

`<a href="https://…">` makes the text clickable: the cursor becomes a pointer over it and a click
opens the URL in `target` (`_blank`, a new tab, by default; `_self`, `_top` or a window name
otherwise), without giving the opened page access to yours (`noopener`). Only `http:`, `https:`,
`mailto:` and relative URLs are kept; anything else (`javascript:`, `data:`, …) is drawn as plain
text without a link, as in Plotly.

Links work in titles, axes, legends, colorbars, annotations, shape labels and trace text labels.
A click on a link doesn't zoom, toggle a legend item or emit a chart `click` event.

### Differences from Plotly

- Unknown tags (`<img>`, `<script>`, `<div>`) are shown literally, never interpreted. A closing
  tag closes the innermost open tag, and stray closing tags are dropped, like Plotly.
- In layout text (titles, annotations, legend, axes), a raw newline (`\n`) breaks the line;
  Plotly shows it as a space there. Trace text labels and hover labels follow Plotly and only
  break lines at `<br>`.
- Text with markup doesn't wrap: Plotly's SVG text doesn't either.
- LaTeX (`$…$`) is not rendered yet.

## Uniform text size

Labels inside bars and pie slices shrink to fit, so neighbors end up with different sizes.
`layout.uniformtext` draws them all at one size per trace type (every bar trace together, every
pie trace together), the smallest size any label had to shrink to:

```ts
chart.relayout({ uniformtext: { mode: 'hide', minsize: 8 } });
```

- `mode: 'hide'`: labels that would be smaller than `minsize` are hidden; the others are drawn at
  the smallest remaining size.
- `mode: 'show'`: those labels are drawn at the uniform size anyway, even if they overflow.
- `minsize` also raises trace fonts that are smaller than it.

<Example id="_dev/uniformtext-bars" :height="420" />

<Example id="_dev/uniformtext-pie" :height="420" />

## Still to come on this page

- Hover modes: `closest`, `x`, `y`, and unified hover
- `hoverinfo`, `hovertext`, and `hoverlabel` styling
- Template syntax: `%{x}`, `%{y:.2f}`, `%{x|%b %d}`, `%{customdata[0]}`, and the `<extra>` block
- Number and date format strings (d3-format and d3-time-format)
- Text labels on points and bars: `text`, `textposition`, `textfont`

See also [Interaction & events](/fundamentals/interaction-events).
