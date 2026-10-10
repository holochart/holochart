---
'@mk7s/holochart-traces-3d': patch
---

3D scenes no longer leave two GPU buffers behind each time their axes are rebuilt at a different size. On the shared renderer those buffers outlived the chart.
