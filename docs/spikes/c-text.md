# Spike C: 2,000 labels, WebGL SDF text vs DOM overlay

- **Plan:** E0.7 spike C; informs ADR-005.
- **Status:** Measured on 2026-10-11 ([Results](#results-2026-10-11)).
- **Page:** [`examples/_spikes/c-text.ts`](../../examples/_spikes/c-text.ts)

## What the page measures

- **WebGL** (`TextPrimitive`, troika `BatchedText`): cold and warm sync time until `ready`, cost
  of changing 100 labels, pan cost (`setTransform` every frame), draw calls, JS heap, SDF atlas size.
- **DOM overlay:** 2,000 absolutely positioned spans: creation, 100-label update, pan (a transform
  per span per frame), JS heap. DOM times include forced style and layout but not paint.
- `&order=dom-first` swaps the run order to rule out warm-up bias.

## How to run

Use the isolated runner (never an embedded app browser), small scale first:

```bash
pnpm --filter @mk7s/holochart-sandbox exec vite --port 5197 --strictPort --host 127.0.0.1 &
node docs/spikes/scripts/run-spike.mjs --spike c-text --params 'reps=5' --out /tmp/spikes
```

The label count is fixed at 2,000 (the ADR-005 question), which is a light workload.

## Results (2026-10-11)

|         |                                                                                  |
| ------- | -------------------------------------------------------------------------------- |
| Machine | Apple M1 Max, macOS, **under load from other applications** (load average 18–30) |
| Browser | Playwright Chromium (HeadlessChrome 153), ANGLE → Metal                          |
| Runner  | [`scripts/run-spike.mjs`](scripts/run-spike.mjs), DPR 1, peak browser RSS 1.1 GB |

Medians of 5 repetitions (3 for pan), 2,000 labels, in ms. The "DOM first" columns are the same
run with `order=dom-first`. Because the machine was busy, read the ratios, not the absolute
numbers.

| Measurement                                 | WebGL (troika) | WebGL, DOM first | DOM overlay | DOM, DOM first |
| ------------------------------------------- | -------------- | ---------------- | ----------- | -------------- |
| First sync until ready, cold (loads troika) | 302            | 177              | n/a         | n/a            |
| Sync until ready, warm                      | 100            | 88               | 11.8        | 19.2           |
| Change 100 labels: update call              | 3.1            | 2.9              | 1.4         | 1.3            |
| Change 100 labels: until the frame is ready | 12.5           | 13.0             | n/a         | n/a            |
| Pan, per frame                              | 3.5            | 4.0              | 1.7         | 1.7            |
| Draw calls                                  | 1              | 1                | n/a         | n/a            |

The DOM times include forced style and layout but **not paint**, so they are a lower bound.

What it says for ADR-005:

- **WebGL text holds a frame budget with 2,000 labels.** A pan costs 3.5–4 ms a frame in one draw
  call, and a 100-label change is ready in 13 ms.
- **The first layout is the weak spot.** 2,000 labels take about 90 ms warm and 180–300 ms cold,
  eight times the DOM's creation time. A chart draws tens of labels, not thousands, so this is a
  cost for the densest figures only.
- **The DOM is cheaper on everything measured**, which excludes paint. It is not in the
  framebuffer, so it cannot be exported or depth-tested. Nothing here argues for it as the default.
- The `textRenderer: 'dom'` mode that ADR-005 describes as an option was not built; this page
  measures a hand-written overlay.
