---
'@mk7s/holochart-traces-finance': minor
'@mk7s/holochart-traces-basic': minor
'@mk7s/holochart-core': minor
'@mk7s/holochart-runtime': minor
'@mk7s/holochart': minor
---

`waterfall` (E12.4), `funnel` (E12.5) and `funnelarea` (E12.6) traces in `@mk7s/holochart-traces-finance`.

- `waterfall`: `measure` (`relative`, `total`, `absolute`), a scalar `base`, `orientation`, `increasing` / `decreasing` / `totals` `.marker.{color, line}` (Plotly's `#3D9970` / `#FF4136` / `#4499FF`), connector lines (`connector.visible`, `mode: 'between' | 'spanning'`, `line.{color, width, dash}`), `textinfo` (`label`, `text`, `initial`, `delta`, `final`) and `texttemplate` with `%{initial}`, `%{delta}`, `%{final}`, and `layout.waterfallmode` (`group`, `overlay`), `waterfallgap`, `waterfallgroupgap`. Hover adds Plotly's change (▲ / ▼) and initial-value lines; events and `hovertemplate` get `initial`, `delta` and `final`.
- `funnel`: stages as bars centered on the value axis (horizontal by default, stage axis reversed and value axis hidden unless other traces use them, as in Plotly), `textinfo` with `value`, `percent initial`, `percent previous`, `percent total`, `label` and `text`, connector regions between stages (`connector.fillcolor`, `line`, `visible`), and `layout.funnelmode` (`stack`, `group`, `overlay`), `funnelgap`, `funnelgroupgap`. Hover adds the three percentage lines.
- `funnelarea`: pie-like data (`labels`, `values`, `marker.colors`, `text`, `textinfo`, `texttemplate`, `scalegroup`, `domain`, `title`) as stacked trapezoids with areas proportional to their values, shaped by `aspectratio` and `baseratio`, with `layout.funnelareacolorway` / `extendfunnelareacolors`, per-label legend items toggling `hiddenlabels` and per-stage hover.

Waterfalls and funnels are drawn by bar's renderer (one instanced rect set, batched SDF labels with bar's `textposition` / `insidetextanchor` / `textangle` / `constraintext` placement) and laid out with bar's stacking helper, each type on its own; connectors are one line primitive, funnel regions and funnel-area stages one batched polygon fill. traces-basic exports the bar and pie helpers they reuse (`calcBar`, `layoutBars`, `barHoverPoints`, `placeBarText`, `sliceText`, …); hover points can carry `extraText` lines (runtime); core defaults funnel axes like Plotly. The default template gives waterfalls the colorway's emerald, red and blue with thin gray connectors.
