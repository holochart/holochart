# Spike D: 9 scissored viewports vs 9 canvases

- **Plan:** E0.7 spike D; informs ADR-004.
- **Status:** **Not measured yet.** Deferred to the M7 benchmarking pass (with E16.1), by decision
  on 2026-09-23. The page is ready.
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

Each panel draws a line, so wait for the [spike B](b-lines.md) line-cost fix first; otherwise the
line cost dominates and the viewport comparison means little.

## What we know so far

The `viewports-grid` visual example renders 9 viewports (8 × 2D markers and one 3D panel) in one
context correctly and deterministically. The design works; its cost relative to separate canvases is
not measured yet.
