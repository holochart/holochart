---
'@mk7s/holochart-traces-3d': minor
'@mk7s/holochart-runtime': minor
'@mk7s/holochart-render': minor
'@mk7s/holochart-components': minor
'@mk7s/holochart-core': minor
'@mk7s/holochart': minor
---

3D scene subplot (M6 wave 0, plan E14.1a–c), in the new `@mk7s/holochart-traces-3d` (registered by the full bundle): `layout.scene`, `scene2`, … with Plotly's attributes and defaults — `domain` (or a `layout.grid` cell), `bgcolor`, `camera.{eye, center, up, projection.type}` (perspective or orthographic), `aspectmode` (`auto`, `cube`, `data`, `manual`) and `aspectratio`, `dragmode`, `hovermode`, `uirevision` — and 3D axes (`xaxis`, `yaxis`, `zaxis`: linear, log, date and category types, Plotly's 1/32 autorange padding, ticks, grid and zero lines, axis lines, `mirror`, tick marks, titles, `showbackground` / `backgroundcolor` walls, spike attributes). Walls, grids and label edges follow the camera (the far faces of the box, as gl-plot3d); tick labels and titles are upright billboards with overlap culling. Controls: turntable, orbit, zoom and pan drags with damping (off with reduced motion), wheel zoom per `config.scrollZoom`, one-finger drags and two-finger pinch and pan, double-click reset; `relayouting` while the camera moves and one `relayout` with `scene.camera` (plus `scene.aspectratio` after an orthographic zoom) when it rests. The modebar shows Plotly's 3D group (`zoom3d`, `pan3d`, `orbitRotation`, `tableRotation`, `resetCameraDefault3d`, `resetCameraLastSave3d`). The default look gives scenes faint walls. For 3D trace authors: the runtime's `subplotViewport` hook (a 3D viewport per scene), `Viewport.setProjection`, the modebar's `fullLayout._modebarButtons` groups, and the scene contract (`acquireScene`, `sceneCrossTraceLayout`, `sceneSubplotDomain`, `sceneScales`, `Scene3D`).
