---
title: Styling & themes
description: Style charts with built-in themes, templates, colorways, and fonts, and find where a style value comes from.
status: complete
---

# Styling & themes

You can change how a chart looks at three levels: pick a **theme**, set **layout-wide defaults**
(colorway, fonts), or set **attributes** on single traces and components. This page starts with
the first two; [Customization](/customization/) covers the full cascade down to shaders.

## Pick a theme

```ts
import { createChart } from '@mk7s/holochart';

createChart(el, { data, layout: { template: 'plotly_white' } });
```

Fifteen themes are built in: Holochart's `holochart` (the default look), `holochart-dark`,
`high-contrast` and `neon`, and plotly.py's `plotly`, `plotly_white`, `plotly_dark`,
`simple_white`, `ggplot2`, `seaborn`, `presentation`, `xgridoff`, `ygridoff`, `gridon` and `none`.
Four of them, on the same figure:

<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:12px">

<Example id="themes/holochart" :height="300" />
<Example id="themes/holochart-dark" :height="300" />
<Example id="themes/plotly_white" :height="300" />
<Example id="themes/ggplot2" :height="300" />

</div>

All fifteen are shown side by side, with what each one sets, in
[Themes & templates](/customization/themes-templates).

Themes combine with `+`, later ones winning: `'plotly_white+presentation'` gives
`plotly_white` with 18 px text and thicker lines, and `'simple_white+gridon'` adds grid lines to
`simple_white`. `template: null` (or `'none'`) turns templates off.

## Where a style value comes from

Each attribute takes the first value it finds, in this order:

1. the value in your figure (`marker.color`, `layout.paper_bgcolor`, …);
2. the template's value;
3. a value derived from another attribute, e.g. axis tick labels inherit `layout.font` and a
   trace's color comes from `layout.colorway`;
4. the library default.

A theme never overrides what you set:

```ts
// plotly_dark everywhere, except a black page and 14 px text (still plotly_dark's text color)
const layout = { template: 'plotly_dark', paper_bgcolor: '#000', font: { size: 14 } };
```

`chart.fullLayout` and `chart.fullData` show the result of the cascade for every attribute.

## Colorways

`layout.colorway` is the list of colors traces get by default, in order:

```ts
import { QUALITATIVE } from '@mk7s/holochart';

// QUALITATIVE.Safe, or your own list of CSS colors
createChart(el, { data, layout: { colorway: QUALITATIVE.Safe } });
```

Every qualitative palette of plotly.py is built in (Plotly, D3, G10, T10, Alphabet, Dark24,
Light24, the ColorBrewer sets, and CARTO's Antique, Bold, Pastel, Prism, Safe and Vivid). See
[Colors, colorscales & colorbars](/fundamentals/colors-colorscales) for swatches, colorscales for
numeric data, and registering your own palettes.

## Fonts

`layout.font` is the base font. Every other text (title, axis ticks and titles, legend, colorbar,
hover labels, annotations) inherits the fields it doesn't set from it:

```ts
layout: {
  font: { family: 'Inter, sans-serif', size: 13, color: '#1f2937' },
  title: { text: 'Revenue', font: { size: 22, weight: 600 } },
  xaxis: { tickfont: { color: '#6b7280' } },
}
```

| Attribute      | Values                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------- |
| `family`       | A CSS family list. The first **registered** family is drawn (see below).                          |
| `size`         | px                                                                                                |
| `color`        | a CSS color                                                                                       |
| `weight`       | `'normal'`, `'bold'`, or 1–1000                                                                   |
| `style`        | `'normal'` or `'italic'`                                                                          |
| `variant`      | `'normal'`, `'small-caps'`, `'all-small-caps'`, `'petite-caps'`, `'all-petite-caps'`, `'unicase'` |
| `textcase`     | `'normal'`, `'upper'`, `'lower'`, `'word caps'`                                                   |
| `lineposition` | `'none'`, or `'under'`, `'over'`, `'through'` joined with `+`                                     |
| `shadow`       | `'none'`, `'auto'`, or a CSS text shadow such as `'1px 1px 2px black'`                            |

A few notes on the last four, which Plotly added in 2.x:

- `textcase: 'word caps'` capitalizes the first letter of every word, like CSS
  `text-transform: capitalize`.
- `lineposition` draws underlines, overlines and strike-through lines under the text, in the
  text color.
- `shadow` draws the first shadow of a CSS `text-shadow` list behind the glyphs (offset, blur and
  color). `'auto'` draws a thin halo in the color that contrasts with the text. The `neon` theme
  uses a shadow for its glowing title.
- `variant` is **approximated**: small and petite caps are drawn as capitals at 80% and 72% of the
  size. True small caps mix full-size and small capitals in one label, which needs rich-text runs
  (planned).

Layout measures text with the same transformations, so margins and legends fit what is drawn.

### Web fonts

Charts draw text on the GPU from font **files** (TTF, OTF or WOFF; not WOFF2), so a family must be
registered before it can be drawn. Register each face you use:

```ts
import { fonts } from '@mk7s/holochart';

fonts.register('Inter', {
  regular: '/fonts/Inter-Regular.woff',
  bold: '/fonts/Inter-Bold.woff',
  italic: '/fonts/Inter-Italic.woff',
  boldItalic: '/fonts/Inter-BoldItalic.woff',
  // Other weights: weights: { 300: '/fonts/Inter-Light.woff', 600: { normal: '…', italic: '…' } },
});
```

- A text's `weight` and `style` pick the closest registered face, with the CSS matching rules (a
  600 request uses the bold face when there is no 600).
- A `family` list is a **fallback chain**: `'"Brand Sans", Inter, sans-serif'` draws with the first
  family in the list that is registered. Unregistered names are skipped.
- Registering also adds the files as CSS font faces, so the text measurements layout uses match
  the drawn glyphs.
- Families that aren't registered at all use the default font, which you can set once with
  `configureText({ defaultFontURL })` from `@mk7s/holochart-render`. Without it, a Latin fallback
  font is loaded from a CDN, so set one for offline apps and deterministic tests.

`fonts.register` returns a function that unregisters the faces. `fonts.families()` lists the
registered families.

See also [Themes & templates](/customization/themes-templates) and
[Customization](/customization/).
