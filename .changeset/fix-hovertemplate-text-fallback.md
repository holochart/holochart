---
'@mk7s/holochart-runtime': patch
---

Hover: `%{text}` in a `hovertemplate`, and the text line of `hoverinfo`, now read `text` when `hovertext` is empty, its default, as in Plotly (`hovertext || text`). Before, `%{text}` came out empty for most trace types (scatter, bar, bar3d, …), and a template of only `%{text}` showed no label.
