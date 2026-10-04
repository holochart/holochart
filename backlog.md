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

## After 1.0, explicitly out of scope

Recorded so they don't creep back in:

- Maps and geo (E15)
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

## After 1.0, ideas: network graphs

Node-link charts: force-directed networks, DAGs and trees. Added 2026-10-03. None of this is in
plan.md, and Plotly.js has no graph trace (its docs draw networks as `scatter` traces with positions
from networkx), so these are Holochart extras (➕) with no parity pressure and nothing for the
importer to do. They are ideas to pick from, not commitments, and decision 1 (pause new features)
holds until 1.0 is out.

**What is already there to build on**

- Sankey is a node-link chart already: a `node`/`link` attribute shape, cycle detection
  (`circularLinks`, `traces-hier/src/sankey/layout.ts:146`), longest-path layering, node dragging
  that reports a restyle payload (`sankey/drag.ts`), link hover and a text description
  (`sankey/describe.ts`).
- Instanced SDF markers (`render/src/markers`), the line and arrow primitives
  (`render/src/primitives/line.ts`, `arrow-geometry.ts`) and the pixel-space 2D camera (ADR-008)
  cover drawing, zoom and pan.
- The 3D scene with `scatter3d` markers and tube lines (E14.2, E14.10) covers a 3D graph.
- ADR-006 allows d3 micro-libraries in the pure stages, which admits `d3-force`, `d3-quadtree` and
  `d3-hierarchy`'s `tree`/`cluster`.

| ID  | Item                                                                         | Size | Needs      |
| --- | ---------------------------------------------------------------------------- | ---- | ---------- |
| G1  | `graph` trace: nodes and links at given positions                            | M    | S3.5       |
| G2  | Force-directed layout, deterministic, static or animated                     | L    | G1         |
| G3  | Layered DAG layout (Sugiyama) with box nodes and routed edges                | L    | G1         |
| G4  | Tree layouts: tidy, radial, dendrogram                                       | M    | G1         |
| G5  | Graph interaction: neighbour highlight, drag and pin, expand and collapse    | M    | G1         |
| G6  | `graph3d`: force layout in the 3D scene                                      | M    | G2         |
| G7  | Large graphs: level of detail, edge bundling, layout in a worker             | L    | G2, S3.7   |
| G8  | Related forms from existing primitives: arc diagram, chord, adjacency matrix | M    | —          |
| G9  | Data in: Express `hx.graph` and adapters for common graph formats            | M    | G1         |
| G10 | Accessibility, export and demos                                              | M    | G1, G2, G3 |

**G1 `graph` trace.** The base everything else sits on, useful on its own for positions computed
elsewhere (networkx, Graphviz, a server).

- [ ] `node: { label, x, y, size, color, symbol, group, customdata }` and
      `link: { source, target, value, color, width, dash, arrow, curve }`, shaped like sankey's so
      the same data feeds both.
- [ ] Two batches: all nodes as instanced markers, all links as one line buffer. Arrowheads stop
      at the node's edge, not its center. Curved links for parallel edges, loops for self-links.
- [ ] Labels with collision culling: the highest-degree nodes win, the rest appear on zoom.
- [ ] Color by group (categorical) or by a value through a colorscale, with a legend or colorbar.
      Size by degree as a built-in option.
- [ ] Cartesian or domain placement: `xaxis`/`yaxis` for positions in data units (a network over
      a scatter), a `domain` otherwise.

**G2 Force-directed layout.**

- [ ] `d3-force`-style simulation: link springs, many-body repulsion through a Barnes–Hut
      quadtree, centering, collision by node size. Link `value` sets spring strength or length.
- [ ] Deterministic: seeded phyllotaxis start and a fixed tick count, so the same figure gives the
      same pixels in visual baselines, SSR and export.
- [ ] Two modes: static (run to rest in calc, draw once) and `simulate: true` (animate the
      cooling through the on-demand render loop, ADR-007). Reduced motion gets static.
- [ ] Pinned nodes (`node.x`/`node.y` given for some), and forces toward a group center or along
      one axis (a beeswarm-like timeline network).
- [ ] ForceAtlas2 as a second algorithm; it separates communities better on scale-free graphs.

**G3 Layered DAG layout.** Pipelines, dependency graphs, data lineage, state machines, commit
graphs.

- [ ] The Sugiyama steps: break cycles (reuse `circularLinks`), assign layers (longest path, as
      sankey does; network simplex later for shorter edges), reduce crossings with barycenter
      sweeps, place nodes (Brandes–Köpf), route long edges through dummy nodes.
- [ ] `rankdir: 'TB' | 'LR' | 'BT' | 'RL'`, layer and node spacing, splines or orthogonal routes.
- [ ] Box nodes sized to their label, with the text inside. This is what separates a DAG diagram
      from a dot-and-line network, and it needs text measuring in calc.
- [ ] Clusters: nodes grouped in a labelled frame (stages of a pipeline, packages of a monorepo).
- [ ] Back edges of a cyclic input drawn as loops in a distinct style, not dropped.

**G4 Tree layouts.**

- [ ] Tidy tree (Reingold–Tilford) and radial tree from the same `ids`/`parents`/`labels` input
      the hierarchical traces take (`traces-hier/src/hierarchy/build.ts`), so a treemap and a
      tree swap with one attribute.
- [ ] Dendrogram with branch heights from data and elbow links. This would give plan.md E11.9
      (`ff.dendrogram`) a native layout to target instead of scatter lines.
