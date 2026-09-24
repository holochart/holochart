# @mk7s/holochart-themes

## 0.1.0

### Minor Changes

- 9166528: New default look: charts without `layout.template` use the dark, dense `holochart` template (near-black background, tiny Helvetica-style text drawn with the bundled TeX Gyre Heros font, a red/blue/indigo/emerald colorway and a neon plasma colorscale). Plotly's look is `layout.template: 'plotly-classic'` (identical to the previous default); `setDefaultTemplate('plotly-classic')` switches it globally. TeX Gyre Heros now ships as the default font (loaded lazily per face; no CDN fetch by default), and `holochart-dark` is a deprecated alias of `holochart`.
- 66432d0: Themes, colors and fonts (E8.1–E8.3): 15 built-in themes (`holochart`, `holochart-dark`, `high-contrast`, `neon` and plotly.py's `plotly`, `plotly_white`, `plotly_dark`, `simple_white`, `ggplot2`, `seaborn`, `presentation`, `xgridoff`, `ygridoff`, `gridon`, `none`); every plotly.py palette and colorscale (cmocean, CARTO, ColorBrewer, cyclical) with `_r` variants, `colors.register` / `colorways.register`, `layout.colorscale` and `layout.colorscaleInterpolation` (`rgb`, `oklab`, `lab`, `hcl`); `fonts.register('Inter', { regular, bold, italic, boldItalic })` and the `font.variant`, `textcase`, `lineposition` and `shadow` attributes.

### Patch Changes

- Updated dependencies [9166528]
- Updated dependencies [1b629e6]
- Updated dependencies [66432d0]
- Updated dependencies [1b629e6]
- Updated dependencies [1b629e6]
- Updated dependencies [66432d0]
  - @mk7s/holochart-core@0.1.0
