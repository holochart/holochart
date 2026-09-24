---
title: Themes & templates
description: The default look, Plotly's look, the 15 built-in themes side by side, how templates work, combining them, and building your own theme.
status: complete
---

# Themes & templates

A **template** is a set of defaults for a figure: layout values (backgrounds, fonts, axes,
colorway, colorscales) and per-trace-type values (bar outlines, line widths, colorbars). A
**theme** is a template with a name. Set one with `layout.template`:

```ts
createChart(el, { data, layout: { template: 'plotly_dark' } });
```

Templates are layer 2 of the [customization cascade](/customization/): they override the library
defaults, and everything you set on the figure overrides them: a theme never overrides a value you
set.

## The default look

A figure without `layout.template` gets the **`holochart`** template, a dark and dense look made
for dashboards, monitoring and multi-panel views:

- **Background:** `#0a0a0f` paper and plot area, a faint `#1a1a22` grid, `#2c2c38` axis lines
  with short outside ticks, and `#3e3e4c` zero lines.
- **Text:** `'Helvetica Neue', Helvetica, Arial, sans-serif` at 9 px in `#a4a7b5` (legend, axis
  titles and hover labels too), 8 px `#80838f` tick labels, and an 11 px `#eceef4` figure title at
  the top left. Unless you register one of those families, text is drawn with the bundled
  [default font](/fundamentals/styling-themes#default-font), TeX Gyre Heros.
- **Colorway:** eight colors, red `#ea2a37`, blue `#5e74d5`, indigo `#9962c0`, emerald `#118e36`,
  orange `#cc540a`, teal `#128b8b`, gold `#997600` and magenta `#b8267e`, ordered so neighbors
  differ in hue.
- **Colorscales:** on a dark background, brighter means further from zero. `sequential` is a "neon
  plasma" ramp (deep violet, violet, magenta, orange, pale yellow; the low end still shows on
  the background); `sequentialminus`, for all-negative data, mirrors it in cool hues (pale cyan at
  the most negative value, dark blue at zero); `diverging` has a muted `#4b475c` midpoint with blue
  to cyan for negative and magenta to orange for positive values.
- **Density:** margins of 40/16/42/32 px (left/right/top/bottom) that axes grow as their labels
  need (`automargin`), up to 12 ticks per axis, a transparent horizontal legend just above the
  plot area at the left, 1.25 px lines, 4 px markers and bars without outlines, pie slices
  separated by a 1 px background-colored line, slim 10 px colorbars, and dark `#15151d` hover
  labels.

<Example id="themes/holochart" :height="300" />

It is an ordinary template: any value you set on the figure wins, and `chart.fullLayout.template`
shows it. The attribute reference lists the schema defaults, which are Plotly's; the `holochart`
template sits on top of them.

::: tip Long legends
`margin.t` leaves room for the title and one legend row. A legend that wraps to more rows can
overlap the title: raise `margin.t`, move the legend with `legend.y`, or make it vertical
(`legend.orientation: 'v'`).
:::

### Plotly's look

**`plotly-classic`** is the library defaults, which are Plotly's, written out: white paper and
plot area, `#444` text in Open Sans 12 px, the D3 category10 colorway, a light `#eee` grid,
Plotly's automatic colorscales (Reds, Blues, RdBu), Plotly's margins and a vertical legend on the
right. `template: 'plotly-classic'`, `template: 'none'` and `template: null` render the same
chart; `plotly-classic` also works as the base of a light theme of your own.

<Example id="themes/plotly-classic" :height="300" />

Set it per figure with `layout: { template: 'plotly-classic' }`, or make it the default for every
chart:

```ts
import { setDefaultTemplate } from '@mk7s/holochart'; // or '@mk7s/holochart-runtime'

setDefaultTemplate('plotly-classic'); // once, before creating charts
```

