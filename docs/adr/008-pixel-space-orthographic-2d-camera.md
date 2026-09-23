# ADR-008: Pixel-space orthographic camera for 2D subplots

- **Status:** Accepted
- **Date:** 2026-09-23
- **Related stories:** E2.3, E2.4, E2.5, E2.7, E8.9, E16.4; plan §3 principle 7, §4.3

## Context

Plotly specifies marker sizes, line widths, dash lengths, tick lengths, and paddings in CSS pixels.
2D subplots render into scissored viewports of a shared canvas
([ADR-004](004-one-webgl-context-per-figure.md)). If 2D geometry lived in normalized device units,
every primitive would need to convert pixel-specified sizes on each resize and zoom, and hover
distances would need a separate conversion. Plan principle 7 also wants 2D to be a special case of 3D
so the same primitives serve both and a 2D chart can be lifted into 3D (`view3d`, E8.9).

## Decision

Each 2D viewport uses an `OrthographicCamera` where **1 world unit = 1 CSS pixel** of the viewport,
with the origin at the viewport's plot area. Line widths, marker sizes, and dash patterns are
therefore specified directly in px in shaders and geometry. Data coordinates are mapped to pixel
space through the axis scales (data → linearized → pixel, plan §4.3); zoom and pan update the
data-to-pixel transform (uniforms), not the geometry. Vertex buffers store linearized values
relative to a per-trace origin (RTC encoding, E16.4) to keep float32 precision. The device pixel
ratio is applied only at the renderer/framebuffer level.

## Consequences

### Positive

- Pixel sizes from the spec map 1:1 to world units; no per-primitive conversion.
- Hover, picking, and text layout share the same pixel coordinate system.
- The same primitives work in 3D by swapping the camera; `view3d` becomes a camera change.
- DPR changes do not affect layout, only framebuffer resolution.

### Negative

- Screen-space-sized primitives in 3D (lines, markers) need a separate world-to-screen path.
- Every viewport resize must update its camera frustum.
- Pixel snapping (crisp 1 px borders) must be handled explicitly (E2.7).

## Alternatives considered

### Normalized device units (−1..1 or 0..1 domain space)

Resolution-independent geometry, and camera setup never changes on resize. Rejected because
Plotly-style px sizes would need conversion in every primitive and on every resize, line widths and
marker sizes are easy to get subtly wrong across DPRs, and hover math would need its own transform.

## References

- `plan.md` §3 principle 7, §4.3 coordinate systems, §6 ADR table, E2.3, E16.4
- [ADR-004](004-one-webgl-context-per-figure.md), [ADR-010](010-cpu-spatial-hover-gpu-picking-3d.md)
