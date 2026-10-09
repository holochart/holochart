# Research: HDR rendering and a data-to-video studio

Status: exploratory, not scheduled. Written 2026-09-24.

Two ideas that build on Holochart's renderer. For each: the goal, where Holochart is today, a design
sketch, the research spikes that must answer open questions before any plan story is written, and
one end-to-end demo that would prove the idea.

Spikes follow the conventions in [`docs/spikes/README.md`](docs/spikes/README.md): a sandbox page
tagged `spike`, run with the isolated runner, starting at low scale.

---

## Where Holochart is today

Both ideas depend on the same parts of the stack:

| Area             | Current state                                                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Renderer         | three.js `WebGLRenderer`, one WebGL2 context per figure ([render-root.ts](packages/render/src/core/render-root.ts), ADR-004)                                   |
| Shaders          | GLSL3 `ShaderMaterial`s (ADR-009). WebGPU is opt-in after v1 via `WebGPURenderer` and TSL (plan E16.8, P3, M8)                                                 |
| Colour           | sRGB output (`SRGBColorSpace`). Colours parsed with `d3-color`, which cannot read `oklch()` or `color(display-p3 …)`. Colorscale LUTs are 256×1 RGBA8 textures |
| Frame scheduling | On-demand `RenderLoop` with an **injectable `FrameScheduler`** ([loop.ts](packages/render/src/core/loop.ts), ADR-007)                                          |
| Animation        | `layout.transition` is in the schema; attribute transitions (E7.3), frames and `animate` (E7.4) and camera animation (E7.5) are not built yet                  |
| Export           | `renderImage` renders offscreen and reads back with `canvas.toDataURL` (PNG/JPEG/WebP) ([image.ts](packages/runtime/src/export/image.ts))                      |
| Visual tests     | SwiftShader PNG baselines, bit-stable across runs and OSes (ADR-018, spike E)                                                                                  |

---

## 1. HDR mode

### Goal

Let charts use the brightness range of HDR displays: chosen marks (peaks, selections, live events)
render brighter than SDR white and actually glow, while everything else looks exactly as it does
today. On SDR displays the chart falls back to today's look with no loss of information.

Very few charting libraries do this. It suits the dark default look (ADR-021), where brightness has
the most room.

### Two separate capabilities

These are often lumped together but ship on different timelines:

1. **Wide gamut:** colours outside sRGB, such as Display P3. This works inside SDR and is likely reachable on
   WebGL today (`drawingBufferColorSpace = 'display-p3'`).
2. **Extended range:** values above 1.0 (brighter than SDR white). This needs a float drawing buffer and
   a canvas that is allowed to present extended values. The known route is a WebGPU canvas configured
   with `format: 'rgba16float'` and `toneMapping: { mode: 'extended' }` (Chromium first). Whether any
   WebGL route exists is an open question (spike H3).

Plan them as two phases: wide gamut first, then extended range.

### Design sketch

- **API:** keep it small and hard to misuse.
  - `config.dynamicRange: 'sdr' | 'auto'`. `auto` uses HDR only when the display supports it.
  - An `intensity` multiplier on marks and colorscale stops, relative to SDR white (1 = today, up to
    about 4). Colours stay ordinary colours; brightness is a separate channel, so SDR fallback just
    drops it.
  - Themes can define HDR highlight rules, such as hover, selection and "new data" pulses.
- **Colour pipeline:**
  - Parse `oklch()` and `color(display-p3 …)` in `core/coerce/color.ts`, replacing or extending d3-color.
  - Blend in linear light in a half-float framebuffer.
  - Change colorscale LUTs from RGBA8 to RGBA16F so a scale can end above 1.0.
- **Rules for good taste, enforced by defaults:**
  - HDR is for highlights only.
  - Never on text, axes or gridlines.
  - Never on large filled areas, which are uncomfortable to look at.
  - Respect the user's reduced-motion and brightness preferences.
- **The DOM limit:** the modebar, tooltips and the accessibility mirror are DOM elements, and CSS
  cannot currently go brighter than white. A glowing marker next to an SDR tooltip must still look
  intentional.
- **Testing:** 8-bit PNG baselines cannot capture HDR. Keep screenshot tests for the SDR fallback,
  and add float readback assertions (actual pixel values above 1.0) for the HDR path.
- **Export:** PNG and JPEG are SDR. HDR stills (PNG with a cICP colour tag, or AVIF) and HDR video are
  a later extension shared with the video studio.

### Research spikes

