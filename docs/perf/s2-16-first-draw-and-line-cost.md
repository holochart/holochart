# S2.16: heatmap first draw, line and marker cost

Backlog S2.16 (plan E11.1, E16.9, E16.10), ship wave R3, 2026-10-03. What was measured, what
changed, and how to measure it again. Not generated: `gpu-benchmarks.md` next to it is.

> **Read the numbers as ratios.** They were taken on a shared machine with a 1-minute load average
> between 10 and 200 on 10 cores (three other jobs were building and testing). Every before/after
> pair below comes from the same session, interleaved where the table says so, and the spread is
> given. Absolute milliseconds will be lower on an idle machine: rerun the commands.

Machine: Apple M1 Max (10 cores, 64 GB), macOS 26.6.2, Playwright's Chromium 153 headless, ANGLE on
Metal, device pixel ratio 1. The pages are served by the sandbox's Vite dev server, so the library
runs as unminified modules.

## Heatmap first draw (E11.1)

Target: a 4096 × 4096 heatmap renders in under 100 ms. Measured: `createChart` to `chart.ready`
(calc, textures, first frame, text, the accessible description), then `gl.finish()`.

Median (min–max) in ms. The first row is the benchmark's own number, 5 runs before and 5 after,
hours apart. The other rows are interleaved: before, after, before, after, each in a fresh
browser, 5 and 6 runs.

| 4096² `Float32Array` rows                     | Before (15251ef) | After         |
| --------------------------------------------- | ---------------- | ------------- |
| `pnpm bench:gpu --only heatmap`, first draw   | 768 (689–942)    | 425 (376–513) |
| `createChart` to `afterplot` (first frame)    | 350 (290–369)    | 174 (159–207) |
| `createChart` to `chart.ready`                | 837 (692–897)    | 401 (323–501) |
| `createChart` to `chart.ready`, 2 × 2 heatmap | 171 (143–257)    | 157 (138–294) |

Pan and zoom stayed at 60 fps with 0.5 ms of GPU time per frame.

The target is not met, and is not reachable as written: an empty chart (the 2 × 2 row) takes 135
to 170 ms from `createChart` to `chart.ready` in this harness (renderer and context, the first
pipeline run, text typesetting in its worker, a second pass after fonts). What the 16.7M cells add
on top went from about 670 ms to about 245 ms in the interleaved runs (550 to 275 in an earlier,
quieter session of 5 and 7 runs: 686 to 417, over a floor of 133 to 142).

### Where the time went

`pnpm bench:gpu --only heatmap --profile` (new) runs one extra mount under V8's sampling profiler
and prints self time per function. Before, of about 820 ms of main-thread time after the data was
generated (profiled milliseconds, slower than unprofiled ones):

| Share | What                                                                                    |
| ----- | --------------------------------------------------------------------------------------- |
| 37 %  | `describeHeatmap`: the accessible description scanned all cells twice per call, 4 calls |
| 11 %  | `grid` (the chart summary): another pass with row and column sums, 1–2 calls            |
| 10 %  | calc: `copyRows` (float32 rows to the float64 grid) and a second pass for the z extent  |
| 6 %   | `packHeatmapValues`: the grid to (value, valid) float32 pairs, 134 MB                   |
| 5 %   | `texSubImage2D` of the 134 MB, and about 8 % more of native time right after it         |
| 4 %   | shader compile and link (`onFirstUse`)                                                  |
| 3 %   | garbage collection                                                                      |
| rest  | the chart itself: renderer, layout, text                                                |

So the 134 MB upload the backlog named was about a seventh of the cost, and the description, which
runs after every pipeline run with new content (the first run, the pass after fonts load, the
automargin pass, and once more when the summary code has loaded), was half of it.

### What changed

- **The description reads statistics from calc** (`heatmapZStats`: the index of the largest value
  and the number of values, recorded while calc copies the rows). `describeHeatmap` went from
  about 300 ms in total to under 5 ms.
- **R32F instead of RG32F**: one float per cell, cells without a value stored as the largest
  float32 and told apart in the shader by `v < 3e38`, which rebuilds the same (value, valid) pair,
  so every valid cell is colored by the same arithmetic. The texture, the packed copy and the
  upload are 67 MB instead of 134 MB: `texSubImage2D` 41 → 15 ms profiled, and the native time
  after it 65 → 9 ms.
- **Calc reads the rows once.** `Float32Array` and `Float64Array` rows are copied with
  `TypedArray.set` and read once more for the extent and the statistics, by a loop without a
  data-dependent branch.