`setDefaultTemplate` takes any registered template name (your own theme too) and only affects
figures without `layout.template`; `setDefaultTemplate(undefined)` applies no template, which is
Plotly's look as well. It warns when the name is not registered. Charts already on the page use
the new default from their next render. Moving a Plotly app over? See
[Coming from Plotly](/getting-started/from-plotly#default-look).

An explicit `layout.template` **replaces** the default instead of building on it, as in Plotly:
`template: 'plotly_dark'` is plotly.py's dark theme with Plotly's margins and legend, not
`holochart` plus `plotly_dark`. To build on the default look, name it: `'holochart+presentation'`.

## Built-in themes

Every chart below is the same figure, the **theme sampler** (bars, a line, markers mapped
through the theme's colorscale with a colorbar, a legend, a title and axis titles on two
subplots), with only `layout.template` changed. Each one is also a visual regression test.

<div class="hc-theme-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:12px">

<Example id="themes/holochart" :height="300" />
<Example id="themes/plotly-classic" :height="300" />
<Example id="themes/plotly" :height="300" />
<Example id="themes/plotly_white" :height="300" />
<Example id="themes/plotly_dark" :height="300" />
<Example id="themes/simple_white" :height="300" />
<Example id="themes/ggplot2" :height="300" />
<Example id="themes/seaborn" :height="300" />
<Example id="themes/presentation" :height="300" />
<Example id="themes/xgridoff" :height="300" />
<Example id="themes/ygridoff" :height="300" />
<Example id="themes/gridon" :height="300" />
<Example id="themes/none" :height="300" />
<Example id="themes/high-contrast" :height="300" />
<Example id="themes/neon" :height="300" />

</div>

| Theme            | What it is                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `holochart`      | The default look: dark and dense. A chart without `layout.template` looks exactly like this. |
| `plotly-classic` | Plotly's look, the library defaults written out. Renders the same as `none`.                 |
| `plotly`         | plotly.py's default: blue-grey plot area, white grid, the Plotly colorway, Plasma.           |
| `plotly_white`   | `plotly` on white with light blue-grey grid lines.                                           |
| `plotly_dark`    | plotly.py's dark theme.                                                                      |
| `simple_white`   | No grid, dark axis lines with outside ticks, D3 colors, Viridis.                             |
| `ggplot2`        | R's ggplot2: grey panel, white grid, ggplot's hue palette.                                   |
| `seaborn`        | Python seaborn's darkgrid style with the deep palette and the rocket colorscale.             |
| `presentation`   | 18 px text, 3 px lines, 9 px markers. Meant to be combined: `'plotly_white+presentation'`.   |
| `xgridoff`       | No vertical grid lines. Combine it with another theme.                                       |
| `ygridoff`       | No horizontal grid lines. Combine it with another theme.                                     |
| `gridon`         | Grid lines on both axes, e.g. `'simple_white+gridon'`.                                       |
| `none`           | The empty template: the library defaults, Plotly's look (same as `template: null`).          |
| `high-contrast`  | For low vision, projectors and print.                                                        |
| `neon`           | Neon hues on near-black, with glowing title text.                                            |

`holochart-dark`, the dark variant from before the default look was dark, still resolves as a
**deprecated** alias of `holochart`. Use `holochart` (or leave `layout.template` unset); the alias
is removed before 1.0.

The Plotly themes reproduce plotly.py's template values for everything Holochart draws today:
backgrounds, font colors, colorways, the automatic colorscales (`layout.colorscale`), axis grid,
line, zero-line and tick styling, colorbars, bar outlines, error bars, annotation and shape
defaults, and table fills. Their blocks for subplot types that don't exist yet (polar, ternary,
geo, maps, 3D scenes) and widgets (sliders, update menus) are left out and arrive with those
features. Holochart's scatter is GPU-drawn like Plotly's `scattergl`, so it takes the colorbar
defaults plotly.py gives `scattergl`.

### Holochart's own themes

