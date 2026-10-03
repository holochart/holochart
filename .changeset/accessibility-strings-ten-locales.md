---
'@mk7s/holochart-locales': minor
'@mk7s/holochart-traces-stats': patch
---

Accessibility strings in ten locales. `de`, `es`, `fr`, `it`, `ja`, `ko`, `pt-BR`, `ru`, `tr` and `zh-CN` now translate Holochart's own strings, which plotly.js's locales don't have: the generated chart summaries (until now `de`, `es` and `fr` only), every keyboard announcement ("Revenue: (Mar 1, 2024, 11), point 3 of 6.", "Zoomed in.", "View rotated.", the row, level and category sentences of grids, hierarchies and parcats), the name of the legend's keyboard toolbar and the plot area's keyboard hint. Regional locales that fall back to one of them (`de-CH`, `es-AR`, `es-PE`, `fr-CH`) get its strings; every other locale falls back to English, sentence by sentence (`pt-PT`, `zh-TW` and `zh-HK` fall back to `pt-BR` and `zh-CN` first when those are registered too, as they already did for Plotly's UI strings).

The same ten locales also fill gaps among the UI strings a chart looks up: the titles of the modebar's drawing buttons ("Draw line", "Erase active shape", …), and in `ko` and `pt-BR` the hover labels of box, violin, OHLC and candlestick (`open:`, `median:`, …), which plotly.js has under keys without the colon, plus the default trace name in `ko`.

These are machine translations that no native speaker has reviewed; the locales guide and the accessibility guide say so, and say what is still English: the rest of the hidden description (chart type sentence, axis and trace lines, table captions) and a few control names ("Chart toolbar", "Menu 1", "Slider 1", "Range selector"). To correct a sentence, register the locale with your own entry for its English key.

A parcoords dimension without a label is now named through the locale dictionary in its keyboard stops (`'Dimension {n}'`), instead of always in English.

The ten locale modules grow by 1 to 2.5 kB each (gzipped), to 3 to 4 kB; nothing is added to the core bundles. The locales guide now also states the limits of right-to-left text: legends, menus and axes are not mirrored, and measuring text without a browser has no bidi or shaping.
