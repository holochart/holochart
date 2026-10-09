# Holochart backlog for Plotly.js comparability

Reviewed October 2, 2026 against checkout **44953a7** and the working tree. This backlog
prioritizes the work needed for developers to choose Holochart for the same jobs as Plotly.js:
interactive analytics, scientific figures, financial dashboards, embedded application charts,
and exported reports.

**Recommendation:** establish a tested migration contract, fix the observed test failure, and
ship a usable alpha before expanding the renderer. Holochart already has substantial chart
coverage. The largest adoption gaps are unverified compatibility, production reliability,
publication export, integration, and missing coordinate systems.

The comparison baseline is **Plotly.js 4.1.1**, shown as the latest release when reviewed.
Its recent changes include native TypeScript support and quiver, so the older plan's assumptions
need updating. See the [official releases](https://github.com/plotly/plotly.js/releases).
The official [figure reference](https://plotly.com/javascript/reference/index/) supplies the
current chart catalogue. These sources establish the comparison target; priorities and acceptance
thresholds below are recommendations, not measurements of current parity.

This document orders **remaining work**. It complements [plan.md](../plan.md) and the existing
[ship backlog](../backlog.md); their story IDs are reused below. Completed implementations should
not be rebuilt because an older checkbox remains open. No implementation, release, or external
issue creation is part of this review.

## What the review established

| Area                  | Current evidence                                                                                                                                                                                                                                                                                                                                                                              | Product implication                                                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chart breadth         | The live full-bundle registry contains 35 trace types: 34 names shared with Plotly's current catalogue and Holochart's bar3d. See [generated figure types](../packages/holochart/src/generated/figure.ts) and [bundle registration](../packages/holochart/src/index.ts).                                                                                                                      | Basic, distribution, finance, hierarchy, polar, and 3D implementations already exist. Trace count alone does not establish attribute or behavioral parity.          |
| Migration             | Direct defaults probes return invisible, unregistered traces for scattergl and scatterpolargl. Their equivalents are metadata, not aliases. The [compatibility page](../apps/docs/reference/plotly-compat.md) and [migration guide](../apps/docs/getting-started/from-plotly.md) remain stubs.                                                                                                | Common existing figures can lose traces on import. There is no published, tested compatibility percentage.                                                          |
| Public API            | [Functional functions](../packages/runtime/src/api.ts) accept HTMLElement and resolve to Chart. Plotly accepts element IDs too, and exposes figure data on the graph element.                                                                                                                                                                                                                 | Similar function names do not make existing integrations work unchanged. A compatibility facade needs an explicit contract.                                         |
| Schema and behavior   | [Schema generation](../tools/schema-gen/src/generate.ts) writes the core JSON schema using an empty registry; its traces object is empty. The runtime registry and generated TypeScript types are populated. [tickmode sync](../packages/core/src/layout/schema.ts) is accepted but behaves as auto; [shape legends](../packages/components/src/shapes/schema.ts) are declared but not drawn. | A schema-key comparison would both miss implemented traces and overstate implemented attributes unless its input and status model are corrected.                    |
| Reliability           | [RenderRoot](../packages/render/src/core/render-root.ts) owns one WebGL context per figure; [raster export](../packages/runtime/src/export/image.ts) creates another chart. Browser suites currently use Chromium with SwiftShader.                                                                                                                                                           | Large dashboards, concurrent exports, and actual browser/GPU combinations need dedicated validation. A universal context limit cannot be assumed.                   |
| Export and typography | [ImageFormat](../packages/runtime/src/export/types.ts) allows PNG, JPEG, and WebP. LaTeX remains explicitly unsupported in the [text guide](../apps/docs/fundamentals/hover-text-templates.md).                                                                                                                                                                                               | Scientific and publication workflows need SVG and mathematical text.                                                                                                |
| Accessibility         | DOM summaries, a table view, keyboard navigation, reduced motion, and touch handling exist. [Keyboard navigation](../packages/runtime/src/fx/keyboard.ts) excludes several families; only pie currently provides the domain keyboardPoints hook.                                                                                                                                              | Extend and audit the existing system instead of adding a second accessibility layer.                                                                                |
| Performance           | A real-GPU benchmark exists. Its [September 30 report](perf/gpu-benchmarks.md) records 695 ms heatmap first draw against a 100 ms target and 262 ms surface first draw against 50 ms. The [CI benchmark job](../.github/workflows/ci.yml) is disabled.                                                                                                                                        | Performance is promising but not yet a reproducible advantage over Plotly. Those older numbers are one heavily loaded M1 Max run, not current cross-device results. |
| Distribution          | Generated public types, package fixtures, package linting, ESM/CDN builds, and alpha prerelease mode exist. [Release documentation](release/releasing.md) still describes first-publication setup; package versions are 0.0.0.                                                                                                                                                                | Complete and verify the public installation path. npm account configuration and registry publication were not inspected in this review.                             |

For the functional comparison, use Plotly's
[function reference](https://plotly.com/javascript/plotlyjs-function-reference/).
For export, Plotly supports SVG and documents that WebGL portions can remain raster images
inside it; Holochart need not invent fully vectorized 3D to match that expectation.
See [static export](https://plotly.com/javascript/static-image-export/).

The current catalogue also contains eleven distinct types absent from Holochart's registry:
scattergeo, choropleth, scattermap, choroplethmap, densitymap, scatterternary, scattersmith,
carpet, scattercarpet, contourcarpet, and quiver. The two GL aliases are an additional migration
gap. This is a name inventory, not a claim that every existing implementation is complete.

## Verification performed

- **Unit suite:** pnpm test completed with **4,852 passed and 1 failed across 335 files**.
  The doubles property in
  [delaunay.test.ts](../packages/traces-3d/src/scatter3d/delaunay.test.ts) failed. A targeted
  replay reproduced the same assertion; PC01 captures it.
- **Workspace types:** pnpm typecheck passed all **18 tasks**, with 16 results from the Turbo
  cache and two executed. This does not replace a fresh packed-package check.
- **Browser sample:** export.spec.ts, keyboard.spec.ts, and touch.spec.ts passed
  **25 tests** in Chromium with SwiftShader, using the existing interaction configuration.
- **Direct source probes:** confirmed 35 registered traces, both missing GL aliases, and the
  empty trace section in the checked-in core JSON schema.
- **Inspection:** reviewed public APIs, schema/defaulting, exports, rendering lifecycle,
  accessibility, packages, CI, benchmark reports, docs, and existing plans.

This was not a full visual audit or a fresh GPU benchmark. Firefox, WebKit, physical mobile
devices, the entire interaction suite, all visual examples, package publication, and the upstream
Plotly mock corpus were not run. No percentage of behavioral parity is claimed.

## Delivery priorities and release gates

P0 establishes correctness and a credible adoption path. P1 makes the initial supported scope
usable in production. P2 expands that scope to the broader Plotly.js product. P2 items remain
necessary for a broad comparability claim even if they do not block an earlier focused release.

Sizes are rough **engineering effort per item**, including tests and documentation:
S = 1–3 days, M = 4–8 days, L = 2–4 weeks, XL = more than four weeks and must be split before
scheduling. They are not calendar commitments. Owner labels identify the responsible discipline,
not an assigned person.

| Gate                                   | Work                                                                           | Proposed acceptance                                                                                                                                                                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Installable alpha                      | PC01, PC02, PC04–PC06, and the first PC03 report                               | Observed failure resolved; documented examples install from an actual package; common GL aliases migrate; unsupported input produces actionable diagnostics; API differences are explicit. Full corpus parity is not required for an alpha.                            |
| Production beta for the declared scope | PC03 and PC07–PC19                                                             | All agreed critical workflows pass; at least 95% of the pinned in-scope corpus passes semantic checks, with visual differences reviewed; documented browser matrix passes; dashboard, export, framework, accessibility, and performance gates are met.                 |
| Broad Plotly.js alternative            | Beta gate plus PC21–PC26, with PC20 and PC27–PC30 according to published scope | Maps and missing scientific coordinate systems work; each claimed family passes its migration and interaction suite. Retain the existing plan's at least 80% all-corpus gate, but publish the full denominator, exclusions, and separate behavior and rendering rates. |

Do not equate “rendered without throwing” with “correct.” The scorecard must separately report
schema acceptance, native rendering, converted rendering, numerical correctness, visual review,
and interaction behavior. Unsupported figures remain visible in the all-corpus denominator.
Extensions such as bar3d do not offset missing Plotly functionality.

## P0 Correctness and a usable migration path

### PC01 Resolve the reproducible triangulation property failure

**Owner:** Numerical geometry. **Size:** M. **Dependencies:** none.
**Reuses:** E14.2 and E20.2.

The current full suite is red. The in-circle assertion received 1.0000000003853055e-9 where
it requires a value below 1e-9. The production algorithm and test oracle both use floating-point
in-circle calculations, so the cause is not yet established as a rendering defect.

- Preserve the seven-point counterexample below as a regression and compare it against a
  robust predicate/reference. Determine whether the algorithm, oracle, or tolerance is wrong.
- Pass the replay and seeded geometry suite without disabling the property or loosening the
  threshold without a numerical justification. Re-run the full unit suite.

Replay the search and shrink with:

    FC_SEED=-1467415740 pnpm test packages/traces-3d/src/scatter3d/delaunay.test.ts -t 'doubles, with non-finite entries'

The minimized input was:

    [[0,-3.3648132358384157],
     [-999.9999830551591,0],
     [-999.9996863820454,-0.0000010218917931847928],
     [0,-3.364813235838416],
     [-999.9999835720006,0],
     [999.9996863751684,0],
     [0,0]]

### PC02 Define and generate the compatibility contract

**Owner:** Core and developer experience. **Size:** M. **Dependencies:** none.
**Reuses:** S2.10, E18.4, E20.7.

Generate a full-bundle schema from registered modules, alongside any intentionally core-only
schema. Populate a compatibility manifest pinned to the selected Plotly version. Treat this as
a prerequisite to a reliable coverage report.

- Assert that full-bundle schema trace names match all 35 currently registered types and include
  component/trace layout attributes. Partial bundles produce their own accurate manifests.
- Give each API, trace, and attribute a status: supported, partial, converted, unsupported, or
  unverified, with evidence. Mark tickmode sync and shape legends partial until their behavior
  lands. Audit other declared configuration switches rather than treating declaration as support.
- Generate the public compatibility page and reconcile README, ARCHITECTURE.md, roadmap,
  plan.md, and backlog status. Replace the README's “every Plotly chart family” claim with the
  tested scope. CI catches stale generated outputs.

### PC03 Build the Plotly comparison corpus

**Owner:** Quality engineering. **Size:** L. **Dependencies:** PC02; expand with PC04.
**Reuses:** S3.1, E20.7.

Pin upstream schema, mock fixtures, license notices, and renderer version. Run representative
figures through both libraries with the same viewport, fonts, data, and a Plotly-compatible
template. Existing Holochart screenshots alone cannot detect compatibility differences.

- Start with at least 100 curated fixtures across existing families and 20 application workflows:
  updates, streaming, linked subplots, legend actions, animation, hover/selection, export, and
  figure serialization. Add the complete pinned upstream corpus incrementally.
- Compare calculated bins, statistics, ranges, colors, visible traces, and event payloads.
  Review visual differences with tolerances appropriate to GPU versus SVG text and edges.
- Publish per-family and all-corpus results with denominators, conversion counts, expected
  differences, failures, and pinned versions. Fail CI on regressions; every accepted exception
  has a reason and a fixture. A blank figure never counts as a successful render.

### PC04 Implement a loss-aware Plotly importer and aliases

**Owner:** Core and migration. **Size:** M. **Dependencies:** PC02.
**Reuses:** S3.1, E18.4.

[Registry lookup](../packages/core/src/registry/registry.ts) uses exact trace names;
[supplyTrace](../packages/core/src/defaults/supply-defaults.ts) hides unregistered types.
Existing JSON decoding already handles Plotly-style typed arrays and should be reused.

- Map scattergl to scatter and scatterpolargl to scatterpolar, including their template data.
  Preserve trace IDs, customdata, frames, axes, and explicit styling; return path-specific
  diagnostics for unsupported attributes and traces.
- Test real Plotly JSON and plotly.py encoded arrays through
  [figureFromJSON](../packages/runtime/src/json.ts). Strict import rejects data loss; permissive
  import returns a conversion report instead of silently presenting an incomplete chart.
- Keep conversion separate from native parity reporting. Add migration fixtures for missing
  packages in partial bundles and for figures containing both supported and unsupported traces.

### PC05 Make functional API compatibility explicit

**Owner:** Runtime. **Size:** L. **Dependencies:** PC02, PC04.
**Reuses:** E7.1 and S2.10.

Provide an opt-in compatibility facade so the existing Chart API can remain coherent. Confirm
the target behavior against Plotly's function and event references before changing public returns.

- Support graph element IDs as well as elements, expected promise return values, graph-element
  event registration/removal, and documented data/layout access within the declared facade.
  Implement supported equivalents or explicit exclusions for validate, resize, and template APIs.
- Port integration fixtures for newPlot, react, restyle, relayout, update, trace operations,
  frames, Fx, export, and purge. Test nested attribute paths, scalar/array broadcasting,
  null versus undefined, invalid elements, and promise rejection behavior.
- Include a runnable before/after migration example. Clearly state that internal Plotly private
  fields and arbitrary Dash integrations are not an implied compatibility guarantee.

### PC06 Complete the alpha installation and release path

**Owner:** Release engineering. **Size:** M. **Dependencies:** PC01, PC02, PC04, PC05.
**Reuses:** S1.1; retain completed S1.2–S1.9 work.

The checked-in alpha mode and package checks are already implemented. Remaining work is an
end-to-end release rehearsal and verified public consumption.

- Pack the intended prerelease and test its actual tarballs in Node, TypeScript, Vite, a
  framework application, and plain HTML, including the optional 3D bundle.
- Complete the repository's existing publishing setup and review process, publish the intended
  dist-tag when authorized, then verify registry metadata, fonts, types, CDN URLs, and
  documentation commands from a clean consumer directory.
- Produce release notes, compatibility limitations, upgrade guidance, and a rollback procedure.
  Close S1.6 as implemented after its package tests pass; do not regenerate a second type system.

## P1 Production quality for the supported chart families

### PC07 Bound WebGL contexts across dashboards and exports

**Owner:** Rendering architecture. **Size:** L. **Dependencies:** PC02.
**Reuses:** S2.1, E2.16, ADR-004.

Choose shared rendering, a bounded renderer pool, or another measured design. Account for
hidden charts and exports as well as visible charts. Set an explicit context budget rather than
depending on a browser-specific maximum.

- Demonstrate a 40-chart dashboard that can scroll, resize, hover, update, and export without
  context eviction or blank charts. Measure both active context count and memory.
- Queue/reuse export rendering resources within the budget; preserve live chart state and
  interaction. Cover multiple owners/documents and teardown in integration tests.
- Document limits, allocation policy, and fallback behavior in a revised ADR.

### PC08 Verify lifecycle recovery and constrained GPUs

**Owner:** Runtime and rendering. **Size:** M. **Dependencies:** none; integrate with PC07.
**Reuses:** S2.2, S2.3, S2.6, E20.6.

Build on the existing mount-failure cleanup and WebGLUnavailableError rather than replacing them.

- Force context loss and restoration on representative 2D, 3D, image, and lit-material charts.
  Rebuild GPU-only targets, resume animation safely, and settle pending update/export promises.
- Test initially hidden containers, zero-to-positive sizing, detach/remount, DPR changes,
  iframe ownership, and resize during updates. Read device limits for textures/render targets
  and provide diagnostics when a requested size cannot be supported.
- Run at least 100 mount/update/export/destroy cycles; demonstrate bounded DOM, listener,
  renderer-resource, and heap counts after warm-up. Treat config.pixelRatio as existing functionality.

### PC09 Establish browser and application-environment support

**Owner:** Quality engineering. **Size:** L. **Dependencies:** none.
**Reuses:** S2.5, S2.9, E20.5.

The Chromium sample passed, but it does not prove Safari, Firefox, physical touch, or restrictive
application environments.

- Add Firefox and WebKit integration projects and publish a versioned support matrix. Use
  real Safari/iOS and Android checks for representative GPU, font, touch, and memory behavior;
  Playwright WebKit is not the whole Safari qualification process.
- Add runnable Next.js/Nuxt client-loading fixtures and strict-CSP examples for workers,
  fonts, images, and styles. Verify existing no-worker text configuration.
- Gate the documented environments in CI or a release checklist with recorded results.
  Failures in an unsupported environment produce an actionable fallback.

### PC10 Close interaction and update semantics gaps

**Owner:** Runtime interaction. **Size:** L. **Dependencies:** PC03, PC05.
**Reuses:** S3.2, E5, E6, E7.

[unhover](../packages/runtime/src/fx/interaction.ts) currently emits an empty points list.
Existing selection, streaming, and animation systems should be checked against the target
contract before adding more interaction modes.

- Preserve the last hovered points in unhover; verify customdata, original indices after
  filtering/aggregation, hierarchy events, legend cancellation, unified hover, and selection payloads.
- Cover uirevision, selection persistence, datarevision, reordered trace IDs, simultaneous
  update calls, bounded streaming, and frame interruption. Exercise numeric, date, and category axes.
- Keep mouse, touch, keyboard, and programmatic actions consistent; pass the corpus workflows
  without unnecessary remounts or loss of user state.

### PC11 Complete report layout and common attribute behavior

**Owner:** Components and axes. **Size:** L. **Dependencies:** PC03.
**Reuses:** S3.2, E3, E5.

Prioritize attributes that change interpretation or break dashboard/report composition.
Confirmed starting points are tickmode sync and shape legend entries.

- Implement synchronized ticks and shape legend display/group toggling with visual and
  interaction tests, including multiple legends, subplots, log axes, and reversed ranges.
- Use corpus failures to close annotation hover, colorbar formatting, label clipping,
  automargins, uniform text, and mixed-trace layout gaps. Do not assume every candidate is missing.
- Audit the pinned Plotly version's newer legend/hover controls and defaults, including
  groupdoubleclick and the changed double-click delay. Put deliberate differences in the
  compatibility profile instead of silently changing Holochart defaults.

### PC12 Add publication-quality SVG export

**Owner:** Export and rendering. **Size:** XL. **Dependencies:** PC02, PC03.
**Reuses:** S3.4, E18.2.

Split into vector scene description, export backend, and family coverage. The first slice
should cover scatter/line/bar with axes, titles, legends, annotations, and shapes.

- Export those primitives as real SVG paths/text with clipping, dashes, symbols, patterns,
  opacity, and selectable text. Embedding the entire chart as a PNG does not satisfy this item.
- Extend to the remaining declared 2D scope; use explicit raster layers for 3D or dense
  GPU-only content, with a documented fidelity table.
- Compare export against the live figure at several sizes, including embedded images and
  custom fonts. Test missing/CORS-blocked assets and ensure exports do not alter chart state.

### PC13 Render mathematical text consistently

**Owner:** Text rendering. **Size:** L. **Dependencies:** PC02; integrate with PC12.
**Reuses:** E2.10.

Add an optional math renderer for scientific titles, axes, annotations, and trace labels.
Plotly supports MathJax; see its [official integration notes](https://github.com/plotly/plotly.js#mathjax).

- Render representative equations, subscripts, superscripts, multiline expressions, and mixed
  rich text with correct measurement, wrapping, and baseline alignment.
- Make raster/SVG exports and accessibility text agree with the displayed figure.
  Handle asynchronous font/math loading and malformed input without blanking the chart.
- Keep the dependency optional and document CSP, loading, supported syntax, and bundle impact.

### PC14 Extend and audit accessibility across chart families

**Owner:** Accessibility and trace authors. **Size:** L. **Dependencies:** PC08, PC10.
**Reuses:** S2.14, S2.15, E17, E20.8.

This is a product-quality target, not an assertion that Plotly already meets every criterion.

- Add keyboard navigation for heatmap cells, histogram bins, distributions, hierarchy/flow
  nodes, polar points, and scatter3d; provide usable camera controls and summaries for other 3D types.
- Preserve focus through updates; audit modebar, sliders, menus, table view, high contrast,
  reduced motion, and announcements. Combine automated checks with NVDA and VoiceOver tasks.
- Translate navigation/status strings for the documented locale set, test RTL and non-Latin
  labels, and state any remaining text-layout limitations.

### PC15 Publish reproducible performance comparisons

**Owner:** Performance engineering. **Size:** M. **Dependencies:** PC03.
**Reuses:** S3.8, E16.1.

Extend the existing GPU harness; do not create competing benchmark infrastructure.

- Compare pinned Holochart and Plotly builds on identical hardware, datasets, visible density,
  DPR, interaction scripts, and comparable renderer modes. Include small charts, 1M-point
  scatter, long lines, streaming, heatmaps, surfaces, and multi-chart dashboards.
- Record cold/warm load, JS transfer and parse cost, first visible frame, ready time,
  interaction p50/p95, long tasks, peak memory, and export latency. Publish raw runs and variance.
- Enable controlled CPU/size regression checks in ordinary CI and a hardware benchmark lane.
  Use a proposed 10% regression budget only after measuring noise; never substitute
  SwiftShader numbers for GPU performance claims.

### PC16 Reduce expensive first draws and dense-line costs

**Owner:** Rendering performance. **Size:** L. **Dependencies:** PC15.
**Reuses:** S2.16, E11.1, E14.3, E16.9, E16.10.

The historical heatmap and surface misses are better starting points than unmeasured shader
optimizations.

- Profile calc, allocations, upload, shader compilation, text, and layout independently;
  remeasure the 4096² heatmap and 1024² surface against the existing 100/50 ms targets.
- Optimize data packing, buffer reuse, and line/dash work where measured. Preserve hover
  identity, precision, gaps, and scientific values when introducing decimation or LOD.
- Close the measured gaps or explicitly revise unrealistic budgets with evidence. Retain
  responsiveness and bounded memory on a representative integrated GPU, not just a high-end Mac.

### PC17 Ship and maintain a React integration

**Owner:** Framework integration. **Size:** M. **Dependencies:** PC05, PC08.
**Reuses:** S3.3, E18.5.

React is the first proposed wrapper because it offers a direct path for an existing
[react-plotly.js workflow](https://plotly.com/javascript/react/).

- Provide typed figure props, event callbacks, a chart ref, efficient updates, resize,
  loading/error states, and cleanup. Pass Strict Mode remounts and rapid prop changes.
- Include client-only SSR guidance and preserve user state through uirevision.
- Test a published/packed wrapper in a real application, including two linked charts,
  selection filters, streaming, theme changes, and unmount during export.

### PC18 Stabilize the public API and extension contracts

**Owner:** Architecture and developer experience. **Size:** M. **Dependencies:** PC02, PC05.
**Reuses:** S2.13, S3.5, E22.

Generated trace types and the plugin registry exist. Focus on keeping consumer code stable.

- Snapshot public exports/types for each package, including exactOptionalPropertyTypes
  fixtures; require reviewed API diffs. Mark experimental render/internal surfaces explicitly.
- Document lifecycle, disposal, errors, schema extension, custom traces/components, and
  supported custom-scale behavior. Supply one external plugin fixture that builds from tarballs.
- Split runtime/chart.ts only around demonstrated ownership/testing boundaries. A line-count
  refactor alone is not a product milestone and must not delay compatibility fixes.

### PC19 Finish adoption documentation and runnable examples

**Owner:** Documentation and developer experience. **Size:** L. **Dependencies:** PC02,
PC04, PC05; incorporate PC09, PC12, PC17.
**Reuses:** S2.9–S2.12, S3.9, S3.10, S3.12, E19.

- Finish migration, data formats, updates, configuration, performance, framework/SSR, dashboard,
  and troubleshooting pages using tested code. Separate working capability from reserved schema.
- Add an editable playground with schema completion, validation messages, shareable examples,
  and a “compare with Plotly” path for the curated corpus.
- Provide versioned docs and release notes. Gate public examples for correct links, no console
  errors, matching package versions, and relevance; keep primitive-only internal examples out
  of the default getting-started path.

## P2 Broader comparability and remaining adoption workflows

### PC20 Move expensive calculations off the main thread

**Owner:** Runtime performance. **Size:** L. **Dependencies:** PC08, PC15.
**Reuses:** S3.7, E16.5, E16.6, ADR-011.

The schema declares config.worker; the current chart orchestration needs a verified implementation
and an honest status for it.

- Start with measured blocking work such as volume/isosurface calculation, streamtube
  integration, and binning. Support transferables, cancellation, superseded updates, and teardown.
- Worker and synchronous modes produce equivalent results; auto mode uses measured thresholds.
  Report peak memory and input latency as well as elapsed calculation time.
- Retain a tested synchronous/CSP fallback. Promote this item to P1 if PC15 identifies it as
  necessary to meet the beta responsiveness gate.

### PC21 Add projected geographic charts

**Owner:** Geographic rendering. **Size:** XL. **Dependencies:** PC02, PC03, PC07.
**Reuses:** E15.1–E15.3.

- Implement layout.geo, scattergeo, and choropleth in an optional package: projection,
  locations/GeoJSON joins, fitbounds, geographic styling, hover, selection, and colorbars.
- Cover holes, multipolygons, the antimeridian, missing joins, multiple geo subplots, and
  export. Use pinned geographic assets with attribution and an offline configuration.
- Publish family-specific migration results; do not count a geographic screenshot as an
  interactive implementation.

### PC22 Add tile maps with current Plotly trace names

**Owner:** Geographic integration. **Size:** XL. **Dependencies:** PC02, PC03, PC07.
**Reuses:** E15.5 and related map stories.

Target scattermap, choroplethmap, densitymap, and layout.map. Plotly v4 removed the Mapbox
trace names; the [official migration guide](https://plotly.com/javascript/maplibre-migration/)
identifies the MapLibre replacements.

- Establish how a map renderer shares or coordinates GPU resources with Holochart; budget
  this optional dependency separately. Do not force map code into ordinary chart bundles.
- Match pan/zoom, camera state, hover/selection, geographic fills, density coloring, legends,
  events, and raster export. Test rotated/pitched maps and geographic edge cases.
- Document tile/style attribution, user-provided providers, keys, offline behavior, and network
  failures. Offer legacy-name conversion only as an explicit migration feature.

### PC23 Add ternary charts

**Owner:** Scientific traces. **Size:** L. **Dependencies:** PC02, PC03.
**Reuses:** E11.6.

- Implement layout.ternary and scatterternary with normalization/sum, axis titles/ticks,
  lines/fills/markers, clipping, hover, selection, and subplot composition.
- Verify zero/negative/missing components, explicit axis limits, label geometry, JSON import,
  keyboard navigation, and SVG/raster export using scientific fixtures.

### PC24 Add Smith charts

**Owner:** Scientific traces. **Size:** L. **Dependencies:** PC02, PC03.
**Reuses:** new gap relative to the existing ship backlog.

- Implement layout.smith and scattersmith with the impedance transform, grid/labels,
  marker/line styling, hover values in original units, and subplot placement.
- Validate known impedance points, singularities, clipping, updates, and export against the
  pinned Plotly reference; add an RF engineering example and accessibility summary.

### PC25 Add carpet coordinate systems

**Owner:** Scientific traces. **Size:** XL. **Dependencies:** PC02, PC03.
**Reuses:** E11.10.

- Split into carpet geometry/axes, scattercarpet, and contourcarpet. Preserve the mapping
  between a/b values and plotted x/y coordinates, including nonuniform grids.
- Verify interpolation, boundaries, clipping, tick/grid styling, hover coordinates, linked
  traces, and export. Each slice gets upstream fixtures before the family is marked supported.

### PC26 Add the current quiver trace

**Owner:** Scientific traces. **Size:** M. **Dependencies:** PC02, PC03.
**Reuses:** E11.7, updated for native Plotly quiver.

- Follow the pinned native trace schema and defaults for vector positions, components,
  scaling, arrow geometry, colors, and hover rather than only reproducing a Python figure factory.
- Test zero vectors, anisotropic axes, missing values, zoom, clipping, legends, and export.
  Use instanced/batched geometry and demonstrate bounded draw calls for dense fields.

### PC27 Complete editable chart interactions

**Owner:** Components and interaction. **Size:** L. **Dependencies:** PC10, PC11.
**Reuses:** E6.7.

Shape drawing and parts of annotation interaction already exist. Audit the exposed editable
and edits options to identify the remaining promised behavior.

- Make supported titles, annotations, shapes, and legend positions editable with consistent
  commit/cancel behavior, keyboard access, and predictable relayout payloads.
- Preserve edits through the documented revision model and JSON serialization; emit explicit
  diagnostics for editing modes outside the support contract.

### PC28 Support automated report generation

**Owner:** Export tooling. **Size:** M. **Dependencies:** PC08, PC12, PC13.
**Reuses:** E18.6 and the remaining E18.2 scope.

- Provide a supported headless recipe/CLI taking a figure and explicit fonts/assets to PNG,
  SVG, and PDF via an appropriate export/conversion path. Bound concurrency and GPU contexts.
- Test deterministic sizing, font loading, remote-asset failures, timeouts, and batch memory.
  Document the distinction between browser toImage and a server/report pipeline.
- Include figure JSON download using the existing serializer; assess the newer Plotly
  full-json/defaulted-output behavior separately rather than changing input-preserving JSON silently.

### PC29 Improve tabular authoring and secondary framework integrations

**Owner:** Developer experience. **Size:** L, split into independent deliverables.
**Dependencies:** PC08, PC17, PC18. **Reuses:** E18.5, E23.

Express already accepts rows, columns, and Arrow-like tables in
[table.ts](../packages/express/src/data/table.ts). Extend it based on actual authoring gaps.

- Add wide-form multi-series input with predictable labels, grouping, facets, and animation
  behavior; retain typed-array and Arrow-like support and test missing values.
- Ship Vue and Svelte integrations and a web component in demand order, reusing the React
  lifecycle contract and packed-consumer tests.
- Keep Express convenience and ecosystem breadth separate from Plotly.js core compatibility
  scores. Do not make a Python/notebook bridge a prerequisite for the JavaScript release.

### PC30 Provide a useful path when WebGL2 is unavailable

**Owner:** Rendering and accessibility. **Size:** L. **Dependencies:** PC12, PC14.
**Reuses:** S1.8 as completed foundation; additional product capability.

The current readable error and summary are useful, but GPU-only rendering remains a deployment
constraint relative to SVG-based basic charts.

- Reuse the SVG scene/export work for an optional static 2D fallback or define a separate
  rendering fallback after a measured spike. Offer a table/data view with export.
- Test disabled GPU, context creation failure, and recovery, preserving the original figure
  and avoiding repeated failed renderer allocation.
- Publish the supported fallback families and interaction limits. If static fallback is the
  chosen scope, describe it precisely rather than claiming full non-WebGL interactive parity.

## Recommended execution order

1. **Establish the baseline:** PC01, PC02, and the first PC03 fixtures. Reconcile old statuses
   and agree the exact compatibility profile before assigning a parity percentage.
2. **Make migration usable:** PC04, PC05, PC06, and the migration portion of PC19. Validate
   three reference applications: a financial dashboard, a scientific report, and a linked
   analytics dashboard. Include real imported figures, not only Holochart-authored examples.
3. **Qualify production use:** PC07–PC11 and PC14–PC18. Start PC12's export design early because
   it is a substantial architecture task; integrate PC13 and finish PC19.
4. **Broaden the product:** PC21–PC26 in demand order, with maps and ternary as the proposed
   first additions. Schedule PC20 and PC27–PC30 by measured performance and adoption blockers.
   Evaluate each release against its declared gate rather than tying it to old milestone numbers.

The first five implementation tickets should be **PC01, PC02, PC03's initial slice, PC04, and
PC05's contract fixtures**. They remove uncertainty and prevent compatibility regressions from
accumulating while later work proceeds.

## Work that should not distract from comparability

Defer new HDR/video-studio work from [research.md](../research.md), WebGPU, extra 2.5D effects,
custom shader/postprocessing features, and new Holochart-only chart families until the initial
production gate is met. Existing extrusion, 3D materials, themes, and Express remain strengths
to preserve and demonstrate.

Already implemented work to retain includes schema-generated public figure types, alpha
prerelease mode, metadata/exports hygiene, package-consumer fixtures, callback error isolation,
mount/teardown error handling, configurable pixel ratio, Chart JSON serialization, typed-array
encoding, basic keyboard and touch behavior, and duck-typed Arrow input in Express. Their
remaining work is qualification, documentation, or targeted extension—not reimplementation.
