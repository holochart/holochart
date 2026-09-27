---
'@mk7s/holochart-core': minor
'@mk7s/holochart-runtime': minor
'@mk7s/holochart-components': minor
'@mk7s/holochart-traces-basic': minor
'@mk7s/holochart': minor
---

Legend group titles: `legendgrouptitle` (`text`, `font`) now draws a title row heading its `legendgroup`, in `legend.grouptitlefont` (by default the global font, 10% larger, as in Plotly); clicking it toggles the group (`groupclick: 'togglegroup'`) and it fades when the whole group is hidden. Grouped horizontal legends lay each group out as a column, like Plotly, and `legendwidth` sets a trace's item width in horizontal legends (`legend.entrywidth` in px now counts the text width after the glyph, as in Plotly). Bars support `xperiod`, `xperiod0` and `xperiodalignment` (and the `y` versions), with the unaligned position in hover; hover labels of `x0`/`dx` (and `y0`/`dy`) traces show each point's own position, including on date and category axes; `x0`/`dx` positions and period alignment are exact across range breaks. Grids of subplots on `overlaying` axes draw under all traces of the subplot, and overlay subplots draw above their base. `config.displaylogo` is accepted (a no-op: the modebar has no logo). The default look labels log-axis in-between ticks in full (`minorloglabels: 'complete'`).
