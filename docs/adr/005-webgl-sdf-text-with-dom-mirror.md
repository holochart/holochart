# ADR-005: WebGL SDF text with a DOM mirror

- **Status:** Accepted (2026-10-11, by the owner), on the spike C measurements below. The opt-in DOM text mode that the
  proposal described was struck before acceptance: it was never built.
- **Date:** 2026-09-23
- **Related stories:** E0.7 (spike C), E2.9, E2.10, E8.3, E17.1, E18.1; plan §16 Q4, risk R2

## Evidence

- `TextPrimitive` (troika `BatchedText`) renders labels in one draw call with a synchronous
  metrics oracle, and is stable run to run under SwiftShader ([spike E](../spikes/e-determinism.md)).
- [Spike C](../spikes/c-text.md), measured 2026-10-11 with 2,000 labels: WebGL text pans in
  3.5–4 ms a frame in one draw call, and a change to 100 labels is on screen in 13 ms. Its first
  layout is the weak spot: about 90 ms warm and 180–300 ms cold, against 12–19 ms to create the
  same labels in the DOM. The DOM overlay was cheaper on everything measured, which excludes
  paint. The machine was under load, so the ratios are the evidence, not the milliseconds.

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

There is one text path. The proposal also described an opt-in DOM overlay mode
(`config.textRenderer: 'dom'`) for apps that want native text selection or browser font rendering.
It was never built, and it is not part of this decision; a DOM text mode would need an ADR of its
own.

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
- No native text selection or browser font rendering for chart text; the DOM mirror is the only
  DOM text.
- The first layout of a very dense figure is slow: thousands of labels cost about 100 ms.
- The DOM mirror must be kept in sync with the rendered chart.

### Follow-ups

- **Spike C (E0.7):** done, see Evidence. It settles §16 Q4: WebGL is the text renderer.
- Remove the `config.textRenderer` key from the schema. Nothing reads it (backlogv2 V2-B7).
- Bundle fonts for visual tests ([ADR-018](018-visual-regression-harness.md)).

## Alternatives considered

### DOM overlay only (CSS2DRenderer)

Native text quality, selection, and accessibility with little code. Rejected as the default because
DOM text is not in the WebGL framebuffer (export must re-composite it), does not depth-sort or work
naturally in 3D, and thousands of absolutely positioned elements are slow to update during pan/zoom.
Spike C did not fail, so it is not needed as a fallback either.

## References

- `plan.md` §5 (Text row), §6 ADR table, E0.7 spike C, E2.9, E17.1, §16 Q4, risks R2 and R7
- [ADR-004](004-one-webgl-context-per-figure.md), [ADR-008](008-pixel-space-orthographic-2d-camera.md)
