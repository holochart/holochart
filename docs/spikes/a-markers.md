# Spike A: instanced SDF markers at scale

- **Plan:** E0.7 spike A; targets from G5 (100k first render < 300 ms, 1M pan ≥ 50 fps) and E16.3
  (1M restyle < 16 ms). Also informs ADR-010 (CPU hover index).
- **Status:** Measured at full scale on 2026-09-23.
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

## Results

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
2. **The marker fragment shader is about 3.5× as expensive as a trivial point shader**, per pixel
   covered (13–14 ms vs 3.6 ms at 3 px; 28–34 ms vs 8.5–9 ms at 8 px). At 8 px, 1M markers drop to
   27–32 fps. The cost scales with covered pixels, so it is fill-rate: the per-fragment SDF work
   (symbol selection across 55 shapes × variants, AA, border) and the quad padding around each
   marker. This is the main optimization target for markers (hand-off: E16, see below).
3. **CPU hover (ADR-010) is comfortably fast:** nearest-point queries take microseconds on 1M
   points, so hover never needs the GPU in 2D. The 148 ms build should happen lazily or in a worker
   for very large traces (E16.5), not on the first hover.

## Hand-offs

- **Marker fill cost (E16):** specialize the fragment shader per symbol set in use (compile-time
  defines instead of a runtime switch over every symbol), tighten the quad to the symbol's extent
  plus the AA margin, and skip border math when `lineWidth` is 0. Re-measure with this spike.
