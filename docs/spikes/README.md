# E0.7 technical spikes

Evidence for the M0 architecture decisions, measured against the real M0 implementations. See plan
story E0.7 and the ADRs in [`docs/adr/`](../adr/README.md).

| Spike                              | Question                                            | Status       | Verdict                                                                                                                                                                                     |
| ---------------------------------- | --------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [A: markers](a-markers.md)         | Can instanced SDF markers hit the G5 targets?       | Measured     | ✅ 100k first render 23 ms, 1M restyle 7 ms. After the shader optimization, 1M markers pan at 119–160 fps at 3 px and 70–77 fps at 8 px (1.4–1.7× a trivial point shader; was 3.5×).        |
| [B: lines](b-lines.md)             | Our `LinePrimitive` vs three's `Line2`              | Measured     | ✅ after fixing a critical setup trap (1×1 default resolution made every quad cover the canvas). 1M segments: 58 fps solid, 22 fps dashed (~5–10× `Line2`'s GPU time); better join quality. |
| [C: text](c-text.md)               | 2,000 labels: WebGL SDF vs DOM overlay (ADR-005)    | Not measured | Deferred to M7 benchmarking                                                                                                                                                                 |
| [D: viewports](d-viewports.md)     | 9 scissored viewports vs 9 canvases (ADR-004)       | Not measured | Deferred to M7 benchmarking (after the spike B fix)                                                                                                                                         |
| [E: determinism](e-determinism.md) | Are CI screenshots reproducible? (ADR-018, risk R4) | Measured     | ✅ SwiftShader is bit-stable run to run and across macOS/Linux; keep it as the only blocking gate                                                                                           |

Spikes C and D move to the M7 benchmarking pass (plan E16.1), by decision on 2026-09-23.

## GEO1 spikes

Evidence for the geographic-charts decisions (backlog GEO1), run through the same isolated runner.
The sizes of the candidate dependencies and basemap data are in
[`docs/release/bundle-size.md`](../release/bundle-size.md#geo-candidates-measured-for-geo1-2026-10-03)
([`scripts/geo-sizes.mjs`](scripts/geo-sizes.mjs)).

| Spike                                    | Question                                                                                                                     | Status   | Verdict                                                                                                                                                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [F: geo projection](f-geo-projection.md) | Can a 50m world be reprojected through `d3-geo` on every frame of a drag? ([ADR-025](../adr/025-geo-projection-pipeline.md)) | Measured | ❌ at 50m: 89–95 ms per frame (11 fps), and 32 ms with every CPU shortcut. ✅ at 110m: 12 ms. A vertex-shader prototype draws 50m in 2–3 ms for a list of projections. Pan and zoom need no reprojection. |
| [G: MapLibre](g-maplibre.md)             | A Holochart layer over MapLibre GL: custom layer or overlay canvas? ([ADR-027](../adr/027-map-renderer-integration.md))      | Measured | Both align to 0.1 px. The overlay needs no change in `packages/render` and costs 1–2 ms more per frame; the custom layer needs a hosted render root but can draw under the map's labels. Chromium only.   |

A running dev server does not see a new file under `examples/` until `examples/index.ts` is
touched, because `examples/` is outside the sandbox's Vite root.

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
