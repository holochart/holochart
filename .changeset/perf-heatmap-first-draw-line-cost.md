---
'@mk7s/holochart-render': patch
'@mk7s/holochart-traces-sci': patch
---

Large heatmaps draw sooner and lines cost less GPU time, with the same pixels.

A 4096 × 4096 heatmap's first draw takes about half as long. Its values go to the GPU as one float per cell (`R32F`, 67 MB) instead of a value and a validity flag (`RG32F`, 134 MB), calc reads the rows once instead of twice, and the accessible description no longer scans all 16.7 million cells after every pipeline run. `packHeatmapValues` now returns one float per texel, with cells without a value stored as the largest float32.

On a 1M-segment pan, a solid line costs 2.1 to 2.6 times three's `Line2` instead of 3 to 4 times, and a dashed one 2.4 to 3 times instead of 8. A line with one color keeps it in a uniform instead of a per-vertex buffer (28 bytes per vertex instead of 44), a dashed line no longer recomputes and re-uploads its dash phase while panning, and each segment's quad ends where the pixels it draws end. New in `@mk7s/holochart-render`: `quadReach`, `QUAD_FRINGE` and `QUAD_SLACK` (the CPU mirror of the quad's extent).
