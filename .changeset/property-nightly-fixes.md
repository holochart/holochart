---
'@mk7s/holochart-core': patch
'@mk7s/holochart-traces-graph': patch
---

An axis that `matches` another no longer keeps a `range` or `categoryarray` that only its own template gives when the axis it matches has none: the group autoranges, as it was already drawn, and the full layout stays the same when it is fed back in. It used to come back with the template's range copied to the matched axis.

Radial tree layout: two siblings no longer land on top of each other on a full circle when nothing else on their ring takes any angle (nodes without a size and `subtreesep: 0`). With a `subtreesep` close to 0 the ring is no longer pushed far out to pull them apart.
