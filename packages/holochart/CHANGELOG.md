# @mk7s/holochart

## 0.1.0

### Minor Changes

- 9166528: New default look: charts without `layout.template` use the dark, dense `holochart` template (near-black background, tiny Helvetica-style text drawn with the bundled TeX Gyre Heros font, a red/blue/indigo/emerald colorway and a neon plasma colorscale). Plotly's look is `layout.template: 'plotly-classic'` (identical to the previous default); `setDefaultTemplate('plotly-classic')` switches it globally. TeX Gyre Heros now ships as the default font (loaded lazily per face; no CDN fetch by default), and `holochart-dark` is a deprecated alias of `holochart`.
- 1b629e6: Accessibility and image export. Every chart now describes itself to screen readers: the chart element gets `role="figure"` (`role="img"` for `staticPlot`) and an `aria-label` from `config.ariaLabel` (new), `layout.meta.description` or the title plus an automatic summary, and a visually hidden description with the axes, one summary per trace (scatter, bar and pie describe their data) and data tables of the first 100 points; read it from code with `chart.description`. New `chart.toImage({ format, width, height, scale, transparent })` and `chart.downloadImage()` (and Plotly's functional `toImage(el | figure, …)` / `downloadImage(el, …)`) draw the figure offscreen at the requested size and resolution as PNG, JPEG or WebP, without the modebar or hover labels; the modebar camera button now uses `config.toImageButtonOptions` (format, filename, width, height, scale).
- 66432d0: Area charts and bubbles (E9.4, E9.5): scatter `fill` (all modes), `fillcolor`, `fillgradient`, `stackgroup` with `stackgaps`, `groupnorm` and `orientation`, `hoveron: 'fills'`, and the `bubbleSizeref(sizes, maxPx)` helper.
- 66432d0: Pie and donut charts (E9.11) with per-label legend entries and hover; `domain` placement for non-cartesian traces (E4.5); `layout.grid` and the `makeSubplots()` helper (E4.4); axis `overlaying`.
- 1b629e6: Rich text (Plotly pseudo-HTML) everywhere Plotly allows it: `<b>`, `<i>`, `<em>`, `<strong>`, `<u>`, `<s>`, `<sup>`, `<sub>`, `<span style="…">`, `<a href target>`, `<br>` and HTML entities in titles, axis titles and tick labels, legend items, colorbar titles, annotations, shape labels, scatter/bar/pie text labels and hover labels. Mixed styles are drawn as styled runs with the default font's bold and italic faces (loaded only when used); links show a pointer cursor and open with their `target` (default `_blank`, `noopener`), and only `http(s)`, `mailto` and relative URLs are kept. New core API: `parseRichText`, `richTextLines`, `sanitizeHref`; render: `TextLabel.runs`, `layoutTextRuns`, `textLinkAt`. `layout.uniformtext.{mode, minsize}` draws bar and pie labels at one size per trace type (`hide` / `show`), as in Plotly.
- 66432d0: Shapes (E5.5): lines, rectangles, circles and SVG paths in data, paper or domain coordinates, with labels, layers, drag/resize editing, the `addHline`/`addVline`/`addHrect`/`addVrect` helpers, and autorange that includes data-referenced shapes. Layout images (E5.6) with `contain`/`fill`/`stretch` sizing.
- 1b629e6: New `table` trace (Plotly's `table`): `header` / `cells` with `values`, d3 `format`, `prefix`, `suffix`, `align`, `line`, `fill`, `font` and `height`, styled per column or per column and row; `columnwidth`, `columnorder` (drag a header cell to reorder, which restyles `columnorder`) and `domain`. Rows are virtualized, so tables with 100,000 rows scroll smoothly with the wheel, by dragging, or with the scrollbar; the chart never zooms or pans under a table. Text with spaces wraps and grows its row, as in Plotly. The default `holochart` template styles tables (dark header, faint rules, 9 px text). Gantt charts: `timeline({ data, xStart, xEnd, y, color, … })` builds a `px.timeline`-style figure (horizontal bars with a date `base` and ms lengths, one trace per color group, rows top-down), and bar hover labels on a date axis show the bar's end when it has a `base`.
- 66432d0: Themes, colors and fonts (E8.1–E8.3): 15 built-in themes (`holochart`, `holochart-dark`, `high-contrast`, `neon` and plotly.py's `plotly`, `plotly_white`, `plotly_dark`, `simple_white`, `ggplot2`, `seaborn`, `presentation`, `xgridoff`, `ygridoff`, `gridon`, `none`); every plotly.py palette and colorscale (cmocean, CARTO, ColorBrewer, cyclical) with `_r` variants, `colors.register` / `colorways.register`, `layout.colorscale` and `layout.colorscaleInterpolation` (`rgb`, `oklab`, `lab`, `hcl`); `fonts.register('Inter', { regular, bold, italic, boldItalic })` and the `font.variant`, `textcase`, `lineposition` and `shadow` attributes.

### Patch Changes

- 9746e15: Docs: an OpenRouter token-growth demo page that recreates mk7s/exporouter with Holochart and adds provider share, model, task and industry-growth charts.
- Updated dependencies [9166528]
- Updated dependencies [1b629e6]
- Updated dependencies [66432d0]
- Updated dependencies [66432d0]
- Updated dependencies [1b629e6]
- Updated dependencies [66432d0]
- Updated dependencies [1b629e6]
- Updated dependencies [66432d0]
  - @mk7s/holochart-core@0.1.0
  - @mk7s/holochart-runtime@0.1.0
  - @mk7s/holochart-render@0.1.0
  - @mk7s/holochart-themes@0.1.0
  - @mk7s/holochart-components@0.1.0
  - @mk7s/holochart-traces-basic@0.1.0