- [ ] Click to collapse and expand a subtree, with the tween the sunburst uses for drill-down.

**G5 Interaction.**

- [ ] Hovering a node highlights its links and neighbours and dims the rest; hovering a link
      highlights its two ends. `hovertemplate` variables for degree, in- and out-degree.
- [ ] Node drag on the `SankeyDrag` pattern, emitting a restyle with the new positions. In
      simulate mode a drag reheats the layout, and a dragged node stays pinned until
      double-clicked.
- [ ] Box and lasso select over nodes; click, hover and select events carry node and link
      indices.
- [ ] `highlight: { hops: n }` for an n-hop neighbourhood, and a path highlight between two
      selected nodes.

**G6 `graph3d`.** The one that plays to Holochart's 3D scene; general charting libraries mostly
leave it to dedicated tools such as 3d-force-graph.

- [ ] Force layout in three dimensions (an octree in place of the quadtree) inside a `scene`.
- [ ] Nodes as lit spheres or billboards, links as lines or tubes, the orbit camera and camera
      animation as they are. GPU picking (ADR-010) for hover.
- [ ] A layered DAG in 3D: layers as planes along z, force layout within each plane.

**G7 Large graphs.** Targets to argue about: 10k nodes and 50k links laid out in under 2 s and
panned at 60 fps; 100k nodes drawn at 60 fps from given positions.

- [ ] Layout in a worker (S3.7, ADR-011) that streams positions back, so the graph settles on
      screen instead of blocking.
- [ ] Level of detail: labels and arrowheads only above a zoom threshold, link opacity scaled by
      density, nodes below a pixel drawn as points.
- [ ] Edge bundling for hairballs: hierarchical bundling when nodes have groups, force-directed
      bundling otherwise.
- [ ] Stretch: the simulation on the GPU with transform feedback. Worth a spike only if the
      worker version misses the targets.

**G8 Related forms.** Each is a layout over primitives that exist, and each avoids the hairball
for some kind of graph.

- [ ] Arc diagram: nodes on a line, links as arcs (`render/src/primitives/arc.ts`).
- [ ] Chord diagram: sunburst ring geometry for the groups, ribbons between them. Plotly has
      no chord trace.
- [ ] Adjacency matrix: a heatmap with rows and columns reordered by cluster. Works at densities
      where node-link fails.
- [ ] Hive plot, as a lower priority.

**G9 Data in.**

- [ ] `hx.graph(edges, { source, target, weight, color })` from an edge table, with an optional
      node table, matching the other Express calls.
- [ ] Adapters: adjacency matrix, node-link JSON (networkx, graphology, Cytoscape), and a DOT
      subset. GraphML only if someone asks.
- [ ] Small pure helpers for the things people color and size by: degree, connected components,
      and one community detection (Louvain). Anything past that belongs to a graph library, not
      to a chart library.

**G10 Accessibility, export and demos.**

- [ ] A text summary on the `describe.ts` pattern (node and link counts, components, the
      most-connected nodes) and a table view of the edge list.
- [ ] Keyboard: arrow keys move from a node along its links, announcing the neighbour.
- [ ] Demos that sell it: this monorepo's package dependency DAG, Les Misérables character
      co-occurrence (force), a git commit graph, a data pipeline with clusters, a 3D network.

**Decisions these need first**

1. **One trace or several?** Recommended: one `graph` trace with a pluggable layout
   (`'force' | 'layered' | 'tree' | 'radial' | 'circular' | 'grid' | 'preset'`), plus `graph3d`.
   The attribute can't be called `layout`, which the figure owns; sankey's `arrangement` is the
   precedent.
2. **Own layouts or dependencies?** Recommended: `d3-force` and `d3-hierarchy` under ADR-006, our
   own layered layout sharing code with sankey, and a layout hook from the plugin API (S3.5) so an
   app can bring elkjs for the hard cases. Check the alternatives before starting G3: dagre and
   d3-dag are small but have seen little maintenance, and elkjs is too large to bundle (sizes and
   status here are from memory, not measured).
3. **A new `traces-graph` package, outside the default bundle.** Full ESM is at 533.9 of 540 kB,
   so graphs register through a partial bundle like any plugin. That makes G1 a real test of the
   frozen trace module contract, which is why it waits for S3.5.
4. **Order.** G1, then G3 or G2 by demand (layered DAGs are rare in general charting libraries;
   force layouts are the crowd-pleaser), then G5. G8's chord diagram is independent and could go
   first.

## Suggested waves

| Wave | Items                                                                       | Notes                                                                                          |
| ---- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| R0   | S1.2, S1.3, S1.7 + S1.8, S1.4 + S1.5 + S1.9                                 | Four independent agents. S1.1's owner steps can happen in parallel.                            |
| R1   | S1.6 (typed figures), then the S1.1 dry run and the `0.1.0-alpha.0` publish | S1.6 is the largest phase 1 item. The first publish waits for it.                              |
| R2   | S2.1, S2.2 + S2.3 + S2.4, S2.5 + S2.6, S2.9 + S2.10                         | Robustness and docs in parallel.                                                               |
| R3   | S2.11 + S2.12, S2.13, S2.14, S2.15 + S2.16 + S2.7 + S2.8                    | Ends with a beta release. Built 2026-10-03; the release itself waits on S1.1's owner steps.    |
| M7   | Phase 3 in the order above                                                  | Plan it into waves when R3 closes, starting with the corpus runner so its report decides S3.2. |