| ID  | Question                                                                                                                                                                                                                                                                      | Output                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| H1  | **Platform matrix.** Which browser, OS and display combinations show extended range from a WebGPU canvas, and P3 from WebGL? Test a MacBook XDR screen, an external HDR monitor on Windows, and Android. What happens when the window moves between an SDR and an HDR screen? | Support table plus a probe page            |
| H2  | **three.js `WebGPURenderer`.** Can it present to an `rgba16float` extended-range canvas? What would it take to port one primitive (markers) to TSL (ADR-009, E16.8)?                                                                                                          | Working marker demo, or a list of blockers |
| H3  | **A WebGL-only route.** Does `drawingBufferStorage(RGBA16F)` plus `drawingBufferColorSpace` show values above 1.0 in any browser? This decides whether HDR must wait for the WebGPU renderer.                                                                                 | Yes/no with evidence                       |
| H4  | **Headroom detection.** How much brighter than SDR white can we go, and how do we find out? Evaluate the `dynamic-range: high` media query and the `dynamic-range-limit` CSS property, and check whether any API reports headroom.                                            | Detection strategy                         |
| H5  | **Colour pipeline.** Options for parsing OKLCH and P3 (extend d3-color or replace it), the cost of RGBA16F LUTs, and how to interpolate perceptually above 1.0.                                                                                                               | Short ADR draft                            |
| H6  | **Mixing DOM and canvas.** A glowing marker beside an SDR DOM tooltip or the modebar: capture it on real hardware and set the visual rules.                                                                                                                                   | Screenshots and design rules               |
| H7  | **Testing.** Can headless Chromium (SwiftShader) create an `rgba16float` canvas and read it back? Otherwise, which CI path is needed for HDR assertions?                                                                                                                      | Test approach                              |
| H8  | **Performance.** Cost of an RGBA16F framebuffer with MSAA versus RGBA8 at 1M markers, reusing the spike A harness.                                                                                                                                                            | fps table                                  |
| H9  | **HDR stills.** Can the browser encode PNG with a cICP tag, or HDR AVIF?                                                                                                                                                                                                      | Yes/no per browser                         |

H1 and H3 come first: together they decide whether HDR is a WebGL feature soon, or a WebGPU feature
that follows E16.8.

### End-to-end demo: "Earthquakes, last 30 days"

A single page in `apps/docs/demos/`, built on public USGS GeoJSON feeds, using only traces that
exist today:

- **Main panel:** a scatter plot of every quake, with longitude and latitude as x and y on the dark default
  look. Size follows magnitude. **Brightness also follows magnitude:** M6+ events reach about 3×
  SDR white and M2 events sit at normal brightness.
- **Live pulse:** quakes from the last hour pulse in HDR, then settle to their resting brightness.
- **Second panel:** a density heatmap (`histogram2d`) of depth against time. Only its colorscale's top stop is
  HDR, so the busiest bins glow.
- **Interaction:** hover and lasso selection lift the selected points into HDR, and the DOM tooltip
  stays SDR.
- **Controls:** an SDR/HDR toggle and a headroom readout, plus a still export.

**Done when:**

- The page looks deliberate on an HDR display and identical to today's look on SDR.
- The SDR path passes the normal visual suite.
- The HDR path has float readback tests.
- The page holds 60fps with every quake plotted.

---

## 2. Data-to-video studio

### Goal

Turn a Holochart figure and an animation timeline into a video file, rendered locally in the
browser, frame-exact and repeatable: 1080p to 4K, 30 or 60fps, in landscape, vertical (9:16) and
square formats. The target users are data journalists and social or marketing teams, who today
screen-record charts or rebuild them in motion-graphics tools.

### Key insight: the render loop already allows offline rendering

`RenderLoop` takes an injectable `FrameScheduler`. A **virtual clock** can drive it: frame
_n_ renders at _t = n / fps_, no matter how long it takes. Slow frames never drop, and the same
timeline always produces the same frames. Real-time preview and offline rendering share one code
path.

Pipeline:

```
timeline (keyframes, camera, captions, audio)
  → virtual-clock FrameScheduler drives RenderLoop at t = n / fps
  → offscreen RenderRoot at output size (like renderImage)
  → new VideoFrame(canvas, { timestamp })        (WebCodecs)
  → VideoEncoder (H.264 / VP9 / AV1) + AudioEncoder
  → muxer (MP4 / WebM)
  → streamed to disk (File System Access API or OPFS), never held fully in memory
```

### Design sketch

- **Prerequisites in the existing plan:** E7.3 (transitions), E7.4 (frames and `animate`) and E7.5
  (camera). Video is the strongest reason to finish E7, and E7 should be designed with offline
  rendering in mind. In particular, transitions must be pure functions of time, not of wall-clock
  deltas.
- **Timeline model:**
  - A list of figure states (Plotly frames) with transitions.
  - Camera moves.
  - Caption and annotation tracks with enter and exit animations.
  - An optional audio track.
  - Serializable as JSON, like the figure spec.
- **Packaging: library first, studio second.**
  - `@mk7s/holochart-video` with `renderVideo(figure, timeline, options) → Blob | stream`, plus a
    real-time `preview()`.
  - A studio app later (`apps/studio`): a timeline editor with keyframes, scrubbing and presets. That
    timeline editor is also the second user of `packages/render` discussed earlier, and the case for
    extracting a toolkit.