**`holochart`** is the [default look](#the-default-look), and **`plotly-classic`** is
[Plotly's look](#plotly-s-look), both described above.

**`high-contrast`** follows WCAG 2.2: black 14 px text on white (21:1), black 1.5 px axis lines
with outside ticks, a darker `#bdbdbd` grid, and a colorway where every color has at least 3:1
contrast against white (WCAG 1.4.11, non-text contrast), with the first four at least 5:1. Its
hues are spread apart for color-vision deficiencies. Lines are 2.5 px; markers are 8 px with a
white rim, so overlapping points stay separate; bars get a black outline; the legend gets a
border. Sequential data uses Cividis, which was designed for color-vision deficiency, and
diverging data uses ColorBrewer PuOr. Hover labels are white on black.

**`neon`** shows off glow: saturated neon hues on a near-black indigo background, a faint cyan
grid, a magenta zero line, and a title with a cyan halo (`title.font.shadow`). Markers and bars
get a thin white-hot rim and lines are 2.5 px, which reads as a glowing core. Its colorscales
are interpolated in Oklab (`colorscaleInterpolation`), which keeps the neon ramps bright through
their midpoints.

::: info Glow is approximated
The plan's `neon` is a showcase for a 3D bloom effect, a post-processing pass that doesn't exist
yet (plan E8.12). Until it does, the rims, the text halo and the palette's brightness against the
dark background stand in for it. The theme will turn bloom on once it lands.
:::

## How templates work

A template has two parts:

```ts
import type { Template } from '@mk7s/holochart';

const brand: Template = {
  layout: {
    font: { family: 'Inter, sans-serif', color: '#1f2937' },
    colorway: ['#2563eb', '#f97316', '#10b981', '#e11d48'],
    xaxis: { gridcolor: '#e5e7eb', zeroline: false },
    yaxis: { gridcolor: '#e5e7eb' },
    annotationdefaults: { arrowcolor: '#1f2937' },
  },
  data: {
    bar: [{ marker: { line: { color: 'white', width: 1 } } }],
    scatter: [{ line: { width: 3 } }, { line: { width: 3, dash: 'dash' } }],
  },
};
```

- `layout` values act as defaults for the same paths in the figure's layout. A template's `xaxis`
  applies to every x axis (`xaxis2`, `xaxis3`, …) and its `yaxis` to every y axis, unless the
  template also has an entry for that exact axis.
- `data` holds a list of defaults per trace type. The k-th trace of a type uses entry
  `k % length`, so a list of two alternates solid and dashed lines above.
- For array items such as annotations and shapes, `<item>defaults` (`annotationdefaults`) applies
  to every item, and named template items can be referenced with `templateitemname`.

Values are checked like figure values: invalid ones fall through to the library default.

A template set with `layout.template` replaces the default `holochart` template, so `brand` above
is drawn on the library defaults (Plotly's white look) plus its own values. To keep a theme's other
values, compose your template on it, as in [Your own theme](#your-own-theme).

### Combining themes

Join names with `+`. Later themes win; values only the earlier theme sets are kept:

```ts
createChart(el, { data, layout: { template: 'simple_white+gridon+presentation' } });
```

`presentation`, `xgridoff`, `ygridoff` and `gridon` exist to be combined like this.

### Where a value comes from

For any attribute, the first of these that is set wins:

1. the figure (trace or layout) value;
2. the template's value (`layout.template`, or the default `holochart` template when it is
   unset);
3. a value derived from other values (for example an axis's tick color follows its `color`, and
   titles inherit `layout.font`);
4. the library default.

So `{ template: 'plotly_dark', paper_bgcolor: 'white' }` gives a white page with everything else
dark.

## Your own theme

Register a template once, then use it by name everywhere:

```ts
import { composeTemplates, register, defineTemplate, themes } from '@mk7s/holochart';

// The default look with your brand's font and colors
const brand = composeTemplates(themes.holochart, {
  layout: { font: { family: 'Inter' }, colorway: ['#2563eb', '#f97316', '#10b981'] },
});

register(defineTemplate('brand', brand));
createChart(el, { data, layout: { template: 'brand' } }); // by name
createChart(el, { data, layout: { template: 'brand+presentation' } }); // combined
```

`defineTemplate(name, template, { default: true })`, or `setDefaultTemplate('brand')` after
registering it, makes it the template for every chart that doesn't set `layout.template`, in place
of `holochart`. Passing a template object directly (`layout: { template: brand }`) works too, but
a name keeps the figure JSON small.

Tips:

- Start from a theme with `composeTemplates` rather than from scratch: `themes.holochart` for a
  dark theme, `themes.plotlyClassic` for a light one on Plotly's defaults.
- Set `layout.colorscale.sequential`, `sequentialminus` and `diverging` so charts that color by
  number match your brand.
- Keep text contrast at 4.5:1 or more and colorway contrast against the background at 3:1 or
  more. `high-contrast` shows one way.
- [Register your web fonts](/fundamentals/styling-themes#fonts) before the first chart renders.

Every bundle, partial ones included, knows `holochart`, `plotly-classic` and `none`. With the
runtime alone (a partial bundle), register the other built-in themes you use:
`register(...builtinThemes)` or `register(defineTheme('ggplot2'))` from
`@mk7s/holochart-themes`. The full bundle registers all of them.

## Not yet available

- Following your app's CSS variables and dark mode (`'var(--brand-500)'` in a template,
  `config.watchColorScheme`) is planned (plan E8.4).
- Bloom and the other post-processing effects `neon` is meant to show off are planned (E8.12).

See also [Styling & themes](/fundamentals/styling-themes) and
[Colors, colorscales & colorbars](/fundamentals/colors-colorscales).
