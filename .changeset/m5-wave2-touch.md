---
'@mk7s/holochart-runtime': minor
'@mk7s/holochart-components': minor
'@mk7s/holochart-traces-basic': minor
'@mk7s/holochart-traces-hier': minor
'@mk7s/holochart-traces-sci': minor
'@mk7s/holochart-traces-stats': minor
'@mk7s/holochart': minor
---

Touch and pointer support (E6.6): one Pointer Events pipeline for mouse, pen and touch.

- A tap hovers the points under the finger and emits `click`; the hover stays after the finger lifts until a tap elsewhere on the chart or off it. Double taps (up to 30 px apart) reset like a double-click. Touch and pen taps tolerate 10 px of travel.
- Pinch zooms around the fingers' midpoint and two fingers pan, previewed per frame (`relayouting`) and committed with one `relayout`, respecting `fixedrange`, `minallowed` / `maxallowed`, `matches` and `scaleanchor`. A second finger cancels a runtime drag in progress; views that own a drag (sankey nodes, range slider, table) ignore extra fingers; a cancelled pinch restores the ranges.
- The canvas `touch-action` keeps page scrolling on phones: `pan-y` in zoom mode (vertical swipes scroll the page, sideways ones draw the zoom box), `none` for pan / select / lasso / draw modes, `manipulation` for `dragmode: false`, all-fixed axes and charts without cartesian axes. Trace modules declare what their own drags need with the new `TraceModule.touchAction` (`'pan-y'`: sankey, scatterpolar, barpolar; `'none'`: table, parcoords, parcats).
- Modebar buttons are 32 px tap targets with a coarse pointer, with `touch-action: manipulation`.
