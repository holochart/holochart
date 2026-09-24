---
'@mk7s/holochart-core': minor
'@mk7s/holochart-traces-basic': minor
'@mk7s/holochart': minor
---

New `table` trace (Plotly's `table`): `header` / `cells` with `values`, d3 `format`, `prefix`, `suffix`, `align`, `line`, `fill`, `font` and `height`, styled per column or per column and row; `columnwidth`, `columnorder` (drag a header cell to reorder, which restyles `columnorder`) and `domain`. Rows are virtualized, so tables with 100,000 rows scroll smoothly with the wheel, by dragging, or with the scrollbar; the chart never zooms or pans under a table. Text with spaces wraps and grows its row, as in Plotly. The default `holochart` template styles tables (dark header, faint rules, 9 px text). Gantt charts: `timeline({ data, xStart, xEnd, y, color, … })` builds a `px.timeline`-style figure (horizontal bars with a date `base` and ms lengths, one trace per color group, rows top-down), and bar hover labels on a date axis show the bar's end when it has a `base`.
