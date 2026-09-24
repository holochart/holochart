---
'@mk7s/holochart-core': minor
'@mk7s/holochart-runtime': minor
'@mk7s/holochart-render': minor
'@mk7s/holochart-themes': minor
'@mk7s/holochart': minor
---

New default look: charts without `layout.template` use the dark, dense `holochart` template (near-black background, tiny Helvetica-style text drawn with the bundled TeX Gyre Heros font, a red/blue/indigo/emerald colorway and a neon plasma colorscale). Plotly's look is `layout.template: 'plotly-classic'` (identical to the previous default); `setDefaultTemplate('plotly-classic')` switches it globally. TeX Gyre Heros now ships as the default font (loaded lazily per face; no CDN fetch by default), and `holochart-dark` is a deprecated alias of `holochart`.