- **Chart-specific quality: chroma subsampling.**
  - Most encoders store colour at quarter resolution (4:2:0). That smears 1px lines, small text and
    saturated colours on dark backgrounds, which is exactly what charts are made of.
  - The studio needs a "video mode" with thicker lines, larger text and supersampling (render at 2×
    and downscale), with 4:4:4 where supported.
- **Colour tagging:** tag output as BT.709 and check that sRGB canvas colours do not shift in common
  players (QuickTime, browsers, social platforms).
- **Fonts:** troika signed-distance-field text at 4K, and a guarantee that fonts are loaded before
  frame 0.

### Research spikes

| ID  | Question                                                                                                                                                                                                                                 | Output                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| V1  | **Codec matrix.** H.264, VP9 and AV1 encode support and hardware acceleration via `VideoEncoder.isConfigSupported` in Chrome, Safari and Firefox on macOS, Windows and Linux. Also 4K and 60fps limits, and even-dimension requirements. | Support table plus a probe page              |
| V2  | **Muxer choice.** Compare Mediabunny (successor to mp4-muxer and webm-muxer) with alternatives on streaming-to-disk, fragmented MP4, audio support and bundle size.                                                                      | Recommendation                               |
| V3  | **Frame capture cost.** Speed of `new VideoFrame(canvas)` from a WebGL canvas: does it stay on the GPU or read back through the CPU? Measure 4K throughput on an M1 against `readPixels` plus `VideoFrame` from a buffer.                | Frames per second at 1080p and 4K            |
| V4  | **Virtual clock.** Prototype a stepping `FrameScheduler`. Confirm the loop, resize and on-demand invalidation behave, with no dependence on real time anywhere in the render path.                                                       | Prototype plus a list of problems            |
| V5  | **Repeatability.** Does the same timeline give byte-identical frames under SwiftShader (as spike E found for stills)? Does the _encoded_ file vary between runs?                                                                         | Result, and a video test strategy            |
| V6  | **Chroma subsampling.** Encode a test chart (1px gridlines, 10px text, red on dark) at 4:2:0; compare supersampling, line and text scaling, and 4:4:4 availability.                                                                      | Side-by-side captures, "video mode" defaults |
| V7  | **Colour accuracy.** Check sRGB to BT.709 tagging in QuickTime, Chrome, Safari, and after upload to a social platform.                                                                                                                   | Colour settings that survive                 |
| V8  | **Rendering in a worker.** Can a three.js `WebGLRenderer` on an `OffscreenCanvas` inside a worker keep the main thread free during long renders? What would that cost in the architecture (calculation is already in a worker, ADR-011)? | Yes/no plus the cost                         |
| V9  | **Audio.** Mux a music track with `AudioEncoder` and align beats to keyframes. Is audio-reactive animation (e.g. pulses on beats) worth adding?                                                                                          | Prototype                                    |
| V10 | **HDR video** (shared with HDR mode). Can WebCodecs encode 10-bit PQ or HLG output (HEVC or AV1 Main10) from an `rgba16float` source?                                                                                                    | Yes/no per platform                          |

V1, V3 and V4 come first. Together they show whether a one-minute 4K60 render (3,600 frames) can
finish in about real time on a laptop.

### End-to-end demo: "OpenRouter token growth, the video"

Reuse the existing OpenRouter demo data (`examples/demos/openrouter/data`) so the demo tests the
video pipeline and not data collection:

1. **0–5s:** a title card set in the bundled TeX Gyre Heros, fading in over the dark default look.
2. **5–15s:** the weekly-tokens line draws itself left to right, and the y-axis grows with it. At
   the switch from linear to log scale, the axis morphs with a transition (E7.3).
3. **15–22s:** the exponential fit and forecast outline animate in, and a caption explains the
   growth rate.
4. **22–30s:** the stacked area by author transitions into the donut, with segments matched by
   `ids`. An end card shows the source, taken from `SOURCES.md`.
5. **Audio:** an optional music bed, with keyframes snapped to beats.

Exported from one timeline JSON as:

- 4K 16:9 MP4 (H.264, 60fps)
- 1080×1920 vertical MP4 for social
- WebM (VP9) fallback

**Done when:**

- All three files come from the same timeline with no per-format edits.
- Two renders of the same timeline produce identical frames (V5).
- The 1px gridlines and axis labels stay legible after encoding (V6).
- A 30-second 4K60 render takes under about two minutes on an M1 Max.
- The real-time preview in the browser matches the rendered file frame for frame.

---

## How the two connect

- **HDR video (V10)** is where the two ideas meet: glowing highlights in exported video.
- **Both depend on E7 animation.** For video, E7 is the dependency. For HDR, E7 would power the
  pulses and highlights.
- **Both argue for the WebGPU renderer (E16.8)**, if spike H3 shows WebGL cannot present extended
  range.
- **The studio's timeline editor** is the natural second user of `packages/render`, and the point to
  revisit extracting a toolkit.
