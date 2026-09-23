# Spike A: instanced SDF markers at scale

- **Plan:** E0.7 spike A; targets from G5 (100k first render < 300 ms, 1M pan ≥ 50 fps) and E16.3
  (1M restyle < 16 ms). Also informs ADR-010 (CPU hover index).
- **Status:** Measured at full scale on 2026-09-23, then re-measured after the marker shader
  optimization the same day ([Optimization](#optimization-2026-09-23)).
- **Page:** [`examples/_spikes/a-markers.ts`](../../examples/_spikes/a-markers.ts)

## Setup

|         |                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------ |
| Machine | Apple M1 Max, 64 GB, macOS                                                                       |
| Browser | Playwright Chromium 1.63, headless, ANGLE → Metal (`ANGLE Metal Renderer: Apple M1 Max`)         |
| Canvas  | 1024×640 CSS px, DPR 1                                                                           |
| Runner  | [`scripts/run-spike.mjs`](scripts/run-spike.mjs), one spike per browser, peak browser RSS 916 MB |

Timings are medians over repetitions (5 for first render and restyle, 3 for pan). Pan frames are
rendered back to back with a GPU sync after each frame, so fps is throughput and is not capped by
vsync. GPU time per frame comes from `EXT_disjoint_timer_query_webgl2`.

Reproduce:

```bash
pnpm --filter @mk7s/holochart-sandbox exec vite --port 5197 --strictPort --host 127.0.0.1 &
node docs/spikes/scripts/run-spike.mjs --spike a-markers --params 'scale=0.1&reps=3' --out /tmp/spikes
node docs/spikes/scripts/run-spike.mjs --spike a-markers --params 'scale=1&reps=5' --out /tmp/spikes
```

## Results (before the optimization)

### First render and restyle

| Measurement                                                      | Median                       | Target   | Result |
| ---------------------------------------------------------------- | ---------------------------- | -------- | ------ |
| 100k markers: new render root + markers + first GPU-synced frame | 24 ms (cold first run 50 ms) | < 300 ms | ✅     |
| 1M restyle: colorscale values (CPU update)                       | 6.5 ms                       | < 16 ms  | ✅     |
| 1M restyle: explicit RGBA (CPU update)                           | 6.0 ms                       | < 16 ms  | ✅     |
| 1M restyle: constant color (CPU update)                          | 2.4 ms                       | < 16 ms  | ✅     |

The restyle numbers are CPU time for `update()` including the buffer upload call. The next
GPU-synced frame takes 22–29 ms, which is the cost of drawing 1M markers, not of the upload (a frame
with no update takes 25 ms synced).

### 1M-marker pan

| Distribution                                | Marker size | Ours (fps / GPU ms per frame) | Control: `THREE.Points`, trivial shader (fps / GPU ms) |
| ------------------------------------------- | ----------- | ----------------------------- | ------------------------------------------------------ |
| Gaussian cloud (dense core, heavy overdraw) | 3 px        | **57 / 14.5**                 | 156 / 3.6                                              |
| Gaussian cloud                              | 8 px        | 27 / 33.7                     | 87 / 8.5                                               |
| Uniform square (even coverage)              | 3 px        | **63 / 13.1**                 | 164 / 3.7                                              |
| Uniform square                              | 8 px        | 32 / 28.5                     | 85 / 9.2                                               |

One draw call in every case. CPU time per frame is 0.1 ms, so panning is entirely GPU-bound.

### CPU hover index (flatbush) on 1M points

| Query                      | Cost             |
| -------------------------- | ---------------- |
| Build                      | 148 ms           |
| Nearest within 20 px       | 1.9 µs per query |
| Nearest, any distance      | 2.8 µs per query |
| Radius query (~2,000 hits) | 346 µs per query |
| x-band query (~2,000 hits) | 353 µs per query |

## Findings

1. **The M0 exit target is met** for typical scatter marker sizes: 1M markers pan at 57–63 fps at
   3 px. First render and restyle beat their targets by an order of magnitude.
2. **Before the optimization, markers cost about 3.5× a trivial point shader** (13–14 ms vs 3.6 ms
   at 3 px; 28–34 ms vs 8.5–9 ms at 8 px), so 8 px markers dropped to 27–32 fps. The
   [optimization](#optimization-2026-09-23) cut this to 1.4–1.6× the control on the dense cloud.
3. **CPU hover (ADR-010) is comfortably fast:** nearest-point queries take microseconds on 1M
   points, so hover never needs the GPU in 2D. The 148 ms build should happen lazily or in a worker
   for very large traces (E16.5), not on the first hover.

## Optimization (2026-09-23)

Fitting "cost = per-instance + per-pixel" to the original numbers showed two separate overheads
against the `THREE.Points` control (which already used the same 5 px / 10 px quads): about 4× the
per-instance cost (4 vertices per marker, each doing 2 symbol-table fetches, a sin/cos, and writing
~22 floats of varyings, which tile-based GPUs stream through memory) and about 2.8× the per-pixel
cost (generic branching over every symbol kind, screen-space derivatives, a `discard`).

Changes (`markers/specialize.ts`, `markers.glsl.ts`):

1. **Compile-time specialization.** A set whose items share one symbol code bakes that symbol's
   layout into `#define`s (`MARKER_SYMBOL`, `SYM_*`): no symbol-table fetches in the vertex shader,
   two fewer flat `ivec4` varyings, constant shape branches and loop bounds in the fragment shader.
   `NO_ROTATION` (all angles 0) and `NO_STROKE` (all line widths 0, no open variants) drop the
   rotation and stroke math. The summary is kept incrementally, so `patch()` scans only the patched
   range; a set that becomes mixed uses the generic program (same pixels).
2. **Anti-aliasing width from the pixel ratio** (`1 / uPixelRatio`) instead of `dFdx`/`dFdy`: the
   quad is screen-aligned and screen-sized (also in 3D), so the two are equal.
3. **Tighter quads.** The half-extent is the geometry plus where coverage actually reaches zero
   (`max(lw/2, aa/2)` for strokes, `aa/2` AA fringe, 0.01 px guard) instead of `lw/2 + 1 px`.
4. **No `discard` for fully transparent fragments** in the visible pass (they write transparent
   black, which blends to exactly the destination). The discard stays when `depthWrite` is on.

### Results (same machine and runner, 1M markers, median of 3)

| Distribution   | Size | Before: GPU ms (fps) | After: GPU ms (fps) | Speed-up | `THREE.Points` control |
| -------------- | ---- | -------------------- | ------------------- | -------- | ---------------------- |
| Gaussian cloud | 3 px | 13.70 (61)           | **4.48 (160)**      | 3.1×     | 3.06 ms                |
| Gaussian cloud | 8 px | 32.52 (28)           | **10.05 (77)**      | 3.2×     | 6.47 ms                |
| Uniform square | 3 px | 11.37 (75)           | **6.50 (119)**      | 1.7×     | 3.73 ms                |
| Uniform square | 8 px | 24.79 (37)           | **12.38 (70)**      | 2.0×     | 8.47 ms                |

Ablation on the Gaussian cloud: with specialization off (`&generic=1`) the other changes alone give
10.40 / 25.13 ms (3 / 8 px), so specialization is the bulk of the win (~2.3–2.5×); keeping the old
quad margin instead of the tight one gives 5.16 / 12.15 ms, so tight quads add another 13–17%.
First render (23 ms for 100k) and restyle (7–8 ms CPU for 1M) are unchanged within noise.

### Pixels

- All visual tests pass with **0 pixelmatch differences**; baselines are unchanged. Exact
  (bit-level) comparison on SwiftShader, change by change:
  - Specialization and the discard change: **bit-identical** (verified by bisection).
  - Derivative-free AA width: ±1 level on a few pixels (18 in `markers-colorscale`, 1,434 in
    `markers-symbols`), because hardware derivatives of the interpolated coordinate differ from the
    exact `1 / pixelRatio` in the last bit.
- The tighter quad changes pixels by 1–3 levels (max 29 in the densest overlaps of
  `markers-colorscale`): SwiftShader rasterizes in fixed point, so any change to the quad corners
  shifts the interpolated local coordinates by sub-LSB amounts, and dense translucent overlap
  compounds the 8-bit blending round-off. Varying the margin gave non-monotonic results (0.75 px → 1,805
  pixels differ; 0.95 px → 34,067; 1.0 px → 0), which confirmed it is interpolation noise, not coverage
  being cut off. Baselines are unchanged.
- GPU picking returns identical hits before and after (25-point sweep over `_dev/picking-3d`,
  markers and surface), including the specialized pick program.

## Hand-offs

- **Marker fill cost (E16): done** (see [Optimization](#optimization-2026-09-23)). Remaining gap to
  the trivial control is 1.4–1.7×: the SDF + AA work itself, instanced quads (4 vertices) vs
  `gl_POINTS` (1), and per-instance colorscale lookups. Further options: sprite/point rendering for
  small circles, and packing `aStyle` tighter.
