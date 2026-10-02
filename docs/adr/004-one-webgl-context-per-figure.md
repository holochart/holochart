# ADR-004: One WebGL context per figure, scissored subplot viewports

- **Status:** Proposed (spike D not yet measured; deferred to the M7 benchmarking pass).
- **Date:** 2026-09-23
- **Related stories:** E0.7 (spike D), E2.1, E2.3, E2.16, E4.\*; plan §3 principle 5, risk R5

## Evidence

- The `viewports-grid` example renders 9 scissored viewports (8 × 2D, one 3D) in one context,
  correctly and deterministically ([spike E](../spikes/e-determinism.md)).
- The cost comparison with separate canvases and the context-limit probe are not measured yet
  ([spike D](../spikes/d-viewports.md)). Decide Accepted/Rejected from that data.

## Context

A figure can contain many subplots (grids, facets, SPLOM, mixed 2D/3D). Browsers limit the number of
live WebGL contexts per page (roughly 16 in Chromium); beyond that the oldest context is lost.
Dashboards with dozens of charts, each with several subplots, would hit that limit quickly if every
subplot had its own canvas. Contexts also cannot share GPU resources (glyph atlases, colorscale
textures, shared geometries).

## Decision

Each figure owns **one canvas and one WebGL2 context**. Each subplot renders into a **scissored
viewport** of that canvas: `Viewport { rect(px), camera, scene, clip }` with the scissor test enabled
per viewport (E2.3). 2D viewports use a pixel-space orthographic camera
([ADR-008](008-pixel-space-orthographic-2d-camera.md)); 3D viewports use a perspective or orthographic
camera per `scene.camera.projection`. An overlay viewport renders figure-level components in paper
coordinates.

A **shared renderer** serves many figures from one context (`config.sharedRenderer`, E2.16): one
offscreen context renders and copies each frame to that figure's canvas. Its design and the context
budget it keeps are in [ADR-023](023-shared-renderer-context-budget.md), which amends this ADR: a
figure still has one canvas and scissored viewports, but its context may be shared.

## Consequences

### Positive

- A figure never uses more than one context, regardless of subplot count.
- GPU resources (textures, atlases, geometries) are shared across subplots within a figure.
- One render pass per frame; overlays and cross-subplot components draw in the same context.

### Negative

- Viewport, scissor, and clip management is our responsibility (including `cliponaxis`).
- One context loss affects the whole figure (mitigated by rebuild from `calcdata`, E2.1).
- Dashboards with more figures than the browser keeps contexts for (~16) need the shared renderer
  ([ADR-023](023-shared-renderer-context-budget.md)).

### Follow-ups

- **Spike D (E0.7):** 9 subplots scissored in one context; measure draw overhead and correctness.
  Its result moves this ADR to Accepted or Rejected.
- E2.16 shared renderer and docs guidance for large dashboards (risk R5): done in
  [ADR-023](023-shared-renderer-context-budget.md).

## Alternatives considered

### One canvas per subplot

Simpler layout via DOM/CSS and natural isolation between subplots. Rejected because it multiplies
context count by subplot count (hits the browser cap on a single SPLOM), prevents resource sharing,
and makes cross-subplot overlays (spikelines, annotations in paper coordinates) harder.

## References

- `plan.md` §3 principle 5, §6 ADR table, E0.7 spike D, E2.3, E2.16, risk R5
- [ADR-007](007-on-demand-rendering.md), [ADR-008](008-pixel-space-orthographic-2d-camera.md)
