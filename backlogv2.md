# Holochart v2 backlog

The work that takes Holochart from the first alpha to a second-generation release: a wider chart
catalogue, a platform other people can build on, output beyond a browser canvas, and first-class
use from frameworks and Python. Written 2026-10-11 against commit 1e5e4cd, after
`0.1.0-alpha.0` reached npm.

`backlog.md` (ship backlog), `backlog-site.md` (docs site) and `docs/plotly-parity-backlog.md`
(PC01–PC30) stay where they are. This file does not repeat their open checkboxes. It picks up
what they deferred, adds what a fresh review of the code found, and puts both in one order. The
[ID map](#id-map-earlier-backlogs-to-this-one) at the end shows where every earlier deferred item
landed.

**Where things stand**

- 16 npm packages at `0.1.0-alpha.0` in Changesets pre mode (`.changeset/pre.json`), with 40
  registered trace types: Plotly's basic, statistical, scientific, financial, hierarchical and 3D
  families, plus `scattergeo`, `choropleth`, `graph`, `graph3d`, `chord` and `bar3d`.
- One rendering path: WebGL2 through three.js (`packages/render/src/core/render-root.ts`). No
  SVG, Canvas 2D or WebGPU. Export is PNG, JPEG and WebP only, and needs a `document`.
- The engine has a trace and component registry, but every contract a third party would build on
  is tagged `@experimental` (104 tags in `api-reports/holochart-runtime.api.md`, 477 in
  `holochart-render.api.md`).
- Calc runs synchronously on the main thread. `config.worker` is declared and only
  `traces-graph` uses a worker.
- No framework wrappers, no web component, no headless rendering, no CLI.
- `holochart-py` works in JupyterLab and Notebook 7 but sits at version `0.0.0`, is not on PyPI,
  and has no browser-to-Python events.
- The full ESM bundle measures 540.0 kB on CI against a 542 kB budget and a 560 kB hard ceiling
  (`tests/bundle/size/policy.ts`). There is no room for v2 features in the default bundle.
- Phase 3 of `backlog.md` (S3.1–S3.12, the 1.0 exit) has not started.

**What "v2" means here.** No earlier document defines a v2; they speak of alpha, beta, 1.0 and
1.x. This file treats v2 as a scope, not a version number: everything past the alpha's feature
set. Decision 1 below settles how it maps to SemVer.

| Legend   | Meaning                                                                                   |
| -------- | ----------------------------------------------------------------------------------------- |
| P0       | v2 does not ship without it                                                               |
| P1       | Planned for v2; may slip to a following minor                                             |
| P2       | Stretch or exploratory; start only when its condition is met                              |
| S, M, L  | Hours; a day or two for one agent; a multi-agent wave (same as `backlog.md`)              |
| XL       | Several waves. Split into stories before starting                                         |
| Prior ID | Where the item came from: `S`/`GEO`/`G` = `backlog.md`, `E`/`R` = `plan.md`, `PC`, `SITE` |

## Decisions for the owner

Recommendations first. Each changes what goes into the tracks below.

1. **Make the breaking contract changes before the 1.0 freeze, and ship the rest additively.**
   Async calc (V2-B2), renderer-neutral types (V2-B3), the scale registry (V2-B4) and the wider
   hover and selection queries (V2-B6) all change `@experimental` types today at no cost. After
   S3.5 freezes them, each one is a major version. Recommended: track B lands first and becomes
   the 1.0 contract; tracks C–J then ship as minors, and "2.0" is used only if something later
   forces a break.
2. **New chart families go in opt-in packages, never the full bundle.** With 2 kB of headroom,
   tile maps, ternary, Smith, carpet and vector fields each need their own package or a lazy
   chunk, as geo and graph already do (ADR-026). Recommended: adopt this as a rule and add
   prebuilt CDN variant bundles (V2-G4) so script-tag users are not left out.
3. **Pick the vector export approach before sizing it.** SVG export (V2-D1) is either a second
   draw path per primitive (true vectors, XL) or a raster image wrapped in SVG with vector text
   and axes (M, and what most "SVG export" users would call a disappointment). Recommended: true
   vectors for 2D cartesian, pie and polar first; raster fallback, clearly labelled, for 3D.
4. **Accept ADR-027 and build tile maps on MapLibre as an optional peer.** It is the largest
   missing Plotly family and the spike already recommends the overlay-canvas design.
5. **Keep WebGPU out of v2's commitments.** Do V2-B3 so the public types stop naming
   `WebGLRenderer`, run a spike, and decide the backend (V2-C10) on its numbers.
6. **Treat Python as a first-class deliverable.** V2-H1 and V2-H2 are P0 here. The bridge is
   built and tested across 27 matrix legs but cannot be installed.
7. **Keep the parked list parked.** HDR, the video package, shader hooks and the 2.5D extras stay
   in track K until the Plotly corpus gate (V2-E1) is met, as PC:563-566 already says.
8. **Non-goals stay non-goals:** pixel-identical Plotly output, Plotly `transforms`, a Dash-style
   app framework, and a fallback for browsers without WebGL2 (PC30). Reopen the last one only if
   V2-D1 produces a Canvas-free draw path that makes it cheap.

---

## Track A: close out v1

Prerequisites. None of this is new scope; v2 work built on top of it will be wrong or blocked
without it.

| ID    | Item                                             | Pri | Size | Prior ID       |
| ----- | ------------------------------------------------ | --- | ---- | -------------- |
| V2-A1 | The documents describe the alpha that shipped    | P0  | S    | S1.1, S1.5     |
| V2-A2 | Decide the ten Proposed ADRs                     | P0  | M    | S3.6, GEO1     |
| V2-A3 | Close the open ship-backlog residue              | P0  | L    | S2.x, R3 bugs  |
| V2-A4 | Leave alpha: beta criteria, then the stable line | P0  | M    | S1.1, PC:83-87 |

### V2-A1 — The documents describe the alpha that shipped · P0 · S · ✅ Done (2026-10-11)

Evidence: `npm view @mk7s/holochart dist-tags` returns `0.1.0-alpha.0` on both `latest` and
`alpha`, yet `README.md:19`, `CONTRIBUTING.md:4`, `apps/docs/roadmap.md:51`,
`packages/locales/README.md:7`, `backlog.md:9` and PC:46 say nothing is published.
`ARCHITECTURE.md:7` says "pre-alpha (milestone M0)", lists packages that do not exist
(`compat-plotly`, `react`, `apps/playground`, `apps/bench`, `tools/mock-runner`; lines 71–77) and
indexes ADRs only to 018 of 029. `apps/docs/roadmap.md` shows M6 "in progress" and the globe as
planned; both are built. `docs/release/initial-release.md:83-84` contradicts
`browser-support.md:18-19` on Firefox and WebKit CI.

- [x] Fix the "not on npm" statements in the six files above. Whether `latest` should point at
      an alpha is decided in V2-A4.
- [x] Rewrite `ARCHITECTURE.md` status, package table and ADR index from the tree as it is.
- [x] Rewrite `apps/docs/roadmap.md` around this file's tracks; drop milestone version numbers
      that no release will carry.
- [x] Tick or reword stale checkboxes in `backlog.md` (S1.1, S1.6, `stripInternal` at B:89 against
      B:445) and mark `docs/plotly-parity-backlog.md` items PC07, PC14, PC16 and PC21 against the
      work that landed after 2 Oct.
- [ ] Refresh `docs/perf/gpu-benchmarks.md` after V2-C1 gives numbers from a quiet machine.
      `docs/spikes/README.md` is refreshed (V2-A2).

Found while doing it, and done:

- [x] The whole getting-started path told readers to clone and build. The published alpha was
      installed clean from npm, bundled with Vite 8 and drawn (2D, 3D, a choropleth, PNG export,
      no request outside the page's origin), and the jsDelivr script-tag build was drawn too.
      `apps/docs/.vitepress/release-state.ts` now says npm is published and smoke-tested, and
      the installation page, the three quick starts and eleven other pages lead with npm or the
      CDN, pinned to `0.1.0-alpha.0`.
- [x] The docs said the Python bridge, maps and graphs were missing from public `main`. They are
      on it. The bridge is still not on PyPI (V2-H1).
- [x] `docs/release/browser-support.md` and the installation page called Firefox "tested
      nightly". It never was: see V2-A3.

Left as they are: `plan.md` (its status line and ADR table are the plan as written) and the
published changelog of `0.1.0-alpha.0`, which says Firefox and Safari are not tested in CI.

Acceptance: a reader of README, roadmap, ARCHITECTURE and CONTRIBUTING gets one consistent
account of what is published and what exists.

### V2-A2 — Decide the ten Proposed ADRs · P0 · M · ✅ Done (2026-10-11)

Evidence: ADR-004, 005, 011 and 023–029 are still Proposed, and code for 023–029 has shipped.
ADR-025 and ADR-029 rely on the unaccepted ADR-011. Spikes C (text) and D (viewports) were never
measured (`docs/spikes/`).

- [x] Run spikes C and D; accept or replace ADR-004 and ADR-005. — Both measured on a machine
      under load (`docs/spikes/c-text.md`, `d-viewports.md`); both ADRs accepted by the owner.
      ADR-005 was accepted without the opt-in DOM text mode, which was never built.
- [x] Accept ADR-023–026 and 028–029 as built, or record what must change. — Accepted by the
      owner. ADR-026 and ADR-029 say in their status what acceptance does not cover. The UN
      geodata terms in ADR-024 matter only if someone proposes shipping Plotly's current files.
- [x] ADR-011 is decided by V2-B2; ADR-027 by decision 4. — ADR-011 left Proposed by the owner
      until V2-B2 has a prototype. ADR-027 accepted as the design for V2-E3.

Acceptance: no ADR is Proposed while its code is in a published package. Met: the one Proposed
ADR (011) has no engine code.

### V2-A3 — Close the open ship-backlog residue · P0 · L · 🟡 Partly done (2026-10-11)

Fixed, with unit tests. None of it has run in CI yet.

- [x] Text-dependent trace extremes were measured before the font loaded and never again. A font
      change now reruns only the stages that measured text (bars with outside labels, histogram,
      waterfall, funnel, graph box nodes).
- [x] `ready`, `newPlot` and `react` never settled when a fallback font could not be fetched or
      the text worker was blocked. They now settle after at most about 10 s, with one warning.
- [x] Strict mode validates every edit, a rejected update leaves the figure as it was, and a
      multi-part update applies nothing if any part is invalid.
- [x] `BigInt64Array` and `BigUint64Array` data; Plotly's `{ dtype, bdata, shape }` arrays on
      input (traces, dataset columns, layout, box and violin positions).
- [x] A plain color list as `colorscale`; a warning for an unknown colorscale name; contour's
      color domain from the resolved levels; `image` on a log axis; histograms in the bar layer.
- [x] `eraseActiveShape` is exported. Examples `shapes/draw` and `line/streaming` exist.
- [x] Planning IDs ("(E6.7)", "M1") are out of 34 attribute descriptions and one error message.
- [x] The two macOS-only visual failures (`demos/tqqq-soxl/*`) are annotated, not failed, when
      the suite runs off Linux outside CI (`tests/visual/platform.ts`). CI gates them as before.
- [x] The `scatter3d` Delaunay property now checks validity exactly and excuses a Delaunay
      violation only where float arithmetic cannot decide; its wall-clock limit is a work count.

Found on the way: **both nightly workflows on `main` have been red for weeks.**

- [x] Property tests failed 16 of 17 nights. Four causes fixed: a matched axis kept a
      template-only `range`, so defaults were not idempotent (product bug); the radial tree let
      ring neighbours overlap (product bug); a warn-once test was not repeat-safe; the globe-mesh
      tolerance ignored float32 rounding, and its shrinking took 826 s.
- [x] The browser nightly failed every night since it began on 2026-10-04, and Firefox was never
      tested: headless Firefox has no WebGL in the container. Its legs now run under `xvfb-run`,
      where a probe in the same container got WebGL2. **Not yet confirmed by a nightly run.**
- [ ] Look at what Firefox on Linux fails once it can draw.
- [ ] WebKit's seven failing interaction tests and one bundle test
      (`docs/release/browser-support.md`, "Nightly runs").
- [ ] Nothing reports a red nightly. Open an issue from the workflow (V2-J1).
- [ ] The property harness prints "failed" with a replay line for passing repeats once any repeat
      has failed (`tests/property/setup.ts`), which buries the real failure.
- [ ] Sixteen unit tests in render and traces-graph fail only on a repeat. The nightly does not
      run them, since they are not property tests.

Still open from `backlog.md`:

- [ ] Destroying a chart after a context restore logs one `INVALID_OPERATION: delete` per GPU
      object (S2.2). Needs a change in three.js, or its private listener lists.
- [x] Line baselines regenerated in the pinned container (S2.8), with a new one for
      `shapes/draw`. The full visual suite ran there: 859 pass. Five graph pictures moved by a
      few dozen pixels (`graph/dependencies`, `hive`, `large`, `layered-cycle`,
      `layered-orthogonal`), all from the font fix: node boxes and label culling now use the
      loaded font's widths. Their baselines are regenerated. The container was arm64, where the
      unchanged code matches every CI baseline; a CI run has not confirmed the new ones.
- [ ] Shape legend entries and annotation hover labels are confirmed not drawn; they are
      V2-F4 and V2-D4.
- [ ] Declared-but-dead schema keys are V2-B7. One correction to it: `config.worker` is read, as
      the default of the graph traces' `worker` attribute.
- [ ] Strict mode now also checks edits made by interactions. No interaction was audited for
      writing a value the validator rejects.
- [ ] GEO2–GEO8 and G1–G10 "left open" lists move to V2-E17; leaks and contexts to V2-C8;
      keyboard gaps to V2-F5; translations to V2-F7; browsers to V2-J1.

The fixes added 2.13 kB to `partial: core + scatter` and 1.28 kB to `partial: basic`, which put
both over budget. The owner raised them, 157 to 159 kB and 250 to 252 kB, with ledger lines in
`tests/bundle/size/policy.ts`; the measurements are in `docs/release/bundle-size.md`.

- [ ] `partial: core + graph` passes locally by 0.03 kB (235.97 of 236) and is expected to
      exceed its budget on CI, which reads about 0.3% higher. Trim it or raise it.
- [ ] The full bundle is expected within about 0.4 kB of its 542 kB budget on CI.

Acceptance: `backlog.md` has no open box outside Phase 3 that this file does not reference, and
both nightly workflows are green.

### V2-A4 — Leave alpha: beta criteria, then the stable line · P0 · M · 🟡 Partly done

Evidence: `docs/release/releasing.md:145-173` lists post-publish steps 11–12 (docs pinned to the
published version, trusted publishing) and the `pre exit` sequence; none is done. No canary or
snapshot release exists. Three documents give three beta bars (B:16-20, P:1922, PC:83-87).

- [x] Write one beta bar and one 1.0 bar. — Drafted in `docs/release/release-criteria.md`, with
      each criterion's state and its item here. It makes two choices and leaves one question
      open; the owner has not confirmed it, so the other three bars are not deleted yet.
- [x] Release step 11, docs pinned to the published version. — Done under V2-A1.
- [ ] Switch npm publishing to trusted publishing (OIDC) and retire the token. An owner step on
      npmjs.com; the workflow already supports it (`NPM_TRUSTED_PUBLISHING`).
- [ ] Add snapshot releases from `main` under a `next` tag. — Blocked: Changesets refuses
      snapshot versions in pre mode ("Snapshot release is not allowed in pre mode"). Possible
      after `pre exit`, or with a tool outside Changesets.
- [x] Decide whether `latest` should point at an alpha. — Already decided and written down:
      until the first stable release `latest` follows the newest alpha
      (`docs/release/versioning.md`, "Before 1.0").

Acceptance: a contributor can read one page and tell what blocks beta and what blocks 1.0.

---

## Track B: engine contracts

The changes that are free today and breaking after the plugin API freezes. See decision 1.

| ID    | Item                                            | Pri | Size | Prior ID             |
| ----- | ----------------------------------------------- | --- | ---- | -------------------- |
| V2-B1 | Split `chart.ts` into pipeline stages           | P0  | L    | S3.11                |
| V2-B2 | Async calc contract and worker calc             | P0  | XL   | S3.7, E16.5, ADR-011 |
| V2-B3 | Renderer-neutral public types                   | P1  | M    | ADR-009              |
| V2-B4 | Scale registry: symlog and custom scales        | P1  | M    | E22.4                |
| V2-B5 | Subplot registry; `makeSubplots` for every kind | P0  | M    | —                    |
| V2-B6 | Hover and selection queries beyond x/y          | P1  | M    | —                    |
| V2-B7 | Declared-but-dead config: wire it or remove it  | P0  | S    | S2.10 residue        |
| V2-B8 | Freeze the plugin API                           | P0  | L    | S3.5, E22.1–6, S2.13 |

### V2-B1 — Split `chart.ts` into pipeline stages · P0 · L

Evidence: `packages/runtime/src/chart.ts` is 3,568 lines and holds the update plan, the settle
loop (up to 8 passes), axis handling and the export source. V2-B2, V2-D1, V2-D3 and V2-C10 all
change it.

- [ ] Extract mount, scheduler, settle loop, selection and export into modules with their own
      tests; `Chart` keeps the public surface.
- [ ] No API report change; the 90% runtime coverage threshold holds per module.

Acceptance: no file under `runtime/src` exceeds about 800 lines and the API report diff is empty.

### V2-B2 — Async calc contract and worker calc · P0 · XL

Evidence: `TraceModule.calc` returns `Calc`, not a promise (`packages/runtime/src/contracts.ts:369`);
the only async hook is `ctx.recalc()` (lines 286–295). `config.worker` is declared "Run the calc
stage in a Web Worker (ADR-011)" (`packages/core/src/config/schema.ts:176-181`) and the engine
never creates a worker; `traces-graph` has its own (`packages/traces-graph/src/worker/client.ts:140`).
Isosurface extraction "runs synchronously in calc for now" (`traces-3d/src/isosurface/extract.ts:41`),
and a 1M-point flatbush build takes 148 ms on the main thread (`docs/perf/`).

- [ ] Let `calc` return a promise; define how the settle loop, `chart.ready`, `toImage` and
      `react()` cancellation treat a pending calc.
- [ ] A worker host in runtime with transferable calcdata, a main-thread sliced fallback (the
      graph package's pattern) and a strict-CSP path.
- [ ] Move isosurface, volume, streamtube, 2D binning, contour and the hover index build onto it.
- [ ] Port the graph layout worker to the shared host; decide the `config.worker` default.
- [ ] Bundler trials: Vite, webpack, Next, and the IIFE build.
- [ ] Accept or reject ADR-011 on measured wins.

Acceptance: a 1M-point scatter and a 256³ isosurface keep input latency under 50 ms during first
draw, with identical pixels to the main-thread path.

### V2-B3 — Renderer-neutral public types · P1 · M

Evidence: `ChartThree.renderer` is typed `WebGLRenderer` (`runtime/src/chart.ts:231`) and
`RenderRootOptions.createRenderer` returns one (`render/src/core/render-root.ts:71`). The peer
range is `three >=0.180.0 <0.187.0`. Any second backend is a breaking type change today.

- [ ] Type the escape hatch against a narrow interface with a discriminated `backend` field.
- [ ] Record in ADR-009 which primitives would need a TSL port, with a count (21 GLSL3
      `ShaderMaterial` files today).

Acceptance: `api-reports/` names `WebGLRenderer` only behind a backend-narrowed type.

### V2-B4 — Scale registry: symlog and custom scales · P1 · M

Evidence: scale types are a closed switch (`packages/core/src/scales/scale.ts:155-170`) and
`DataTransform` is affine per axis (`packages/render/src/types.ts:34-40`).

- [ ] A scale registration contract with forward, inverse, ticks and a GPU linearisation hook.
- [ ] Ship `symlog`, `sqrt` and `logit` on it; keep log and date on the fast path.
- [ ] `geometric mean` category aggregation (`core/src/scales/category-values.ts:23`).

Acceptance: a third-party scale works with zoom, hover, range breaks and export.

### V2-B5 — Subplot registry; `makeSubplots` for every kind · P0 · M

Evidence: `makeSubplots` throws "subplots are not supported until milestone…" for `scene`,
`polar` and `geo` (`packages/core/src/subplots/make-subplots.ts:158-166, 346-353`), although all
three subplots exist in `traces-3d`, `traces-sci` and `traces-geo`. Mixed-type grids, a staple of
Plotly dashboards, fail today.

- [ ] Replace the hard-coded `UNSUPPORTED` table with a lookup in the subplot registry.
- [ ] `scene`, `polar`, `geo` specs place domains correctly; `ternary`, `smith`, `map` light up
      when their packages register (V2-E3–E5).
- [ ] Examples and visual baselines for mixed grids.

Acceptance: Plotly's "mixed subplots" documentation example renders unchanged.

### V2-B6 — Hover and selection queries beyond x/y · P1 · M

Evidence: `HoverQuery.mode` is `'closest' | 'x' | 'y'` and `SelectionQuery` is a rect or lasso in
x/y (`packages/runtime/src/contracts.ts:867-876, 964-971`). Ternary, Smith, carpet and tile maps
each need another coordinate space.

- [ ] Carry a subplot-defined coordinate frame through both queries.
- [ ] Retrofit polar and geo, which work around it today.

Acceptance: a new subplot kind implements hover and selection without touching runtime.

### V2-B7 — Declared-but-dead config: wire it or remove it · P0 · S

Evidence (grep of `packages/*/src`, excluding schema, generated and test files):
`config.textRenderer` has no reader; `config.debug` reaches only core's `planUpdate` option
(`core/src/edit/plan.ts:42, 133`), which runtime never sets; six `config.edits` flags
(`annotationText`, `axisTitleText`, `colorbarPosition`, `colorbarTitleText`, `legendPosition`,
`legendText`) have no reader; `hoverRenderer` has one value. `frame.redraw`, error-bar
`traceref` and bar `cliponaxis: false` are accepted and ignored.

- [ ] Wire `config.debug` to plan and timing logs.
- [ ] Remove `textRenderer` or implement it; the `edits` flags are V2-F1; `worker` is V2-B2.
- [ ] A schema lint that fails when an attribute has no reader and no "compatibility only" note.

Acceptance: every config attribute either changes behaviour or says in its description that it
does not.

### V2-B8 — Freeze the plugin API · P0 · L

Evidence: 51 `ae-forgotten-export` warnings in the engine reports and 135 more across the trace
packages; 123 internal types leak through public signatures, `stripInternal` is off and the
declaration build is not reproducible (B:445-456). ADR-029 lists eight experimental contract
additions that S3.5 must "keep or replace". All three `apps/docs/extending/*` pages are stubs.

- [ ] Land V2-B2, B4, B5 and B6 first.
- [ ] Promote `TraceModule`, `ComponentModule`, subplot, scale and lifecycle contracts to
      `@public`; resolve every forgotten export; add `/internal` subpaths.
- [ ] Import-boundary lint; reproducible declarations; `stripInternal` on.
- [ ] Three example plugins (a trace, a component and a scale), each in a fixture outside the
      workspace that installs only the packed tarballs.
- [ ] Write the three extending pages (V2-I3).

Acceptance: the example plugins build against packed tarballs with no `@experimental` import.

---

## Track C: scale and rendering

| ID     | Item                                            | Pri | Size | Prior ID          |
| ------ | ----------------------------------------------- | --- | ---- | ----------------- |
| V2-C1  | Performance harness with budgets in CI          | P0  | M    | S3.8, E16.1       |
| V2-C2  | Meet or restate the missed first-draw targets   | P1  | M    | S2.16             |
| V2-C3  | Marker density aggregation and GPU 2D binning   | P1  | L    | E16.10            |
| V2-C4  | Precision split for extreme zoom on long series | P1  | M    | E16.4             |
| V2-C5  | Incremental append beyond `scatter`             | P1  | M    | —                 |
| V2-C6  | 3D performance and clipping                     | P1  | L    | E14.11            |
| V2-C7  | Order-independent transparency                  | P1  | M    | B:929             |
| V2-C8  | Memory, leaks and the context budget            | P0  | M    | S2.1, S2.6, E16.6 |
| V2-C9  | Bundle strategy for v2 growth                   | P0  | M    | ADR-015, ADR-026  |
| V2-C10 | WebGPU backend                                  | P2  | XL   | E16.8             |
| V2-C11 | OffscreenCanvas rendering                       | P2  | L    | E16.7             |

### V2-C1 — Performance harness with budgets in CI · P0 · M

Evidence: the CI `bench` job is `if: ${{ false }}` and exits 1 (`.github/workflows/ci.yml:444-454`).
`pnpm bench:gpu` is local-only, every published number comes from one M1 Max, and the last report
was taken on a loaded machine (`docs/perf/gpu-benchmarks.md`).

- [ ] A scheduled job on a GPU runner, plus a CPU-only SwiftShader subset per PR for calc and
      layout timings.
- [ ] Budgets in a ledger file, with the same "name the cause" rule as bundle size.
- [ ] PR comment with deltas; history kept as an artifact.
- [ ] At least one non-Apple GPU and one integrated GPU measured once, by hand, and recorded.

Acceptance: a PR that slows 1M-point pan by 10% fails or is flagged before merge.

### V2-C2 — Meet or restate the missed first-draw targets · P1 · M

Evidence: heatmap 4096² first draw 425 ms against 100 ms, called "not reachable as written"
because an empty chart takes 135–170 ms (B:522-532); surface 1024² 262 ms against 50 ms with no
follow-up; solid lines 2.1–2.6× `Line2` against 2×.

- [ ] Profile empty-chart startup; it bounds every other first-draw number.
- [ ] Heatmap and surface: upload paths, texture formats, deferred colorscale.
- [ ] Restate any target that cannot be met, with the measurement that shows why.

Acceptance: every target in `gpu-benchmarks.md` is met or carries a dated note.

### V2-C3 — Marker density aggregation and GPU 2D binning · P1 · L

Evidence: lines have M4 level of detail (`traces-basic/src/scatter/line-lod.ts`); markers have
nothing (`plan.md:1498`, `marker.aggregate` open). `histogram2d` defers GPU aggregation above 1M
samples (`traces-stats/src/histogram2d/index.ts:8`).

- [ ] `marker.aggregate`: density texture when points per pixel pass a threshold, points when
      zoomed in, with correct hover and selection in both states.
- [ ] GPU binning for `histogram2d` and `histogram2dcontour`.

Acceptance: a 10M-point scatter pans at 50 fps or better and its hover returns real points.

### V2-C4 — Precision split for extreme zoom on long series · P1 · M

Evidence: "A hi/lo split for extreme zoom of very long series is deferred (E16.4, P2)"
(`packages/render/src/precision.ts:9`).

- [ ] Hi/lo attribute pairs for line and marker primitives, switched on by data extent.
- [ ] Property tests at nanosecond-resolution date axes.

Acceptance: a year of millisecond data zoomed to one second shows no vertex jitter.

### V2-C5 — Incremental append beyond `scatter` · P1 · M

Evidence: `calcAppend` and `extremesAppend` exist in the contract
(`runtime/src/contracts.ts:379-391`) and only `scatter` implements them. `extendTraces` on
`candlestick`, `ohlc`, `bar` and `heatmap` recalculates everything. Decimated splines are "not
supported incrementally" (`scatter/line-stream.ts:437`).

- [ ] `calcAppend` for `candlestick`, `ohlc`, `bar`, `heatmap` (row append) and `scatter3d`.
- [ ] A streaming example per trace and a benchmark in V2-C1.

Acceptance: appending one bar to a 100k-candle chart costs under 2 ms.

### V2-C6 — 3D performance and clipping · P1 · L

Evidence: E14.11 (frustum culling, LOD, pixel-ratio drop while orbiting) is open
(`plan.md:1453-1456`). "Data outside the axis ranges is not clipped yet"
(`traces-3d/src/scene/index.ts:78`); only surface, isosurface and volume clip.

- [ ] Axis-box clipping for `scatter3d`, `mesh3d`, `cone`, `streamtube` and `bar3d`.
- [ ] Culling, mesh LOD and adaptive pixel ratio during camera motion.
- [ ] GPU picking for `Points` and `Line` objects (`render/src/picking/gpu-picking.ts:31-33`).

Acceptance: a 2M-triangle mesh orbits at 30 fps or better on an integrated GPU.

### V2-C7 — Order-independent transparency · P1 · M

Evidence: "Weighted blended order-independent transparency … is deferred (P2)" and
`MESH_SORT_LIMIT = 500_000` (`packages/render/src/primitives/transparency.ts:17, 22`).

- [ ] Weighted-blended OIT as a render-target pass in `RenderRoot`, opt-in per scene.
- [ ] SwiftShader baselines; fall back to sorting where float targets are missing.

Acceptance: overlapping translucent isosurfaces look the same from every camera angle.

### V2-C8 — Memory, leaks and the context budget · P0 · M

Evidence: leaks L1, L1b and L2 are open (`docs/release/browser-support.md:129-138`); the troika
glyph generator holds an extra WebGL context (B:217); nine overlay maps exceed Chromium's context
limit (spike G). V2-E3 adds a second WebGL library per map.

- [ ] Fix the three leaks; keep the nightly 100-cycle test and add a heap budget to it.
- [ ] Remove or share the glyph generator's context.
- [ ] One context budget across charts, text and tile maps, with a documented limit.
- [ ] Buffer pools for typed arrays in calc (E16.6).

Acceptance: 50 mount and purge cycles of a mixed dashboard return to baseline heap and contexts.

### V2-C9 — Bundle strategy for v2 growth · P0 · M

Evidence: full ESM 540.0 kB of 542 kB; ceiling 560 kB needs an ADR to move
(`docs/release/bundle-size.md:5-13, 175-178`).

- [ ] Rule in CONTRIBUTING: new families ship as opt-in packages or lazy chunks.
- [ ] Find 15–20 kB to give the default bundle working room; candidates are the 76 locale format
      tables, schema descriptions already stripped (ADR-020), and troika.
- [ ] A size entry and budget for every new package in this file.

Acceptance: the full bundle has at least 3% headroom when the first v2 minor ships.

### V2-C10 — WebGPU backend · P2 · XL

Start when: V2-B3 is done and a spike shows a win on a real workload (compute binning for V2-C3
or large-graph simulation). Scope then: TSL ports of the primitives, a backend flag, a second
visual baseline set. Deferred by ADR-009 and B:929.

### V2-C11 — OffscreenCanvas rendering · P2 · L

Start when: V2-D4 has moved hover labels off the DOM, since `Chart` requires an `HTMLElement`
and overlays are DOM/SVG today (`runtime/src/fx/labels.ts:10-11`).

---

## Track D: export and headless

| ID    | Item                                             | Pri | Size | Prior ID    |
| ----- | ------------------------------------------------ | --- | ---- | ----------- |
| V2-D1 | SVG export for 2D charts                         | P0  | XL   | S3.4, E18.2 |
| V2-D2 | PDF export                                       | P1  | M    | E18.2       |
| V2-D3 | Headless rendering: Node API, CLI, image service | P1  | L    | E18.6       |
| V2-D4 | Exports match the screen                         | P1  | M    | E5.7        |
| V2-D5 | Large images, clipboard and data export          | P1  | M    | E18.8       |

### V2-D1 — SVG export for 2D charts · P0 · XL

Evidence: `toImage` rejects anything but PNG, JPEG and WebP
(`packages/runtime/src/export/image.ts:73`); `apps/docs/guides/export.md:128-133` lists SVG and
PDF as unsupported. Plotly users expect `format: 'svg'`. See decision 3.

- [ ] Split the story: a vector emitter interface that each primitive implements beside its
      GPU draw (rect, line, marker, text, fill, arc).
- [ ] Cartesian, pie and polar first; then hierarchy, sankey, finance and tables.
- [ ] Text as real `<text>` with embedded or referenced fonts.
- [ ] Heatmap, image and 3D embed as raster inside the SVG, labelled in the output.
- [ ] A visual suite that rasterises the SVG and compares it with the canvas baseline.
- [ ] Lazy chunk; no cost to the default bundle.

Acceptance: 2D gallery examples export to SVG that opens in Inkscape and Illustrator with
editable text, within a set pixel tolerance of the PNG.

### V2-D2 — PDF export · P1 · M

- [ ] PDF from the V2-D1 emitter, with embedded fonts and CMYK-safe colours noted in the guide.

Acceptance: a figure exports to a single-page vector PDF at a stated physical size.

### V2-D3 — Headless rendering: Node API, CLI, image service · P1 · L

Evidence: export "needs a `document`" (`packages/runtime/src/api.ts:255`); `guides/ssr.md:38`
says server rendering is unsupported; no package has a `bin`. There is no Kaleido equivalent.

- [ ] `@mk7s/holochart-export`: figure JSON in, PNG or SVG out, through a managed headless
      Chromium; pure-Node SVG once V2-D1 has no DOM dependency.
- [ ] A `holochart` CLI: `export`, `validate`, `schema`.
- [ ] A container image for use as an export service.
- [ ] Used by V2-H3 for Python `write_image`.

Acceptance: `npx holochart export fig.json -o fig.png` works on a machine with no display.

### V2-D4 — Exports match the screen · P1 · M

Evidence: hover labels, spikes and modebar are DOM overlays that exports leave out
(`runtime/src/export/image.ts:7-8`); "a WebGL label renderer is planned (E5.7)"
(`core/src/config/schema.ts:182-187`); annotation `hovertext` is "declared; hover labels for
annotations are not drawn yet" (`core/src/layout/annotation-attributes.ts:148, 156`).

- [ ] A WebGL hover label renderer on the SDF text path, selectable with `hoverRenderer`.
- [ ] Annotation hover labels.
- [ ] An option to include the current hover and selection state in an export.
- [ ] Rich labels that wrap and ellipsize (`render/src/primitives/text-layout.ts:115`).

Acceptance: an export taken with a hover label showing contains that label.

### V2-D5 — Large images, clipboard and data export · P1 · M

Evidence: export fails above the GPU's drawing-buffer size (`runtime/src/export/image.ts:93-98`);
clipboard copy is listed as unsupported in the export guide.

- [ ] Tiled rendering for images beyond the buffer limit.
- [ ] Copy image to clipboard; download the plotted data as CSV; modebar buttons for both.

Acceptance: a 16k-pixel-wide poster exports on a GPU with a 4096 limit.

---

## Track E: chart catalogue

| ID     | Item                                                        | Pri | Size | Prior ID            |
| ------ | ----------------------------------------------------------- | --- | ---- | ------------------- |
| V2-E1  | Plotly mock corpus runner and importer                      | P0  | L    | S3.1, E20.7, E18.4  |
| V2-E2  | `scattergl` and `scatterpolargl` aliases; loss-aware import | P0  | S    | PC04                |
| V2-E3  | Tile maps: `scattermap`, `choroplethmap`, `densitymap`      | P0  | XL   | GEO9, PC22, ADR-027 |
| V2-E4  | Ternary subplot and `scatterternary`                        | P1  | L    | E11.6, PC23         |
| V2-E5  | Smith subplot and `scattersmith`                            | P2  | L    | PC24                |
| V2-E6  | Carpet family                                               | P2  | XL   | E11.7, PC25         |
| V2-E7  | Quiver and 2D streamline                                    | P1  | M    | E11.8–9, PC26       |
| V2-E8  | Dendrogram figure factory                                   | P2  | M    | E11.10, B:1050      |
| V2-E9  | Scatter-family attribute tail                               | P1  | M    | B:599-610           |
| V2-E10 | Bar, funnel, waterfall and pie attribute tail               | P1  | M    | —                   |
| V2-E11 | Cross-trace schema parity                                   | P1  | M    | —                   |
| V2-E12 | World calendars and display time zones                      | P1  | L    | E3, R11             |
| V2-E13 | Layout, axis, legend and colorbar parity                    | P1  | L    | S3.2, B:599-610     |
| V2-E14 | Math text                                                   | P2  | L    | PC13, P:599         |
| V2-E15 | 3D trace completeness                                       | P1  | M    | —                   |
| V2-E16 | Trace interaction polish                                    | P1  | M    | —                   |
| V2-E17 | Promote geo and graph to stable                             | P1  | L    | GEO2–10, G1–10      |
| V2-E18 | Express gaps                                                | P1  | M    | P:2155              |
| V2-E19 | Holochart-only extras                                       | P2  | L    | B:929-943           |

### V2-E1 — Plotly mock corpus runner and importer · P0 · L

Evidence: the 1.0 goal is "importer renders ≥ 80% of the plotly.js mock corpus" (`plan.md:72-77`);
`tools/mock-runner` does not exist. Without it, the ranking of V2-E9 to V2-E13 is guesswork.

- [ ] Pin a Plotly.js version and vendor its mocks under a licence note.
- [ ] A runner that imports each mock, records dropped attributes and unsupported traces, and
      renders a side-by-side page.
- [ ] Publish the coverage percentage in the docs and gate regressions in CI.
- [ ] Re-rank V2-E9 to V2-E13 from its report.

Acceptance: a published number, and a list of the top 20 dropped attributes by mock count.

### V2-E2 — `scattergl` and `scatterpolargl` aliases; loss-aware import · P0 · S

Evidence: neither name is registered; `scattergl` appears only as template data
(`packages/themes/src/shared.ts:114`). Plotly figures using them lose those traces.

- [ ] Register both as aliases of the GPU-drawn `scatter` and `scatterpolar`.
- [ ] One warning per figure listing every dropped trace type and attribute.

Acceptance: a `scattergl` figure from Plotly's docs renders with no change to its JSON.

### V2-E3 — Tile maps: `scattermap`, `choroplethmap`, `densitymap` · P0 · XL

Evidence: GEO9 is 0 of 6 (B:865-878); no tile provider exists in `traces-geo`. ADR-027
(Proposed) chooses MapLibre as an optional peer with a DOM layer; spike G measured 1M markers at
6.8 ms on an overlay canvas and found the nine-map context limit.

- [ ] New package `@mk7s/holochart-traces-map` with `layout.map` and the three traces.
- [ ] Camera sync both ways; hover, selection and `relayout` events in map coordinates (V2-B6).
- [ ] `densitymap` on a float render target, with a SwiftShader-safe fallback.
- [ ] Style and tile-provider configuration with no default third-party request.
- [ ] Accept legacy `*mapbox` trace names as aliases.
- [ ] Its own visual harness; a second WebGL library behaves differently under SwiftShader
      (B:925).
- [ ] First version limits, stated in the docs: Mercator only, `below` ignored (ADR-027:78-81).

Acceptance: Plotly's tile-map documentation examples render, pan and hover.

### V2-E4 — Ternary subplot and `scatterternary` · P1 · L

- [ ] `layout.ternary` with a/b/c axes on the polar subplot's pattern; depends on V2-B5, V2-B6.
- [ ] `scatterternary` reusing scatter modes; Express `scatterTernary`, `lineTernary`.

Acceptance: Plotly's soil-triangle example renders with hover and zoom.

### V2-E5, V2-E6, V2-E8, V2-E14, V2-E19 — P2 catalogue items

| ID     | Scope                                                                                                                           | Start when                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| V2-E5  | `layout.smith`, `scattersmith`                                                                                                  | V2-E4 has shipped its subplot scaffolding      |
| V2-E6  | `carpet`, `scattercarpet`, `contourcarpet`                                                                                      | V2-E1 shows real demand in the corpus          |
| V2-E8  | `ff.dendrogram` on the graph package's dendrogram layout                                                                        | V2-E17 has stabilised the graph package        |
| V2-E14 | LaTeX in titles, ticks and annotations, as a lazy chunk                                                                         | V2-D1 text emitter exists, so math exports too |
| V2-E19 | Mesh loaders (STL, OBJ, PLY, glTF), beeswarm, adaptive bins, extruded candles, city treemap, animated streamtube flow, 3D gauge | V2-E1 corpus gate is met (decision 7)          |

### V2-E7 — Quiver and 2D streamline · P1 · M

Evidence: both are on the "after 1.0" list (B:929); cone and streamtube already hold the vector
maths. PC:13-15 notes Plotly gained a native `quiver` trace.

- [ ] An instanced arrow primitive; `quiver` trace matching Plotly's attributes.
- [ ] `ff.streamline` in Express.

Acceptance: Plotly's quiver examples render unchanged.

### V2-E9 — Scatter-family attribute tail · P1 · M

Evidence: "Not yet declared (deferred): `marker.gradient`, `marker.angleref`, `marker.standoff`,
`line.backoff` and `scattermode: 'group'`" (`traces-basic/src/scatter/attributes.ts:10`); the
same gaps repeat in `scattergeo`, `scatterpolar` and `splom`. Scatter has no `cliponaxis`,
`xhoverformat` or `yhoverformat`.

- [ ] Implement once in the shared marker and line code; enable in all four traces.
- [ ] `scatterpolar` `fillpattern`; `scattergeo` `marker.line.dash`.

Acceptance: the V2-E1 report shows none of these attributes dropped.

### V2-E10 — Bar, funnel, waterfall and pie attribute tail · P1 · M

Evidence: bar `cliponaxis: false` "is not drawn yet" (`bar/attributes.ts:240`);
`marker.pattern.path` missing on bar and pie; funnel and waterfall lack `marker.pattern` and
hover formats (`funnel/attributes.ts:8`, `waterfall/attributes.ts:9`); pie lacks `automargin` and
per-slice legend attributes (`pie/attributes.ts:7`); error-bar `traceref` has no effect.

- [ ] Each attribute implemented or marked compatibility-only (V2-B7).
- [ ] Remove deferral notes that are already stale (`bar` `marker.colorbar`, pie `uniformtext`).

Acceptance: as V2-E9.

### V2-E11 — Cross-trace schema parity · P1 · M

Evidence: absent in every trace package: `hovertemplatefallback`, `texttemplatefallback`, font
`variant`/`textcase`/`lineposition`/`shadow`. `parcoords` lacks `line.coloraxis`; `table` lacks
rich text in cells.

- [ ] Template fallbacks in core's template engine, then one schema change per trace.
- [ ] Font variants in the SDF text path.

Acceptance: generated types match Plotly's schema for these attributes on all 40 traces.

### V2-E12 — World calendars and display time zones · P1 · L

Evidence: "reserved for world calendars (plan E3) and currently yield `undefined`"
(`packages/core/src/data/dates.ts:129-131`); `xcalendar` and friends are deferred in histogram,
box, heatmap, contour, surface, mesh3d and isosurface. No `timezone` reference exists in
`packages/core/src`.

- [ ] Calendars as a lazy chunk, registered like locales.
- [ ] A display time zone on date axes, with DST-correct ticks and hover.

Acceptance: a figure with `xcalendar: 'persian'` and a named time zone formats both correctly.

### V2-E13 — Layout, axis, legend and colorbar parity · P1 · L

Evidence: absent from every engine package: `insiderange`, `tickson`, `labelalias`,
`ticklabelindex`, `hoversubplots`, `minreducedwidth`. From B:599-610: `tickmode: 'sync'`,
colorbar `tickformatstops` and minor ticks, legend `grouped+reversed` and `maxItemWidth`,
`layer: below traces` tick labels, `unhover` payloads, hierarchy clicks without a DOM event,
animation of dates and categories.

- [ ] Rank by V2-E1; build in corpus order.
- [ ] Hierarchy `level` transitions through `animate` and `react` (sunburst, treemap, icicle).

Acceptance: the top 20 dropped layout attributes in the V2-E1 report are implemented.

### V2-E15 — 3D trace completeness · P1 · M

Evidence: isosurface `contour` missing (`isosurface/index.ts:20`); surface `refineData` and
highlight-line projections (`surface/index.ts:26`); cone `material` (`cone/attributes.ts:8`).
Globe markers are not depth-tested and the globe has no perspective, tilt or lighting attributes
(ADR-028:100-123).

- [ ] Each attribute above; globe depth test.

Acceptance: `isosurface` moves from partial to full in the chart-type table.

### V2-E16 — Trace interaction polish · P1 · M

Evidence: sankey has no `node.hoverlabel`, `link.hoverlabel` or box/lasso grouping
(`sankey/index.ts:10`); violin's hovered-value line "is not drawn here" (`violin/hover.ts:6`);
parcats lacks band and path strokes and drag transitions (`parcats/index.ts:9`); `histogram2d`
has no selection.

- [ ] Each item above, with an interaction spec.

Acceptance: `sankey` and `parcats` move from partial to full.

### V2-E17 — Promote geo and graph to stable · P1 · L

Evidence: both packages are opt-in and experimental; GEO2–GEO8 residue (B:705-861), GEO10's 25
missing baselines, and the G1–G10 left-open lists (B:991-1167) are open; the graph layout worker
is off by default; `graph3d` has no animated layout, worker or LOD (ADR-029:126). 50m
reprojection costs 89–95 ms per frame against 2.3 ms for the shader path (spike F).

- [ ] Close the residue lists; CI baselines for both packages.
- [ ] Shader projection for flat maps if rotation at 50m must be smooth (ADR-025's condition).
- [ ] Graph worker on the shared host (V2-B2); `graph3d` animated layout.
- [ ] Modebar buttons for geo and 3D (V2-F3).

Acceptance: both packages drop `@experimental` from their public traces.

### V2-E18 — Express gaps · P1 · M

Evidence: wide-form data is "the biggest Express gap" (B:599-610, `plan.md:2155`); no ternary or
tile-map builders; `ff` holds only `distplot`; "rolling: center is not supported with a time-span
window", "ewm: sum is not implemented with adjust=false" (`express/src/stats/window.ts:187, 381`);
"imshow: binaryFormat … is not supported" (`express/src/charts/imshow.ts:444`).

- [ ] Wide-form input across the cartesian builders.
- [ ] Builders for each new family in this track as it lands.
- [ ] The three thrown limits above.

Acceptance: plotly.express documentation examples that use wide-form data port line for line.

---

## Track F: interaction, theming and accessibility

| ID    | Item                                                 | Pri | Size | Prior ID      |
| ----- | ---------------------------------------------------- | --- | ---- | ------------- |
| V2-F1 | Editable mode                                        | P1  | L    | E6.7          |
| V2-F2 | Linked charts                                        | P1  | M    | —             |
| V2-F3 | Modebar and event completeness                       | P1  | M    | —             |
| V2-F4 | Shape legend entries; new and active selection style | P1  | S    | B:599-610     |
| V2-F5 | Keyboard reach for every trace and every build       | P0  | M    | S2.14 residue |
| V2-F6 | Theme tokens and automatic colour scheme             | P1  | M    | E8.4          |
| V2-F7 | Right-to-left layouts and reviewed translations      | P1  | L    | S2.15 residue |

### V2-F1 — Editable mode · P1 · L

Evidence: of the ten `config.edits` flags only `annotationPosition`, `annotationTail` and
`shapePosition` are read (`components/src/annotations/annotations.ts:124-129`,
`components/src/shapes/shapes.ts:566-573`). There is no in-place text editing and no draggable
legend or colorbar.

- [ ] Draggable legend and colorbar, emitting `relayout`.
- [ ] In-place editing of title, axis titles, legend text and annotation text through a DOM
      overlay that keeps the DOM mirror in step.
- [ ] Keyboard equivalents for every drag.

Acceptance: every `config.edits` flag changes behaviour and has an interaction spec.

### V2-F2 — Linked charts · P1 · M

Evidence: nothing links two `Chart` instances today; `guides/dashboards.md` is a draft. Plotly
has `hoversubplots` inside one figure only, so this is where Holochart can lead.

- [ ] A `linkCharts` helper: shared hover, shared selection by `ids` or `customdata`, shared
      axis ranges.
- [ ] Crossfilter example with four charts; works with the shared renderer.

Acceptance: brushing one chart filters three others at 60 fps on 100k rows.

### V2-F3 — Modebar and event completeness · P1 · M

Evidence: 27 Plotly button names warn as unsupported, including every 3D, geo and map button
(`packages/components/src/modebar/buttons.ts:236-262`). `ChartEvents` has no `buttonclicked`,
slider or `beforehover` events (`packages/runtime/src/events.ts:106-182`).

- [ ] 3D, geo and map buttons, registered by the package that owns the subplot.
- [ ] The missing events, with `plotly_*` aliases.

Acceptance: only `sendDataToCloud` and `editInChartStudio` remain in the unsupported set.

### V2-F4 — Shape legend entries; new and active selection style · P1 · S

Evidence: "Legend entry for this shape (declared; not drawn yet)"
(`components/src/shapes/schema.ts:99, 101`); `newselection` and `activeselection` are absent.

- [ ] Draw shape legend entries; add both selection style containers.

Acceptance: the attributes render as in Plotly's shape and selection examples.

### V2-F5 — Keyboard reach for every trace and every build · P0 · M

Evidence: the script-tag build has no 2D keyboard stops; `surface`, `mesh3d`, `cone`,
`streamtube`, `isosurface`, `volume` and `bar3d` have no point stops; `image`, `splom`, `table`
and `indicator` are not navigable (B:481-491). WebKit has a `fixme` at
`tests/interaction/keyboard.spec.ts:87`.

- [ ] Point or region stops for each trace above; the lazy keyboard chunk in the IIFE build.
- [ ] Extend the axe sample to every chart family and shrink its allow-list.
- [ ] A screen-reader pass with VoiceOver and NVDA, recorded like the browser checklist.

Acceptance: every registered trace type has a keyboard spec, and the stated WCAG 2.1 AA claim
names what was tested.

### V2-F6 — Theme tokens and automatic colour scheme · P1 · M

Evidence: no CSS-variable tokens, no `watchColorScheme`
(`apps/docs/customization/themes-templates.md:278-282`); `defineTheme` takes built-in names only
(`packages/themes/src/index.ts:101`). ADR-021 keeps dark as the default; this item does not
reopen that.

- [ ] Templates that read CSS custom properties from the host element and update on change.
- [ ] `template: 'auto'` following `prefers-color-scheme`, with a light and dark pair.
- [ ] `defineTheme` for user themes, with the contrast tests available as a helper.
- [ ] Remove the deprecated `holochart-dark` alias (ADR-021:97).

Acceptance: toggling the page's colour scheme restyles a chart without a `relayout` call.

### V2-F7 — Right-to-left layouts and reviewed translations · P1 · L

Evidence: bidi works inside labels only; nothing mirrors, page `dir` is ignored, and Arabic and
Hebrew have no UI strings (`apps/docs/fundamentals/locales.md:236-262`). Ten locales carry
machine-translated a11y strings with no review (`packages/locales/src/index.ts:5-8`). The
locale test asserts only "at least 20" of 76.

- [ ] `dir`-aware layout: y-axis side, legend, colorbar, modebar, hover label alignment.
- [ ] Arabic and Hebrew UI strings; native review of all translated strings.
- [ ] Visual baselines with real RTL glyphs.
- [ ] Decide whether number and date formatting moves to `Intl` (cuts bundle size; see V2-C9).

Acceptance: a chart inside `dir="rtl"` mirrors, with baselines to prove it.

---

## Track G: frameworks and embedding

| ID    | Item                                          | Pri | Size | Prior ID      |
| ----- | --------------------------------------------- | --- | ---- | ------------- |
| V2-G1 | `<holo-chart>` web component                  | P0  | M    | S3.3          |
| V2-G2 | React, Vue, Svelte and Angular wrappers       | P0  | L    | S3.3, E18.5   |
| V2-G3 | Bundler fixtures and SSR recipes run for real | P0  | M    | S2.9 residue  |
| V2-G4 | Script-tag reach: geo, graph and CDN variants | P1  | M    | B:861, B:1142 |
| V2-G5 | Plotly compatibility facade                   | P2  | M    | PC05, P:2542  |
| V2-G6 | Arrow adapters in core                        | P2  | M    | E1.10         |

### V2-G1 — `<holo-chart>` web component · P0 · M

Evidence: no wrapper package exists (`apps/docs/getting-started/installation.md:288`).

- [ ] A custom element with `figure`, `config` and `template` properties, events re-dispatched
      as DOM events, resize handling, and cleanup on disconnect.
- [ ] Works in the shared-renderer mode and under a strict CSP.

Acceptance: the element works in plain HTML and is the base of each wrapper in V2-G2.

### V2-G2 — React, Vue, Svelte and Angular wrappers · P0 · L

Evidence: the React, Svelte and Angular recipes in `apps/docs/guides/frameworks.md` "were never
run in their frameworks" (line 25). `react()` diffing already exists in runtime.

- [ ] One package per framework: typed props from the generated figure types, event props, a
      ref to the `Chart`, StrictMode and HMR safe, server-render safe (renders a sized
      placeholder).
- [ ] A fixture app per framework in `tests/package`, run in CI.
- [ ] Wrappers join the Changesets fixed group or version on their own; decide which.

Acceptance: each wrapper's fixture mounts, updates, resizes and unmounts with no leak.

### V2-G3 — Bundler fixtures and SSR recipes run for real · P0 · M

Evidence: install fixtures cover only `node-esm`, `types`, `vite` and `html`
(`tests/package/fixtures.ts:20`).

- [ ] Fixtures for Next.js (app router), webpack 5, Rollup, esbuild, Parcel and Jest/Vitest.
- [ ] Worker and lazy-chunk loading verified in each (needed by V2-B2).

Acceptance: every bundler named in the installation guide has a passing fixture.

### V2-G4 — Script-tag reach: geo, graph and CDN variants · P1 · M

Evidence: geo and graph are not in either IIFE build; prebuilt variant bundles were deferred
(`docs/release/bundle-size.md:1125-1127`).

- [ ] Add-on IIFE files for geo, graph and map, on the 3D add-on's pattern.
- [ ] Named variants (basic, cartesian, finance, full) with budgets.

Acceptance: a single HTML file draws a choropleth from a CDN.

---

## Track H: Python

| ID    | Item                                         | Pri | Size | Prior ID        |
| ----- | -------------------------------------------- | --- | ---- | --------------- |
| V2-H1 | Publish `holochart-py` to PyPI               | P0  | M    | roadmap M8      |
| V2-H2 | Two-way sync and binary transport            | P0  | L    | W:217, 528, 817 |
| V2-H3 | Full catalogue and static output from Python | P1  | L    | W:817           |
| V2-H4 | More notebook hosts                          | P1  | M    | SITE-26         |
| V2-H5 | Streamlit and Dash components                | P2  | M    | —               |
| V2-H6 | Python package hygiene                       | P1  | S    | —               |

### V2-H1 — Publish `holochart-py` to PyPI · P0 · M

Evidence: `packages/holochart-py/pyproject.toml:7` has `version = "0.0.0"`; no workflow
publishes it; `python.yml` tests Python 3.10/3.12/3.14 × Plotly 5/6/7 × anywidget 0.9/0.10/0.11.

- [ ] Confirm the PyPI name; version the wheel from the npm release it embeds.
- [ ] A release job with trusted publishing, sdist and wheel checks, and an install test from
      the built wheel.
- [ ] Dependabot for the pip ecosystem; `python.yml:30` is still on `checkout@v4`.

Acceptance: `pip install holochart-py` followed by `fig.show(renderer="holochart")` draws a chart
in a fresh environment.

### V2-H2 — Two-way sync and binary transport · P0 · L

Evidence: the widget syncs four traits (`src/holochart/widget.py:31-61`) and nothing flows back
(`README.md:61-62`). The figure is JSON in a `traitlets.Any`, replaced whole on each update, with
no binary buffers (`widget.py:28, 40`).

- [ ] Click, hover, selection and relayout events to Python callbacks; `selected_points` and
      current axis ranges as readable traits.
- [ ] Incremental updates (`restyle`, `relayout`, `extend_traces`) instead of full replacement.
- [ ] NumPy and Arrow columns sent as binary buffers, using the engine's typed-array path.

Acceptance: a selection in the browser is readable in the next cell, and a 5M-point NumPy array
reaches the chart without JSON encoding.

### V2-H3 — Full catalogue and static output from Python · P1 · L

Evidence: geo and graph are not in the wheel (`README.md:66`); static and nbconvert export are
unsupported (line 67); there is no `to_html` or `write_image`. The wheel inlines about 3.2 MB.

- [ ] Geo, graph and map as lazily loaded assets, not inlined.
- [ ] `to_html` (standalone and CDN modes); `write_image` through V2-D3.
- [ ] A static PNG fallback mime type so notebooks render on GitHub and in nbconvert.

Acceptance: a saved notebook shows its charts as images where widgets cannot run.

### V2-H4 — More notebook hosts · P1 · M

Evidence: JupyterLab 4.6 and Notebook 7.6 are verified; VS Code, Colab, Binder and JupyterLite
are not (`apps/docs/python/environments.md:22-27`). SITE-26's launcher buttons wait on this.

- [ ] Verify or fix each host and marimo; record GPU and widget-manager caveats.
- [ ] Run the real-host check on more than the 3.14 leg.

Acceptance: the environments page lists each host as verified, with a dated run.

### V2-H6 — Python package hygiene · P1 · S

Evidence: imports the private `plotly.io._base_renderers` (`src/holochart/renderer.py:4`); no
`py.typed`, ruff or mypy; 10 pytest functions.

- [ ] Public Plotly API only; type hints with `py.typed`; ruff and mypy in CI.

Acceptance: mypy strict passes and no private Plotly import remains.

---

## Track I: documentation and developer experience

| ID    | Item                                              | Pri | Size | Prior ID      |
| ----- | ------------------------------------------------- | --- | ---- | ------------- |
| V2-I1 | Playground with shareable links                   | P0  | L    | S3.9, E19.6   |
| V2-I2 | Versioned docs and migration tooling              | P0  | M    | S3.10, E19.12 |
| V2-I3 | Finish the stub and draft pages                   | P0  | M    | B:395-399     |
| V2-I4 | Example attribute coverage from 34% to 70%        | P1  | M    | S3.12         |
| V2-I5 | Docs pipeline: previews, `llms.txt`, site residue | P1  | S    | SITE-22–28    |

### V2-I1 — Playground with shareable links · P0 · L

Evidence: `apps/docs/playground/index.md` is a stub; the sandbox is not deployed
(`apps/docs/README.md:77`).

- [ ] An editor with figure JSON and JS modes, typed completion from the generated types, and
      state in the URL.
- [ ] "Open in playground" and StackBlitz links on every example; bundled sample datasets.
- [ ] A "paste a Plotly figure" mode that shows the V2-E2 loss report.

Acceptance: a bug report can link to a playground URL that reproduces it.

### V2-I2 — Versioned docs and migration tooling · P0 · M

- [ ] Versioned paths with a switcher; the alpha docs stay reachable.
- [ ] A changelog-driven migration page per minor; codemods for renamed attributes.

Acceptance: a link to a versioned page keeps working after the next release.

### V2-I3 — Finish the stub and draft pages · P0 · M

Evidence (`status: stub` or `draft` in front matter): `migration.md`,
`getting-started/from-d3.md`, `from-chartjs.md`, `extending/custom-trace.md`,
`extending/component-plugin.md`, `extending/trace-module-contract.md`,
`customization/three-objects.md`, `customization/extrusion-2-5d.md`, `customization/index.md`,
`guides/frameworks.md`, `guides/ssr.md`, `guides/dashboards.md`.

- [ ] Extending pages after V2-B8; frameworks after V2-G2; SSR after V2-D3; dashboards after
      V2-F2.
- [ ] A docs gate that fails the build on a stub linked from navigation.

Acceptance: no stub or draft page is reachable from the sidebar.

### V2-I5 — Docs pipeline: previews, `llms.txt`, site residue · P1 · S

- [ ] PR preview deployments; `docs.yml` fails loudly when deploy secrets are missing.
- [ ] `llms.txt` and a machine-readable attribute index (E19).
- [ ] SITE-22, 23, 25, 27 and 28 stay in `backlog-site.md`; this item tracks them as a gate.

Acceptance: every docs PR has a preview link.

---

## Track J: quality, release and governance

| ID    | Item                                                  | Pri | Size | Prior ID    |
| ----- | ----------------------------------------------------- | --- | ---- | ----------- |
| V2-J1 | Real browsers, devices and a second baseline platform | P0  | L    | S2.5, E20.5 |
| V2-J2 | Supply-chain and security scanning                    | P0  | S    | —           |
| V2-J3 | Coverage and CI hygiene                               | P1  | S    | —           |
| V2-J4 | Governance, support and privacy                       | P1  | S    | —           |

### V2-J1 — Real browsers, devices and a second baseline platform · P0 · L

Evidence: the manual pass on real Safari and Firefox was never run (B:278, 290). All 863 visual
baselines are Chromium on SwiftShader in one Linux container; 90 examples are tagged
`no-visual-test`. Firefox and WebKit run nightly for interaction and bundle only, with `fixme`
at `tests/bundle/iife-3d.spec.ts:49, 266` and `tests/interaction/context-loss.spec.ts:140`. No
iOS, Android or hardware GPU is tested, and `versioning.md:159` and `browser-support.md:12-13`
disagree on minimum versions.

- [ ] Run the manual checklist; state minimum browser versions once.
- [ ] A hardware-GPU smoke suite on real Safari, iOS Safari and Android Chrome.
- [ ] Clear the four browser `fixme`s; touch gestures beyond Chromium.
- [ ] An issue opened automatically when a nightly fails.

Acceptance: the browser support page lists tested versions with dated runs.

### V2-J2 — Supply-chain and security scanning · P0 · S

Evidence: no CodeQL, OSV, audit or SBOM step exists under `.github/`; actions are pinned by tag.

- [ ] CodeQL, dependency review on PRs, an SBOM attached to each release.
- [ ] Actions pinned by commit SHA; least-privilege `permissions` on every workflow.

Acceptance: the OpenSSF Scorecard run has no high-severity finding.

### V2-J3 — Coverage and CI hygiene · P1 · S

Evidence: thresholds cover core, runtime, render and trace `calc*.ts` only
(`vitest.config.ts:54-67`); components, express, themes and locales have none. The comment at
`.github/workflows/ci.yml:170` gives a stale spec count. 3D hover specs flake under CPU load.

- [ ] Thresholds for components and express; a published coverage summary.
- [ ] Isolate the 3D hover specs in their own shard.

Acceptance: every package under `packages/` has a coverage threshold.

### V2-J4 — Governance, support and privacy · P1 · S

Evidence: single-owner `CODEOWNERS`; no GOVERNANCE, SUPPORT or FUNDING file; no stated telemetry
stance. Fallback fonts are fetched from a CDN for missing glyphs (`README.md:163`), and tile maps
(V2-E3) will add third-party requests.

- [ ] GOVERNANCE and SUPPORT pages; a release cadence; the 6-month previous-major window from
      `versioning.md:111-114` restated where users look.
- [ ] A privacy page: no telemetry, every network request the library can make, and how to turn
      each one off.

Acceptance: the privacy page is linked from the README and is true under a network-blocked test.

---

## Track K: exploratory, not scheduled

Recorded so they are neither lost nor started early. All are P2.

| ID    | Idea                                                     | Source              | Start when                                       |
| ----- | -------------------------------------------------------- | ------------------- | ------------------------------------------------ |
| V2-K1 | HDR and wide-gamut output                                | `research.md`       | V2-C10 decided; both "argue for WebGPU" (R:229)  |
| V2-K2 | `@mk7s/holochart-video` and `apps/studio`                | `research.md`       | V2-D3 gives deterministic headless frames        |
| V2-K3 | Shader hooks, post-processing, SSAO, bloom               | E8.8, E8.12         | V2-B8 frozen, so hooks have a stable contract    |
| V2-K4 | GPU graph simulation; `graph3d` LOD and edge bundling    | B:1101, ADR-029:126 | V2-E17 done and a user has a graph that needs it |
| V2-K5 | Flat-to-globe transition; globe perspective and lighting | B:848, ADR-028      | V2-E15 globe depth test done                     |
| V2-K6 | GraphML import                                           | B:1133              | Someone asks                                     |
| V2-K7 | 10m basemap as a separately hosted asset                 | ADR-024:129         | V2-G4 has an asset-loading story                 |

---

## Suggested waves

Up to four agents per wave, as in `backlog.md`. Items in one cell are independent of each other.

| Wave | Items                                                            | Notes                                                                |
| ---- | ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| W0   | V2-A1, V2-A2, V2-B7 + V2-E2, V2-J2                               | Truth and hygiene. Small, and unblocks honest planning.              |
| W1   | V2-E1, V2-C1, V2-B1, V2-B5                                       | The two measuring tools and the refactor everything else leans on.   |
| W2   | V2-B2, V2-B4 + V2-B6, V2-B3, V2-A3                               | Contract changes. V2-B2 is the long pole; start it first.            |
| W3   | V2-B8, V2-G1 then V2-G2, V2-G3, V2-C8                            | Freeze, then wrappers on the frozen surface. Candidate beta (V2-A4). |
| W4   | V2-D1, V2-E3, V2-H1 then V2-H2, V2-I1                            | The four headline v2 features.                                       |
| W5   | V2-E9–E13 by corpus rank, V2-F5, V2-C3, V2-D3                    | Parity depth and scale.                                              |
| W6   | V2-E4 + V2-E7, V2-E17, V2-F1 + V2-F2, V2-H3 + V2-H4              | Catalogue growth and authoring.                                      |
| W7   | V2-F6 + V2-F7, V2-C5–C7, V2-D2 + V2-D4 + V2-D5, V2-I2–I5 + V2-J1 | Finish. V2-C9 and V2-J3–J4 run alongside every wave.                 |

Critical path: V2-B1 → V2-B2 → V2-B8 → V2-G2, and V2-B1 → V2-D1 → V2-D3 → V2-H3. V2-E1 decides
the order inside W5 and should not wait.

## ID map: earlier backlogs to this one

| Earlier item                                               | Here                       |
| ---------------------------------------------------------- | -------------------------- |
| S3.1 corpus and importer                                   | V2-E1                      |
| S3.2 parity gaps                                           | V2-E9–E13, V2-E18          |
| S3.3 wrappers and web component                            | V2-G1, V2-G2               |
| S3.4 SVG export                                            | V2-D1, V2-D2               |
| S3.5 plugin API freeze                                     | V2-B8                      |
| S3.6 spikes C/D, ADR-004/005                               | V2-A2                      |
| S3.7 worker calc and memory pools                          | V2-B2, V2-C8               |
| S3.8 performance harness                                   | V2-C1                      |
| S3.9 playground                                            | V2-I1                      |
| S3.10 versioned docs and codemods                          | V2-I2                      |
| S3.11 split `chart.ts`                                     | V2-B1                      |
| S3.12 example attribute coverage                           | V2-I4                      |
| GEO9 tile maps                                             | V2-E3                      |
| GEO2–8, GEO10, G1–G10 residue                              | V2-E17                     |
| After 1.0: carpet, ternary, quiver, streamline, dendrogram | V2-E6, E4, E7, E7, E8      |
| After 1.0: WebGPU, OIT                                     | V2-C10, V2-C7              |
| After 1.0: image server, Arrow adapters, editable mode     | V2-D3, V2-G6, V2-F1        |
| After 1.0: shader hooks, post-processing, SSAO             | V2-K3                      |
| After 1.0: CSS-variable themes                             | V2-F6                      |
| After 1.0: 2.5D/3D extras, beeswarm, adaptive bins         | V2-E19                     |
| plan E16.7 OffscreenCanvas, E16.10 marker fast path        | V2-C11, V2-C3              |
| plan E14.11 3D performance                                 | V2-C6                      |
| plan LaTeX, camelCase converter                            | V2-E14, V2-G5              |
| PC04, PC05, PC13, PC22–PC26                                | V2-E2, G5, E14, E3–E7      |
| PC30 non-WebGL2 fallback                                   | Non-goal (decision 8)      |
| `research.md` HDR, video                                   | V2-K1, V2-K2               |
| SITE-22–28 residue                                         | V2-I5 (tracked, not moved) |
| Site: browser-to-Python events, static notebooks           | V2-H2, V2-H3               |

## How this was put together, and what was not checked

Four read-only audits covered the engine packages, the trace packages, the earlier planning
documents and everything around them (Python, docs, tests, CI). Nothing was built, run or
benchmarked for this file.

- **Checked directly against the tree at 1e5e4cd:** the `makeSubplots` rejection, the dead config
  flags, the modebar unsupported set, the disabled bench job, package and Python versions, pre
  mode, the `three` peer range, `chart.ts` line count, API report tag counts, and the stub page
  list.
- **Taken from the audits without re-reading every line:** the per-trace deferral notes and their
  line numbers, the residue line ranges in `backlog.md`, and the ADR conditions.
- **Taken from documents, not measured:** every performance number, the 540.0 kB bundle size, and
  coverage percentages. All timing figures come from one M1 Max.
- **Not looked at:** issue tracker or user demand. Priorities here follow Plotly parity and the
  project's own stated goals, not requests from users. V2-E1 is the first thing that would
  replace that guess with data.
- **Known soft spots:** trace maturity ("full" or "partial") was read from schemas and header
  notes, not from rendering. `config.edits.titleText` has matches in the source that were not
  traced to a reader, so V2-F1 may be one flag smaller than stated.
