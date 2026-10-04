---
title: Accessibility guide
description: How Holochart describes a canvas chart to screen readers — names, generated summaries, data tables — how keyboards explore its data and controls, and its high-contrast themes, colorblind-safe palette, pattern encoding and reduced motion.
status: complete
---

# Accessibility guide

A chart is drawn on a WebGL canvas, which assistive technology cannot see into. Holochart keeps a
**DOM mirror** next to the canvas: an ARIA role and name on the chart element, and a visually hidden
description of the chart that screen readers read like any other page content. You get it on every
chart without doing anything; this guide shows what it contains and how to make it better. It
also covers the **generated summaries** of trends and extremes, the **data table** you can show
under a chart, **keyboard access** to the data points and every control, and the options for
**low vision, color-vision deficiency and motion sensitivity**: high-contrast themes, the `Safe`
palette, pattern encoding and reduced motion.

All accessibility options live in [`config.a11y`](/reference/config):

| Option               | Default    | What it does                                                         |
| -------------------- | ---------- | -------------------------------------------------------------------- |
| `a11y.summaries`     | `true`     | [Generated summaries](#generated-summaries) in the description.      |
| `a11y.dataTable`     | `'hidden'` | [Data tables](#data-tables): `'hidden'`, `'visible'` or `false`.     |
| `a11y.patterns`      | `false`    | [Pattern encoding](#patterns-as-redundant-encoding) of bars, slices. |
| `a11y.reducedMotion` | `'auto'`   | [Reduced motion](#reduced-motion): `'auto'`, `true` or `false`.      |
| `a11y.keyboard`      | `true`     | [Keyboard access](#keyboard-access) to the data and the legend.      |

<Example id="accessibility/description" :height="400" />

The chart above draws nothing extra. Open your browser's accessibility inspector on it, or read
[`chart.description`](#the-hidden-description) from code, to see what a screen reader gets.

## What the chart element gets

The element you pass to `createChart` gets three attributes:

| Attribute          | Interactive chart                              | Static chart (`config.staticPlot`) |
| ------------------ | ---------------------------------------------- | ---------------------------------- |
| `role`             | `figure`                                       | `img`                              |
| `aria-label`       | the chart's accessible name (see below)        | the same                           |
| `aria-describedby` | the hidden description's summary, axes, traces | the same                           |

**Why `figure`, not `application`.** `role="application"` tells a screen reader to stop its
browse mode and hand every key to the page. That only helps widgets that implement their whole
keyboard model, and it would stop users from reading the description and data tables line by
line. A `figure` keeps its content browsable: the description, the tables and the modebar
toolbar. Keyboard navigation of the data has its own small `application` inside the figure (see
[Keyboard access](#keyboard-access)). A static chart has no controls, so it is exposed as one
image with a long description.

The canvas and the hover labels are `aria-hidden`: the canvas has no content of its own, and hover
labels come and go with the mouse. Everything they show is in the description.

If your page already sets `role`, `aria-label` or `aria-describedby` on the element, Holochart
leaves that attribute alone, and when the chart is destroyed every attribute it set is removed.

## The accessible name

The name is the first thing a screen reader announces. It comes from, in order:

1. [`config.ariaLabel`](/reference/config), when set;
2. `layout.meta.description`, when `layout.meta` is an object with a `description` string;
3. the figure title followed by an automatic summary: "Revenue and costs, H1 2024. Line and bar
   chart with 2 traces."

```ts
createChart(el, {
  data,
  layout: { title: { text: 'Revenue and costs' } },
  config: { ariaLabel: 'Revenue grew 58% in the first half of 2024' },
});
```

A name that states the takeaway is better than one that states the chart type. `layout.meta` is
Plotly's free-form data for text templates (`%{meta.unit}`); Holochart only reads its
`description` key, so templates keep working, and a `meta` array or string is ignored for the name.

## The hidden description

The description is plain DOM inside the chart element, hidden with the usual "visually hidden"
CSS (clipped to one pixel, not `display: none`, which would hide it from screen readers too). It
never changes the layout or a single pixel of the chart. It has:

- **A summary**: the chart types and trace count ("Line and bar chart with 2 traces.").
- **An overview**: the [generated summary](#generated-summaries) of trends and extremes.
- **Axes**: title, type and the range in view, formatted like the axis' tick labels
  (`X axis "Month": date axis from Dec 2023 to Jun 2024.`). Category axes list their categories.
- **Traces**: one sentence or two per trace, written by the trace type:
  - scatter: its kind (line, area, bubble or scatter), point count, x extent, and where y is lowest
    and highest;
  - bar: bar count and the largest and smallest bar with their positions;
  - pie: slice count, total and the largest slices with their shares;
  - traces hidden from the legend (`visible: 'legendonly'`) say so; other trace types get their
    type, name and point count.
- **Data tables**: one hidden `<table>` per trace with column headers from the axis titles. Tables
  show the first 100 rows, with "first 100 of 5,000 rows" in the caption, so large datasets stay
  cheap. A [visible table](#data-tables) shows every row instead.

Read it from code with `chart.description`: the same text, as data.

```ts
await chart.ready;
chart.description?.label; // 'Revenue and costs, H1 2024. Line and bar chart with 2 traces.'
chart.description?.traces;
// ['Line "Revenue": 6 points. x from Jan 1, 2024 to Jun 1, 2024. Lowest y 11 at x = Mar 1, 2024,
//   highest 21 at x = May 1, 2024.', 'Bar "Costs": 6 bars. Largest 12 at May 1, 2024, …']
```

### Keeping it in sync

The description follows the chart without costing frames:

- data, trace and layout changes (`restyle`, `relayout`, `react`, adding traces, …) rebuild it
  right away, so it is current when their promise resolves;
- zooming, panning and resizing only change the axis ranges: the description follows 300 ms after
  the last change;
- streaming (`extendTraces`, `prependTraces`) updates it at most twice a second;
- hover and selection never touch it.

Nothing is rewritten when the text did not change.

## Generated summaries

The description starts with the gist of the chart, written from its data: which way each series
goes, from what to what, and the extremes worth knowing.

<Example id="accessibility/summary" :height="460" />

> USD by Month. Revenue rises from 1.2M (Jan 1, 2024) to 3.4M (Dec 1, 2024). It peaks at 3.6M
> (Nov 1, 2024). Costs stays flat at about 2.0M.

Values are formatted like the chart shows them (the axis' `tickformat`, `hoverformat`, dates,
categories, the locale's separators). What each trace type says:

| Trace types                                       | Summary                                                                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| scatter lines and areas, bars on dates or numbers | rises / falls from the first to the last value, stays flat, or varies with no clear trend; a peak or low point that stands out |
| scatter markers (x not increasing)                | how y relates to x, with the correlation ("tends to rise with", "no clear relationship")                                       |
| bar on categories                                 | where it is highest and lowest                                                                                                 |
| pie, funnelarea, sunburst, sankey                 | the largest slice / stage / branch / flow with its share, and the next two                                                     |
| histogram                                         | the most common range, the middle half of the values, and skew                                                                 |
| box, violin                                       | median, quartiles and range; for several boxes, the lowest and highest median                                                  |
| heatmap, contour, 2D histogram                    | the value range, where the highest and lowest values are, the hottest row and column                                           |
| candlestick, OHLC                                 | the change from the first open to the last close, the highest high and lowest low                                              |
| indicator                                         | the value and its change from the reference                                                                                    |

The rules are simple and deterministic, so a summary never claims more than the data shows:

- A series **rises** or **falls** when its last value differs from its first by at least 10% of
  its range; otherwise it **stays flat** (a range under 5% of its size) or **varies with no clear
  trend**.
- A **peak** or **low point** is named only when it stands out from both ends by 5% of the range.
- Markers whose x doesn't increase are described by their correlation instead: strong from 0.7,
  a tendency from 0.3.
- Seasonality is not detected: on short series it is not robust.
- The overview summarizes the first ten visible traces, and says how many more there are.

The summary code is loaded after the chart's first draw (about 5 kB), so it never delays drawing.
`chart.description` has the overview once it is there; `chart.describe()` waits for it:

```ts
const description = await chart.describe();
description?.overview; // 'USD by Month. Revenue rises from 1.2M (Jan 1, 2024) to …'
```

Turn summaries off with `config: { a11y: { summaries: false } }`; the rest of the description
stays.

### Summaries in other languages

Every sentence comes from an English template with `{placeholders}`, and that template is also
the key a locale's `dictionary` translates, like Plotly's UI strings. `@mk7s/holochart-locales`
translates the summaries in ten locales — `de`, `es`, `fr`, `it`, `ja`, `ko`, `pt-BR`, `ru`, `tr`
and `zh-CN` — and [Languages](#languages) says what else they translate and how far to trust
them. For another language, add the sentences to the locale you register:

```ts
import { createChart, register } from '@mk7s/holochart';
import { nl } from '@mk7s/holochart-locales';

register({
  ...nl,
  dictionary: {
    ...nl.dictionary,
    '{name} rises from {start} ({startX}) to {end} ({endX}).':
      '{name} stijgt van {start} ({startX}) naar {end} ({endX}).',
    'It peaks at {max} ({maxX}).': 'Het hoogste punt is {max} ({maxX}).',
  },
});
createChart(el, { data, layout, config: { locale: 'nl' } });
```

A translation keeps every placeholder and may reorder them, or reword the sentence around them:
the Russian, Turkish and Korean ones lead with the trace name and a colon, because a placeholder
can't take a case ending or a particle that depends on its value. Sentences without a translation
stay English. The templates, grouped by what they describe:

- **Axes and totals**: `{y} by {x}.`, `{count} more traces are not summarized.`,
  `{name} has no values.`, `{name} has a single value, {value} ({x}).`
- **Trends**: `{name} rises from {start} ({startX}) to {end} ({endX}).`,
  `{name} falls from {start} ({startX}) to {end} ({endX}).`, `{name} stays flat at about {value}.`,
  `{name} varies between {min} ({minX}) and {max} ({maxX}) with no clear trend.`,
  `It peaks at {max} ({maxX}).`, `Its lowest point is {min} ({minX}).`
- **Correlation**: `{name}: {y} rises strongly with {x} (correlation {r}).`,
  `{name}: {y} tends to rise with {x} (correlation {r}).`,
  `{name}: no clear relationship between {x} and {y} (correlation {r}).`,
  `{name}: {y} tends to fall as {x} rises (correlation {r}).`,
  `{name}: {y} falls strongly as {x} rises (correlation {r}).`, `Values range from {min} to {max}.`
- **Parts of a whole**: `{label} is the largest slice of {name}: {share} ({value}).` (and the same
  with `stage`, `branch` and `flow`), `Next: {label}, {share} ({value}).`,
  `Next: {label}, {share} ({value}), and {label2}, {share2} ({value2}).`,
  `{name} is highest at {label} ({value}) and lowest at {lowLabel} ({lowValue}).`
- **Distributions**:
  `{name}: median {median}; half of the values lie between {q1} and {q3}; range {min} to {max}.`,
  `{name}: medians range from {low} ({lowLabel}) to {high} ({highLabel}).`,
  `{name}: the most common range is {start} to {end} ({value}).`,
  `Half of the values lie between {q1} and {q3}, with a median of about {median}.`,
  `The distribution is skewed to the right (a long tail of high values).`,
  `The distribution is skewed to the left (a long tail of low values).`
- **Grids**: `{name}: values range from {min} to {max}.`,
  `The highest value, {max}, is at {x}, {y}; the lowest, {min}, at {minX}, {minY}.`,
  `Highest average by row: {row} ({rowValue}); by column: {column} ({columnValue}).`
- **Prices**:
  `{name} rises {change} from an open of {open} ({startX}) to a close of {close} ({endX}).`
  (and `falls`), `{name} closes at {close} ({endX}), where it opened ({startX}).`,
  `Highest high {high} ({highX}); lowest low {low} ({lowX}).`
- **Values**: `{name} is {value}.`, `{name} is {value}, up {change} from {reference}.`,
  `{name} is {value}, down {change} from {reference}.`,
  `{name} is {value}, unchanged from {reference}.`

## Data tables

Every trace with data gets a table. `config.a11y.dataTable` says where it goes:

| Value                | Tables                                                                         |
| -------------------- | ------------------------------------------------------------------------------ |
| `'hidden'` (default) | Hidden tables in the description, for screen readers only: the first 100 rows. |
| `'visible'`          | Shown under the chart, styled like it, with **every** row.                     |
| `false`              | None.                                                                          |

<Example id="accessibility/data-table" :height="700" />

A visible table is a sibling placed right after the chart element (`div.holochart-data-table`),
not inside it: the chart sizes itself to its element, which must not grow with the table. It takes
the chart's width, font family, text color and background, uses the x grid color for its rules,
and never goes below 12 px text. Each table sits in a scroll region at most 320 px high that has a
keyboard focus stop and is named by the table's title; the header row stays in view while the rows
scroll.

Long tables are **virtualized**: past 200 rows, only the rows in view (plus a few on each side)
exist in the DOM, between two spacer rows that keep the full scroll height, and each row is
formatted only when it scrolls into view. A table of a million points costs a few dozen rows.
`aria-rowcount` and `aria-rowindex` tell assistive technology how many rows there are and which
ones it is reading. With visible tables, the hidden copies are left out of the description, so
screen readers don't meet every table twice.

## Keyboard access

Every interactive chart can be explored and operated from the keyboard. **Tab** moves into the
chart's **plot area**, which gets a focus ring in the text color; the arrow keys then move a cursor
between the data points. Each point shows its hover label, as if the mouse were on it, and is
announced to screen readers ("Revenue: (Mar 1, 2024, 11), point 3 of 6."). The legend, the update
menus, the sliders, the modebar and the range selectors follow in the tab order.

<Example id="accessibility/keyboard-focus" :height="400" />

### Keys in the plot area

| Key                 | Action                                                                    |
| ------------------- | ------------------------------------------------------------------------- |
| ← / →               | Previous / next point of the trace, along x.                              |
| ↑ / ↓               | The trace drawn next above / below at the same x (lines, stacked bars).   |
| Page Up / Page Down | Previous / next trace, in legend order, keeping the x position.           |
| Home / End          | First / last point of the trace.                                          |
| Enter / Space       | Click the point: the `click` event (with `clickmode: 'select'`, selects). |
| Escape              | Clear the cursor and its label.                                           |
| `+` / `-`           | Zoom in / out around the point (around the plot center without one).      |
| Shift + ← → ↑ ↓     | Pan by a tenth of the range.                                              |
| `0`                 | Reset the view, like a double-click (`config.doubleClick`).               |

The first arrow key starts at the first point of the first trace. Details:

- **What is visited**: visible traces in legend order (`legendrank`, then trace order, reversed
  with a `reversed` `legend.traceorder`), skipping `hoverinfo: 'skip'`; only points whose x lies
  inside the x range, so after zooming in the cursor stays in view. For horizontal traces
  (`orientation: 'h'`) the roles turn with the chart: ↑ / ↓ step through the points along y, and
  ← / → move between traces.
- **Other chart families** have stops of their own, each showing the hover label of what it is
  on; see [Keys by chart family](#keys-by-chart-family).
- **Events**: moving emits `hover` (like `chart.hover()`, without a DOM event), Escape `unhover`,
  Enter `click` with the same Plotly-shaped point as a mouse click and the `KeyboardEvent` as
  `event`. Zoom, pan and reset emit one `relayout` with the keys a drag emits
  (`'xaxis.range[0]'`, …) and respect `fixedrange` and `minallowed` / `maxallowed`.
- **Announcements** go to a polite live region inside the plot area's focus target, with the text
  of the hover label, its lines read as a list ("Share: Alpha, 40, 40%, point 1 of 5."); zoom, pan,
  rotation and reset are announced too. They are localized like the modebar: the English sentence
  is the locale dictionary key, translated in [ten locales](#languages); see
  [Announcement sentences](#announcement-sentences).
- Keys with Ctrl, Alt or Meta are left to the browser, and keys pressed while a control inside the
  chart has focus stay with that control.

The plot area's focus target is `role="application"`, so screen readers in browse mode hand it
the arrow keys; the rest of the figure stays browsable. Its code loads the first time the chart
gets focus, and so do the stops of the chart families below (one small chunk per trace package);
keys pressed meanwhile are kept and replayed.

### Keys by chart family

Every stop shows the hover label(s) a pointer would get there and announces what they say, with
the stop's place in the chart. Page Up / Page Down, Enter, Escape and the view keys work as above.

| Traces                                              | Stops                                            | ← / →                                                   | ↑ / ↓                                                           | Home / End                  |
| --------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------- | --------------------------- |
| scatter, line, bar, waterfall, funnel, OHLC, candle | data points, along x                             | previous / next point                                   | the trace next above / below at this x                          | first / last point          |
| histogram                                           | bins: the range and the bar's value              | previous / next bin                                     | the trace next above / below at this bin                        | first / last bin            |
| box, violin                                         | one per box: every statistic at once (max … min) | previous / next box                                     | the trace next above / below at this position                   | first / last box            |
| heatmap, contour, histogram2d, histogram2dcontour   | cells in view, rows from the top                 | along the row                                           | along the column                                                | ends of the row             |
| pie, funnelarea                                     | slices, stages, in drawing order                 | previous / next                                         | previous / next                                                 | first / last                |
| sunburst, treemap, icicle                           | drawn nodes of the current level                 | previous / next sibling                                 | ↑ the parent, ↓ the first child                                 | first / last sibling        |
| sankey                                              | nodes by column, and links                       | previous / next node (on a link: links of that node)    | ↓ downstream (first outgoing link, a link's target), ↑ upstream | first / last node (or link) |
| parcats                                             | categories                                       | the category beside it in the previous / next dimension | previous / next category of the dimension                       | first / last category       |
| parcoords                                           | each line on each axis (a label on the axis)     | the same line on the previous / next axis               | the previous / next line on this axis                           | first / last axis           |
| scatterpolar, barpolar                              | points inside the subplot, bars, in data order   | previous / next                                         | previous / next                                                 | first / last                |
| scatter3d                                           | points, in data order                            | previous / next                                         | previous / next                                                 | first / last                |

- **Hierarchies**: Enter drills into the node like a click (out of the entry, like a click on the
  center), and the cursor stays on its node through the transition.
- **Grids** build their cells on demand, so the cursor costs the same on a 4096 × 4096 heatmap. A
  gap with `hoverongaps: false` is still a stop, announced with its position.
- **Box and violin** stops need box hover: a trace with `hoveron: 'points'` (a strip plot) has
  none.
- **3D scenes**: on a chart with a scene, Shift + arrows **orbit the camera** in steps of 15° (← / →
  around the scene, ↑ / ↓ over it; a turntable, or a free orbit with `dragmode: 'orbit'`), `+` /
  `-` move it in and out, and `0` resets it to the first drawn view. Each key is one GUI
  `relayout` of `scene.camera`, as a drag is. With the cursor on a 3D point, its scene gets the
  keys; without a cursor, every scene does. Surface, mesh3d, cone, streamtube, isosurface, volume
  and bar3d have no stops yet (their scenes take the view keys).
- **Not navigated yet**: `image`, `splom`, `table` cells and `indicator`.
- **The script-tag build** (`holochart.iife.min.js`) leaves the 2D families' stops out for now
  (histogram, box, violin, the grids, funnelarea, the hierarchies, sankey, parcats, parcoords and
  polar): its size budget has no room for the chunks it would inline. Cartesian points, pie and,
  with the 3D add-on, scatter3d and the scenes' view keys work there. The ESM build has them all.

### Announcement sentences

The sentences below are the locale dictionary keys; a translation keeps the `{placeholders}`, in
any order. `{name}` is the trace name and `{text}` what the hover label(s) say.
`@mk7s/holochart-locales` translates them in the same [ten locales](#languages) as the summaries;
elsewhere they are English, and you can add them to a locale the way
[summaries](#summaries-in-other-languages) are added.

| Sentence                                                                   | Said for                                           |
| -------------------------------------------------------------------------- | -------------------------------------------------- |
| `{name}: {text}, point {n} of {count}.`                                    | data points, slices, stages, polar and 3D points   |
| `{name}: {text}, {n} of {count}.`                                          | histogram bins, sankey nodes and links, a lone box |
| `{name}: {position}, {text}, {n} of {count}.`                              | a box or violin at `{position}` of its trace       |
| `{name}: {text}, row {row} of {rows}, column {column} of {columns}.`       | grid cells; parcoords lines (rows) on axes         |
| `{name}: {text}, level {level}, {n} of {count}, children: {children}.`     | sunburst, treemap and icicle nodes                 |
| `{name}: {dimension}, {category}, {text}, {n} of {count}.`                 | parcats categories                                 |
| `Dimension {n}`                                                            | in `{text}`: a parcoords dimension without a label |
| `No data points to explore.`                                               | a chart without stops                              |
| `Zoomed in.` / `Zoomed out.` / `Panned.` / `View rotated.` / `View reset.` | the view keys                                      |

### The controls

| Control               | Keyboard                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Legend                | A `toolbar` named "Legend", one tab stop: arrows, Home and End move between items; Enter or Space toggles (like a click), Shift + Enter isolates (a double-click). |
| Update menus, sliders | See [Controls](/fundamentals/controls#keyboard-and-screen-readers): toolbars, listboxes and `slider`s with the usual keys.                                         |
| Modebar               | A `toolbar`, one tab stop: arrows, Home and End move; Enter or Space press. It shows while a button has keyboard focus.                                            |
| Range selector        | A `group` of buttons, each its own tab stop.                                                                                                                       |

Toggles say whether they are on with `aria-pressed`: legend items while their trace (or label, or
group) is shown, the modebar's drag mode, hover mode and spike line buttons, update menu buttons
(with `showactive`) and range selector buttons while their range is in view. Every control has a
visible focus ring in its text color in the default look and in `plotly-classic`; nothing shows a
ring until it has keyboard focus. The legend is drawn on the canvas: its keyboard targets are
transparent buttons laid over the items that only draw the focus ring, and the mouse keeps going to
the canvas.

### Tab order

Inside the chart element, Tab visits:

1. the plot area (data navigation);
2. the legend (one stop);
3. the update menus, in `layout.updatemenus` order (a button menu is one stop, a dropdown one);
4. the sliders, in `layout.sliders` order;
5. the modebar (one stop, while it is shown: `displayModeBar` is not `false`);
6. the range selectors' buttons, one stop each;
7. after the chart element: its visible data tables (`dataTable: 'visible'`).

A control that appears only after the first draw (added by `react` or `relayout`) is placed at the
end of this order.

### Turning it off

`config.a11y.keyboard: false` removes the plot area's tab stop and the legend's keyboard targets
(the other controls stay reachable, being real buttons). Static charts (`config.staticPlot`) have
neither.

```ts
createChart(el, { data, layout, config: { a11y: { keyboard: false } } });
```

## Visual accessibility

### High-contrast themes

Two themes are made for low vision, projectors and print:
[`high-contrast`](/customization/themes-templates#holochart-s-own-themes) (black on white) and
`high-contrast-dark` (white and yellow on black). Text meets WCAG AAA (7:1) in both; their
colorways stay above the 3:1 of non-text contrast on white and above 7:1 on black; lines and
markers are thicker and text larger than the default look. A unit test computes the ratios.

<Example id="themes/high-contrast-dark" :height="440" />

```ts
createChart(el, { data, layout: { template: 'high-contrast-dark' } });
```

With the runtime alone (partial bundles), register the theme first:
`register(defineTheme('high-contrast-dark'))` from `@mk7s/holochart-themes`.

### The Safe palette

`Safe` is CARTO's colorblind-safe qualitative palette (plotly.py's
`px.colors.qualitative.Safe`): eleven colors that stay apart with the common color-vision
deficiencies. Name it as the colorway; it is available in every bundle:

```ts
createChart(el, { data, layout: { colorway: 'Safe' } });
```

<Example id="accessibility/safe-palette" :height="400" />

A registered colorway's name works wherever a colorway goes (`layout.colorway`,
`piecolorway`, …; a Holochart extension, Plotly takes arrays only). `Safe` is about hue, not
lightness: a few of its colors (`#332288`, `#661100`, `#117733`) are dark and low in contrast on
the dark default look, and a few are light on white. Use thicker lines and markers with it, or a
high-contrast theme's colorway when contrast matters most.

### Patterns as redundant encoding

`config.a11y.patterns: true` gives every bar, histogram and polar bar trace, every filled area
(`fillpattern`) and every pie slice its own hatch, overlaid on its color, so series stay apart
without color: for color-vision deficiencies and grayscale print.

<Example id="accessibility/patterns" :height="420" />

```ts
createChart(el, { data, layout, config: { a11y: { patterns: true } } });
```

Shapes are handed out in order — `/`, `.`, `\`, `x`, `-`, `+`, `|` — one per trace (counting only
traces that take a pattern) and one per slice for pies, by the slice's position in the data.
A trace or template that sets its own `marker.pattern.shape` (even `''`, no pattern) keeps it.
Hierarchies (sunburst) and sankey keep their colors only: one pattern per trace wouldn't tell their
sectors apart. For lines, vary `line.dash` and marker symbols yourself.

### Reduced motion

When the user asks their system for reduced motion (`prefers-reduced-motion: reduce`), Holochart
doesn't animate: transitions (`layout.transition`, `animate`, `react`) and sunburst drill-downs
snap to their end, the indicator's count-up and slider handles jump, sankey flow particles hold
still, and the modebar doesn't fade. Animation frames still advance: they change what is shown,
not how it moves. `config.a11y.reducedMotion` overrides the system setting: `true` snaps always,
`false` animates anyway (for a chart whose animation is the content), and `'auto'`, the default,
follows the user.

```ts
createChart(el, { data, layout, config: { a11y: { reducedMotion: true } } });
```

## Languages

A chart speaks the language of its [locale](/fundamentals/locales) where a translation exists, and
English where none does. `@mk7s/holochart-locales` translates Holochart's own accessibility strings
in ten of its locales: **`de`, `es`, `fr`, `it`, `ja`, `ko`, `pt-BR`, `ru`, `tr` and `zh-CN`**.
Regional locales that fall back to one of them (`de-CH`, `es-AR`, `es-PE`, `fr-CH`) get its
strings when both are registered. `pt-PT`, `zh-TW` and `zh-HK` have no translations of their own:
registered alone they speak English, and registered next to `pt-BR` or `zh-CN` they fall back to
it through the shared language, so a `zh-TW` chart then announces in Simplified Chinese and a
`pt-PT` chart in Brazilian Portuguese. Register only the locale you use if you prefer English
there.

| What a screen reader hears                                                            | In the ten locales | Elsewhere                |
| ------------------------------------------------------------------------------------- | ------------------ | ------------------------ |
| [Generated summaries](#generated-summaries) (the overview)                            | translated         | English                  |
| [Keyboard announcements](#announcement-sentences) of points and view changes          | translated         | English                  |
| The plot area's keyboard hint and the legend toolbar's name                           | translated         | English                  |
| Modebar button names, hover label words (`open:`, `median:`, …), default trace names  | translated         | where Plotly's locale is |
| The chart type sentence, the axis and trace lines, "Axes:" and "Traces:"              | English            | English                  |
| Data table captions ("first 100 of 5,000 rows")                                       | English            | English                  |
| The modebar's toolbar name, fallback names of menus and sliders, range selector names | English            | English                  |

The values inside summaries and announcements are formatted like the chart shows them (the
locale's separators and month names), whatever language the sentence around them is in.

**These are machine translations.** No native speaker has reviewed them. A test checks that each
one keeps the placeholders of its English sentence, which says nothing about how it reads: expect
wording a native speaker would improve. If a sentence reads wrong in your language, override it
in the locale you register (the English sentence is the key, as in
[Summaries in other languages](#summaries-in-other-languages)) and please open an issue.

What stays English, and why:

- **The rest of the hidden description** — the chart type sentence ("Line and bar chart with 2
  traces."), the axis lines, the line each trace type writes about itself (the 3D traces' included)
  and the table captions — is assembled in code from English fragments and English plurals, not
  from templates, so a dictionary cannot translate it yet. The mirror therefore mixes languages on
  a localized chart: a translated overview, then English lines. Set
  [`config.ariaLabel`](#the-accessible-name) and name your traces and axes in your language to
  carry the essentials.
- **A few control names**: the modebar's toolbar is named "Chart toolbar", an update menu or
  slider without a `name` is "Menu 1" or "Slider 1", and range selectors are "Range selector".
  Give menus and sliders a `name` in your language.
- **Sentence shapes that fit a language poorly.** A count of one reads like the English ("1 more
  traces are not summarized") in German, French and Spanish. A trace name that is a plural noun
  meets a singular verb in the Germanic and Romance translations, as it does in English ("Sales
  rises"). French does not elide before a name ("de Août"). The Italian and Spanish price
  sentences put an article before the change, which suits the percentage it almost always is.
  Turkish writes the percent sign after the number, where it belongs before it: that is the
  number format's doing, not the sentence's.
- **Right-to-left languages.** No locale translates these strings into Arabic or Hebrew, and
  plotly.js's `ar` and `he` have no UI strings either: such a chart has your right-to-left
  titles and labels next to English controls and announcements. See
  [Right-to-left scripts](/fundamentals/locales#right-to-left-scripts) for what the text layout
  does and does not do.

## Make your charts easier to understand

- **Give every chart a title and axis titles.** They become the accessible name, the axis
  descriptions and the table headers.
- **Name your traces.** `Line "Revenue"` tells more than `Line "trace 0"`.
- **Put the conclusion in `config.ariaLabel`** when the chart makes a point.
- **Don't rely on color alone**: turn on [patterns](#patterns-as-redundant-encoding), vary marker
  symbols or line dashes, and label lines directly with annotations where you can.

## Writing a description for a custom trace type

Trace modules describe themselves with `describe()`, which gets the trace, its calc and its axes
and returns a summary, an optional `kind` ("line", "donut", …), an optional table and an optional
`insight` for the generated summary. Format values with the axes, so the description reads like
the chart:

<!-- docs-gates: no-typecheck -->

```ts
import { countText, formatAxisValue, traceNameText, type TraceModule } from '@mk7s/holochart';

export const myTrace: TraceModule<MyCalc> = {
  // …
  describe({ trace, calc, index, xaxis, yaxis, maxRows }) {
    const name = traceNameText(trace['name'], index);
    const rows = [];
    for (let i = 0; i < Math.min(calc.length, maxRows); i++) {
      rows.push([formatAxisValue(xaxis, calc.x[i]), formatAxisValue(yaxis, calc.y[i])]);
    }
    const fx = (v: number) => formatAxisValue(xaxis, v);
    const fy = (v: number) => formatAxisValue(yaxis, v);
    return {
      kind: 'ribbon',
      summary: `Ribbon "${name}": ${countText(calc.length, 'point')}.`,
      // Every row on demand, for visible tables.
      table: {
        columns: ['x', 'y'],
        rows,
        total: calc.length,
        row: (i) => [fx(calc.x[i]), fy(calc.y[i])],
      },
      // The generated summary describes the points as a series.
      insight: {
        kind: 'series',
        length: calc.length,
        x: calc.x,
        y: calc.y,
        joined: true,
        formatX: fx,
        formatY: fy,
      },
    };
  },
};
```

A module can also ship its accessibility code in a chunk of its own that loads on first use, as the
built-in 3D traces do: `a11y: () => import('./a11y.js').then((m) => m.parts)` resolves to
`{ [traceType]: { describe, keyboardPoints, keyboardView } }`. The trace shows the generic line
until the chunk is there, then the chart describes itself again; `chart.describe()` waits for it.

Build at most `maxRows` rows and report the full count as `total`; `row(i)` formats any row, so a
visible table can show all of them. The `insight` hands the summary code facts, not sentences: a
`series` (values along x), `shares` (parts of a whole), `boxes`, `bins`, a `grid`, `prices` or a
single `value`, with the formatters to show them — the calc's own arrays, never copies. A
`describe()` that throws is logged and replaced by the generic line, so it can never break the
chart.

## Keyboard stops for a custom trace type

A trace module lists its stops with `keyboardPoints(calc, trace, ctx)`: the hover points of what
it draws, in reading order. A cartesian trace whose stops are its data points needs none. Stops
may say where the arrows lead (`nav`: the indices ←, →, ↑, ↓, Home and End go to), show more
labels (`more`) and bring their own sentence (`say`: an English template and its values):

<!-- docs-gates: no-typecheck -->

```ts
keyboardPoints(calc, trace, ctx) {
  return calc.cells.map((cell, k) => ({
    ...hoverPointOf(cell, trace, ctx), // what hoverPoints returns on the cell
    nav: [cell.left ?? k, cell.right ?? k, cell.up ?? k, cell.down ?? k],
    say: ['{name}: {text}, ring {ring}.', { ring: String(cell.ring) }],
  }));
},
```

Return an array, or anything with a `length` and `at(i)` that builds stop `i` on demand. A trace
drawn in a 3D scene gets the scene's view keys with `a11y: sceneA11y`.

## What's next

Stops for the remaining 3D traces, `image` and `table`, the 2D families in the script-tag build,
and keys for the range slider's handles and for editing selections, come later.
[Locales](/fundamentals/locales) (E17.6) translate the modebar, format numbers and dates, and in
[ten of them](#languages) translate the generated summaries and keyboard announcements; the rest
of the description (the chart type sentence, axis and trace lines, table captions) and a few
control names are English for now, and the translations await review by native speakers.
Summaries don't announce changes as they happen (no live region) and don't detect seasonality.
