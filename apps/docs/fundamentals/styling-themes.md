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

Fifteen themes are built in: Holochart's `holochart` (the default look), `plotly-classic`
(Plotly's look), `high-contrast` and `neon`, and plotly.py's `plotly`, `plotly_white`,
`plotly_dark`, `simple_white`, `ggplot2`, `seaborn`, `presentation`, `xgridoff`, `ygridoff`,
`gridon` and `none`. (`holochart-dark` still resolves, as a deprecated alias of `holochart`.)
Four of them, on the same figure:

<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:12px">

<Example id="themes/holochart" :height="300" />
<Example id="themes/plotly-classic" :height="300" />
<Example id="themes/plotly_white" :height="300" />
<Example id="themes/ggplot2" :height="300" />

</div>

All fifteen are shown side by side, with what each one sets, in
[Themes & templates](/customization/themes-templates).

Themes combine with `+`, later ones winning: `'plotly_white+presentation'` gives
`plotly_white` with 18 px text and thicker lines, and `'simple_white+gridon'` adds grid lines to
`simple_white`. `template: null` (or `'none'`) turns templates off, the default one included.

## The default look

A chart without `layout.template` uses the `holochart` template: dark and dense, with a `#0a0a0f`
background, 9 px Helvetica Neue text in `#a4a7b5` (8 px tick labels, an 11 px title at the top
left), an eight-color colorway starting red `#ea2a37`, blue `#5e74d5`, indigo `#9962c0`, tight
margins, a horizontal legend above the plot area, and bright-on-dark automatic colorscales.
[Themes & templates](/customization/themes-templates#the-default-look) lists every value.

For Plotly's look (white background, `#444` text in Open Sans 12 px, the category10 colorway, a
vertical legend on the right), set `template: 'plotly-classic'` on a figure, or make it the
default for every chart:

```ts
import { setDefaultTemplate } from '@mk7s/holochart';

setDefaultTemplate('plotly-classic'); // once, before creating charts
```

A figure that names a template gets that template instead of the default, not on top of it.

## Where a style value comes from

Each attribute takes the first value it finds, in this order:

1. the value in your figure (`marker.color`, `layout.paper_bgcolor`, …);
2. the template's value (`holochart` unless you set `layout.template`);
3. a value derived from another attribute, e.g. axis tick labels inherit `layout.font` and a
   trace's color comes from `layout.colorway`;
4. the library default (the schema's `dflt`, which is Plotly's).

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
Light24, the ColorBrewer sets, and CARTO's Antique, Bold, Pastel, Prism, Safe and Vivid). The
default look has its own eight colors; `plotly-classic` uses D3's category10, as Plotly does. See
[Colors, colorscales & colorbars](/fundamentals/colors-colorscales) for swatches, colorscales for
numeric data, and registering your own palettes.

## Fonts

`layout.font` is the base font. Every other text (title, axis ticks and titles, legend, colorbar,
hover labels, annotations) inherits the fields it doesn't set from it:

```ts
import type { Layout } from '@mk7s/holochart';

const layout: Layout = {
  font: { family: 'Inter, sans-serif', size: 11, color: '#c9ccd6' },
  title: { text: 'Revenue', font: { size: 16, weight: 600 } },
  xaxis: { tickfont: { color: '#8b8e9a' } },
};
```

In the default look, `layout.font` is `'Helvetica Neue', Helvetica, Arial, sans-serif` at 9 px in
`#a4a7b5`, tick labels are 8 px, and the title is 11 px.

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
- Families that aren't registered at all use the default font (below).

`fonts.register` returns a function that unregisters the faces. `fonts.families()` lists the
registered families.

### Default font

Holochart ships a default font, **TeX Gyre Heros** (a free Helvetica-style family, GUST Font
License), in four faces: regular, bold, italic and bold italic. Every family that isn't registered,
such as `'Helvetica Neue', Helvetica, Arial, sans-serif`, is drawn and measured with it, so charts
look the same on every platform and work offline. Faces are loaded the first time text needs them:
a chart without text loads none, plain text loads only the regular face (about 86 kB gzipped), and
bold or italic faces load only when used. `chart.ready` waits for them.

- With a bundler (Vite, webpack, esbuild, Rollup), each face is its own lazy chunk that holds the
  font as a `data:` URL; no configuration is needed.
- With the `<script>` build, the faces are the `.otf` files in `fonts/` next to
  `holochart.iife.min.js`, fetched relative to the script. Keep that folder next to the script when
  you copy it.

To serve the font files yourself (for caching, a CDN, or a Content Security Policy without `data:`
and `blob:` sources), copy them from `@mk7s/holochart-render/fonts/` (keep
`GUST-FONT-LICENSE.txt` with them) and point Holochart at them before the first chart:

```ts
import { configureText } from '@mk7s/holochart-render'; // or Holochart.render.configureText

configureText({
  defaultFontFaces: {
    regular: '/fonts/texgyreheros-regular.otf',
    bold: '/fonts/texgyreheros-bold.otf',
    italic: '/fonts/texgyreheros-italic.otf',
    boldItalic: '/fonts/texgyreheros-bolditalic.otf',
  },
});
```

To use another font everywhere instead, register it under the family names your figures use, or
set `configureText({ defaultFontURL: '/fonts/Brand.woff' })`: one file for every weight and style
(bold and italic text then draw with that one face). Characters the font doesn't cover (such as
Cyrillic or CJK) are drawn with fallback fonts that troika loads from a CDN.

See also [Themes & templates](/customization/themes-templates) and
[Customization](/customization/).
