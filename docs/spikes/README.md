# E0.7 technical spikes

Evidence for the M0 architecture decisions, measured against the real M0 implementations. See plan
story E0.7 and the ADRs in [`docs/adr/`](../adr/README.md).

| Spike                              | Question                                            | Status       | Verdict                                                                                                                                                                                     |
| ---------------------------------- | --------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [A: markers](a-markers.md)         | Can instanced SDF markers hit the G5 targets?       | Measured     | ✅ 1M pan 57–63 fps at 3 px, 100k first render 24 ms, 1M restyle 6 ms. Fill cost is 3.5× a trivial shader, so larger markers are slower (27–32 fps at 8 px).                                |
| [B: lines](b-lines.md)             | Our `LinePrimitive` vs three's `Line2`              | Measured     | ✅ after fixing a critical setup trap (1×1 default resolution made every quad cover the canvas). 1M segments: 58 fps solid, 22 fps dashed (~5–10× `Line2`'s GPU time); better join quality. |
| [C: text](c-text.md)               | 2,000 labels: WebGL SDF vs DOM overlay (ADR-005)    | Not measured | Deferred to M7 benchmarking                                                                                                                                                                 |
| [D: viewports](d-viewports.md)     | 9 scissored viewports vs 9 canvases (ADR-004)       | Not measured | Deferred to M7 benchmarking (after the spike B fix)                                                                                                                                         |
| [E: determinism](e-determinism.md) | Are CI screenshots reproducible? (ADR-018, risk R4) | Measured     | ✅ SwiftShader is bit-stable run to run and across macOS/Linux; keep it as the only blocking gate                                                                                           |

Spikes C and D move to the M7 benchmarking pass (plan E16.1), by decision on 2026-09-23.

## Running spikes safely

Spike pages are sandbox examples tagged `spike` and `no-visual-test`. They run their benchmark on
load and publish results on `window.__spikeResults`.

**Always use the isolated runner.** It starts one headless Chromium per spike on the hardware GPU,
with a hard timeout and a memory watchdog that kills the browser if its process tree exceeds a cap:

```bash
pnpm --filter @mk7s/holochart-sandbox exec vite --port 5197 --strictPort --host 127.0.0.1 &
node docs/spikes/scripts/run-spike.mjs --spike a-markers --params 'scale=0.1' --out /tmp/spikes
```

Rules learned the hard way:

- **Never run spikes in an embedded app browser** (for example an IDE or desktop-app browser pane).
  It shares a GPU process with the host app, so a pathological frame or a lost context can take the
  app down. This happened once during M0.
- **Start at `scale=0.1` (or lower) and step up only after a clean run.** `scale` multiplies the
  point counts (clamped to 0.01–1) and is recorded in the results.
- **Run one spike at a time,** with nothing else GPU-heavy running. On macOS the GPU is shared with
  the window server, so multi-second GPU frames make the whole machine lag.
- **Keep the `d-viewports` context-limit probe (`only=limit`) separate** from the comparison run.

[`scripts/determinism.mjs`](scripts/determinism.mjs) drives spike E (SwiftShader vs Metal
screenshots); see [e-determinism.md](e-determinism.md).
