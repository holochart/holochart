---
'@mk7s/holochart-core': patch
'@mk7s/holochart-render': patch
'@mk7s/holochart-runtime': patch
'@mk7s/holochart-components': patch
'@mk7s/holochart': patch
---

Runtime robustness. A chart event listener that throws no longer stops the other listeners or the chart (hover, zoom, `afterplot` and update promises carry on); its error is reported with `reportError`. The same goes for `config.renderHover` (the built-in labels are drawn instead), custom modebar buttons, render-loop listeners and font-change subscribers. Without WebGL2, `createChart` throws and `newPlot` rejects with the new `WebGLUnavailableError`, and the container shows a note that WebGL2 is required plus the chart's text description instead of staying blank; `purge(el)` removes it, and `getChart(el)` no longer returns a chart whose mount failed. `WebGLUnavailableError` and `ValidationError` extend the new `HolochartError`. Teardown logs a failing dispose (`[holochart] disposing … failed`) and always releases the WebGL context.
