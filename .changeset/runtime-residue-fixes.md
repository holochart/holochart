---
'@mk7s/holochart-runtime': patch
'@mk7s/holochart-render': patch
---

Text that a trace measured before its font had loaded is measured again once the font arrives. Horizontal bars with `textposition: 'outside'` (also histograms, waterfalls and funnels) reserved room for their labels with the browser's fallback font, so the axis range depended on the fonts installed; graph nodes with `shape: 'box'` were sized the same way, and contour labels could be. Traces that measure no text are not recalculated when a font loads.

`chart.ready` and the promises of `newPlot`, `react` and the other updates now always settle. They used to wait forever when the text engine could not typeset: its worker or the built-in font blocked by a Content Security Policy without `blob:`, or a character the font lacks while the fallback font (fetched from jsDelivr by default, see `configureText({ unicodeFontsURL })`) could not be reached. The wait for text now ends after 10 seconds with one console warning; the chart is drawn without the missing text, and text that arrives later still appears.

Strict mode (`config.strict`) validates every update, style-only ones such as `restyle({ 'marker.color': … })` included. An update it rejects no longer leaves the invalid value in `chart.data` or `chart.layout`: the figure returns to what it was before the rejected calls.

An update call that throws applies nothing. `chart.update` with a trace index out of range used to apply its config, its layout and the trace patches before the bad one; `updateAttributes` with a malformed layout path used to keep its restyle.
