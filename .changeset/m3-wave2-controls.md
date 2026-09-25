---
'@mk7s/holochart-components': minor
'@mk7s/holochart-runtime': minor
'@mk7s/holochart-core': minor
'@mk7s/holochart': minor
---

Layout controls: `updatemenus` (buttons and dropdowns) and `sliders` as accessible DOM controls running `restyle`/`relayout`/`update`; `xaxis.rangeslider` with a live thumbnail of the traces and `xaxis.rangeselector` buttons; box/lasso selections stored in `layout.selections`, restored on load and editable. Their drawing code loads only when a figure uses them.
