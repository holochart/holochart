---
'@mk7s/holochart-traces-hier': minor
'@mk7s/holochart': minor
---

Sankey flow particles (a Holochart extension): `link.flow` streams animated dots along every link from its source to its target, loops included — `density` (per 100 px of length for every 10 px of width), `speed` (px per second), `size`, `color` (default: the link color, opaque) and `opacity`, per link where it makes sense. The particles are one instanced draw animated by a GPU time uniform, loaded on first use; they move only while the chart is on screen, dim with links outside a hover highlight, follow dragged links, and hold still under `prefers-reduced-motion: reduce`. `link.flow.time` freezes them at a given time for deterministic exports and tests.