- **Loops written for the first call.** These loops run once, before the optimizing compiler has
  them, so what counts is how V8's lower tiers run them. One fresh page per call, interleaved,
  12 calls each, median (min–max):

  | Loop over 16.7M cells                         | ms               |
  | --------------------------------------------- | ---------------- |
  | calc before (copy, then extent)               | 65.5 (60.2–69.5) |
  | calc, copy with statistics in the same loop   | 55.5 (51.3–60.2) |
  | calc now: `set`, then a branch-free scan      | 16.9 + 26.0      |
  | pack RG32F (before)                           | 48.0 (47.3–52.4) |
  | pack R32F, `data[k] = ok ? v - o : HOLE`      | 56.2 (54.1–59.0) |
  | pack R32F now, two stores in an `if` / `else` | 28.3 (26.6–28.7) |

  The select form is slower than writing twice as many bytes because the mid tier boxes the
  selected number; with holes in 10 % of the cells the two-store loop takes 49 ms (the branch
  mispredicts) against 58 ms before.

### What is left, and what did not help

After the changes, per first draw (profiled, of about 420 ms after the data was generated): calc
43 ms, pack 26 ms, upload 14 ms, shader compile 14 ms, garbage collection 28 ms, and **`grid` in
`packages/runtime/src/a11y/summary.ts`, 85 to 88 ms per call, called once or twice before
`chart.ready`** (twice when the summary code loads before the last pipeline pass). It is now the
largest single cost and it is outside this change (that directory belonged to another workstream
in R3). Remembering its scan per `z` array (a `WeakMap`, 15 lines) was measured and not
committed: `chart.ready` 325 ms (311–347, 7 runs) against 417 ms (320–505, 7 runs) in the same
session, and the spread goes with it. Passing row and column sums from calc would remove the scan
altogether; `describeContour` and `describeHistogram2d` have the same double scan
`describeHeatmap` had.

- **Incremental or deferred upload: not done.** The upload is 15 ms of main-thread time after
  R32F, and `chart.ready` means "fully drawn", so spreading the upload over frames would only move
  those 15 ms, at the price of a first frame without the data.
- **Copy and statistics in one loop** was slower than the native copy plus a scan (table above).
- **A float32 grid in calc** would halve the copy, but `HeatmapCalc.z` is a public `Float64Array`
  that hover, contours and text read; not done.
- A reasonable target for E11.1 is "at most 100 ms more than an empty chart": the remaining
  heatmap-specific work is about 250 ms with `grid`, 100 to 180 ms without it, and getting
  reliably under 100 ms needs calc and packing off the main thread (S3.7).

## Line cost (E16.9)

Target: at most 2× three's `Line2` solid and 3× dashed at 1M segments (spike B: 10 series of
100k points, a 1024 × 640 canvas, panning; GPU time per frame from
`EXT_disjoint_timer_query_webgl2`, median of 3 repetitions per run).

Three interleaved rounds (before, after, before, after, …; each run is a fresh browser), GPU ms
per frame, with the `Line2` of the same run and the ratio to it:

| 1M segments                | Before: ours / `Line2` = ratio | After: ours / `Line2` = ratio |
| -------------------------- | ------------------------------ | ----------------------------- |
| solid, round 1             | 9.69 / 2.63 = 3.7×             | 6.75 / 2.64 = 2.6×            |
| solid, round 2             | 9.94 / 2.96 = 3.4×             | 8.24 / 3.68 = 2.2×            |
| solid, round 3             | 9.67 / 3.18 = 3.0×             | 6.68 / 3.14 = 2.1×            |
| dashed (`'dash'`), round 1 | 22.67 / 2.58 = 8.8×            | 7.79 / 2.60 = 3.0×            |
| dashed, round 2            | 20.84 / 2.77 = 7.5×            | 7.84 / 3.22 = 2.4×            |
| dashed, round 3            | 21.27 / 2.87 = 7.4×            | 6.86 / 2.86 = 2.4×            |

Two earlier sessions agree: before 11.21 and 11.35 solid, 25.54 and 23.99 dashed; after, in four
runs, 6.72 to 6.81 solid and 6.82 to 6.85 dashed, with `Line2` at 3.14 to 3.40 in those runs
(2.0 to 2.2×). With per-point colors (`colors=vertex`) the line costs 9.38 ms solid and 9.45 ms
dashed. At a tenth of the scale (100k segments) every variant is under 3 ms and two interleaved
rounds did not separate before from after (solid 3.00 and 1.95 before, 1.50 and 2.12 after).

The dashed target (3×) is met: 2.4 to 3.0×, from 7.4 to 8.8×. The solid target (2×) is not: 2.1
to 2.6×, from 3.0 to 3.7×. `Line2` itself moves between 2.6 and 3.7 ms from run to run, which is
most of the spread of the ratio; `LinePrimitive` is steadier. Geometry is 26.7 MB instead of
42 MB (`Line2`: 22.9 MB).

### Where the time went

Experiments on the solid line, one change at a time (GPU ms per frame, same session):

