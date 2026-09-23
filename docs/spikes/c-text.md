# Spike C: 2,000 labels, WebGL SDF text vs DOM overlay

- **Plan:** E0.7 spike C; informs ADR-005.
- **Status:** **Not measured yet.** Deferred to the M7 benchmarking pass (with E16.1), by decision
  on 2026-09-23. The page is ready.
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

## What we know so far

The `text-labels` visual example renders about 60 labels in one draw call (plus one for outlined
labels), and the E0.7 determinism spike found it stable run to run. That says nothing about 2,000
labels or update cost, which is what ADR-005 needs.
