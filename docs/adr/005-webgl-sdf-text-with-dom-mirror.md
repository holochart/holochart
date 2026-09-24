# ADR-005: WebGL SDF text with a DOM mirror

- **Status:** Proposed (spike C not yet measured; deferred to the M7 benchmarking pass).
- **Date:** 2026-09-23
- **Related stories:** E0.7 (spike C), E2.9, E2.10, E8.3, E17.1, E18.1; plan §16 Q4, risk R2

## Evidence

- `TextPrimitive` (troika `BatchedText`) renders labels in one draw call with a synchronous
  metrics oracle, and is stable run to run under SwiftShader ([spike E](../spikes/e-determinism.md)).
- The 2,000-label comparison with a DOM overlay is not measured yet
  ([spike C](../spikes/c-text.md)). Decide Accepted/Rejected from that data.

## Context

Charts are text-heavy: tick labels, titles, legends, annotations, hover labels. Text must be crisp at
any DPR, themable with any web font, appear in raster export (E18.1) exactly as on screen, and work
in 3D (billboarded axis labels, labels on extruded bars). The layout stage also needs synchronous
text measurement. At the same time, canvas-rendered text is invisible to screen readers and cannot be
selected or copied (principle 10, risk R7).

## Decision

Text renders in WebGL as SDF glyphs via **troika-three-text** (E2.9): pooled label objects, batched
sync so only changed labels re-layout, a cached font-metrics oracle for layout, and billboard mode for
3D. A **hidden DOM mirror** (E17.1) describes the chart and exposes text for assistive technology and
selection.

An opt-in DOM overlay mode, `config.textRenderer: 'dom'`, renders 2D text as positioned DOM elements
instead, for apps that need native text selection, browser font rendering, or very large label counts
where DOM is cheaper.

## Consequences

### Positive

- Text is part of the WebGL frame, so `toImage` export is pixel-identical to the screen.
- Same text primitive in 2D and 3D; labels can be depth-tested and lit with the scene.
- Any WOFF/TTF/OTF font works, with lazy glyph atlas generation (E8.3).

### Negative

- SDF text is less sharp than native text at small sizes, and troika layout adds CPU cost and
  bundle size (risk R9). Mitigated in M2 wave 0 (E21.5): troika and its dependencies (~44 kB gz)
  load with a dynamic `import()` the first time a chart draws text, and layout measures
  synchronously without it. Rich text (E2.10), RTL, and CJK need extra work.
- Two text paths (WebGL and DOM) must be kept visually consistent and tested.
- The DOM mirror must be kept in sync with the rendered chart.

### Follow-ups

- **Spike C (E0.7):** troika with 2,000 tick labels; measure update cost and memory. Spike C also
  settles §16 Q4 (default text renderer) and moves this ADR to Accepted or Rejected.
- Bundle fonts for visual tests ([ADR-018](018-visual-regression-harness.md)).

## Alternatives considered

### DOM overlay only (CSS2DRenderer)

Native text quality, selection, and accessibility with little code. Rejected as the default because
DOM text is not in the WebGL framebuffer (export must re-composite it), does not depth-sort or work
naturally in 3D, and thousands of absolutely positioned elements are slow to update during pan/zoom.
Kept as the opt-in `textRenderer: 'dom'` mode and as the fallback if spike C fails.

## References

- `plan.md` §5 (Text row), §6 ADR table, E0.7 spike C, E2.9, E17.1, §16 Q4, risks R2 and R7
- [ADR-004](004-one-webgl-context-per-figure.md), [ADR-008](008-pixel-space-orthographic-2d-camera.md)
