# GPU benchmarks

Real-GPU timings of the plan performance targets (§11.7): E12.1, E11.1, E12.3, E13.3 and the
M0 marker baseline E2.4. CI renders with SwiftShader (software GL), so these numbers come from
a local run: `pnpm bench:gpu` (script in `tools/bench/`) writes this page and
`gpu-benchmarks.json` next to it. **Generated: rerun the script instead of editing.**

> **Note:** The machine was busy (1-minute load average up to 66.0 on 10 cores): frame times and first draws are pessimistic. Rerun on an idle machine.

## Machine

| Item                          | Value                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| GPU (WebGL renderer)          | ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max, Unspecified Version)                  |
| Browser                       | Chromium 153.0.8010.12 (Playwright, headless)                                           |
| OS                            | macOS 26.6.2 (Darwin 25.6.0, arm64)                                                     |
| CPU                           | Apple M1 Max (10 cores)                                                                 |
| Memory                        | 64 GB                                                                                   |
| Load average (1 / 5 / 15 min) | before 65.99 / 71.07 / 69.41, after 46.69 / 58.21 / 64.14                               |
| Commit                        | b49fe2c (with uncommitted changes)                                                      |
| Date                          | 2026-09-30T19:45:39Z                                                                    |
| Runs                          | 3 per example (medians below), 500 ms warm-up + 3000 ms per sweep, device pixel ratio 1 |

## Targets

fps targets count as met at 95 % (headless Chromium paces frames at 60 Hz, so a chart that
keeps up measures 59–60 fps). First-draw targets include the `gl.finish()` right after ready.

| Story | Example               | Target                                                          | Measured                                 | Met    |
| ----- | --------------------- | --------------------------------------------------------------- | ---------------------------------------- | ------ |
| E12.1 | `_dev/timeseries-2m6` | pan at 60 fps                                                   | 60.0 fps                                 | yes    |
| E11.1 | `heatmap/large`       | renders < 100 ms                                                | 695 ms (createChart → ready + gl.finish) | **no** |
| E11.1 | `heatmap/large`       | pan at 60 fps                                                   | 60.0 fps                                 | yes    |
| E11.1 | `heatmap/large`       | zoom at 60 fps                                                  | 60.0 fps                                 | yes    |
| E12.3 | `candlestick/large`   | pan at 60 fps (instanced)                                       | 60.0 fps                                 | yes    |
| E12.3 | `candlestick/large`   | zoom at 60 fps (instanced)                                      | 60.0 fps                                 | yes    |
| E13.3 | `treemap/large`       | renders < 500 ms                                                | 416 ms (createChart → ready + gl.finish) | yes    |
| E2.4  | `_dev/markers-1m`     | pan ≥ 50 fps                                                    | 60.0 fps                                 | yes    |
| E14.2 | `_dev/scatter3d-1m`   | 1M points interactive orbit (≥ 30 fps)                          | 60.0 fps                                 | yes    |
| E14.2 | `_dev/scatter3d-1m`   | 1M points interactive orbit (≥ 30 fps)                          | 60.0 fps                                 | yes    |
| E14.2 | `_dev/scatter3d-1m`   | 1M points interactive orbit (≥ 30 fps)                          | 38.8 fps                                 | yes    |
| E14.2 | `scatter3d/perf-1m`   | 1M points interactive orbit (≥ 30 fps)                          | 60.0 fps                                 | yes    |
| E14.2 | `scatter3d/perf-1m`   | 1M points interactive orbit (≥ 30 fps)                          | 57.7 fps                                 | yes    |
| E14.3 | `surface/perf-1024`   | 1024² grid drawn < 50 ms (first draw: chart, shaders, textures) | 262 ms (createChart → ready + gl.finish) | **no** |
| E14.3 | `surface/perf-1024`   | orbit at 60 fps                                                 | 60.0 fps                                 | yes    |
| E14.7 | `volume/perf-256`     | 256³ ray-marched volume interactive (≥ 30 fps)                  | 60.0 fps                                 | yes    |

## First draw

`createChart` → ready is the example’s own timing (from just before `createChart` to
`chart.ready`: calc, buffers and textures, first frame); `run()` → ready adds its data
generation. `gl.finish` is the GPU work still queued at ready.

| Example               | Canvas       | Data generation | createChart → ready | gl.finish | run() → ready | JS heap |
| --------------------- | ------------ | --------------- | ------------------- | --------- | ------------- | ------- |
| `_dev/timeseries-2m6` | 640 × 400 px | –               | –                   | 0.0 ms    | 413 ms        | 177 MB  |
| `heatmap/large`       | 800 × 600 px | 720 ms          | 695 ms              | 0.0 ms    | 1415 ms       | 410 MB  |
| `candlestick/large`   | 900 × 520 px | 294 ms          | 540 ms              | 0.0 ms    | 834 ms        | 139 MB  |
| `treemap/large`       | 900 × 600 px | 10 ms           | 416 ms              | 0.0 ms    | 427 ms        | 109 MB  |
| `_dev/markers-1m`     | 640 × 400 px | –               | –                   | 0.0 ms    | 128 ms        | 81 MB   |
| `_dev/scatter3d-1m`   | 640 × 400 px | –               | –                   | 0.0 ms    | 278 ms        | 139 MB  |
| `_dev/scatter3d-1m`   | 640 × 400 px | –               | –                   | 0.0 ms    | 277 ms        | 139 MB  |
| `_dev/scatter3d-1m`   | 640 × 400 px | –               | –                   | 0.0 ms    | 276 ms        | 139 MB  |
| `scatter3d/perf-1m`   | 640 × 400 px | 77 ms           | 218 ms              | 0.0 ms    | 295 ms        | 148 MB  |
| `scatter3d/perf-1m`   | 640 × 400 px | 78 ms           | 215 ms              | 0.0 ms    | 293 ms        | 148 MB  |
| `surface/perf-1024`   | 640 × 400 px | 28 ms           | 262 ms              | 0.0 ms    | 291 ms        | 157 MB  |
| `volume/perf-256`     | 640 × 400 px | 88 ms           | 448 ms              | 0.0 ms    | 537 ms        | 342 MB  |

