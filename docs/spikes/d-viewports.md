# Spike D: 9 scissored viewports vs 9 canvases

- **Plan:** E0.7 spike D; informs ADR-004.
- **Status:** Measured on 2026-10-11 ([Results](#results-2026-10-11)).
- **Page:** [`examples/_spikes/d-viewports.ts`](../../examples/_spikes/d-viewports.ts)

> ⚠️ **Run this only in the isolated runner.** Its context-limit probe deliberately creates up to
> 24 WebGL contexts until the browser starts losing them. Inside an embedded app browser that shares
> a GPU process with the app, lost contexts can take the host app down with them.

## What the page measures

A 3×3 grid, each panel with 50k markers and a 5k-point line:

- `single`: one render root (one canvas, one WebGL2 context) with 9 scissored viewports.
- `multi`: 9 canvases, one render root each.

For both: build plus first frame, frame cost when all 9 panels pan and when one panel changes
(hover-like), programs/geometries/textures, and JS heap. Then the context-limit probe records at
which render root the browser starts losing contexts (`&max=`, default 24).

## How to run

Small scale first, and the comparison separately from the context-limit probe:

```bash
pnpm --filter @mk7s/holochart-sandbox exec vite --port 5197 --strictPort --host 127.0.0.1 &
node docs/spikes/scripts/run-spike.mjs --spike d-viewports --params 'scale=0.1&only=compare' --out /tmp/spikes
node docs/spikes/scripts/run-spike.mjs --spike d-viewports --params 'only=limit&max=24' --out /tmp/spikes
```

## Results (2026-10-11)

|         |                                                                                  |
| ------- | -------------------------------------------------------------------------------- |
| Machine | Apple M1 Max, macOS, **under load from other applications** (load average 18–30) |
| Browser | Playwright Chromium (HeadlessChrome 153), ANGLE → Metal                          |
| Runner  | [`scripts/run-spike.mjs`](scripts/run-spike.mjs), DPR 1, peak browser RSS 663 MB |

Medians, in ms, for a 3×3 grid with 50k markers and a 5k-point line per panel (`scale=1`), and
with a tenth of that (`scale=0.1`). Because the machine was busy, read the ratios, not the
absolute numbers.

| Measurement                              | One context, 9 viewports | 9 canvases | Ratio |
| ---------------------------------------- | ------------------------ | ---------- | ----- |
| Build and first frame                    | 56.5                     | 159.4      | 2.8×  |
| Frame, all 9 panels panning              | 4.0                      | 16.4       | 4.1×  |
| Frame, one panel changes                 | 4.0                      | 2.0        | 0.5×  |
| Build and first frame, `scale=0.1`       | 26.3                     | 130.2      | 5.0×  |
| Frame, all 9 panels panning, `scale=0.1` | 2.1                      | 8.2        | 3.9×  |
| Frame, one panel changes, `scale=0.1`    | 2.1                      | 0.8        | 0.4×  |
| Shader programs                          | 2                        | 18         | 9×    |
| Geometries                               | 18                       | 18         | 1×    |

**Context limit.** Creating 24 render roots, the browser dropped the oldest context when the 17th
was created and one more for each after that, so the limit here is 16. Recreating 16 afterwards
lost none.

What it says for ADR-004:

- **One context is three to four times cheaper** to build and to redraw when every panel moves,
  and it compiles each program once, not once per panel.
- **It is slower when a single panel changes** (4.0 against 2.0 ms), because the whole canvas is
  redrawn. Both are well inside a frame. Redrawing only the changed viewport would close the gap.
- **Nine canvases spend nine of a page's 16 contexts.** Two such figures would lose one.
