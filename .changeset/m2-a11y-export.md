---
'@mk7s/holochart-core': minor
'@mk7s/holochart-runtime': minor
'@mk7s/holochart-components': minor
'@mk7s/holochart-traces-basic': minor
'@mk7s/holochart': minor
---

Accessibility and image export. Every chart now describes itself to screen readers: the chart element gets `role="figure"` (`role="img"` for `staticPlot`) and an `aria-label` from `config.ariaLabel` (new), `layout.meta.description` or the title plus an automatic summary, and a visually hidden description with the axes, one summary per trace (scatter, bar and pie describe their data) and data tables of the first 100 points; read it from code with `chart.description`. New `chart.toImage({ format, width, height, scale, transparent })` and `chart.downloadImage()` (and Plotly's functional `toImage(el | figure, …)` / `downloadImage(el, …)`) draw the figure offscreen at the requested size and resolution as PNG, JPEG or WebP, without the modebar or hover labels; the modebar camera button now uses `config.toImageButtonOptions` (format, filename, width, height, scale).