## Pan and zoom

One view change per animation frame through `chart.previewRanges` (the preview path of zoom
and pan drags), for the measured duration after the warm-up; `_dev/markers-1m` has no chart
and runs its own Pan animation. Frame times are intervals between animation frames. Update
CPU is the `previewRanges` call; render CPU is `renderer.render` (command submission); GPU is
`EXT_disjoint_timer_query_webgl2` around each render (mean / p95). All times in ms.

| Example               | Sweep | fps  | Frame p50 | Frame p95 | Frame max | Renders/s | Update CPU | Render CPU | GPU           | Draw calls |
| --------------------- | ----- | ---- | --------- | --------- | --------- | --------- | ---------- | ---------- | ------------- | ---------- |
| `_dev/timeseries-2m6` | pan   | 60.0 | 16.7      | 16.7      | 16.8      | 60        | 2.04       | 0.36       | 0.84 / 1.13   | 7          |
| `_dev/timeseries-2m6` | zoom  | 60.0 | 16.7      | 16.8      | 16.8      | 60        | 2.05       | 0.31       | 0.95 / 1.51   | 7          |
| `heatmap/large`       | pan   | 60.0 | 16.7      | 16.8      | 16.8      | 60        | 0.96       | 0.41       | 0.56 / 0.99   | 9          |
| `heatmap/large`       | zoom  | 60.0 | 16.7      | 16.7      | 16.8      | 60        | 0.88       | 0.35       | 0.59 / 1.07   | 9          |
| `candlestick/large`   | pan   | 60.0 | 16.7      | 16.7      | 16.8      | 60        | 0.75       | 0.43       | 9.53 / 12.12  | 9          |
| `candlestick/large`   | zoom  | 60.0 | 16.7      | 16.8      | 16.8      | 60        | 0.58       | 0.30       | 11.89 / 28.10 | 9          |
| `_dev/markers-1m`     | pan   | 60.0 | 16.7      | 16.7      | 16.8      | 60        | –          | 0.11       | 8.75 / 14.36  | 1          |
| `_dev/scatter3d-1m`   | pan   | 60.0 | 16.7      | 16.7      | 16.8      | 60        | –          | 0.09       | 5.41 / 7.35   | 1          |
| `_dev/scatter3d-1m`   | pan   | 60.0 | 16.7      | 16.8      | 16.8      | 60        | –          | 0.09       | 9.56 / 12.29  | 1          |
| `_dev/scatter3d-1m`   | pan   | 38.8 | 33.3      | 33.4      | 50.0      | 39        | –          | 0.10       | 49.69 / 61.63 | 1          |
| `scatter3d/perf-1m`   | pan   | 60.0 | 16.7      | 16.8      | 16.8      | 60        | –          | 0.43       | 14.71 / 26.72 | 10         |
| `scatter3d/perf-1m`   | pan   | 57.7 | 16.7      | 16.8      | 33.4      | 58        | –          | 0.37       | 64.59 / 69.63 | 10         |
| `surface/perf-1024`   | pan   | 60.0 | 16.7      | 16.7      | 16.8      | 60        | –          | 0.48       | 9.87 / 12.03  | 12         |
| `volume/perf-256`     | pan   | 60.0 | 16.7      | 16.7      | 16.8      | 60        | –          | 0.43       | 6.48 / 8.34   | 12         |

## Method

- Playwright’s Chromium, headless, on the real GPU:
  `--use-angle=metal --enable-gpu --ignore-gpu-blocklist --disable-renderer-backgrounding --disable-background-timer-throttling --disable-backgrounding-occluded-windows`. The script reads `WEBGL_debug_renderer_info` first and
  refuses to run (and to write this page) on a software renderer such as SwiftShader; the
  renderer of every chart context is checked again.
- The examples are served by the sandbox’s Vite dev server (as for the visual and interaction
  suites) and opened in its test mode, one at a time, each run in a fresh browser (cold
  shader and resource caches). The in-page harness is `tools/bench/src/page.ts`.
- Headless Chromium paces animation frames at 60 Hz whatever the display, so fps tops out at
  60: the CPU and GPU columns show the headroom left in the 16.7 ms frame. GPU times are
  timer-query elapsed times on the GPU timeline, so other GPU work on the machine can inflate
  them.
- Numbers vary with load: check the load averages above, and compare runs on an idle machine.
