# ADR-018: Visual regression harness

- **Status:** Accepted (2026-09-23; confirmed by spike E).
- **Date:** 2026-09-23
- **Related stories:** E20.3, E0.3, E19.2, E0.7 (spike E), E19.5; plan §3 principle 8, risk R4

## Evidence

- [Spike E](../spikes/e-determinism.md): SwiftShader renders are bit-identical run to run and
  match the macOS-generated baselines in CI's Linux container. Hardware Metal renders pass the
  current tolerances but differ at edges, so they must not be a blocking gate.

## Context

Plan principle 8: docs examples, gallery thumbnails, and visual tests are the same artifacts. Every
example in `examples/` should therefore be a pixel-compared test without extra per-test code. GPU
output varies across drivers and machines (risk R4), examples import three.js and DOM code, and a
single broken example must not take down the whole suite.

## Decision

- **Discovery:** every file in `examples/` (except `_lib/` and `index.ts`) is a visual test unless
  its `meta.tags` contains `no-visual-test`. The Playwright suite (`tests/visual/visual.spec.ts`,
  `playwright.config.ts`) enumerates example ids from the filesystem in Node. Each example is its own
  test.
- **Server:** Playwright `webServer` starts the dev sandbox (`apps/sandbox`, Vite dev server). Each
  test opens `?example=<id>&test=1`.
- **Test mode:** renders the example with no UI chrome, in a container sized to `meta.size` (default
  640×400), with DPR forced to 1. It exposes `window.__exampleReady`, a promise that resolves with the
  example's meta after the example's `handle.ready` plus two animation frames, or rejects if the
  example fails to load or run. Meta is read in the page: the sandbox imports the module, and
  `no-visual-test` examples are not run (the test is skipped).
- **Comparison:** the container is screenshotted and compared with
  `tests/visual/__baselines__/<id>.png` using `pixelmatch`. The test fails when the fraction of
  differing pixels exceeds `meta.testTolerance` (default 0.001). A missing baseline is a failure.
- **Output:** on failure, actual and diff PNGs go to `tests/visual/__actual__/` and
  `tests/visual/__diff__/` and are attached to the Playwright HTML report (a CI artifact).
- **Updating:** `UPDATE_BASELINES=1` (`pnpm test:visual:update`) or Playwright's `--update-snapshots`
  rewrites baselines. Baseline changes are reviewed in PRs.
- **Determinism:** Chromium runs with SwiftShader, launched with
  `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`. CI runs the visual job in the
  pinned `mcr.microsoft.com/playwright:v1.63.0-noble` container. When cross-platform drift appears,
  regenerate baselines in that same container.

## Consequences

### Positive

- Adding an example adds a test; examples, docs, and tests cannot drift apart.
- A broken example fails only its own test; the dev server compiles modules on demand, so one
  broken module cannot break the whole run.
- Software rendering in a pinned container gives reproducible pixels across machines.
- Per-example tolerance and explicit output locations keep failures easy to inspect.

### Negative

- SwiftShader is slow, and does not catch GPU-driver-specific bugs (covered by the cross-browser
  matrix, E20.5).
- Baselines generated outside the pinned container may differ; contributors on macOS should use the
  container to update baselines.
- Dev-server mode tests unbundled code, not the production build.

### Follow-ups

- Bundle fonts for text examples (no system fonts, E20.3).
- Polish the HTML diff report.
- Gallery generation (E19.5) shares this pipeline to produce thumbnails.

## Alternatives considered

- **Playwright `toHaveScreenshot`:** less control over tolerance semantics and output locations.
  Could revisit.
- **Build + preview server:** closer to production, but one broken example fails the whole build.
- **Node-side meta parsing:** executing example modules in Node fails (they import three/DOM code);
  regex-parsing source is fragile.
- **GPU rendering on CI runners:** non-deterministic output across runner hardware and drivers.

## References

- `plan.md` §3 principle 8, E0.7 spike E, E19.2, E19.5, E20.3, risk R4
- [ADR-005](005-webgl-sdf-text-with-dom-mirror.md), [ADR-007](007-on-demand-rendering.md)
