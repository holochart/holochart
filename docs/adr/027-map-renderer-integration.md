# ADR-027: Tile maps use MapLibre GL behind the figure's canvas

- **Status:** Proposed
- **Date:** 2026-10-04
- **Deciders:** GEO1; the owner accepts or rejects
- **Related stories:** backlog GEO1, GEO9, GEO10; plan E15.5; amends
  [ADR-023](023-shared-renderer-context-budget.md)

## Context

`scattermap`, `choroplethmap` and `densitymap` draw data over a tile map with zoom, bearing and
pitch. Writing a tile renderer is out of scope, so a map library draws the basemap and Holochart
draws the traces. MapLibre GL is the library Plotly's `*map` traces use, it is BSD-licensed and
needs no key.

There are two ways to put Holochart's primitives on a MapLibre map:

1. **Custom layer.** MapLibre's `CustomLayerInterface` calls us inside its frame, and we draw
   into its WebGL context.
2. **Overlay canvas.** The map is a DOM element of its own; Holochart draws on its own canvas
   above it, with the map's matrix as the camera.

GEO1 built both with the real marker, line and text primitives and measured them
([spike G](../spikes/g-maplibre.md); Chromium on an M1 Max, Metal and SwiftShader, 100k markers):

| Criterion                               | Custom layer                          | Overlay canvas                                                                                    |
| --------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Works with `RenderRoot` as it is        | no, needs a second kind of root       | yes, through `Viewport.projector`                                                                 |
| Drift against MapLibre's own circles    | ≤ 0.10 px                             | ≤ 0.13 px, up to pitch 85° and zoom 19                                                            |
| Frames behind during `easeTo`           | 0 of 90                               | 0 of 90 when drawn in the map's `render` event; about half or all when it schedules its own frame |
| Frame, median, DPR 1 (map alone 1.0 ms) | 1.6 ms                                | 2.9 ms                                                                                            |
| Frame, median, 1M markers               | 5.8 ms                                | 6.8 ms                                                                                            |
| Anti-aliasing                           | the map's (none by default)           | ours (4× MSAA)                                                                                    |
| Layer order                             | anywhere in the map's layers          | above every map layer                                                                             |
| Export to one PNG                       | redraw and read in one task           | redraw both, composite on a 2D canvas                                                             |
| GPU picking                             | has to run in `prerender`, 16 ms      | `GpuPicker` unchanged, 5 ms                                                                       |
| The map's context is lost               | MapLibre drops the layer; rebuild all | the chart keeps its context and buffers                                                           |
| Contexts, one map layer alone           | 2                                     | 3                                                                                                 |

Both line up with the map to a tenth of a pixel, so alignment does not separate them. Four other
findings do:

- `RenderRoot` owns its canvas: it appends and sizes it, clears it every frame, schedules its own
  frames and forces a context loss on destroy. A custom layer needs a hosted root that does none
  of that, and three rules about shared GL state that are easy to break.
- The context count favours the custom layer only for a layer on its own. A figure also draws a
  title, a legend, a colorbar and perhaps other subplots on its canvas, so a figure with a map has
  that canvas either way.
- Every MapLibre map is a WebGL context that ADR-023's budget does not count. Six maps with
  `sharedRenderer: 'auto'` came to 12 contexts; nine maps with dedicated contexts lost three,
  including the first map.
- The overlay cannot draw between the map's layers. Plotly's map traces have a `below` attribute
  for that, and by plotly.js's attribute descriptions `choroplethmap` and `densitymap` sit under
  some of the style's layers by default, so that place names stay readable over the data.

## Decision

We will draw tile maps with **MapLibre GL as an optional peer dependency of `traces-map`, as a
DOM layer behind the figure's canvas**. The map subplot is a viewport of the figure's own
`RenderRoot` whose camera is the map's matrix.

- **Drawing.** Holochart draws the map viewport synchronously inside the map's `render` event,
  never on a frame it schedules itself. The matrix comes from a no-op custom layer added to the
  map, because MapLibre 6 no longer exposes its transform; that layer is added again after the
  map restores a lost context.
- **Camera and events.** The map owns drag, scroll, pinch and keyboard; the figure's canvas lets
  pointer events through over the map viewport. `moveend` emits one `relayout` with `map.center`,
  `map.zoom`, `map.bearing` and `map.pitch`; `move` is the `relayouting` stream.
- **Hover and selection.** A CPU spatial index in mercator space, with the hit distance measured
  in projected pixels (a fixed radius in data units is wrong under pitch). `GpuPicker` is
  available unchanged.
- **Export.** `toImage` redraws the map and the figure in one task and composites them and the
  attribution on a 2D canvas. It waits for the map's `idle` with a time limit, so a tile that
  never arrives cannot hang it.
- **Contexts.** A figure with a map subplot uses the shared renderer by default, and each map
  counts against the page's budget. ADR-023's "4 dedicated + 1 shared + 1 text" becomes that plus
  one per map; the docs give the number of maps a page can hold.
