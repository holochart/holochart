---
'@mk7s/holochart-traces-finance': minor
'@mk7s/holochart-core': minor
'@mk7s/holochart-runtime': minor
'@mk7s/holochart-components': minor
'@mk7s/holochart': minor
---

New package `@mk7s/holochart-traces-finance` (in the full bundle, not in `basic`) with the `ohlc` (E12.2) and `candlestick` (E12.3) traces: `x` (or indices), `open`, `high`, `low`, `close`, Plotly's direction rule, `increasing` / `decreasing` styles (`line.color`, `line.width`, `line.dash` for ohlc, `fillcolor` for candles, defaulting to the line color at half opacity), `tickwidth`, `whiskerwidth`, `xperiod` / `xperiod0` / `xperiodalignment`, `xhoverformat` / `yhoverformat`, `text`, `hoverlabel.split` and the `boxmode` / `boxgap` / `boxgroupgap` layout for candles. Candlesticks draw in two instanced draw calls whatever the count (bodies as one rect set, wicks as one line batch), ohlc in one line batch per direction; zoom and pan are transform-only, also across range breaks. Hover shows Plotly's label (the date, open, high, low and close with ▲ / ▼), in closest, x and unified modes or split per price, and `hovertemplate` gets `%{open}` … `%{close}` plus `%{change}` and `%{changepercent}`; box and lasso selection, accessible descriptions and two-direction legend glyphs. Traces can now ask for a range slider (`requestRangeslider` in core): an x axis with an ohlc or candlestick trace shows one by default, as in Plotly. Legend glyphs can be made of parts (`kind: 'parts'`, `LegendGlyphPart`). The default template styles both types with the colorway's green and red at 1 px.
