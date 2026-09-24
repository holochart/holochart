---
'@mk7s/holochart-core': minor
'@mk7s/holochart-runtime': minor
'@mk7s/holochart-components': minor
'@mk7s/holochart': minor
---

Layout and axes: switching an axis between linear and log with `relayout` converts its range, annotations and layout images (as Plotly does); log-axis tick suffixes are kept and `minorloglabels` is supported; the title and a multi-row legend stack instead of overlapping; the default look's top margin shrinks to 16 px and a new `margin.gutter` keeps labels off the figure edge; `makeSubplots` subplot titles scale with the layout font.
