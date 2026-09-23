# ADR-004: One WebGL context per figure, scissored subplot viewports

- **Status:** Proposed. Browsers cap contexts at about 16.
- **Date:** 2026-09-23
- **Related stories:** E0.7 (spike D), E2.1, E2.3, E2.16, E4.\*; plan §3 principle 5, risk R5

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

Optionally, a **shared renderer** can serve many figures (context pooling, `config.sharedRenderer`,
E2.16, P2): one offscreen context renders and blits to each figure's canvas, and when the limit is hit
the oldest idle charts fall back to static images.

## Consequences

### Positive

- A figure never uses more than one context, regardless of subplot count.
- GPU resources (textures, atlases, geometries) are shared across subplots within a figure.
- One render pass per frame; overlays and cross-subplot components draw in the same context.

### Negative

- Viewport, scissor, and clip management is our responsibility (including `cliponaxis`).
- One context loss affects the whole figure (mitigated by rebuild from `calcdata`, E2.1).
- Dashboards with more than ~16 figures still need E2.16 context pooling.

### Follow-ups

- **Spike D (E0.7):** 9 subplots scissored in one context; measure draw overhead and correctness.
  Its result moves this ADR to Accepted or Rejected.
- E2.16 shared renderer and docs guidance for large dashboards (risk R5).

## Alternatives considered

### One canvas per subplot

Simpler layout via DOM/CSS and natural isolation between subplots. Rejected because it multiplies
context count by subplot count (hits the browser cap on a single SPLOM), prevents resource sharing,
and makes cross-subplot overlays (spikelines, annotations in paper coordinates) harder.

## References

- `plan.md` §3 principle 5, §6 ADR table, E0.7 spike D, E2.3, E2.16, risk R5
- [ADR-007](007-on-demand-rendering.md), [ADR-008](008-pixel-space-orthographic-2d-camera.md)
