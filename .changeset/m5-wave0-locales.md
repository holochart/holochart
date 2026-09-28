---
'@mk7s/holochart-core': minor
'@mk7s/holochart-runtime': minor
'@mk7s/holochart-components': minor
'@mk7s/holochart-traces-basic': minor
'@mk7s/holochart-traces-stats': minor
'@mk7s/holochart-traces-sci': minor
'@mk7s/holochart-traces-finance': minor
'@mk7s/holochart-locales': minor
'@mk7s/holochart': minor
---

Locales: `config.locale` now translates the modebar, default trace names and hover labels (open/close, box statistics, kde) and formats numbers and dates for the language — separators, month and day names and default date formats in ticks, hover labels, templates, colorbars, pie, contour and indicator text. `register()` accepts plotly.js locale modules as they are (`{ moduleType: 'locale', name, dictionary, format }`), with Plotly's fallback from `de-CH` to `de` to English; `config.locales` adds per-chart locales and `layout.separators` overrides the separators. New package `@mk7s/holochart-locales` ships plotly.js's 76 locales as ES modules and `<script>` files (`dist/scripts/holochart-locale-de.js`). Arabic and Hebrew text is laid out right to left with joined Arabic letters when a font with the script is available.
