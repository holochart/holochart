---
'@mk7s/holochart-render': minor
'@mk7s/holochart-runtime': minor
'@mk7s/holochart-components': minor
'@mk7s/holochart-traces-basic': minor
'@mk7s/holochart-traces-stats': minor
'@mk7s/holochart-traces-sci': minor
'@mk7s/holochart-express': patch
'@mk7s/holochart': minor
---

Pattern fills (E8.10). `marker.pattern` (`shape` `'/'`, `'\'`, `'x'`, `'-'`, `'|'`, `'+'`, `'.'`, `fillmode` `'replace'` | `'overlay'`, `fgcolor`, `bgcolor`, `fgopacity`, `size`, `solidity`; arrayOk per bar or slice) draws on `bar`, `histogram`, `barpolar` and `pie`, and `fillpattern` on filled `scatter` traces, with Plotly's tile geometry, solidity mapping and default colors; legend glyphs show the patterns, and Express's `pattern` argument now draws. Patterns are computed in the fragment shader of the rect, arc and fill primitives (tiles in screen px, anti-aliased over one device pixel), with no extra draw calls; the pattern code (Plotly's per-item color rules and the shader code, injected at `// @pattern-…` hooks) loads lazily the first time a chart draws a pattern, and `chart.ready` and image export wait for it. The rect and arc primitives take a `pattern` and the fill primitive a `{ kind: 'pattern' }` paint (`PatternFill`); `LegendGlyph.fill.pattern` carries a trace's pattern to the legend. Not yet: `pattern.path` and `marker.texture`.
