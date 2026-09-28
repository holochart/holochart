---
'@mk7s/holochart-traces-hier': minor
'@mk7s/holochart-runtime': minor
'@mk7s/holochart-core': minor
'@mk7s/holochart': minor
---

New `sankey` trace: nodes in columns sized by their flow and links as wide as their value, laid out by a deterministic port of d3-sankey (`node.pad`, `thickness`, `align`, fixed `node.x` / `node.y`, `node.groups`, `orientation`), with cycles routed as loops, `link.arrowlen` arrowheads, per-link colors and `link.colorscales` concentration colorscales. Hovering highlights a node's or a link's links (`hovercolor`) with separate `node.hovertemplate` / `link.hovertemplate`, `valueformat` and `valuesuffix`; nodes can be dragged per `arrangement` (`snap`, `perpendicular`, `freeform`, `fixed`), which restyles `node.x` / `node.y`. Hover points may now set their own secondary box (`extra`) and a `kind` (the default look gets sankey entries).
