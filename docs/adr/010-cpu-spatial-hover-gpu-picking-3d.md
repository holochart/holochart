# ADR-010: CPU spatial indexes for 2D hover, GPU ID picking for 3D

- **Status:** Proposed
- **Date:** 2026-09-23
- **Related stories:** E0.7 (spike A), E2.13, E6.1, E6.\* (selection), E14.\* (3D charts)

## Context

Hover and click must find the right point(s) quickly, including on millions of points. Plotly's
hover modes need more than "which object is under the cursor": `x` and `y` modes find all points at
the cursor's x (or y) across traces, `closest` needs distances in pixel space with `hoverdistance`,
and unified modes aggregate across traces. In 3D, points and mesh faces are projected through a
perspective camera, occlude each other, and dense clouds make CPU projection of every point costly.

## Decision

- **2D:** hover and selection use **CPU spatial indexes** built from calc data: a `flatbush` (or
  `kdbush`) index per trace, built lazily and invalidated on calc (E2.13). Queries run in pixel or
  linearized space ([ADR-008](008-pixel-space-orthographic-2d-camera.md)) and support `x`, `y`,
  `closest`, and unified hover modes.
- **3D:** meshes and dense 3D markers use **GPU ID picking**: render ID-encoded colors into a small
  render target (1×1 or a small region around the cursor) and read back asynchronously (PBO/fence
  where available).
- Both paths sit behind one API: `pick(x, y) → { traceIndex, pointIndex, distance }[]`.

## Consequences

### Positive

- 2D hover modes that need "all points near this x" are natural with an index and impossible with a
  single-pixel GPU read.
- CPU indexes work without a GPU round trip, in tests, and alongside worker calc.
- GPU picking in 3D handles occlusion and screen-space sizes for free.

### Negative

- Two picking implementations to maintain and keep consistent.
- Spatial indexes cost memory and build time on large traces (mitigated by lazy building).
- GPU readback is asynchronous; 3D hover may lag a frame.
- Shader-displaced geometry (shader hooks, E8.8) may disagree with CPU index positions.

### Follow-ups

- Spike A (1M markers): measure index build time and hover query latency alongside pan FPS.
- Accept once E2.13 meets latency targets at 1M points in 2D and dense 3D scatter.

## Alternatives considered

### GPU picking everywhere

One mechanism, exact for anything drawn. Rejected because it cannot express `x`/`y`/unified hover
(nearest point along an axis rather than under the cursor), needs an extra render pass per hover,
and has async readback latency even for simple 2D charts.

## References

- `plan.md` §5 (Spatial index row), §6 ADR table, E2.13, E6.1
- [ADR-008](008-pixel-space-orthographic-2d-camera.md), [ADR-011](011-calc-in-web-worker.md)
