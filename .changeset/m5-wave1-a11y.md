---
'@mk7s/holochart-core': minor
'@mk7s/holochart-runtime': minor
'@mk7s/holochart-components': patch
'@mk7s/holochart-traces-basic': minor
'@mk7s/holochart-traces-stats': minor
'@mk7s/holochart-traces-sci': minor
'@mk7s/holochart-traces-finance': minor
'@mk7s/holochart-traces-hier': minor
'@mk7s/holochart-themes': minor
'@mk7s/holochart-locales': minor
'@mk7s/holochart': minor
---

Accessibility (E17.2, E17.3, E17.5), configured by the new `config.a11y`.

- **Generated summaries** (E17.2, `a11y.summaries`, on by default): the accessible description gains an overview of trends and extremes written from the data — "USD by Month. Revenue rises from 1.2M (Jan 1, 2024) to 3.4M (Dec 1, 2024). It peaks at 3.6M (Nov 1, 2024)." — for lines, areas, markers (correlation), bars, histograms, box and violin plots, pies, funnel areas, heatmaps, contours, 2D histograms, candlestick and OHLC charts, indicators, sunbursts and sankeys, formatted like the chart. Deterministic rules (rise/fall at 10% of the range, extremes named only when they stand out). Sentences come from English templates that locale dictionaries translate; `@mk7s/holochart-locales` translates them for `de`, `fr` and `es`. The code loads lazily after the first draw; `chart.describe()` resolves to the description with its `overview`. Trace modules report facts through the new `TraceDescription.insight` (`series`, `shares`, `boxes`, `bins`, `grid`, `prices`, `value`).
- **Data tables** (E17.3, `a11y.dataTable: 'hidden' | 'visible' | false`): `'visible'` shows every trace's data as a table after the chart element, styled like the chart, with every row — virtualized past 200 rows (rows formatted as they scroll into view, through the new `table.row(i)`), `aria-rowcount`/`aria-rowindex`, a sticky header and a keyboard-scrollable region; `false` drops the tables.
- **Visual accessibility** (E17.5): the `high-contrast-dark` theme (white and yellow on black, every colorway color at 7:1 or more); `Safe`, CARTO's colorblind-safe palette, always available by name — `layout.colorway: 'Safe'` (colorlists now take a registered colorway's name); `a11y.patterns: true` gives bars, histograms, polar bars, filled areas and pie slices a distinct overlaid pattern each unless the trace or template sets one; `a11y.reducedMotion: 'auto' | true | false` overrides `prefers-reduced-motion` for transitions and slider glides (`reducedMotion(fullLayout)` in core for trace views).
