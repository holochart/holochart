---
'@mk7s/holochart-core': minor
'@mk7s/holochart-runtime': minor
'@mk7s/holochart-components': minor
'@mk7s/holochart-traces-basic': minor
'@mk7s/holochart': minor
---

Keyboard navigation and keyboard access to every control (E6.5, E17.4). Tab focuses an interactive chart's plot area (a `role="application"` focus target with a focus ring in the text color, the chart's first tab stop); the arrow keys then move a cursor between data points in x order (↑ / ↓ to the trace drawn next above / below), Page Up / Page Down switch traces in legend order, Home / End jump to a trace's ends, Enter / Space emit `click` with the Plotly-shaped point (and click-select with `clickmode: 'select'`), Escape clears; the point shows its hover label (`hover` events) and is announced in a polite live region with localizable text. `+` / `-` zoom around the point, Shift + arrows pan by a tenth of the range and `0` resets like a double-click, through the same GUI `relayout` as drags. Cartesian scatter, bar, waterfall, funnel, OHLC and candlestick traces and pie slices (new optional `TraceModule.keyboardPoints`) are navigated; the code loads on the chart's first focus. The legend, drawn in WebGL, gets transparent toggle buttons over its items (a "Legend" toolbar with one tab stop, arrows between items, Enter / Space toggle, Shift + Enter isolate, `aria-pressed` while shown). New `config.a11y.keyboard` (default `true`) turns both off. Tab order: plot area, legend, update menus, sliders, modebar, range selectors. Fixed a race in update menu dropdowns: a list reopened from the keyboard under a resting mouse pointer no longer takes the highlight back to the option under the pointer (options highlight on `pointermove`, not `pointerover`).
