---
'@mk7s/holochart-render': minor
'@mk7s/holochart-traces-3d': patch
---

Charts come back complete after the browser takes the WebGL context away and restores it (a GPU reset, a long time in a background tab). Buffers, textures, text and picking already did; a 3D scene's generated environment (`lighting.environment: 'studio' | 'city'`) did not, which left metallic and physical materials black. It is now drawn again on `webglcontextrestored`.

Texture sizes follow the device instead of an assumed 4096: `chart.three.root.capabilities` has the context's `maxTextureSize` and `max3DTextureSize`. Heatmaps pack their values into rows that fit, and a heatmap, image, surface or volume grid too large for the GPU logs a warning and is not drawn, instead of drawing black.
