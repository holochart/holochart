---
'@mk7s/holochart-runtime': minor
'@mk7s/holochart-components': minor
'@mk7s/holochart-traces-basic': minor
'@mk7s/holochart': minor
---

Transitions and animation, Plotly-compatible: `react` with `layout.transition` animates to the new figure (numbers, OKLab colors, per-point arrays matched by `ids` with entering and exiting points fading and growing, axis ranges; every Plotly easing, `ordering`), and `figure.frames` play with `chart.animate` (`addFrames`, `deleteFrames`, groups, `baseframe`, `mode`, `direction`, `fromcurrent`, and the `animating`, `animatingframe`, `animated`, `animationinterrupted` and `transitioning` / `transitioned` / `transitioninterrupted` events). Update menus' `animate` method calls it, so Plotly's Play / Pause buttons work, and sliders over frames follow playback. The animation code loads the first time a chart animates.
