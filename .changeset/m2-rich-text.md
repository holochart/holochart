---
'@mk7s/holochart-core': minor
'@mk7s/holochart-render': minor
'@mk7s/holochart-runtime': minor
'@mk7s/holochart-components': minor
'@mk7s/holochart-traces-basic': minor
'@mk7s/holochart': minor
---

Rich text (Plotly pseudo-HTML) everywhere Plotly allows it: `<b>`, `<i>`, `<em>`, `<strong>`, `<u>`, `<s>`, `<sup>`, `<sub>`, `<span style="…">`, `<a href target>`, `<br>` and HTML entities in titles, axis titles and tick labels, legend items, colorbar titles, annotations, shape labels, scatter/bar/pie text labels and hover labels. Mixed styles are drawn as styled runs with the default font's bold and italic faces (loaded only when used); links show a pointer cursor and open with their `target` (default `_blank`, `noopener`), and only `http(s)`, `mailto` and relative URLs are kept. New core API: `parseRichText`, `richTextLines`, `sanitizeHref`; render: `TextLabel.runs`, `layoutTextRuns`, `textLinkAt`. `layout.uniformtext.{mode, minsize}` draws bar and pie labels at one size per trace type (`hide` / `show`), as in Plotly.