- **Scope of the first version.** Mercator only: no MapLibre globe, and world copies off
  (`renderWorldCopies: false`) until `RenderRoot` can draw a viewport more than once. Traces are
  always above the map's layers; `below` is accepted and ignored with one warning, and listed as
  a deviation.
- **Packaging.** `maplibre-gl` `^6` is an optional peer; `traces-map` imports it dynamically and
  reports a missing peer by name. The app supplies the worker URL (`setWorkerUrl`) and links
  MapLibre's stylesheet; `traces-map` puts a time limit on the map's `load`, because a worker that
  cannot be found fails silently. There is no default style that needs a key or a network: the
  style is the user's, and the attribution control is always shown.

## Consequences

### Positive

- Nothing in `packages/render` has to change for the first map: one canvas per figure
  (ADR-004), the shared renderer, picking, export and context-loss handling work as they are.
- A fault stays on its side. A lost map context leaves the chart's buffers alone, and Holochart
  cannot corrupt MapLibre's GL state.
- Traces keep Holochart's markers, colorscales, anti-aliasing, hover and export paths.
- 60 Hz held with 100k and with 1M markers at DPR 1 and 2 on the test machine.

### Negative

- **Layer order.** Data covers the style's labels, and `below` is not honoured. For
  `choroplethmap` this is a visible difference from Plotly, where place names stay above the
  regions. Partial opacity is the only mitigation in the first version.
- 1–2 ms more per frame than a custom layer, and one more full-size compositor layer.
- The camera matrix depends on a probe layer or a private field, either of which a MapLibre
  release can break; the peer range has to be tested per minor version.
- Maps are heavy on the context budget. A dashboard of maps has a hard limit that a dashboard of
  charts no longer has.
- Under SwiftShader a frame with 10k markers takes about 0.3 s (the marker shader, not the map),
  so CI baselines for maps need small data and long timeouts.

### Follow-ups

- GEO9, in `packages/render`: make the external-camera viewport a supported input
  (`core/viewport.ts`); let a viewport be drawn more than once, for world copies
  (`core/render-root.ts`); give `LinePrimitive` an origin that follows the view, or do the hi/lo
  split, because float32 drifts 0.45 px at zoom 19 with a world-centred origin; a way to reserve
  foreign contexts in the shared-renderer budget (`core/shared-renderer.ts`).
- GEO9: text labels are projected on the CPU into a pixel-space viewport, as the spike does.
- GEO9: `densitymap` needs a float render target; not tried in the spike.
- GEO10: the CSP guide gains `worker-src` (`'self'`, or `blob:` for a cross-origin worker) and
  `connect-src` for the style's tiles, glyphs and sprites.
- Not measured, and needed before GEO9 ships: Firefox, Safari, a mobile device, a production
  build with the peer external, and a style with real tiles.
- If labels over data or `below` prove necessary, add a hosted root (spike G, "Changes in
  `packages/render`", items 7–10) as a second mode. Both ways draw the same primitives through
  the same matrix, so traces do not change.

## Alternatives considered

### Draw into MapLibre's context through a custom layer

It is the interface MapLibre provides for this, the cheapest per frame, and the only way to draw
under the style's labels. Not chosen for the first version: it needs a hosted `RenderRoot`,
depth-test and fill anti-aliasing options on the primitives, picking moved into `prerender`, a
different export path, and a full rebuild whenever the map loses its context; and a figure keeps
its own canvas regardless. It stays open as the answer to the layer-order problem.

### Draw the traces as MapLibre layers, as Plotly does

Labels, world copies and `below` come for free, and 100k circles cost 1.5 ms per frame. Rejected:
it gives up Holochart's markers, colorscales, picking and export, makes the map traces a second
implementation of every style attribute, and 100k points as GeoJSON raised the browser's memory
from 0.75 to 1.45 GB.

### Bundle MapLibre

Rejected: 302.5 kB gzip that does not tree-shake, plus a worker file and a stylesheet the app has
to serve anyway ([ADR-026](026-geo-packages-and-bundles.md)).

### Write a tile renderer

Out of scope by the epic's decision 4.

## References

- [Spike G: a Holochart layer over MapLibre GL](../spikes/g-maplibre.md),
  `examples/_spikes/g-maplibre.ts`
- `backlog.md`, "Before 1.0, epic: geographic charts", decision 4 and GEO9
- [ADR-004](004-one-webgl-context-per-figure.md),
  [ADR-008](008-pixel-space-orthographic-2d-camera.md),
  [ADR-010](010-cpu-spatial-hover-gpu-picking-3d.md),
  [ADR-023](023-shared-renderer-context-budget.md),
  [ADR-026](026-geo-packages-and-bundles.md)
- [bundle-size.md, "Geo candidates, measured for GEO1"](../release/bundle-size.md#geo-candidates-measured-for-geo1-2026-10-03)