| Variant                                                                   | ms                 |
| ------------------------------------------------------------------------- | ------------------ |
| before                                                                    | 9.7–11.4           |
| fragment shader replaced by a constant color (no discards)                | 5.3                |
| same, quads no larger than `Line2`'s                                      | 3.8                |
| same as the second row, without the join math in the vertex shader        | 5.0                |
| color attributes and varyings removed                                     | 6.9                |
| direction and length recomputed in the fragment shader (3 varyings fewer) | no change          |
| dashed, without the dash phase recompute while panning                    | 12.0 (from 22.6)   |
| dashed, one turn of the dash loop instead of a loop over 16 entries       | 6.3 (from 7.9–8.4) |

So the vertex stage and the rasterization of the quads cost more than `Line2` in total, whatever
the fragment shader does, and four things were worth changing:

- **One color is a uniform** (`LINE_UNIFORM_COLOR`): no color buffer, two attributes and two flat
  varyings fewer. The backlog's u8 colors were not needed for this case; per-point colors keep
  float attributes (packing them as u8 would change colors by up to half a level, and they are
  the rare case).
- **Dashes keep their phase through a pan.** The dashed line's extra cost was not the dash math
  but the phase buffers recomputed and re-uploaded every 50 ms while the transform changed.
  Offsets alone change no screen length under a camera without perspective, so nothing is
  recomputed. A zoom still recomputes (throttled, as before).
- **One dash and one gap skip the loop**, and longer patterns loop over the entries in use: the
  loop over all 16 with a `break` cost a quarter more than a solid line.
- **Quads end where the segment's pixels end.** At a gentle join the neighbour owns everything
  before the bisector, so the quad stops half a pixel past the vertex instead of half the width
  and a pixel. The property test in `line-join.test.ts` checks that every pixel the former quad
  drew is inside the new one with half a pixel to spare. A segment whose ends differ in depth (a
  2.5D view, a 3D scene) keeps the former quad, because the quad's corners carry the end points'
  depths.

### What did not help, or cost pixels

- **A smaller margin than half a pixel** around the drawn pixels (0.06 and 0.25 px were tried):
  6.2 ms instead of 6.7 ms, but the canvas is multisampled, a pixel at the edge of a quad is only
  written to the samples the quad covers, and joins showed pin holes (1,500 to 5,700 pixels of
  `_dev/lines-joins-dashes` differed). Half a pixel reproduces every baseline exactly.
- **The shorter quad for segments that cross depths**: it tilted their depth, and 258 pixels of
  `area/depth-toself` and 6 of `view3d/interactive` changed where lines meet extruded faces.
- **Fewer varyings** by recomputing the segment's direction and length per fragment: no change.
- Reaching 2× with room to spare needs fewer fragments (the anti-aliasing margin makes a
  sub-pixel segment's quad four times `Line2`'s) or a cheaper vertex stage; both change what is
  drawn. At this density (65 points per pixel column) charts use the line level of detail (E16.2)
  before the primitive, so the target measures the primitive, not a chart.

## Marker cost (E16.10)

Measured, not changed (spike A, 1M markers panning, GPU ms per frame, 3 repetitions):

| Marker size | Markers          | `THREE.Points`, trivial shader | Ratio |
| ----------- | ---------------- | ------------------------------ | ----- |
| 3 px        | 4.30 (4.25–4.32) | 3.11 (3.08–3.12)               | 1.38× |
| 8 px        | 8.53 (8.26–8.62) | 6.20 (6.15–6.22)               | 1.38× |

The line result suggests where the rest is: per-instance attributes. A marker instance reads 40
bytes, 16 of them `aStyle` (line width, symbol, opacity, angle as four floats), which most traces
set once for all points. Taking a constant `aStyle` from a uniform is the experiment to run next;
it was not run here.

## Commands

```sh
# Heatmap: first draw, 5 runs, each in a fresh browser; --profile adds the breakdown.
pnpm bench:gpu --only heatmap --runs 5 --out /tmp/heatmap
pnpm bench:gpu --only heatmap --runs 1 --profile --out /tmp/heatmap

# Lines and markers (docs/spikes/README.md: one spike at a time, never in an embedded browser).
pnpm --filter @mk7s/holochart-sandbox exec vite --port 5197 --strictPort --host 127.0.0.1 &
node docs/spikes/scripts/run-spike.mjs --spike b-lines --params 'mode=perf&scale=1&reps=3' --out /tmp/spikes
node docs/spikes/scripts/run-spike.mjs --spike b-lines --params 'mode=perf&scale=1&reps=3&only=LinePrimitive&colors=vertex' --out /tmp/spikes
node docs/spikes/scripts/run-spike.mjs --spike a-markers --params 'scale=1&reps=3' --out /tmp/spikes

# Before: the same commands at 15251ef (git worktree add /tmp/holochart-before 15251ef).
```

The readout of a spike run is the `readout` field of the JSON file it writes.
