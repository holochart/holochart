---
'@mk7s/holochart-core': minor
'@mk7s/holochart-components': minor
'@mk7s/holochart': minor
---

Multiple legends and scrolling legends. The trace attribute `legend` (`'legend'`, `'legend2'`, …) puts a trace's item in `layout.legend2`, `layout.legend3`, …: each a complete legend with every `layout.legend` attribute (position, orientation, title, fonts, colors, `traceorder`, groups, `maxheight`, clicks), its own margin push and its own keyboard toolbar ("Legend 2", with its title). As in Plotly, double-clicking an item isolates it within its own legend, and `showlegend` defaults to `true` when `legend` has two items or another legend has one. In the default look, a numbered legend takes the template legend's look but not its place. A legend taller than `maxheight` now scrolls instead of dropping items: Plotly's defaults (the plot height for vertical legends beside the plot, half the figure height otherwise, at least 30 px), a scrollbar, wheel scrolling that never zooms the plot, scrollbar and finger dragging, and keyboard focus that scrolls the focused item into view; the scroll position survives redraws. The scrolling code loads the first time a legend overflows. `supplyLegendDefaults(layoutIn, layoutOut, ctx)` now takes the input layout first (it coerces every legend container).
