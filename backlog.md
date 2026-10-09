# Holochart ship backlog

Polish work that turns Holochart from a feature-complete monorepo into a library people can
install, trust and build on. Written 2026-09-30, after M6 wave 2 (#30). `plan.md` stays the source
for feature stories; this file only orders the work that stands between today and a release, and
points back to plan.md story IDs where one exists.

**Where things stand.** All planned 2D and 3D chart types are built, with 514 examples, about 4,700
unit tests and visual, interaction and bundle suites in CI. Nothing has been published to npm. The
first thing a new user sees (the README, the install page, the types) still describes the M0
project. Robustness also has a few gaps that any real app will hit: a throwing event handler,
a machine without WebGL2, a dashboard with more than about 16 charts.

**What "shippable" means here**

| Release                 | Bar                                                                                                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0.1.0-alpha` (phase 1) | Installs from npm with correct metadata and types. The README and install docs work as written. A bad callback or missing WebGL2 fails politely. Nothing in the docs is false.                       |
| `0.x beta` (phase 2)    | Safe in production apps: dashboards, framework apps, SSR builds, strict CSP, Firefox and Safari. Plotly users can see what is and isn't supported. The public API is written down and guarded in CI. |
| `1.0` (phase 3)         | The M7 exit criteria in plan.md: Definition of Done met, plugin API stable, importer renders ≥ 80% of Plotly mocks, performance budgets green, ADR-004/005 decided.                                  |

Sizes are S (hours), M (a day or two for one agent), L (a multi-agent wave). Evidence paths are
as of commit b49fe2c.

## Decisions for the owner

These change what goes into each phase. Recommendations first.

1. **Pause new features after M6 wave 3's small items.** Ship Express `scatter3d`/`line3d` and
   the M6 exit review, and move 2.5D extrusion (E8.9, E9.10, E9.12) and the other ➕ 3D extras
   to after 1.0. They are P2 extensions no user is waiting for, and each one adds budget pressure
   (full ESM is at 533.9 of 540 kB).
2. **Release as an alpha pre-release, not a stable 0.1.0.** With 59 pending changesets in one
   fixed group and no `.changeset/pre.json`, the first version PR publishes every package as
   `0.1.0` on the `latest` tag. That contradicts `docs/release/versioning.md`. Recommended:
   `changeset pre enter alpha` and one squashed "initial release" changeset.
3. **ESM-only or dual package?** The exports maps have only `types`/`development`/`import`, so
   `require()`, Jest and older tools fail. Recommended: stay ESM-only, add a `default` condition
   (Node 22 can `require` ESM), and say so in every README.
4. **The `three` peer range.** It is `>=0.180.0`, with no upper bound, and the "three (latest)"
   CI leg can't fail the build. Recommended: cap it at the next minor after the latest tested
   version and widen it per release.
5. **Trademark search for "Holochart"** (plan.md L2495) before anything goes to npm.

---

## Phase 1: first public release (`0.1.0-alpha`)

Everything here is either a promise the docs already make or a failure every early adopter would
hit. It suits two waves of up to four agents.

| ID   | Item                                                          | Size | Track   |
| ---- | ------------------------------------------------------------- | ---- | ------- |
| S1.1 | Release plumbing: pre mode, squashed changeset, owner setup   | S    | release |
| S1.2 | package.json and published-output hygiene                     | M    | release |
| S1.3 | Package quality gates in CI (publint, attw, pack-and-install) | M    | release |
| S1.4 | README rewrite and per-package READMEs                        | M    | docs    |
| S1.5 | Fix what the live docs get wrong                              | S    | docs    |
| S1.6 | Typed figures: per-trace TypeScript types                     | L    | API     |
| S1.7 | User event listeners can't break the chart                    | S    | runtime |
| S1.8 | Fail politely without WebGL2; robust mount and teardown       | M    | runtime |
| S1.9 | Community files                                               | S    | repo    |

### S1.1 Release plumbing `S`

- [ ] `changeset pre enter alpha`. Squash the 59 changesets into one readable "initial release"
      changeset, keeping only what a user of 0.1.0 needs to know.
- [ ] Owner: npm token, `npm` GitHub environment and the `RELEASE_ENABLED=true` repo variable
      (see `docs/release/releasing.md`). Better: npm trusted publishing (OIDC) so no long-lived
      token exists (`releasing.md:100` already lists it as a follow-up).
- [ ] Dry run: run the `version` and `pack` jobs on a branch and check the tarballs, tags
      (`alpha`) and generated CHANGELOG before the first real publish.
- [ ] Docs banner and CDN snippets move from "pre-alpha, clone the repo" to the published
      version, with jsDelivr URLs pinned to `@0.1` rather than floating.

### S1.2 package.json and published output `M` · ✅ Done (wave R0)

Evidence: every `packages/*/package.json`; `packages/render/dist/index.d.ts`; `npm pack --dry-run`.

- [x] Exports: add `"default"` after `import` and a `"./package.json"` export in all 14 packages.
- [x] Metadata: add `bugs`, `keywords` and `author` everywhere. Add `publishConfig.access: public`
      and `provenance: true`, so a manual `pnpm publish` of a scoped package doesn't go out
      restricted.
- [x] Peers: set the `three` upper bound (decision 4). Add `@types/three` as an optional peer
      (`peerDependenciesMeta`), because the shipped `.d.ts` files import from `three`.
- [x] Umbrella: `unpkg`/`jsdelivr` fields → `dist/holochart.iife.min.js`, so the bare CDN URL
      serves the script build. Ship a `global.d.ts` for `window.Holochart`. Say that locales are
      a separate install.
- [x] Types: turn on `stripInternal`; two `@internal` members leak today
      (`render/src/markers/matrix.ts:275, 362`). Either ship `src` or turn off `declarationMap`
      for publish builds, since the maps point at `../src/*.ts`, which isn't in `files`.
- [x] Core ships `THIRD_PARTY_NOTICES.md` (it ports plotly.js color lists).
- [x] Optional: drop `sourcesContent` from the IIFE map (10.4 MB of the 14.7 MB unpacked umbrella).

### S1.3 Package quality gates in CI `M` · ✅ Done (wave R0)

- [x] `publint` and `@arethetypeswrong/cli --pack` for every package in the `build` job. They
      would have caught the exports and `.d.ts.map` issues above.
- [x] Pack-and-install smoke test: `pnpm pack` every package, install the tarballs into
      fresh fixtures outside the workspace (a Vite app, a Node ESM script, a TypeScript
      `tsc --noEmit` project, a plain HTML page with the IIFE and 3D add-on), and draw one 2D and
      one 3D chart. This is the only test that checks what users actually download.
- [x] Run the bundle smoke test on the three (min) and three (latest) legs too. When latest
      fails, open an issue instead of passing silently.

### S1.4 README and per-package READMEs `M` · ✅ Done (wave R0)

Evidence: `README.md:5-6` ("Milestone M0 … in progress", "every API … planned"); its package
table lists 7 of 14 packages; 12 packages have no README, so their npm pages would be blank.

- [x] Root README: what it is, a screenshot, `pnpm add @mk7s/holochart three`, a 10-line working
      example, the CDN snippet (with the 3D add-on), the package table, the supported browsers,
      a link to the docs and the status (alpha).
- [x] A short README for each package: its purpose, install, what it registers, and a docs link.
- [x] `apps/docs/roadmap.md` shows M1 "in progress" and M2–M6 "planned"; update it from plan.md.

### S1.5 Fix what the live docs get wrong `S` · ✅ Done (wave R0)

- [x] **The live site links to `localhost:5173`.** The "Open in sandbox" link defaults to it
      (`apps/docs/.vitepress/config.ts:29`), and `scripts/publish-docs-mk7s.mjs` never sets
      `HOLOCHART_SANDBOX_URL`. Hide the button unless a URL is set.
- [x] `getting-started/installation.md`:
  - Remove "more trace packages arrive with later milestones" and "`createChart` is being built
    in M1".
  - Fix the Vue snippet, which imports a `Figure` type that isn't exported.
  - Fix the partial-bundle recipe, which registers traces but not `builtinComponents` or themes,
    so it draws no axes, legend or hover.
  - It also promises attribute autocomplete that doesn't exist yet; S1.6 makes that true.
- [x] The React snippet recreates the chart on every figure change. Use `react()` and `destroy()`.
- [x] Add a "renders without console errors" page check (plan.md L1721), so broken embeds fail the
      docs build.

### S1.6 Typed figures `L`

Evidence: `FigureInput` in `packages/core/src/defaults/types.ts:12-16` is `data?: readonly
unknown[]`, `layout?: unknown`, `config?: unknown`. The per-trace generator exists
(`core/src/codegen/generate-types.ts`) but `tools/schema-gen` only emits `Layout` and `Config`.

This should land before the first publish: going from `unknown` to real types afterwards breaks
compiles for existing users.

- [ ] Generate one interface per trace type with a `type` literal, and a `Data` union over every
      registered trace (including the Holochart extensions and `bar3d`).
- [ ] Type `FigureInput` as
      `{ data?: Data[]; layout?: Partial<Layout>; config?: Partial<Config>; frames?: Frame[]; datasets?: … }`,
      and export `Figure`, `Data`, `Layout` and `Config` from the umbrella.
- [ ] Type the Plotly-style API (`newPlot`, `react`, `restyle`, `relayout`, `update`) and event
      payloads against them. `restyle`/`relayout` take attribute-path strings, so they need a
      typed path helper or a documented `Record<string, unknown>` escape hatch.
- [ ] Type tests (`tsd` or `expectTypeOf`): autocompletion of `marker.color` on scatter, an error
      on `type: 'scater'`, and every example in `examples/` compiles against the public types
      (this makes the examples the type test corpus).

### S1.7 User event listeners can't break the chart `S` · ✅ Done (wave R0)

Evidence: `ChartEmitter.emit` (`runtime/src/events.ts:243-251`) and render's `Emitter.emit`
(`render/src/core/emitter.ts:32-35`) call listeners without a guard. One throwing
`plotly_click` handler stops the other listeners, skips `afterplot` inside `#drain`
(`runtime/src/chart.ts:1614-1619`), and can leave hover or drag state half-updated.

- [x] Wrap each listener call and report errors with `reportError` (falling back to a
      `queueMicrotask` rethrow), so they reach the console and error trackers while the
      chart carries on.
- [x] Tests: a throwing listener among three, in hover, click, relayout and afterplot.

### S1.8 Fail politely without WebGL2; robust mount and teardown `M` · ✅ Done (wave R0)

Evidence: `new WebGLRenderer(...)` (`render/src/core/render-root.ts:107`) throws inside the Chart
constructor. `CHARTS.set(el, this)` (`chart.ts:650`) runs before `#mount`, so `getChart(el)`
returns a broken chart. `#disposeView`/`#disposeComponent` use `try/finally`, so one failing
dispose skips `root.destroy()` in `#unmount` (`chart.ts:1760-1774`) and leaks the context.

- [x] Detect WebGL2 up front. On failure, render an accessible fallback in the container (the
      chart's text description and a "WebGL2 is required" note) and reject with a typed
      `WebGLUnavailableError`.
- [x] Register the chart only after a successful mount, and clean up on failure.
- [x] Teardown catches and logs each dispose, and always reaches `root.destroy()`.
- [x] Tests: a faked renderer that throws, a trace whose dispose throws, and `getChart` after a
      failed mount.

### S1.9 Community files `S` · ✅ Done (wave R0)

- [x] `SECURITY.md` with a private reporting channel, `CODE_OF_CONDUCT.md`,
      `.github/ISSUE_TEMPLATE/` (bug with a figure JSON and browser/GPU, feature, Plotly
      difference), `CODEOWNERS`, Renovate or Dependabot (grouped, three.js pinned for manual
      review).

---

## Phase 2: beta, safe in production apps

Grouped into tracks that can run in parallel.

### Runtime robustness

| ID   | Item                                                            | Size |
| ---- | --------------------------------------------------------------- | ---- |
| S2.1 | WebGL context limit: shared renderer or pooling (E2.16)         | L    |
| S2.2 | Context loss and restore end to end, plus GPU capability checks | M    |
| S2.3 | Zero-size and hidden containers, pixel-ratio cap, detach        | S    |
| S2.4 | Error policy and messages                                       | S    |

**S2.1 WebGL context limit** (plan.md E2.16, risk R5, ADR-004 L47) · ✅ Done (wave R2). Browsers
keep roughly 16 contexts, and every chart and every `toImage` call took one. A 20-chart dashboard
lost its oldest charts.

- [x] Decide between one shared renderer drawing into per-chart canvases (the plan's E2.16 design)
      and context pooling that freezes idle offscreen charts to a bitmap. Write it up as an ADR
      that amends ADR-004. — Shared renderer behind a budget of 4 dedicated contexts
      (`config.sharedRenderer: 'auto' | true | false`), ADR-023.
- [x] `toImage` reuses the chart's own renderer instead of a temporary context. — Exports always
      draw through the shared renderer: the chart's own when it is shared, otherwise one context
      for all exports, released after the last.
- [x] Tests: 40 charts on one page, all drawing and hovering, with no context-lost events.
      Document the limit and the configuration. — `tests/interaction/dashboard.spec.ts`,
      `guides/dashboards.md`.
- [ ] Follow-up: troika's glyph generator keeps one more WebGL context per page; move it onto the
      shared context or its JS fallback.

**S2.2 Context loss and GPU capabilities.** · ✅ Done (wave R2)

- [x] GPU-only resources rebuild on `contextrestored`. The lighting environment target
      (`render/src/primitives/lighting.ts:390`) doesn't today. Add a Playwright test using
      `WEBGL_lose_context` on a 2D and a 3D chart. — The environment map was the only thing that
      did not come back; `tests/interaction/context-loss.spec.ts` covers 2D, lit 3D, GPU picking
      and the shared renderer.
- [x] Read `MAX_TEXTURE_SIZE` and float-texture support once per root, instead of the hard-coded
      4096 heatmap and surface limits (`render/.../heatmap.ts:88`,
      `traces-sci/src/heatmap/calc.ts:52`). Clamp with a warning. — `root.capabilities`
      (`maxTextureSize`, `max3DTextureSize`); heatmap, image, surface and volume textures check
      it and warn instead of drawing black. Float textures need no check: all are
      nearest-sampled, which WebGL 2 guarantees. The calc-stage `MAX_CELLS` (4096²) stays as a
      memory guard.
- [ ] Follow-up (three.js): destroying a chart after a restore logs one
      `INVALID_OPERATION: delete` console warning per GPU object, because three keeps its
      pre-loss dispose listeners. Harmless; needs an upstream fix or a listener reset on
      `contextlost`.

**S2.3 Container edge cases.** · ✅ Done (wave R2)

- [x] A chart mounted in a hidden or zero-size container (tabs, modals) falls back to 700×450
      forever unless `responsive` is on (`chart.ts:358`). With autosize, re-layout on the first
      non-zero size. — A one-shot `ResizeObserver` waits for the first size, then disconnects.
- [x] Make the pixel-ratio cap of 2 (`render-root.ts:62-65`) configurable. —
      `config.maxPixelRatio` (default 2).
- [x] Polar radial drags listen on the global `window`
      (`traces-sci/src/polar/component.ts:602-604`); use `ownerDocument.defaultView` for iframes
      and popups. — The event's own `view`; tested with a chart in an iframe.
- [x] Document that `purge()` is required; the framework recipes in S2.9 call it. —
      `guides/dashboards.md` ("Always call `purge`") and the S2.9 recipes.

**S2.4 Error policy.** · ✅ Done (wave R2)

- [x] Write down which calls reject and which warn. Export typed error classes, e.g.
      `ValidationError` and `WebGLUnavailableError`. — `reference/errors.md`. Both classes (and
      the `HolochartError` base) were already exported; a test now pins that.
- [x] Unknown trace types name the package to install and register, e.g. "`sankey` is in
      @mk7s/holochart-traces-hier; import it and call `register(sankey)`". Today the message
      only says the trace is hidden. — `tracePackage()` in core, checked against the trace
      packages by the umbrella's tests.
- [x] Move a shared `deprecate(key, message)` warn-once helper into core. It exists only inside
      the modebar (`components/src/modebar/buttons.ts:293`). — `warnOnce` and `deprecate` in
      core; the modebar uses them.

### Browsers, tests and CI

| ID   | Item                                                         | Size |
| ---- | ------------------------------------------------------------ | ---- |
| S2.5 | Firefox and WebKit in CI; a supported-browser matrix (E20.5) | M    |
| S2.6 | Leak tests (E20.6)                                           | M    |
| S2.7 | Coverage thresholds beyond core                              | S    |
| S2.8 | Visual-test debt                                             | S    |

**S2.5 Cross-browser.** Every Playwright project runs on `chromium-swiftshader` only. · ✅ Done (wave R2), except the manual pass

- [x] Nightly Firefox and WebKit runs of the interaction and bundle suites, which don't compare
      pixels.
- [ ] A manual pass on real Safari (macOS and iOS) and Firefox with a checklist: text, lines, 3D,
      touch, export.
- [x] Publish the supported-browser matrix in the README and docs (WebGL2 only, per the non-goals).

**S2.6 Leak tests.** plan.md E2.1 says "the leak test passes" (L537), but E20.6 was never built. · ✅ Test built (wave R2); it found leaks that are still open

- [x] Create, update and destroy each chart family 100 times. Assert that GPU resource counts
      (`renderer.info`), listeners and the heap return to baseline, and that the context is
      released.

Wave R2 notes (details in `docs/release/browser-support.md` and `tests/interaction/leak.spec.ts`):

- The manual pass above is a checklist only (`docs/release/browser-support.md`); nobody has run
  it. `HOLOCHART_BROWSER=firefox|webkit` runs the interaction and bundle suites; nightly in
  `.github/workflows/browsers-nightly.yml`. Verified on macOS only: whether Linux WebKit gets
  WebGL2 in CI is unknown until the first nightly.
- [ ] Firefox: the `holochart:mesh` program logs an unused-varying warning, and shadow scenes a
      depth-texture filtering warning (both draw correctly).
- [ ] WebKit: range selector buttons have no `tabindex`, so Tab skips them.
- [ ] Leak L1: every destroyed chart with its own context leaves its canvas, renderer and lost
      context object reachable (~25 kB), through a `dispose` listener three.js keeps on the
      page-wide troika glyph atlas (and, for lit scenes, on three's DFG lookup texture).
- [ ] Leak L2: on the shared renderer, 1–4 GL buffers stay behind per destroyed chart in 15 of
      22 chart families: troika replaces a text batch attribute and orphans the old buffer.
      Probably also happens on a live chart whenever a text batch changes length (not measured).
- [x] Leak L3: bar3d's scene buffers on the shared renderer (`traces-3d/src/scene/draw.ts`).
- Heap bytes cannot be asserted to return to baseline; the test counts live instances after a
  forced GC instead, and GL objects per context (`renderer.info` alone misses L2 and L3).

**S2.7 Coverage.** `vitest.config.ts` enforces 90% for `packages/core` only. · ✅ Done (wave R3)

- [x] Add thresholds for runtime and render, and ≥ 85% for trace calc modules (plan.md L1772). —
      90% for runtime and render, 85% per package for `packages/traces-*/src/**/calc*.ts`; 925
      new tests in 122 files, nothing excluded. Branches went from 76.7–88.4% to 89.2–94.4%.
      Two single files are still under 85% branches (`traces-3d/src/surface/calc.ts`,
      `traces-finance/src/ohlc/calc.ts`); their packages pass.

**S2.8 Visual-test debt.** · 🟡 Partly done (wave R3)

- [x] Explain or fix the `demos/openrouter/categories` Linux diff (`testTileTolerance: 96`,
      plan.md L2190). — Explained. The tolerance is a fraction of a window's 1,024 px, so `96`
      switched the check off; it is now `96 / 1024` and the spec rejects values outside 0 to 1.
      The diff itself is a library bug, listed under "Found in wave R3" below (text measured
      before the font loads).
- [ ] Regenerate the line baselines in the pinned container (L1802). Not done: it needs Docker.
      `pnpm test:visual:update` never rewrites a baseline whose diff is exact-only, so delete the
      PNGs first: `_dev/viewports-grid`, `_dev/lines-series`, `_dev/lines-joins-dashes`,
      `_dev/lines-3d`, `_dev/lines-3d-opaque`; then run the update in the container with
      `-g '_dev/(lines-|viewports-grid)'`, and repeat for any line example
      `pnpm test:visual:report` still lists with a non-zero exact count.
- [x] Write the CONTRIBUTING note about SwiftShader fixed-point shifts (L1804).

### Docs and migration

| ID    | Item                                                     | Size |
| ----- | -------------------------------------------------------- | ---- |
| S2.9  | Framework, SSR and CSP guides; troubleshooting           | M    |
| S2.10 | Plotly compatibility page and migration guide            | M    |
| S2.11 | Finish the stub and draft pages that matter for adoption | L    |
| S2.12 | Keep internals out of the public docs                    | S    |

**S2.9 Guides** (`guides/frameworks.md` and `guides/ssr.md` are stubs). · ✅ Done (wave R2)

- [x] React, Vue, Svelte and Angular recipes: mount with `newPlot`, update with `react`,
      unmount with `purge`, and resize.
- [x] SSR: Next.js and Nuxt client-only loading. The ESM build is already safe to import in Node,
      so say so.
- [x] CSP guide:
  - troika's text workers need `worker-src blob:`; `configureText({ useWorker: false })` avoids
    that.
  - Fonts load from `blob:` and `data:` URLs.
  - Include a working policy.
- [x] `guides/troubleshooting.md`: no WebGL2, blank chart, "too many active WebGL contexts",
      unknown trace type, fonts, hidden containers.

**S2.10 Plotly compatibility.** The Plotly API exists (`runtime/src/api.ts`, `plotly_*` event
aliases), but the docs don't say so: `reference/plotly-compat.md` and
`getting-started/from-plotly.md` are stubs. · ✅ Done (wave R2)

- [x] Generate a coverage table from `plot-schema.json` against Plotly's schema: trace types,
      attributes and layout keys, as supported, partial or missing.
- [x] List the known deviations, collected from the "Plotly deviations" sections of the chart
      pages and plan.md (e.g. streamtube RK4, `unhover` payloads, UTC-only dates).
- [x] `from-plotly.md`: `Plotly.newPlot` → `Holochart.newPlot` side by side, the events, what's
      missing (maps, geo, carpet, ternary, SVG export) and the default look.

Found while writing these (wave R2), still open:

- [ ] When the text worker or the built-in font is blocked (a CSP without `blob:`), the chart
      draws without text and the promises of `newPlot` / `react` never settle. They should
      settle, with a warning or a typed error.
- [ ] The framework recipes for React, Svelte and Angular and the Next.js / Nuxt snippets are
      type-checked but were not run in those frameworks (the pages say so); run them in real
      apps, then mark `guides/frameworks.md` and `guides/ssr.md` complete.
- [ ] The CSP guide corrects the bullets above: also needed are `script-src blob:`,
      `connect-src blob:`, `font-src blob:` and `style-src 'unsafe-inline'`; `data:` is not
      needed for fonts. Not tested in Safari.
- [ ] `config.debug` is in the schema but nothing reads it.
- [x] Stale pages: `fundamentals/shapes-images.md` says the drawing tools are unavailable;
      `dates-time-series.md` says `Date` objects behave as in Plotly (they are read as UTC). —
      Fixed in wave R3, with other false statements in finished pages (`core-concepts`,
      `reference/events`, `reference/errors`, `colors-colorscales`, `guides/export`).

**S2.11 Pages.** 23 stubs and 8 drafts. · ✅ Done (wave R3); 10 stubs and 6 drafts remain

- [x] Adoption-critical pages first:
  - `fundamentals/traces`, `data-formats`, `configuration` (strict mode for development) and
    `updating-charts`
  - `guides/performance`
  - `reference/colorscales` and `marker-symbols`
  - `changelog` (generated from changesets)
  - — All complete. The colorscale and marker-symbol references and the changelog are generated
    (`apps/docs/scripts/gen-galleries.ts`, `gen-changelog.ts`).
- [x] Also finish the draft `fundamentals/*` pages.
- [x] The TypeDoc reference covers holochart, runtime, core, render and express only
      (`apps/docs/scripts/gen-api.ts`). Add components, themes, locales and every `traces-*`
      package. — All 14 packages; `@internal` names get no page.
- [x] Leave the extending, customization and cookbook stubs to phase 3, after the plugin API
      settles. — Still stubs: `cookbook/index`, `customization/index`,
      `customization/three-objects`, `extending/*` (3), `getting-started/from-chartjs`,
      `from-d3`, `migration`, `playground/index`. Still drafts: `charts/index`,
      `customization/extrusion-2-5d`, `guides/dashboards`, `guides/frameworks`, `guides/ssr`.
- [x] The chart pages' "Keyboard" bullets said there was no keyboard navigation, also for
      families that had it before R3. Each now states what its family does.

**S2.12 Internals out of the public docs.** · ✅ Done (wave R3)

- [x] Remove the ~49 `<Example id="_dev/…">` embeds from public pages (e.g.
      `fundamentals/layout-axes-subplots.md`, `3d-scenes.md`, `customization/materials-lighting.md`);
      promote the useful ones to public example folders. — 34 embeds on 8 pages: 28 became
      public examples, 5 use existing ones. `lint:pages` fails on an internal embed. Seven of the
      29 new baselines were rendered on macOS and may need the CI rendering.
- [x] Drop `_dev` entries (76) from the published gallery manifest. — In the generator.

### API surface

| ID    | Item                                  | Size |
| ----- | ------------------------------------- | ---- |
| S2.13 | Public API reports and stability tags | M    |

**S2.13a** (found in R0) `traces-finance`'s published types fail to type-check under
`exactOptionalPropertyTypes` (not part of `strict`): the attribute schema's `AttrSpec` rejects
`undefined`. Fix the type, then turn the flag on in the `tests/package` TypeScript fixture. ·
✅ Done (the fix landed in R1; in R3 the fixture imports all 14 packages directly)

**S2.13** There is no API-Extractor, no API report and no stability tags. `versioning.md` relies
on `@experimental`, which is used once. · ✅ Done (wave R3)

- [x] Add API-Extractor (or an equivalent export snapshot) per package, with a CI diff check so
      accidental export changes are visible in review. — `api-reports/*.api.md` (14 packages and
      `@mk7s/holochart/global`), `pnpm api:report` and `pnpm api:check`, a step in the CI package
      job. The check also fails when the umbrella's export list and the tags disagree.
- [x] Tag the unstable surfaces (the `render` namespace, runtime contracts) `@experimental`, or
      move them to an `/experimental` subpath. — Tags. The plumbing packages export for each
      other is `@internal`, and the umbrella exports an explicit list instead of `export *`:
      1,627 names became 1,011 (703 public, 308 experimental, no internal). Cross-package name
      collisions are renamed (`Base…` trace types, core's `CoreTraceModule`, `RGBAColor`,
      runtime's `polygonContains`, …; see `.changeset/r3-curated-exports.md`). No `/internal`
      subpaths: that waits for the plugin API freeze (S3.5).
- [x] Decide `Chart#toJSON` (plan.md E21.6, L1841) and the camelCase aliases question (Q2)
      before the surface freezes. — `chart.toJSON()` is removed; `chartToJSON(chart)` is the
      serializer, and `JSON.stringify(chart)` throws. No camelCase aliases: Plotly attributes
      keep their names, Holochart-only ones are camelCase, except the 14 lower-case 3D material,
      lighting and scene attributes.

Left open by R3:

- [ ] `stripInternal` is off, because an `@internal` entry export breaks the declaration build;
      a post-bundle step strips `@internal` members only. Two unreferenced interfaces
      (`MatrixInternals`, `Column`) sit in render's `.d.ts`.
- [ ] The declaration build is not reproducible: inferred unions come out in different orders
      between clean builds in 4 to 5 packages (noted in ADR-015; the report tool sorts them).
- [ ] 123 internal types still leak through public signatures (166 before), none with
      bundler-made names.
- [ ] Classification calls to review before the freeze: trace `*Attributes` schemas and `*Calc`
      types are experimental; the traces-3d scene pick and hover API is internal, which a 3D
      plugin with hover would need; `setBarExtruder` is experimental and not in the umbrella.
- [ ] `chart.three.root` is experimental; the Dashboards guide reaches the canvas through
      `chart.element.querySelector('canvas')`.

### Accessibility and i18n

| ID    | Item                                                       | Size |
| ----- | ---------------------------------------------------------- | ---- |
| S2.14 | Keyboard and screen-reader coverage for every chart family | L    |
| S2.15 | Translate the accessibility strings                        | M    |

**S2.14** `runtime/src/fx/keyboard.ts:40-41, 762-763` lists polar, 3D, grid, histogram and
box/violin as not navigable. Among domain traces only pie has `keyboardPoints`. · ✅ Done (wave
R3), except point stops for the other 3D traces

- [x] Keyboard points for sunburst, treemap, icicle, sankey, funnelarea, parcats and parcoords.
- [x] A bin or cell cursor for histogram and heatmap, and box/violin statistics. — Also contour,
      histogram2d and polar.
- [x] 3D: keyboard orbit (plan.md L1391) and point navigation for scatter3d.
- [x] `describe` summaries for bar3d, cone, isosurface, mesh3d, streamtube and volume. — In a
      lazy chunk; scatter3d and surface descriptions moved there too and are now asynchronous.
- [x] axe-core audits in CI over a sample of examples (E20.8). — 22 examples in the interaction
      job (`tests/interaction/axe.spec.ts`).

The per-trace code is a lazy chunk with its own budget (4.19 of 4.6 kB), loaded on the first
keyboard focus. Left open by R3:

- [ ] The script-tag build has no stops for the 2D families: with them `holochart.iife.min.js`
      was at 689.6 of 690 kB. `scriptWithoutTraceA11yPlugin` in
      `packages/holochart/tsdown.config.ts` leaves them out; shipping them costs about 3 kB of
      that budget.
- [ ] No point stops for surface, mesh3d, cone, streamtube, isosurface, volume and bar3d. Not
      navigated at all: `image`, `splom`, `table`, `indicator`, strip plots.
- [ ] Treemap and icicle tiles and sankey links are not highlighted under the keyboard cursor as
      they are under the pointer.
- [ ] Two `color-contrast` findings are allowlisted (`AXE_STRICT=1` shows them): the pressed
      range selector button (4.39:1, from the built-in template) and white hover-label text on
      the trace color (4.08:1 on `#636efa`, Plotly's rule).

**S2.15** Keyboard announcements (`KEYBOARD_TEMPLATES`) aren't translated anywhere, and chart
summaries exist only for de, fr and es (`locales/src/summaries.ts`). Some UI labels are
English-only (plan.md L2251). · ✅ Done (wave R3), as machine translations without native review

- [x] Add the keys to the top 10 locales; English is the fallback elsewhere. — `de`, `es`, `fr`,
      `it`, `ja`, `ko`, `pt-BR`, `ru`, `tr`, `zh-CN`, in `locales/src/holochart/<locale>.ts`
      (`summaries.ts` is gone). A test holds every translation to its source's placeholders.
- [x] Test Arabic and Hebrew labels, and document the limits: the measurement fallback has no
      bidi (`render/src/primitives/text-metrics.ts:27`), and legends and menus aren't mirrored. —
      `tests/a11y/rtl-labels.test.ts` (the text engine is mocked: drawn glyphs are not tested).

Left open by R3:

- [ ] Native review. `it`, `pt-BR` and the new `de`/`fr`/`es` strings had no second reader.
- [ ] Still English: the 3D trace descriptions, most of the hidden description (axis and 2D
      trace lines, table captions), the modebar's "Chart toolbar" (initial chunk, no room), and
      "Menu N", "Slider N", "none" and the range selector names (in the lazy controls chunk, so
      cheap to route). Arabic and Hebrew have no UI strings.
- [ ] `pt-PT` falls back to `pt-BR`'s sentences and `zh-TW`/`zh-HK` to `zh-CN`'s (documented).

### Performance targets still red

| ID    | Item                             | Size |
| ----- | -------------------------------- | ---- |
| S2.16 | Heatmap first draw and line cost | M    |

Wave R3 (numbers and method in `docs/perf/s2-16-first-draw-and-line-cost.md`; measured on a
loaded machine, so trust the ratios):

- [ ] 4096² heatmap first draw is ≈ 700 ms against < 100 ms (E11.1). Try R32F packing to halve the
      134 MB upload (plan.md L2199), and incremental upload. — 🟡 768 → 425 ms (benchmark
      median). R32F halves the upload, and the description no longer rescans the grid, which was
      37% of the time; the upload was about 5%. The target is not reachable as written: an empty
      chart takes 135–170 ms to `ready` in the harness. Proposed instead: at most 100 ms over an
      empty chart (the heatmap adds about 245 ms now). Left: calc ≈ 43 ms, pack ≈ 26 ms.
- [ ] Lines cost 5× `Line2` solid and 10× dashed, against ≤ 2× and ≤ 3× targets (E16.9); markers
      cost 1.4–1.7× a trivial shader (E16.10). Per-vertex u8 color packing and cheaper dashes. —
      🟡 Dashed 2.4–3.0× while panning (met), solid 2.1–2.6× (not met: 2× needs fewer fragments
      or a cheaper vertex stage, and both change pixels). Markers measured at 1.38×, unchanged;
      next experiment: a constant `aStyle` from a uniform. No baseline changed.
- [x] A size policy so budgets stop being raised case by case (R9): each raise comes with a
      named cause, and the full ESM bundle gets a hard ceiling. — A ledger in
      `tests/bundle/size/policy.ts`, enforced by `pnpm test` and `pnpm size`. The ceiling is
      560 kB (540 + 20), a proposal for the owner to confirm.

### Found in wave R3

Bugs and gaps the wave turned up and did not fix.

- [ ] Text-dependent trace extremes are measured before the built-in font loads and never
      re-measured (`#fontsChanged` in `runtime/src/chart.ts` schedules only `layout`), so the
      room horizontal bars reserve for outside labels depends on the OS fallback font. This is
      the `demos/openrouter/categories` Linux diff. Pie, funnelarea, sunburst, treemap, contour
      labels and parcoords may be affected too (not checked).
- [ ] A glyph missing from the bundled font makes troika fetch a fallback from jsDelivr;
      offline, `ready` never resolves.
- [ ] `BigInt64Array` passes validation, then throws in `core/src/scales/scale.ts:212`.
- [ ] A plain color list as `colorscale` is ignored unless `autocolorscale: false`
      (`traces-basic/src/shared/colorscale.ts:108`, `traces-3d/src/surface/defaults.ts:31`).
- [ ] Contour `colorExtent` (`traces-sci/src/contour/calc.ts:100-123`) reads the raw `contours`
      attributes: a reversed start/end or a missing size gives the right levels and a wrong
      color domain. Expected values derived from plotly.js source, not from running it.
- [ ] `imageExtremes` on a log axis collapses the autorange when the image starts at or below 0.
- [ ] Strict mode does not validate style-only updates, and a rejected strict update leaves the
      bad value in `chart.data`. `chart.update` with an out-of-range trace applies earlier
      entries before rejecting.
- [ ] Dead schema keys beyond `config.debug`: `config.worker`, `textRenderer`, `hoverRenderer`,
      seven `edits` keys, `layout.autosize`, `hoverlabel.grouptitlefont`, and the `uirevision`
      of legend, modebar, scene and polar.
- [ ] `newPlot` does not decode `{ dtype, bdata }` (plotly.js does). Unknown colorscale names
      give no warning. Histograms have no `LAYER_RANK` entry and draw at scatter rank.
- [ ] Stale texts in generated output: `make-subplots.ts` errors name M4/M6, `modebar.ts:370`
      says axes have no `showspikes`, shape schema descriptions say legend entries are "not
      drawn yet", and plan ids such as "(E6.7)" appear in attribute descriptions.
- [ ] `eraseActiveShape` is not exported. Public examples `shapes/draw` and `line/streaming`
      would help.
- [ ] Flaky: the scatter3d Delaunay property test fails on a near-degenerate sliver by a hair
      over its 1e-9 tolerance (`FC_SEED=330387662`), and its 50k-point performance test has a
      1,000 ms wall-clock limit that fails under load.
- [ ] `demos/tqqq-soxl/drawdowns` and `rolling-vol` fail the visual suite on macOS (1.1–1.3% of
      pixels): their baselines are the CI renderings since da0b545.

---

## Phase 3: 1.0 (plan.md M7)

These are the M7 stories that the 1.0 exit criteria depend on, in suggested order.

| ID    | Item                                                                                                 | plan.md      | Size |
| ----- | ---------------------------------------------------------------------------------------------------- | ------------ | ---- |
| S3.1  | Plotly mock corpus runner and importer, with a published coverage % (≥ 80% exit criterion)           | E20.7, E18.4 | L    |
| S3.2  | Close the highest-impact parity gaps the corpus reveals (see the list below)                         | various      | L    |
| S3.3  | Framework wrapper packages and a `<holo-chart>` web component                                        | E18.5        | L    |
| S3.4  | SVG export for 2D charts (split the story first; Plotly users expect `format: 'svg'`)                | E18.2        | L    |
| S3.5  | Plugin API frozen: components, custom scales, lifecycle hooks, example plugins; import-boundary lint | E22.1–E22.6  | L    |
| S3.6  | Text and viewport spikes C and D measured; ADR-004 and ADR-005 decided                               | E0.7         | M    |
| S3.7  | Calc in workers for large inputs (isosurface, streamtube, binning); memory pools                     | E16.5, E16.6 | L    |
| S3.8  | Performance harness with budgets and PR deltas; the GPU benchmark on a schedule                      | E16.1        | M    |
| S3.9  | Playground and StackBlitz links on examples; bundled sample datasets                                 | E19.6, L1708 | M    |
| S3.10 | Versioned docs (`/v1/`) with a switcher; migration guides and codemods                               | E19.12       | M    |
| S3.11 | Split `runtime/src/chart.ts` (3,447 lines) into mount, scheduler, selection and export modules       | —            | M    |
| S3.12 | Example attribute coverage from 34% to the 70% target                                                | L2036        | M    |

**Parity gaps to rank with the corpus (S3.2).** These are the ones Plotly users hit most often,
from plan.md:

- display time zones (E3, R11)
- `tickmode: 'sync'` (L668)
- Express wide-form data (L2155), which is the biggest Express gap
- `unhover` sends an empty `points` list, and hierarchy clicks carry no DOM event (L2253)
- colorbar `tickformatstops` and minor ticks (L775)
- legend `grouped+reversed` order and `maxItemWidth` (L2188)
- `layer: below traces` tick labels (L681)
- annotation `hovertext` (L781)
- shape legend entries (L788)
- `newselection`/`activeselection` (L830)
- animation of dates and categories (L2148-2153)
- `line.backoff` and marker `gradient`

## Before 1.0, epic: geographic charts

Maps: projected geographic charts, a 3D globe and tile maps. Added 2026-10-03. plan.md has this as
E15 (milestone M8, package `traces-geo`) in five one-line stories; this section gives the epic an
order, the decisions it needs and what each story has to cover. Plotly users expect it:
`from-plotly.md` and `plotly-compat.md` list maps among the missing chart families.

**Owner decision, 2026-10-03: the epic runs before 1.0.** It is an exception to decision 1 (pause
new features); the other items under "After 1.0" stay there. plan.md still files E15 under M8
(after 1.0) and calls it a stretch. GEO1 started the same day.

**Done means**

- A Plotly `scattergeo` or `choropleth` figure renders through `newPlot` unchanged, with hover,
  selection, events, colorbars and export.
- A world or US-state map works offline: no request leaves the page unless the user gives a URL.
- A bundle that does not import the geo package pays nothing for it.
- Keyboard and screen-reader access on the level of the other chart families (S2.14).
- Tile maps ship as a separate optional package, after the projected charts.

**What is already there to build on**

- The fill primitive batches many polygons per draw call, built with choropleths in mind
  (plan.md L574); triangulation is in the lazy fill chunk.
- Markers, lines, text, colorscales, `coloraxis` and colorbars, and the pixel-space 2D camera
  (ADR-008).
- The 3D scene, lit materials, the orbit camera and its keyboard orbit, and GPU picking
  (ADR-010), for the globe.
- ADR-006 already lists `d3-geo` among the allowed d3 micro-libraries.
- Lazy per-trace accessibility parts (`TraceModule.a11y`), the bundle-size ledger
  (`tests/bundle/size/policy.ts`) and the API reports, so a new package arrives with its budget,
  its stops and its stability tags.
- The shared renderer and its context budget (ADR-023), which a second WebGL library on the page
  has to fit into.

| ID    | Item                                                                                  | plan.md | Size | Needs            |
| ----- | ------------------------------------------------------------------------------------- | ------- | ---- | ---------------- |
| GEO1  | Decisions and spikes: basemap data, projection on CPU or GPU, packages, map renderer  | —       | M    | —                |
| GEO2  | `geo` subplot: projections, basemap layers, graticule, `fitbounds`, pan, zoom, rotate | E15.1   | L    | GEO1             |
| GEO3  | `scattergeo`: markers, great-circle lines, text, locations                            | E15.2   | M    | GEO2             |
| GEO4  | `choropleth`: location joins, GeoJSON, colorscales                                    | E15.3   | M    | GEO2             |
| GEO5  | Geometry correctness: antimeridian, poles, winding, holes, clipping                   | —       | M    | GEO2             |
| GEO6  | Interaction, accessibility and export for the geo subplot                             | —       | M    | GEO3, GEO4       |
| GEO7  | Express functions, typed figures and the Plotly importer                              | —       | M    | GEO3, GEO4, S3.1 |
| GEO8  | 3D globe, a Holochart extra                                                           | E15.4   | L    | GEO4             |
| GEO9  | Tile maps: `scattermap`, `choroplethmap`, `densitymap`                                | E15.5   | L    | GEO1, GEO6       |
| GEO10 | Docs, gallery, demos, attribution, CSP and offline guidance                           | —       | M    | GEO3, GEO4       |

GEO9 is more than one wave (plan.md sizes it XL).

**GEO1 Decisions and spikes.** Each of these changes the shape of the stories after it, so they
come first. Recommendations are in "Decisions for the owner" below.

- [x] Measure the candidates before choosing: `d3-geo` (and `d3-geo-projection` for the
      projections it lacks), `topojson-client`, and Natural Earth at 110m and 50m, each as min +
      gzip. Record them in `docs/release/bundle-size.md`. Done: code is 11.7 kB (25.0 kB with all
      82 Plotly projections), data about 40 kB at 110m and 235 kB at 50m, MapLibre 302.5 kB.
- [x] Spike: reproject a 50m world (land, countries, coastlines) on every frame of a drag, on the
      CPU through `d3-geo`. If it does not hold 60 fps, try 110m while dragging and 50m on
      release, then a vertex-shader projection for the common projections. Done
      (`docs/spikes/f-geo-projection.md`): 50m does not hold it (89–95 ms), 110m does (12 ms),
      the shader prototype does for a list of projections (2–3 ms).
- [x] Spike: a Holochart layer over MapLibre GL, two ways: drawn into MapLibre's context through
      its custom layer interface, and a second canvas composited above with the camera synced.
      Compare context count, pitch and bearing sync, export and picking. Done
      (`docs/spikes/g-maplibre.md`), in Chromium only.
- [x] Write the outcomes as ADRs (basemap data and attribution; projection pipeline; map
      renderer integration). Written as ADR-024 to ADR-027, with packages and bundles as an ADR
      of its own (026). All four are **Proposed** and wait for the owner.

Left open by GEO1, for the owner or the stories named:

- [ ] Accept or reject ADR-024 to ADR-027. Two of them carry a choice the numbers do not make:
      ADR-025 (110m while rotating, against a shader projection that rotates 50m) and ADR-027
      (an overlay canvas that cannot draw under the map's labels, against a custom layer that
      needs a hosted render root).
- [ ] Measure what GEO1 did not: a mid-range laptop and a phone for the projection numbers;
      Firefox, Safari, a production build and a style with real tiles for MapLibre.
- [ ] Read the UN geodata terms before considering Plotly's current topojson files (ADR-024).
- [ ] The spike pages added `d3-geo`, `d3-geo-projection`, `topojson-client`, `world-atlas` and
      `maplibre-gl` as dev dependencies of the examples package. Remove what GEO2 and GEO9 do not
      keep.

**GEO2 `geo` subplot** (E15.1). Built 2026-10-04 in `packages/traces-geo`; open points below.

- [x] `layout.geo` with Plotly's attributes: `projection.{type, rotation, scale, parallels}`,
      `scope`, `center`, `fitbounds`, `resolution`, `lataxis`, `lonaxis`, `bgcolor`, `domain`,
      and the layers `showland`/`landcolor`, `showocean`, `showlakes`, `showrivers`,
      `showcountries`, `showsubunits`, `showcoastlines`, `showframe`, each with its color and
      width. Defaults follow plotly.js 4.1.1, where `fitbounds` defaults to `'locations'`.
- [x] Projections in two steps: equirectangular, Mercator, natural earth, orthographic and
      Albers USA first; then every other projection Plotly supports. All 84 names work: the 16
      `d3-geo` has are in the package, the 68 of `d3-geo-projection` are one lazy chunk.
- [ ] The table in the docs of which projections are in (GEO10).
- [x] Each basemap layer is one batched fill or one line primitive. The graticule is a line
      primitive resampled along the projection.
- [x] Several geo subplots (`geo`, `geo2`, …) in one figure, in a grid, next to cartesian ones.
- [x] Drag pans a flat projection and rotates an azimuthal one; scroll and pinch zoom. Each
      emits one `relayout` with the keys Plotly emits (`geo.projection.rotation.lon`,
      `geo.projection.scale`, `geo.center.lat`, …). `layout.uirevision` keeps the view, as it
      keeps any GUI edit.
- [ ] `geo.uirevision` (the subplot's own) is not read, as with polar and scene (see "Found in
      wave R3").
- [x] Basemap data loads lazily and never blocks `ready` forever: a failed load draws the chart
      without the layer and warns (the font fallback in "Found in wave R3" is the lesson).

Left open by GEO2:

- [ ] ADR-025's first draw at `resolution: 50` (110m first, 50m when idle) is not done: 50m is
      projected at once. The 110m swap while rotating and the staged swap back are done.
- [ ] 50m data is 283 kB gzip with all layers against ADR-024's 235 kB, because it is on a 2e4
      grid (1.1 km); the 1e4 grid the target was measured on drops three small countries. Owner
      to choose (`GRID` in `tools/geo-data/src/config.ts`).
- [ ] Modebar buttons for maps (GEO6). Keyboard view keys are done.
- [ ] A failed basemap warns twice when a trace also needs it for `locations`.
- [ ] Visual baselines for `examples/scattergeo/*` and `examples/choropleth/*` from the CI
      container (GEO10).

**GEO3 `scattergeo`** (E15.2). Built 2026-10-04.

- [x] `lat`/`lon`, or `locations` with `locationmode` (drawn at the feature's centroid), or
      `geojson` with `featureidkey`. `'country names'` uses the table plotly.js 4.1.1 uses
      (`country-iso-search`, MIT, with CC BY 4.0 and Unicode-licensed alias data: see the
      package's notices), as a lazy chunk.
- [x] `mode` markers, lines and text, with per-point size, color, symbol and a colorbar.
- [x] Lines follow great circles, resampled adaptively so they stay smooth near the poles and
      split at the antimeridian. `fill: 'toself'`.
- [x] Hover (`lon`, `lat`, `location`, `text`, `hovertemplate`), box and lasso selection in
      projected space.
- [ ] Not done: `marker.angleref`, `standoff`, `gradient`, `marker.line.dash`, and the
      `…templatefallback` attributes.
- [ ] Rotation cost: 100k markers reproject in 6–13 ms per frame on an M1 Max (ADR-025's
      follow-up); 10,000 long lines take 49–75 ms, and nothing simplifies lines while rotating.

**GEO4 `choropleth`** (E15.3). Built 2026-10-04.

- [x] `locations`, `z`, `locationmode: 'ISO-3' | 'USA-states' | 'country names' | 'geojson-id'`,
      `geojson`, `featureidkey`, `colorscale`, `zmin`/`zmax`/`zmid`, `coloraxis`, `marker.line`,
      `marker.opacity`, `selected`/`unselected`.
- [x] A location that matches no feature is skipped, and one warning names the unmatched ones.
      The country-name table is data in the geo package, not in core.
- [x] Hover by point-in-polygon in projected space through a spatial index of feature bounds
      (ADR-010): a uniform grid over polygon boxes, about 1 µs per pointer move at 3,000
      polygons. The label is anchored at the feature's point, as in Plotly.
- [ ] Target: a GeoJSON of about 3,000 US counties pans at 60 fps and first draws in under a
      second; triangulation moves to the worker when S3.7 lands. Measured on synthetic data
      only: a pan is a transform (no reprojection); 3,000 polygons of 32 vertices first draw in
      about 95 ms. A real county file has not been tried.
- [ ] Rotation cost (ADR-025): the 50m world is 43 ms per frame in full, 6 ms with the swap to
      110m while rotating. User GeoJSON has no coarser copy: above about 25,000 vertices a
      rotation drops below 60 fps on an M1 Max, and nothing simplifies it.
- [ ] A shared `coloraxis` works with marker-colored traces (scatter, scattergeo, bar), not with
      heatmap or contour.

**GEO5 Geometry correctness.** The part map libraries get wrong for years. Audited 2026-10-04:
all 84 projection names compared with `d3`'s own `geoPath` at seven rotations.

- [x] Antimeridian cutting for polygons and lines; polygons that enclose a pole (Antarctica).
      The 50m data had Fiji's Taveuni split 0.0001° apart on 180°; `tools/geo-data` now aligns
      the cut.
- [x] Winding order: GeoJSON (RFC 7946) and `d3-geo`'s spherical convention disagree, and a
      polygon wound the other way covers the whole globe except itself. Detect by area, rewind,
      and warn once. Done for a choropleth's `geojson`; a region larger than a hemisphere cannot
      be told apart and is rewound too.
- [x] Holes and multipolygons; clipping to the projection's outline (the visible hemisphere of
      an orthographic view, the frames of Albers USA's insets). Lines that pass from one Albers
      USA frame to another are buffered per frame (`geo/albers-usa.ts`; `d3`'s own stream mixes
      them). Four projections whose rings fold back (`gringorten`, `gringorten quincuncial`,
      `guyou`, `peirce quincuncial`) fill by the nonzero rule.
- [x] Property tests: no projected vertex outside the clip outline; a rotated then projected
      feature keeps the sign of its area; a round trip through `invert` returns the point. All
      84 names on the real 110m land (`geo/geometry.test.ts`).
- [x] A visual example per projection, and one each for the antimeridian (Fiji, Russia) and the
      poles: `examples/geo/*` (eight examples) and the dev contact sheet
      `examples/_dev/geo-projections.ts`.
- [ ] Six projections draw correctly but their default view is cropped at the top (`albers`,
      `bonne`, `collignon`, `conic equal area`, `conic equidistant`, `hill`), and a tilted
      `satellite` view sits low. This follows Plotly's fit recipe as ported; it has not been
      compared with a Plotly render.
- [ ] Translucent fills would show the triangle overlap at the rim of `craig` and `wiechel`.

**GEO6 Interaction, accessibility and export.** Built 2026-10-04.

- [x] `click`, `hover`, `selected` and `relayout` events with Plotly-shaped points (`location`,
      `lon`, `lat`, `z`, `pointNumber`).
- [x] Keyboard stops through `TraceModule.a11y`: choropleth regions in the order of `locations`,
      `scattergeo` points in data order; the view keys of the 3D scenes (Shift + arrows rotate
      or pan, `+`/`-` zoom, `0` reset). Announcement sentences go in the locale dictionaries.
      Points the projection hides are skipped. The new sentence is machine-translated in the ten
      translated dictionaries, like the rest.
- [x] `describe` summaries: the region count, the lowest and highest regions by name, the point
      count and extent; a table view of locations and values.
- [x] `toImage` and `downloadImage`, context loss and restore, and the leak test
      (`tests/interaction/leak.spec.ts`) gain the geo family. `ready` did not wait for a lazily
      loaded projection, so an export of a Robinson map on a fresh page was blank; fixed.
- [ ] Color is the only encoding of a choropleth: document patterns or labels as the redundant
      encoding (done in the docs: labels, hover, keyboard, table; the trace has no pattern
      fills), and check the default colorscales against the land and ocean colors. Checked: the
      low end of the default sequential scale is 1.49:1 against the default land color, and the
      lowest 39 % of the scale is under 3:1; the diverging midpoint is 2.00:1. Not changed.
      Owner to choose: start the ramps lighter, or give regions a lighter rim.
- [ ] Modebar buttons for maps.
- [ ] The geo leak case takes over two minutes under load because it uses a 50m globe.

**GEO7 Express, types and importer.**

- [x] `hx.scatterGeo`, `hx.lineGeo` and `hx.choropleth`, with camelCase options
      (`locationMode`, `featureIdKey`, `projection`, `scope`, `fitBounds`). They are in
      `packages/express` (0.61 kB of the full bundle; they import nothing from the geo package).
      With GEO9: `hx.scatterMap`, `hx.choroplethMap` and `hx.densityMap`.
- [x] Typed figures for the new traces and `layout.geo`; API reports and stability tags for the
      package.
- [ ] The Plotly mock corpus (S3.1) reports geo coverage as its own line, so maps do not drag
      down or flatter the overall percentage. Waits for S3.1.
- [x] `reference/plotly-compat.md` and `getting-started/from-plotly.md` stop listing geo as
      missing. Tile maps remain listed.

**GEO8 3D globe** (E15.4). The reason to do maps in this library and not point users at another.
Built 2026-10-04 (ADR-028, Proposed): the globe is the orthographic view drawn in a 3D viewport of
the geo package's own, so the view, the gestures, the relayout keys, hover anchors, selection,
keyboard and `fitbounds` are the flat map's.

- [x] `projection.type: 'globe3d'` draws a sphere in a 3D scene: basemap layers and choropleth
      regions as spherical meshes (or one draped texture, whichever the spike in GEO1 favours),
      lit, with the orbit camera. Meshes, lit by one light fixed to the camera. Not an orbit
      camera: the view is orthographic and the globe turns by `projection.rotation`, as a flat
      orthographic map does. A rotation builds and projects nothing: 9 ms a frame at 50m with
      every layer on an M1 Max, nearly all of it drawing.
- [x] `scattergeo` on the globe: markers on the surface, lines as arcs lifted above it by their
      length (`line.lift`, Holochart's own). Markers and text stay on the 2D path, drawn above
      the globe.
- [x] Extruded choropleth: region height from a second value, as prisms rising from the sphere
      (`elevation`, `elevationscale`, Holochart's own).
- [x] Hover and click through GPU ID picking; the far side is not pickable. For choropleth
      regions and prisms; `scattergeo` keeps its CPU hover in px, which leaves out the far side
      too.
- [ ] An animated transition between a flat projection and the globe is a stretch goal. Not
      done.

Left open by GEO8:

- [ ] Markers are not depth-tested: one behind a prism is drawn over it, and `scattergeo` hover
      does not know about prisms.
- [ ] At `projection.scale: 1` an arc or prism rising past the limb at the top or bottom is cut
      by the subplot's domain; the examples use a smaller scale.
- [ ] No perspective or tilt (`satellite` is the perspective twin), and no lighting attributes.
- [ ] A dashed graticule's dashes slide while the globe turns.
- [ ] The default hover label of an extruded region does not show the elevation.
- [ ] Context loss with regions or prisms drawn is not tested (it is for the base layers).
- [ ] The script-tag build has no geo add-on; a globe will need the 3D add-on's chunks too.

**GEO9 Tile maps** (E15.5). Its own package with MapLibre GL as an optional peer dependency.

- [ ] `layout.map` (`center`, `zoom`, `bearing`, `pitch`, `style`, `bounds`, `layers`) and the
      traces `scattermap`, `choroplethmap` and `densitymap`, under Plotly's current
      MapLibre-based names. The older `*mapbox` names are converted only by the importer.
- [ ] Rendering as decided in GEO1. Either way the map's camera drives Holochart's, and hover,
      selection and events behave as on a `geo` subplot.
- [ ] `densitymap`: points accumulate into a float target through a kernel of `radius`, then a
      colorscale lookup. Needs a float render target; check it through `root.capabilities` and
      fall back with a warning.
- [ ] No default tile provider that needs a key. The style is the user's URL or object, and the
      attribution control is always shown.
- [ ] A map counts against the browser's WebGL context limit beside the chart's (ADR-023):
      document it, and measure a dashboard of several maps.
- [ ] Tiles that fail or never arrive must not hang `ready`; `toImage` waits for the tiles in
      view, with a timeout.

**GEO10 Docs, gallery and demos.**

- [x] A chart page per trace on the chart-page template, a `fundamentals` page for the geo
      subplot and projections (`charts/maps/scattergeo.md`, `charts/maps/choropleth.md`,
      `fundamentals/maps.md`, with the projection table generated from the package's constants).
- [ ] A guide for tile maps (styles, attribution, keys, offline). Waits for GEO9.
- [x] The CSP guide gains what maps need (`connect-src` for user GeoJSON and `topojsonURL`).
      `worker-src` for the map renderer's workers waits for GEO9. Not tested under a served
      policy.
- [x] `THIRD_PARTY_NOTICES.md` and an attribution note for Natural Earth; a line on disputed
      borders and how to supply your own boundaries. Tile styles wait for GEO9.
- [ ] Demos: a world choropleth, US counties, flight routes on great circles, a globe with
      extruded regions, an earthquake density map. The examples cover the first and third as
      examples, not as demos; counties need a real county file, the globe GEO8, density GEO9.
- [ ] Baselines for the new examples come from the CI container, not from macOS: 25 examples
      (`scattergeo/*`, `choropleth/*`, `geo/*`, `express/scatter-geo`) have none yet, so the
      visual suite reports them missing. Gallery thumbnails and manifest entries are missing too
      (`pnpm gallery`), and `vitepress build` has not been run with the new pages.

**Decisions for the owner** (GEO1 turns these into ADRs)

1. **Where the basemap comes from.** Plotly fetches its topojson from a CDN unless
   `config.topojsonURL` says otherwise. Recommended: ship Natural Earth 110m and 50m as lazy
   chunks of the geo package, so maps work offline and under a strict CSP, and accept a user URL
   for anything larger.
2. **Projection on the CPU or the GPU.** Recommended: CPU through `d3-geo`, for every projection
   Plotly has and the same clipping and resampling; a shader path only if the GEO1 spike shows
   dragging a 50m world cannot hold 60 fps.
3. **Packages and bundles.** Recommended: `traces-geo` (the subplot, `scattergeo`, `choropleth`,
   the globe) outside the `full` bundle and loaded as an add-on like the 3D script build, since
   full ESM has a 560 kB ceiling; `traces-map` separately, because MapLibre is large.
4. **The map renderer.** Recommended: MapLibre GL as an optional peer dependency, with the
   integration chosen by the GEO1 spike. Writing a tile renderer is out of scope.
5. **Order.** GEO1, GEO2, then GEO3 and GEO4 in parallel with GEO5 beside them, then GEO6, GEO7
   and GEO10: that is a releasable "projected maps" milestone. GEO8 next, because it is what
   only this library offers. GEO9 last, as its own milestone.

**Risks**

- Bundle weight: projections, topojson decoding and the basemap data are all unmeasured. Every
  budget goes through the ledger.
- Boundaries are political. Natural Earth draws disputed borders one way; say so, and make
  replacing the boundaries easy.
- Tile providers have terms and keys. The examples must use a style that allows it.
- Geometry edge cases (GEO5) are where the bugs will be; they need property tests, not only
  examples.
- A float render target and a second WebGL library both behave differently under SwiftShader,
  so the visual tests for GEO9 need their own look.

## After 1.0, explicitly out of scope

Recorded so they don't creep back in:

- carpet, ternary, quiver, streamline and dendrogram (E11.6–E11.10)
- WebGPU
- order-independent transparency (OIT)
- the image server (E18.6)
- Arrow adapters (E1.10)
- editable mode (E6.7)
- shader hooks, post-processing and SSAO (E8.8, E8.12)
- CSS-variable themes (E8.4)
- every ➕ 2.5D/3D extra (extrusion, 3D pie, extruded candles, city treemap, STL/OBJ loaders,
  animated streamtube flow)
- beeswarm
- adaptive bins

## Epic: network graphs

Node-link charts: force-directed networks, DAGs and trees. Added 2026-10-03 as ideas for after
1.0. **Owner decision, 2026-10-06: build the epic now.** It was built that day, G1 to G10, in the
new package `@mk7s/holochart-traces-graph` (ADR-029, Proposed), and nothing of it is committed
or released yet. None of this is in plan.md, and Plotly.js has no graph trace (its docs draw
networks as `scatter` traces with positions from networkx), so these are Holochart extras (➕)
with no parity pressure and nothing for the importer to do.

What exists: three trace types (`graph`, `graph3d`, `chord`), ten arrangements, the layouts as
pure functions, data adapters and measures, three Express functions, docs pages and a demo.
Checked on 2026-10-06: 8,371 unit tests, typecheck, lint, the size budgets, the API reports and
the docs gates pass; the graph browser specs pass locally (see G10 for what is open there).

| ID  | Item                                                                         | Size | State                 |
| --- | ---------------------------------------------------------------------------- | ---- | --------------------- |
| G1  | `graph` trace: nodes and links at given positions                            | M    | built                 |
| G2  | Force-directed layout, deterministic, static or animated                     | L    | built                 |
| G3  | Layered DAG layout (Sugiyama) with box nodes and routed edges                | L    | built                 |
| G4  | Tree layouts: tidy, radial, dendrogram                                       | M    | built                 |
| G5  | Graph interaction: neighbour highlight, drag and pin, expand and collapse    | M    | built                 |
| G6  | `graph3d`: force layout in the 3D scene                                      | M    | built                 |
| G7  | Large graphs: level of detail, edge bundling, layout in a worker             | L    | built; worker opt-in  |
| G8  | Related forms from existing primitives: arc diagram, chord, adjacency matrix | M    | built                 |
| G9  | Data in: Express `hx.graph` and adapters for common graph formats            | M    | built                 |
| G10 | Accessibility, export and demos                                              | M    | built; baselines open |

**G1 `graph` trace.** The base everything else sits on, useful on its own for positions computed
elsewhere (networkx, Graphviz, a server).

- [x] `node: { label, x, y, size, color, symbol, group, customdata }` and
      `link: { source, target, value, color, width, dash, arrow, curve }`, shaped like sankey's so
      the same data feeds both. Also `ids` / `labels` / `parents`, `node.value`, `node.shape`.
- [x] Two batches: all nodes as instanced markers, all links as one line buffer. Arrowheads stop
      at the node's edge, not its center. Curved links for parallel edges, loops for self-links.
- [x] Labels with collision culling: the highest-degree nodes win, the rest appear on zoom.
- [x] Color by group (categorical) or by a value through a colorscale, with a legend or colorbar.
      Size by degree as a built-in option (`node.sizeby`).
- [x] Placement. **Not as written**: the trace is cartesian in every case (ADR-029). `'preset'`
      positions are data on its axes (a network over a scatter); a computed arrangement hides
      the axes and locks them to one scale. There is no `domain`: several graphs are placed by
      axis domains.

Left open:

- [ ] `link.dash` and the arrowheads are one value per trace, not per link.
- [ ] Links are cut at the node's edge only at ends with arrowheads, and arrow tips stop at the
      circle of the node's size whatever its symbol.
- [ ] A group hidden through the legend still takes part in the layout and in autorange.
- [ ] A graph alone has `dragmode: 'zoom'` like any cartesian chart; whether it should default
      to `'pan'` is a follow-up of ADR-029.

**G2 Force-directed layout.**

- [x] Our own simulation on typed arrays (no `d3-force`): link springs, many-body repulsion
      through a Barnes–Hut quadtree, centering per connected component, collision by node size.
      `link.value` sets spring strength or length.
- [x] Deterministic: seeded phyllotaxis start and a fixed tick count; bit-identical between the
      main thread and a worker.
- [x] Two modes: static (run to rest in calc) and `force.simulate` (animate the cooling).
      Reduced motion and static plots get static, and so does image export.
- [x] Pinned nodes (`node.x` / `node.y` given for some), a force toward a group's center
      (`force.groupstrength`) and a timeline (every `x` given, `y` free: the x axis stays real).
- [x] ForceAtlas2 as a second algorithm (`force.algorithm`).

Left open:

- [ ] The tick count falls with size (300 up to 3,000 nodes, 90 at 10,000), which is how 10,000
      nodes meet 2 s; a full 300 ticks there take about 3.3 s.
- [ ] Collision treats every node as a circle, box nodes included.
- [ ] The trace's defaults differ from d3's (charge −60, velocity decay 0.25, 600 ticks up to
      500 nodes), because d3's leave small sparse graphs folded.

**G3 Layered DAG layout.** Pipelines, dependency graphs, data lineage, state machines, commit
graphs.

- [x] The Sugiyama steps: break cycles (Eades–Lin–Smyth inside strong components; sankey's
      `circularLinks` was not reused: it works on object arrays and turns more links), assign layers
      (longest path, tight tree and network simplex), reduce crossings with barycenter sweeps
      and transposition, place nodes (Brandes–Köpf), route long edges through dummy nodes.
- [x] `rankdir: 'TB' | 'LR' | 'BT' | 'RL'`, layer and node spacing, splines, polylines or
      orthogonal routes.
- [x] Box nodes sized to their label, with the text inside (the default under `'layered'`).
- [x] Clusters: nodes grouped in a labelled frame (`layered.clusters`).
- [x] Back edges of a cyclic input drawn in a distinct style (`link.secondary`), not dropped.

Left open:

- [ ] Links can cross cluster frames; clusters do not nest; a group whose nodes are far apart in
      rank gets a tall, mostly empty frame.
- [ ] No rank-balancing pass after network simplex, so ranks can be wider than Graphviz's.
- [ ] On a random cyclic graph of 5,000 nodes the layout takes seconds (122,000 dummy nodes);
      DAGs of that size take 0.1 to 0.5 s.

**G4 Tree layouts.**

- [x] Tidy tree (Buchheim's linear Reingold–Tilford) and radial tree from the same
      `ids`/`parents`/`labels` input the hierarchical traces take, or from `node` / `link`.
- [x] Dendrogram with branch heights from data (`node.value`) on a real axis, and elbow links.
- [x] Click to collapse and expand a subtree (`tree.collapsed`), with a tween; Enter does the
      same from the keyboard.

Left open:

- [ ] `ff.dendrogram` (plan.md E11.9) is not written; the layout it would target is.
- [ ] A second click or Enter while a fold is still moving (about 0.5 s) is ignored.

**G5 Interaction.**

- [x] Hovering a node highlights its links and neighbours and dims the rest; hovering a link
      highlights its two ends. `hovertemplate` variables for degree, in- and out-degree and
      `%{neighbors}`.
- [x] Node drag, emitting a restyle with the new positions. In simulate mode a drag reheats the
      layout, and a dragged node stays pinned (it gets a ring) until double-clicked.
- [x] Box and lasso select over nodes; click, hover and select events carry node and link
      indices.
- [x] `highlight: { hops: n }` for an n-hop neighbourhood (with `direction`), and a path
      highlight between two selected nodes (`highlight.path`, `pathweight`).

Left open:

- [ ] The highlight follows the pointer only: the keyboard cursor and `chart.hover()` show a
      label and highlight nothing.
- [ ] Without `force.simulate`, a drop writes `force.start` (the picture on screen), after which
      other `force` options change nothing until it is unset.
- [ ] Nodes of `layered`, tree, arc and hive arrangements do not drag.

**G6 `graph3d`.**

- [x] Force layout in three dimensions (an octree in place of the quadtree) inside a `scene`.
- [x] Nodes as lit spheres or billboards, links as lines or tubes with cone arrowheads, the
      orbit camera and camera animation as they are. GPU picking (ADR-010) for nodes and links.
- [x] A layered DAG in 3D: layers as planes along z (or `layered.axis`), force layout within
      each plane.

Left open:

- [ ] No `force.simulate`, worker, level of detail, bundling, node drag or selection in 3D. The
      2D animation code carries two coordinates.
- [ ] The layered mode has ranks and cycle breaking only, no crossing reduction.
- [ ] Sizes are fixed at the first view, so a fly-in from far away magnifies the nodes.

**G7 Large graphs.** Targets: 10k nodes and 50k links laid out in under 2 s and panned at 60 fps;
100k nodes drawn at 60 fps from given positions. Measured 2026-10-06 on an Apple M1 Max, Chromium
on the GPU (ANGLE Metal), with the machine busy: 10k / 50k is settled on screen 1.7 s after
`createChart` with the worker (longest block 0.13 s; 1.1 s without it) and pans at 60 fps; 100k
nodes and 150k links pan and zoom at 60 fps. All three are met.

- [x] Layout in a worker that streams positions back (`worker: 'auto' | true`, or
      `config.worker`), with a time-sliced fallback on the main thread. Our own worker file
      (`dist/layout-worker.js`), not S3.7's pool, which does not exist yet.
- [x] Level of detail (`lod`): labels and arrowheads only above a zoom threshold, link opacity
      scaled by density, small nodes drawn as dots without outlines.
- [x] Edge bundling (`link.bundle`): hierarchical when nodes have groups, force-directed
      otherwise.
- [x] Stretch, the simulation on the GPU: not built, by the rule the item set. The worker
      version meets the targets.

Left open:

- [ ] **`worker` is off by default** (it follows `config.worker`). Making it `'auto'` is one
      line; it waits for ADR-011 and for the worker file to be tried with webpack, Parcel and
      Rollup (Vite and esbuild were tried), and in Firefox and Safari.
- [ ] 50k nodes and 200k links take 3.4 s in the worker. That is where a GPU or multi-worker
      simulation would matter.
- [ ] Force bundling is refused above 20,000 links and blocks the main thread below 1,000.
- [ ] No benchmark was run on an idle machine; every number above is from a loaded one.
- [ ] A strict CSP needs `worker-src 'self'` (the docs' working policy has `blob:` alone).

**G8 Related forms.**

- [x] Arc diagram: `arrangement: 'arc'`.
- [x] Chord diagram: the `chord` trace, with directed ribbons and an outer ring of groups.
- [x] Adjacency matrix: `adjacencyMatrix()` and `hx.adjacencyMatrix`, a heatmap with rows and
      columns ordered by degree, group or community.
- [x] Hive plot: `arrangement: 'hive'`.

Left open:

- [ ] Chord: the gradient is stepped (24 strips), there is no `link.line`, and a node that is
      only a target has no ↓ from the keyboard.

**G9 Data in.**

- [x] `hx.graph(edges, { source, target, weight, color })` from an edge table, with an optional
      node table; also `hx.chord` and `hx.adjacencyMatrix`.
- [x] Adapters: `fromEdgeList`, `fromAdjacencyMatrix`, `fromNodeLink` (networkx, d3,
      graphology, Cytoscape), `fromDot` (a DOT subset). No GraphML: nobody asked.
- [x] `degrees`, `connectedComponents`, `louvain` (deterministic) and `modularity`.

Left open:

- [ ] Express does not compute communities itself (it depends on no trace package): pass
      `louvain(...)` as `color`.
- [ ] No facets or animation frames for the three Express functions, and none for `graph3d`.
- [ ] The Express functions add about 3 kB to the full bundle and to the script-tag build,
      which cannot draw `graph` or `chord` yet (its budget went from 690 to 693 kB).

**G10 Accessibility, export and demos.**

- [x] A text summary (node and link counts, components, the most-connected nodes, groups) and
      a table view of the edge list.
- [x] Keyboard: arrow keys move from a node along its links, announcing where they lead; trees
      and layered graphs are walked by their structure. Six new sentences in ten locales.
- [x] Image export shows the settled layout. SVG export is S3.4.
- [x] Demos: "This repository as graphs" (`apps/docs/demos/repo-graphs.md`: the package
      dependency DAG, module imports by force layout and Louvain, the git commit graph, the
      chart pipeline with clusters, 3D networks, a chord of imports) and the Les Misérables
      co-occurrence example (`graph/les-miserables`).
- [x] Docs: chart pages for `graph`, `chord` and `graph3d`, `fundamentals/graphs.md`, the
      keyboard tables and the CSP section.

Left open:

- [ ] **Visual baselines and gallery thumbnails of every new example were made locally.** As
      for the maps, the baselines have to come from the CI container.
- [ ] The locale sentences are machine translations, not reviewed by native speakers.
- [ ] The demo's commit graph uses `'preset'` with lanes computed in its analysis module; no
      arrangement draws git-style lanes.
- [ ] The Les Misérables data is Knuth's, taken from the locally installed networkx 3.6.1
      (BSD-3-Clause) and credited in THIRD_PARTY_NOTICES.md; the owner should confirm that
      attribution is the one wanted before the docs are published with it.

**How the decisions came out** (ADR-029)

1. **One trace or several?** One `graph` trace with `arrangement` (`'preset' | 'force' |
'layered' | 'tree' | 'radial' | 'dendrogram' | 'circular' | 'grid' | 'arc' | 'hive' |
'custom'`), plus `graph3d` and `chord`.
2. **Own layouts or dependencies?** Our own, no new dependencies. An app brings elkjs or
   d3-force through `'preset'` or `registerGraphLayout`.
3. **A new `traces-graph` package, outside the default bundle**, as proposed. It was built
   before S3.5 froze the plugin API, and added to the experimental contracts: core's
   `axisHints`, the runtime's `TracePlotContext.recalc`, `HoverPoint.selects`, a fourth argument
   to `eventData`, `KeyboardPoint.click` and `KeyboardStops.locate`. S3.5 has to keep or replace
   them.
4. **Order.** Built in four waves on one day: the trace and the pure layouts side by side, then
   the layouts in the trace with `graph3d`, the worker and Express, then interaction,
   accessibility and docs, then large graphs.

## Suggested waves

| Wave | Items                                                                       | Notes                                                                                                         |
| ---- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| R0   | S1.2, S1.3, S1.7 + S1.8, S1.4 + S1.5 + S1.9                                 | Four independent agents. S1.1's owner steps can happen in parallel.                                           |
| R1   | S1.6 (typed figures), then the S1.1 dry run and the `0.1.0-alpha.0` publish | S1.6 is the largest phase 1 item. The first publish waits for it.                                             |
| R2   | S2.1, S2.2 + S2.3 + S2.4, S2.5 + S2.6, S2.9 + S2.10                         | Robustness and docs in parallel.                                                                              |
| R3   | S2.11 + S2.12, S2.13, S2.14, S2.15 + S2.16 + S2.7 + S2.8                    | Ends with a beta release. Built 2026-10-03; the release itself waits on S1.1's owner steps.                   |
| M7   | Phase 3 in the order above                                                  | Plan it into waves when R3 closes, starting with the corpus runner so its report decides S3.2.                |
| GEO  | GEO1, then the order in the epic's decision 5                               | Before 1.0 by owner decision (2026-10-03). GEO1 started; how it interleaves with M7 is open.                  |
| G    | G1 to G10                                                                   | Built 2026-10-06 by owner decision. Open: CI baselines, the `worker` default (ADR-011), ADR-029's acceptance. |
