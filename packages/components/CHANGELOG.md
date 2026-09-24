# @mk7s/holochart-components

## 0.1.0

### Minor Changes

- 1b629e6: Accessibility and image export. Every chart now describes itself to screen readers: the chart element gets `role="figure"` (`role="img"` for `staticPlot`) and an `aria-label` from `config.ariaLabel` (new), `layout.meta.description` or the title plus an automatic summary, and a visually hidden description with the axes, one summary per trace (scatter, bar and pie describe their data) and data tables of the first 100 points; read it from code with `chart.description`. New `chart.toImage({ format, width, height, scale, transparent })` and `chart.downloadImage()` (and Plotly's functional `toImage(el | figure, …)` / `downloadImage(el, …)`) draw the figure offscreen at the requested size and resolution as PNG, JPEG or WebP, without the modebar or hover labels; the modebar camera button now uses `config.toImageButtonOptions` (format, filename, width, height, scale).
- 66432d0: Pie and donut charts (E9.11) with per-label legend entries and hover; `domain` placement for non-cartesian traces (E4.5); `layout.grid` and the `makeSubplots()` helper (E4.4); axis `overlaying`.
- 1b629e6: Rich text (Plotly pseudo-HTML) everywhere Plotly allows it: `<b>`, `<i>`, `<em>`, `<strong>`, `<u>`, `<s>`, `<sup>`, `<sub>`, `<span style="…">`, `<a href target>`, `<br>` and HTML entities in titles, axis titles and tick labels, legend items, colorbar titles, annotations, shape labels, scatter/bar/pie text labels and hover labels. Mixed styles are drawn as styled runs with the default font's bold and italic faces (loaded only when used); links show a pointer cursor and open with their `target` (default `_blank`, `noopener`), and only `http(s)`, `mailto` and relative URLs are kept. New core API: `parseRichText`, `richTextLines`, `sanitizeHref`; render: `TextLabel.runs`, `layoutTextRuns`, `textLinkAt`. `layout.uniformtext.{mode, minsize}` draws bar and pie labels at one size per trace type (`hide` / `show`), as in Plotly.
- 66432d0: Shapes (E5.5): lines, rectangles, circles and SVG paths in data, paper or domain coordinates, with labels, layers, drag/resize editing, the `addHline`/`addVline`/`addHrect`/`addVrect` helpers, and autorange that includes data-referenced shapes. Layout images (E5.6) with `contain`/`fill`/`stretch` sizing.

### Patch Changes

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
