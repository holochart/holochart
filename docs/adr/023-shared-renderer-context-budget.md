# ADR-023: A shared renderer keeps a page within a WebGL context budget

- **Status:** Proposed
- **Date:** 2026-10-02
- **Deciders:** ship wave R2 (S2.1)
- **Related stories:** E2.16, E2.1, E18.1; backlog S2.1; parity backlog PC07; risk R5; amends
  [ADR-004](004-one-webgl-context-per-figure.md)

## Context

[ADR-004](004-one-webgl-context-per-figure.md) gives each figure one canvas and one WebGL2
context. Browsers keep a limited number of live contexts per page (about 16 on desktop, 8 on
mobile Chrome) and drop the oldest beyond that, so the 17th chart on a dashboard blanked the
first. Every `toImage` call also drew through a temporary chart with a context of its own, so
exporting from a 16-chart page lost a chart too. ADR-004 left this to "E2.16 context pooling"
without choosing a design.

Two designs were on the table (backlog S2.1):

1. **A shared renderer.** One context on a canvas that is never in the page draws every figure
   and copies each frame into that figure's own canvas.
2. **Context pooling.** Every figure keeps its own context while it is in use; when the pool is
   full, the oldest idle figure is frozen to a bitmap and its context is given away.

The limit is not one number: it differs by browser and device, and other WebGL content on the
page (maps, other libraries) counts against it. The design has to hold a budget of its own
rather than run up to the browser's.

## Decision

We will use **a shared renderer, behind a budget of dedicated contexts**.

- `RenderRoot` takes `shared: boolean | 'auto'`. A shared root gets its `WebGLRenderer` from a
  `SharedRenderer` (`render/src/core/shared-renderer.ts`) and creates a plain 2D canvas as the
  figure's canvas. Each frame it draws into the bottom-left corner of the shared drawing buffer,
  clearing only its own rectangle, then copies that rectangle into its canvas with one
  `drawImage`. Anchoring at GL's origin leaves viewport, scissor, `gl_FragCoord` and pick-window
  maths exactly as on a dedicated canvas.
- The shared buffer is as large as the largest figure using it, in device px. It is resized
  when that maximum changes. Figures keep their pixels in their own canvases, so resizing or
  redrawing one never blanks another.
- There is one shared renderer per set of context attributes (`antialias`, `powerPreference`),
  created on first use and released with its last figure.
- `config.sharedRenderer` is `'auto'` (the default), `true` or `false`. With `'auto'` the first
  **4** figures on a page get a context of their own (`MAX_DEDICATED_CONTEXTS`) and later ones
  share. Single charts and small pages therefore run exactly as before, with no copy per frame.
- **Image export always draws through the shared renderer**, never a temporary context. Any
  number of concurrent exports use one context, the same one shared charts use.
- The static-image fallback in E2.16 ("oldest idle charts become static images") is dropped: no
  chart is ever evicted, so there is nothing to fall back from.

The resulting budget for a page is **4 dedicated + 1 shared + 1 for text**: troika generates
glyph SDFs in a WebGL context of its own, one per page however many charts there are. Six
contexts fits under the mobile limit with room for other content. Pages that mix `antialias` or
`powerPreference` values across shared charts add one context per distinct combination.

## Consequences

### Positive

- The context count no longer grows with the number of charts or exports.
- Charts on the shared renderer compile each shader program once and upload shared textures
  (marker atlases, glyph atlases, colorscales) once, instead of once per chart.
- A chart on the shared renderer draws the same pixels as one with its own context, and the
  same code paths: the difference is confined to `RenderRoot` and the picker's canvas size.
- Destroying a shared chart frees its GPU resources through three's dispose events; the
  context goes with the last chart.

### Negative

- One copy per frame for shared charts. It is a GPU-to-GPU copy in current browsers; under
  software rendering it is a readback.
- A lost context takes every chart on that renderer with it (all are told, and all redraw on
  restore).
- `chart.three.renderer.domElement` is not the chart's canvas on a shared chart. Code must use
  `chart.three.root.canvas`, or `presentedCanvas(renderer)` inside `onBeforeRender`.
  Renderer-wide state (`shadowMap.enabled`, tone mapping) set through the escape hatch affects
  every chart on that renderer.
- Which of two identical charts owns a context depends on mount order.
- `sharedRenderer: false` on more charts than the browser allows still loses contexts; that is
  now an explicit opt-out.
- Resources that a chart forgets to dispose used to die with its context. On a shared renderer
  they would accumulate, so leak tests (backlog S2.6) must cover shared charts.

### Follow-ups

- Measure the per-frame copy on real GPUs in Firefox and Safari (S2.5) and revisit the default
  of 4 with that data.
- Rebuild GPU-only resources (picking and environment render targets) on `contextrestored`
  (S2.2); a shared renderer makes one loss wider.
- Let troika's glyph generator use the shared context, or its JS fallback, to take the budget
  to five.

## Alternatives considered

### Context pooling with frozen idle charts

Keeps the zero-copy path for every active chart. Rejected: it does not bound anything when more
charts are visible and animating than the pool holds (a wall of small multiples), reviving a
frozen chart means recompiling its programs and re-uploading its buffers in a new context
(hundreds of ms, on hover), and it needs an idle and visibility policy that the shared renderer
does not.

### Share always, no dedicated contexts

One code path and the smallest context count. Rejected as the default because every chart would
pay the per-frame copy, including the single large animated 3D scene where it matters most.
`sharedRenderer: true` selects it per chart.

### One full-page canvas with a viewport per chart

No copy at all. Rejected: the canvas would have to sit behind or above the whole page, which
breaks scrolling containers, stacking order, CSS transforms and charts in other documents
(iframes, popups).

### `OffscreenCanvas.transferToImageBitmap` into `bitmaprenderer` canvases

A zero-copy hand-off, but it allocates a new drawing buffer every frame and needs the buffer to
be exactly the chart's size, which defeats one buffer for charts of different sizes.

## References

- `plan.md` E2.16, risk R5; `backlog.md` S2.1; `docs/plotly-parity-backlog.md` PC07
- [ADR-004](004-one-webgl-context-per-figure.md), [ADR-010](010-cpu-spatial-hover-gpu-picking-3d.md)
- `tests/interaction/dashboard.spec.ts`: 40 charts drawing, hovering and exporting within the
  budget, pixel-equal to a dedicated context
- `packages/render/src/core/shared-renderer.ts`, `render-root.ts`
