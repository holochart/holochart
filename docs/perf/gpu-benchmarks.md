# GPU benchmarks

Real-GPU timings of the plan performance targets (§11.7): E12.1, E11.1, E12.3, E13.3 and the
M0 marker baseline E2.4. CI renders with SwiftShader (software GL), so these numbers come from
a local run: `pnpm bench:gpu` (script in `tools/bench/`) writes this page and
`gpu-benchmarks.json` next to it. **Generated: rerun the script instead of editing.**

> **Note:** rerun after the carry-forward agents finished (no other suites running)
>
> **Note:** The machine was busy (1-minute load average up to 14.6 on 10 cores): frame times and first draws are pessimistic. Rerun on an idle machine.

## Machine

| Item                          | Value                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| GPU (WebGL renderer)          | ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max, Unspecified Version)                  |
| Browser                       | Chromium 153.0.8010.12 (Playwright, headless)                                           |
| OS                            | macOS 26.6.2 (Darwin 25.6.0, arm64)                                                     |
| CPU                           | Apple M1 Max (10 cores)                                                                 |
| Memory                        | 64 GB                                                                                   |
| Load average (1 / 5 / 15 min) | before 14.61 / 25.03 / 38.07, after 9.29 / 20.54 / 34.96                                |
| Commit                        | fdffd51 (with uncommitted changes)                                                      |
| Date                          | 2026-09-28T19:08:00Z                                                                    |
| Runs                          | 3 per example (medians below), 500 ms warm-up + 3000 ms per sweep, device pixel ratio 1 |

## Targets

fps targets count as met at 95 % (headless Chromium paces frames at 60 Hz, so a chart that
keeps up measures 59–60 fps). First-draw targets include the `gl.finish()` right after ready.

| Story | Example               | Target                     | Measured                                 | Met    |
| ----- | --------------------- | -------------------------- | ---------------------------------------- | ------ |
| E12.1 | `_dev/timeseries-2m6` | pan at 60 fps              | 60.0 fps                                 | yes    |
| E11.1 | `heatmap/large`       | renders < 100 ms           | 702 ms (createChart → ready + gl.finish) | **no** |
| E11.1 | `heatmap/large`       | pan at 60 fps              | 60.0 fps                                 | yes    |
| E11.1 | `heatmap/large`       | zoom at 60 fps             | 60.0 fps                                 | yes    |
| E12.3 | `candlestick/large`   | pan at 60 fps (instanced)  | 60.0 fps                                 | yes    |
| E12.3 | `candlestick/large`   | zoom at 60 fps (instanced) | 60.0 fps                                 | yes    |
| E13.3 | `treemap/large`       | renders < 500 ms           | 420 ms (createChart → ready + gl.finish) | yes    |
| E2.4  | `_dev/markers-1m`     | pan ≥ 50 fps               | 60.0 fps                                 | yes    |

## First draw

`createChart` → ready is the example’s own timing (from just before `createChart` to
`chart.ready`: calc, buffers and textures, first frame); `run()` → ready adds its data
generation. `gl.finish` is the GPU work still queued at ready.

| Example               | Canvas       | Data generation | createChart → ready | gl.finish | run() → ready | JS heap |
| --------------------- | ------------ | --------------- | ------------------- | --------- | ------------- | ------- |
| `_dev/timeseries-2m6` | 640 × 400 px | –               | –                   | 0.0 ms    | 416 ms        | 177 MB  |
| `heatmap/large`       | 800 × 600 px | 722 ms          | 702 ms              | 0.0 ms    | 1437 ms       | 386 MB  |
| `candlestick/large`   | 900 × 520 px | 299 ms          | 556 ms              | 0.0 ms    | 856 ms        | 123 MB  |
| `treemap/large`       | 900 × 600 px | 12 ms           | 420 ms              | 0.0 ms    | 433 ms        | 109 MB  |
| `_dev/markers-1m`     | 640 × 400 px | –               | –                   | 0.0 ms    | 131 ms        | 81 MB   |

## Pan and zoom

One view change per animation frame through `chart.previewRanges` (the preview path of zoom
and pan drags), for the measured duration after the warm-up; `_dev/markers-1m` has no chart
and runs its own Pan animation. Frame times are intervals between animation frames. Update
CPU is the `previewRanges` call; render CPU is `renderer.render` (command submission); GPU is
`EXT_disjoint_timer_query_webgl2` around each render (mean / p95). All times in ms.

| Example               | Sweep | fps  | Frame p50 | Frame p95 | Frame max | Renders/s | Update CPU | Render CPU | GPU           | Draw calls |
| --------------------- | ----- | ---- | --------- | --------- | --------- | --------- | ---------- | ---------- | ------------- | ---------- |
| `_dev/timeseries-2m6` | pan   | 60.0 | 16.7      | 16.8      | 16.8      | 60        | 2.15       | 0.36       | 0.89 / 1.71   | 7          |
| `_dev/timeseries-2m6` | zoom  | 60.0 | 16.7      | 16.8      | 16.8      | 60        | 2.11       | 0.32       | 1.03 / 2.24   | 7          |
| `heatmap/large`       | pan   | 60.0 | 16.7      | 16.7      | 16.8      | 60        | 0.88       | 0.40       | 0.48 / 0.59   | 9          |
| `heatmap/large`       | zoom  | 60.0 | 16.7      | 16.7      | 16.8      | 60        | 0.83       | 0.34       | 0.48 / 0.57   | 9          |
| `candlestick/large`   | pan   | 60.0 | 16.7      | 16.8      | 16.8      | 60        | 0.75       | 0.48       | 9.81 / 12.56  | 9          |
| `candlestick/large`   | zoom  | 60.0 | 16.7      | 16.7      | 16.8      | 60        | 0.63       | 0.37       | 11.68 / 26.28 | 9          |
| `_dev/markers-1m`     | pan   | 60.0 | 16.7      | 16.7      | 16.8      | 60        | –          | 0.12       | 7.76 / 9.64   | 1          |

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
