# ADR-007: On-demand rendering

- **Status:** Accepted. Saves battery and CPU.
- **Date:** 2026-09-23
- **Related stories:** E2.1, E2.2, E7.\* (transitions and animation), E6.\* (interaction), E16.6

## Context

Most charts are static most of the time. A continuous `requestAnimationFrame` loop redraws every
frame even when nothing changed, which burns CPU, GPU, and battery, and multiplies across pages with
many charts. Rendering still has to be smooth during drags, camera damping, and animated
transitions.

## Decision

A frame renders only when the scene is marked **dirty**. `invalidate()` schedules a single rAF render;
several invalidations in the same frame are coalesced (E2.2). The render loop switches to
**continuous mode** only while something is animating: transitions and frame animation, camera
damping (3D orbit inertia), or an active user drag. It returns to on-demand mode when that activity
ends. `beforerender` and `afterrender` events are emitted for every rendered frame.

Everything that changes visible output (updates, hover highlights, resize, texture/font load
completion) must call `invalidate()`.

## Consequences

### Positive

- Zero CPU/GPU use when idle; pages with many charts stay responsive.
- Predictable frame count, which makes render hooks and tests easier to reason about.
- Pairs well with a shared context ([ADR-004](004-one-webgl-context-per-figure.md)): only dirty
  figures are drawn.

### Negative

- Any code path that forgets `invalidate()` produces stale frames; this class of bug is easy to
  introduce (for example, an async glyph atlas finishing after the last render).
- Plugins and render hooks must follow the same discipline.
- Custom continuous effects (e.g. `uTime` shader hooks, E8.8) must explicitly request continuous
  mode.

### Follow-ups

- A debug mode that logs why each frame was rendered.
- Visual tests wait for readiness plus two frames so late invalidations are captured
  ([ADR-018](018-visual-regression-harness.md)).

## Alternatives considered

### Continuous rAF loop

Simplest to implement, and stale-frame bugs cannot happen. Rejected because idle charts would
consume CPU and GPU constantly, which is unacceptable for dashboards and mobile devices.

## References

- `plan.md` §6 ADR table, E2.2
- [ADR-004](004-one-webgl-context-per-figure.md)
