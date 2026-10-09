# Holochart website redesign backlog

Created: 2026-10-09. Updated: 2026-10-09. Waves 1–3 technical work and Wave 4 cookbook/demo/discovery expansion implemented on `codex`; human review, hosted launch verification and deployment remain gates.
Checked items are implemented in the current working tree, not published or deployed.

## Outcome

Make the website a dense, example-led charting resource: visitors should immediately see
what Holochart can draw, find the right chart family, copy a complete example, and get a chart
running in their own environment. Python and Jupyter notebooks should be a first-class entry
point alongside JavaScript and TypeScript.

Density means more useful charts, code, and navigation per screen, with clear hierarchy and
readable text. Favor compact layouts, curated example grids, short explanations, and visible
next steps over a large marketing hero or long sequences of isolated full-width embeds.

This backlog covers the website, documentation, public examples, downloadable notebooks, and
the tooling needed to keep them accurate. Library features and package publishing remain in
`plan.md` and `backlog.md`; reference those dependencies here instead of silently promising
new runtime capabilities. A website redesign can ship with a clearly labeled source-install
path before packages are published.

## Repository baseline

This is a source review of the current working tree, including existing uncommitted changes,
not an audit of the deployed website. Recheck release status and counts during implementation.

| Area              | Current evidence                                                                                                                                       | Redesign implication                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Homepage          | `apps/docs/index.md` uses the VitePress home layout, one SVG hero, three actions, and six feature descriptions.                                        | Put working examples, category previews, and environment-specific starts in the first screens.                 |
| Visual system     | `.vitepress/theme/custom.css` already provides dark surfaces, compact typography, and chart-aligned colors; `.vitepress/config.ts` forces dark mode.   | Build on the existing identity; prioritize layout and content density over a cosmetic rebrand.                 |
| Gallery           | `Gallery.vue` has search, category/trace/tag/3D filters, thumbnail cards, a live detail dialog, and URL state.                                         | Preserve useful behavior while replacing folder-derived browsing with a clear chart-family hierarchy.          |
| Inventory         | `public/gallery/manifest.json` currently contains 785 entries, including 275 under `demos`.                                                            | Curate and expose existing work first; raw example totals are not evidence of easy discovery.                  |
| Categories        | `tools/gallery-gen/src/manifest.ts` derives `category` from the first segment of an example ID.                                                        | Chart types, features, Express examples, and demos currently share one category axis. Separate these concepts. |
| Chart docs        | `charts/` and `.vitepress/sidebar.ts` already group charts into Basic, Statistical, Scientific, Financial, Hierarchical, 3D, Maps, and Network graphs. | Reconcile gallery taxonomy with chart navigation instead of building an unrelated second system.               |
| Example component | `Example.vue` has live rendering, highlighted TypeScript, copy, and optional sandbox links; `live-examples.ts` bounds live charts.                     | Extend the existing pipeline for language variants and denser previews; preserve GPU lifecycle management.     |
| Python            | `guides/notebooks.md` and `packages/holochart-py/README.md` describe a working anywidget bridge and Plotly renderer.                                   | Expand a single guide into an onboarding path, examples, troubleshooting, and API documentation.               |
| Python artifacts  | There are currently no `.ipynb` files under `examples/`.                                                                                               | Add actual downloadable, executable notebooks, not only Python code fences.                                    |
| Availability      | The installation docs say npm is unpublished; the Python README says PyPI is unpublished.                                                              | Show commands that work for the documented release state; gate future package-manager paths.                   |
| Cookbook          | `cookbook/index.md` is a stub.                                                                                                                         | Turn common charting tasks into a second discovery path that links back to chart categories.                   |
| Quality tooling   | Docs already have page linting, snippet checks, gallery consistency checks, and render checks.                                                         | Extend existing gates for taxonomy, Python, notebooks, and new routes.                                         |

Paths in the table are relative to `apps/docs/` unless another root is specified.

## Success criteria

These are proposed launch targets, not measured results. Record a baseline in SITE-01.

- A new visitor reaches either the Python/Jupyter quick start or a JavaScript quick start in
  one click from the homepage.
- Every chart family has a browsable landing page, distinct subtypes, meaningful thumbnails,
  and a direct route to examples and chart documentation.
- At 1440 × 900, the homepage shows its main proposition, both language entry points, and at
  least six chart previews without scrolling. The gallery shows at least eight readable cards
  in its initial viewport. Verify the actual layout rather than achieving this by shrinking text.
- At 390 px wide and at 200% browser zoom, navigation and examples remain usable without
  page-level horizontal scrolling; code and wide data tables may scroll inside their containers.
- Every featured example has complete runnable source, an explanation of the data, support
  metadata, and a related guide. Unsupported Python variants never appear as runnable options.
- Ship at least 12 executed starter notebooks and at least 24 curated gallery examples with
  tested Python variants across at least six bridge-supported chart families.
- In five observed first-use sessions spanning Python and JavaScript users, at least four users
  can locate a requested chart example within 30 seconds and render a starter chart within
  five minutes after prerequisites are installed. Track source-build setup time separately.
- Existing gallery links, example anchors, and guide URLs continue to resolve after rollout.

## Information architecture

### Primary navigation and page roles

Use **Get started**, **Gallery**, **Python & Jupyter**, **Guides**, **Reference**, and **Demos**
as the primary destinations. Keep Playground visible as an action where it can actually run an
example. Put release status, changelog, migration, and GitHub in secondary navigation.

| Proposed route                       | Purpose and content                                                                                                                |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                  | Compact introduction, Python/JavaScript starts, representative chart grid, category directory, useful recipes, and selected demos. |
| `/getting-started/`                  | Environment chooser: Python/Jupyter, JavaScript/TypeScript, plain HTML, and existing Plotly figures.                               |
| `/getting-started/python-jupyter`    | Shortest complete notebook path: environment, installation, imports, first output, one update, next steps.                         |
| `/getting-started/javascript`        | Complete browser application setup, chart, update, sizing, and cleanup.                                                            |
| `/getting-started/html`              | Plain HTML and browser bundle path with accurate source-build or release instructions.                                             |
| `/python/`                           | Notebook learning path, downloads, tested environment matrix, Python API, and common failures.                                     |
| `/python/notebooks/`                 | Notebook collection grouped by learning task and chart family.                                                                     |
| `/python/plotly`                     | Plotly Express and graph_objects workflows, renderer selection, and compatibility limits.                                          |
| `/python/widgets`                    | Direct widget construction, replacement updates, dimensions, and Python-driven controls.                                           |
| `/python/troubleshooting`            | Kernel mismatch, blank outputs, widget manager, WebGL2, missing assets, and unsupported traces.                                    |
| `/gallery/`                          | Family directory with small curated preview groups; an explicit “All examples” view remains available.                             |
| `/gallery/<family>/`                 | Dedicated family page, subtype navigation, filters, curated starters, and full family collection.                                  |
| `/gallery/example/<example-id>`      | Shareable example detail page using the existing slash-separated example ID.                                                       |
| `/charts/` and existing chart routes | Learning and technique documentation, linked bidirectionally to the corresponding gallery family/subtype.                          |
| `/cookbook/`                         | Task-oriented recipes such as confidence bands, date axes, subplots, and dashboard layouts.                                        |
| `/demos/`                            | Curated complete applications and reports, separate from individual chart variations.                                              |
| `/reference/python`                  | Exact public bridge signatures, defaults, accepted values, and limitations.                                                        |

All routes are proposed site-relative paths. Preserve the configured `/holochart/` base through
VitePress helpers; never embed it in content or hardcode a localhost sandbox URL.

### Gallery taxonomy

Use a two-level hierarchy: **chart family → chart subtype**. Treat API, programming language,
feature, difficulty, data domain, and rendering dimension as independent facets. Folder names
remain stable example IDs; they no longer determine the entire browsing experience.

| Family / slug                              | Chart subtypes and examples                                                      | Classification notes                                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Basic & comparison / `basic`               | Bar, horizontal bar, grouped/stacked bar, dot, lollipop, table                   | Named chart patterns may share an underlying trace; label by reader intent.                             |
| Lines & time series / `time-series`        | Line, area, stacked area, date axes, step lines, gaps, range bands               | Cross-link financial time series without moving all finance examples here.                              |
| Scatter & relationships / `relationships`  | Scatter, bubble, scatterplot matrix, parallel coordinates                        | A scatter trace in line mode belongs primarily in time series, not automatically here.                  |
| Distributions & statistics / `statistical` | Histogram, box, violin, strip, 2D histogram, density contours                    | Cross-link uncertainty examples and statistical recipes.                                                |
| Heatmaps & scientific / `scientific`       | Heatmap, contour, image, log-scale views                                         | Keep 2D scalar-field examples distinct from 3D surface and volume examples.                             |
| Part-to-whole & hierarchy / `hierarchical` | Pie, donut, treemap, sunburst, icicle, funnel area                               | Explain which views represent hierarchy versus a flat composition.                                      |
| Financial & business / `financial`         | Candlestick, OHLC, waterfall, funnel, indicator, Gantt                           | Business reporting can also appear as a use-case facet.                                                 |
| Polar & radial / `polar`                   | Polar scatter, polar line/radar patterns, barpolar                               | Polar is a discoverable category rather than a small subsection of scientific charts.                   |
| Maps & geography / `maps`                  | Scattergeo, choropleth, projection variations, globe examples                    | Show browser-extension requirements; current Python bridge excludes geo extensions.                     |
| Networks & flows / `networks`              | Graph, chord, Sankey, parallel categories, adjacency matrix                      | Graph/chord require bridge coverage checks; Sankey is not automatically excluded with graph extensions. |
| 3D charts & fields / `3d`                  | Scatter3d, bar3d, surface, mesh3d, cone, streamtube, volume, isosurface, graph3d | graph3d also cross-lists under networks; distinguish native 3D from 2D extrusion.                       |

Each public example has one primary family and zero or more secondary families. A mixed demo
can reference several families but stays a demo in its content kind. Family counts count unique
example IDs; global totals do not sum overlapping family counts. A heatmap used for an adjacency
matrix can belong primarily to networks and secondarily to scientific charts.

Separate collections: **Recipes**, **Themes & styling**, **Interaction & animation**, **Layout &
axes**, **Accessibility**, and **Complete demos**. They may cross-link chart families without
becoming sibling chart types. Express is an API facet, not a chart family.

## Delivery plan

Priority: **P0** = redesign launch requirement; **P1** = depth and polish after the first usable
release; **P2** = follow-up exploration. Size: **S** = bounded page or component task, **M** =
several related pages/components, **L** = coordinated content and tooling work. Sizes are relative,
not delivery-date estimates. Suggested ownership describes responsibility, not assigned people.

| Wave                   | Tickets                            | Exit condition                                                                                                   |
| ---------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1 — Foundation         | SITE-01–04, SITE-08                | Inventory, taxonomy, shared metadata, responsive shell, and accurate installation states agreed and implemented. |
| 2 — Core experience    | SITE-05–07, SITE-09–11, SITE-14–17 | Dense homepage, both onboarding paths, Python hub, and category-first gallery work end to end.                   |
| 3 — Content and launch | SITE-12–13, SITE-18–19, SITE-22–25 | Notebook/example targets met; links, accessibility, performance, and release checks pass.                        |
| 4 — Expansion          | SITE-20–21, SITE-26–28             | Cookbook, demos, broader environments, and measured discovery improvements.                                      |

The redesign is not complete after the homepage alone. Waves 1–3 are the launch scope; package
publication and unverified hosted notebook environments are independent dependencies.

## Wave 1 implementation and review

The source review found that the original Wave 1 acceptance wording included homepage density,
new quick-start routes, family/detail routes, and notebook-host verification delivered in later
waves. The foundation criteria below now identify those dependencies explicitly. Existing routes
and anchors remain available while those later pages are built.

| Ticket  | Delivered evidence                                                                                                                                          | Remaining later-wave work                                                         |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| SITE-01 | [Generated content audit](docs/site/content-audit.md), full inventory, twelve baseline screenshots, coverage matrix and starter tasks.                      | Human first-use timing in SITE-25.                                                |
| SITE-02 | Shared registry, 11 families and 59 subtypes; all 785 entries migrated to manifest v2 with source/variant verification metadata and classification checks.  | New executed Python variants and broader curation in SITE-12/18/19.               |
| SITE-03 | Six primary destinations, Get started/Python/Guides/Demos hubs, shared chart directory, contextual sidebars, breadcrumbs, legacy links and family history.  | Dedicated quick starts and family/detail routes in Wave 2.                        |
| SITE-04 | Shared compact styles, four/three/two/one gallery columns, eight complete desktop cards, tablet overflow fix, split preview/source and shared state styles. | Full homepage redesign, detail pages and launch accessibility/performance checks. |
| SITE-08 | Independent registry/source availability, complete source guidance, isolated Python kernel/frontend and HTML smoke checks, clean public-main browser build. | Public Python source/artifact publication and full notebook-host verification.    |

[Maintenance and verification](docs/site/README.md) describes the canonical registry, audit command,
metadata refresh and contributor workflow. [Installation evidence](docs/site/install-verification.md)
records the exact versions and verification boundaries. Wave 1 does not publish packages or deploy
the website. The Python bridge is present in this development tree but absent from verified public
`main`; Python setup explicitly requires a checkout containing the bridge.

[Production layout evidence](docs/site/foundation/README.md) includes twelve matched screenshots:
eight complete desktop gallery cards, no document overflow and no uncaught page errors. The
production build, 32 unit tests, page lint, typecheck and gallery consistency checks pass. Eight
foundation browser checks pass in development, under `/holochart/v1/`, and in production with
retries disabled. Cold production hydration uses a bounded readiness wait before interaction.

## Wave 2 implementation and review

The core experience includes six static homepage previews, adjacent Python/JavaScript starts,
eleven thumbnail family tiles, practical recipes and selected demos. The gallery defaults to
an SSR family directory, with eleven dedicated family pages, an explicit all-examples view,
shareable facets and 786 addressable detail routes. Full-page card links and separate Quick
preview buttons preserve ordinary navigation and dialog history/focus.

Browser onboarding includes complete JavaScript/TypeScript and plain HTML paths, exercised
from a clean public-source checkout. Python setup accurately requires this development checkout:
public Python source and PyPI publication remain independent release dependencies.

Seven canonical Python sources generate downloadable notebooks and synchronized web snippets.
All seven pass fresh-kernel execution and actual JupyterLab/Notebook browser rendering; the
control notebook updates the same chart and removes the old view on rerun. The environment
matrix records exact versions and the independently reproduced Notebook startup warning.
See [host evidence](docs/site/wave2/notebooks/README.md).

Four exact gallery figures have verified Python variants: basic bar, mixed line/bar, heatmap,
and histogram. All 786 examples have complete browser source bundles; nineteen exact bundles
have browser render proofs spanning all eleven families. Remaining bundles are compiled, with
verification scope shown explicitly. Filters never treat an unverified Python variant or a
thumbnail as executed language evidence. The twelve-notebook and twenty-four Python-variant
launch targets remain unchecked under SITE-12 and SITE-18.

[Wave 2 layout and route evidence](docs/site/wave2/README.md) records production screenshots and
browser checks. Native browser zoom, broad accessibility/performance audits, additional editor
hosts and human first-use timing remain with their respective later-wave tickets. Start the
local site from the repository root with `pnpm run docs`.

## Foundation and dense visual design

## Wave 3 implementation and review

The content targets are implemented: 14 starter notebooks, 24 exact Python gallery variants across
six primary families, 47 compact chart guides, 15 featured guides with at least five distinct
variations, and 33 reviewed beginner tasks across all eleven families. Complete browser exports
cover all 786 gallery IDs; 45 exact copied bundles have browser render/cleanup proofs, including
all 33 beginner starters and the 24 Python counterparts. The Wave 3 source-ledger snapshot retained 53
rendered proofs in total, including earlier-wave checks; its other 733 exports were
compiled with copied-bundle rendering separately unverified. Wave 4 adds five copied-source proofs.

All 38 Python artifacts passed fresh kernels and both actual JupyterLab and Notebook widget
managers: 76 final source-matched host checks. See [notebook evidence](docs/site/wave3/notebooks/README.md),
[coverage matrix](docs/site/wave3/chart-coverage.md) and
[launch checklist](docs/site/wave3/launch-checklist.md). The site now documents the public Python
API, exact tested dependencies and symptom/check/fix troubleshooting. Geo/graph extensions and
untested hosted notebook services retain explicit support boundaries.

Generated download/source drift, missing files, stale IDs/claims and rendering failures have
focused checks. CI is configured for fresh kernels, actual notebook hosts and production browser
checks; the new remote CI jobs have not been run in this working-tree session. The broader rendering
snapshot passes 81 checks, including 49 chart pages and 13 gallery pages. After the final accessibility and facet-computation
refinements, the Wave 3 production build passed 21 integration checks and 19 checks covering
settled chart accessibility, keyboard behavior, fallbacks and lifecycle.
Thirty viewport captures have no page overflow or browser exceptions; the desktop directory and
inventory each show eight complete cards. All 4,746 previous HTML routes and 374 chart anchors
remain present. The final automated audit covers 24 template/viewport combinations with zero
violations; clipped-code contrast ambiguities remain for human review. On the documented mobile
profile, the four catalogs have p75 LCP of 924–1,536 ms, maximum CLS below 0.001 and zero WebGL
contexts. Sixty desktop filter queries have p95 response of 34.2 ms against the 100 ms target,
using an isolated normal headless software compositor. The retained Wave 2 artifact measures
150.3 ms under the same desktop profile, so p95 response is approximately 77% lower. See [performance and accessibility evidence](docs/site/wave3/README.md),
[integration evidence](docs/site/wave3/integration-checks.json),
[viewports](docs/site/wave3/viewports.json), and [route continuity](docs/site/wave3/route-continuity.json).

Human first-use sessions, screen-reader speech/native zoom review, retaining the actual deployed
artifact and post-deployment checks remain unchecked. The local Wave 2 build and its route map are
retained for comparison/rollback; this is not a deployed release or a completed human launch study.

## Wave 4 implementation and review

The cookbook now has ten compact, source-grounded recipes with static thumbnail cards, finished
live charts, complete browser downloads, key choices and related families. Five recipes expose
an exact verified Python counterpart. Linked views mean matched zoom/pan inside one chart;
interval bands use explicit synthetic forecast bounds rather than claiming fitted confidence
coverage. Five additional copied browser exports passed rendering and cleanup; all ten recipe
exports have exact hash-matched copied-source evidence.

The demo directory curates ten deterministic reports and one separate live weather application.
Cards identify domains, chart families, data provenance, techniques and reusable non-demo
starters. Snapshot dates and research source tiers remain visible; the live app states its
on-request service requirements and labels its static technique preview separately.

An editorial replay of the 33 reviewed beginner task descriptions found 32 empty searches.
Including that task language now locates every intended starter first globally and within its
family, preserving actual language-support boundaries. This is regression evidence, not
observed visitor behavior or a measured first-use study. See [discovery evidence and advanced
browsing decisions](docs/site/wave4/discovery.md). More Python coverage, chooser/comparison/
collection features and density controls remain subject to observed needs.

[Notebook environment evaluation](docs/site/wave4/environments.md) considers VS Code, Colab and
Binder independently. No remote host or editor output is claimed verified, no startup duration
is invented and no hosted launcher is displayed. Public immutable install/notebook artifacts and
repeatable real-host rendering remain prerequisites; the fourteen downloads and tested local
Jupyter paths remain the durable fallback. Wave 3's human launch and deployment gates still apply.

Local verification passes thirty focused unit checks, all 58 production browser checks (including
one corrected hydration-readiness test recheck), 24 viewport captures and continuity for 4,746
routes / 374 anchors. The final build, 433 checked TypeScript snippets and 2,117 internal links
pass. See [Wave 4 verification](docs/site/wave4/README.md).

Cookbook and demo mobile p75 LCP meet the target at 1,516 / 1,384 ms, and desktop search p95 is
35 ms. The gallery directory misses the 2,500 ms target in both the six-route measurement and
a focused repeat. Host load was materially higher than in Wave 3, so the cause remains unresolved;
both failures are retained. The performance launch gate remains open, alongside hosted notebook
verification and observed-usage work. See [performance review](docs/site/wave4/performance-review.md).

### SITE-01 — Audit content, coverage, and user journeys · P0 · M

Suggested owner: documentation. Depends on: none.

- [x] Inventory public pages, example IDs, current categories, chart subtypes, existing embed
      links, source availability, status banners, and missing thumbnails. Separate complete, draft,
      stub, and internal content.
- [x] Build a coverage matrix by chart family × subtype × language × learning level. Count
      distinct useful variations rather than screenshots of the same pattern.
- [x] Capture current homepage, gallery, chart guide, and notebook guide at desktop/tablet/mobile
      sizes; record navigation steps and tutorial time estimates, distinguishing these from observed
      r user timings.
- [x] Select representative beginner tasks: notebook scatter, grouped bar, time series with gaps,
      distribution comparison, heatmap, and a browser-only map.

Acceptance: checked-in audit with generated counts, named content gaps, baseline screenshots,
and the prioritized starter set. Reuse existing examples before commissioning duplicates.

### SITE-02 — Define shared taxonomy and example metadata · P0 · L

Suggested owner: docs infrastructure. Depends on: SITE-01.

- [x] Create one taxonomy registry for family IDs, labels, ordering, subtype IDs, aliases, and
      documentation destinations. Feed the gallery, chart index and breadcrumbs from it; the home
      directory in SITE-05 will consume the same registry. Avoid independent hardcoded category lists.
- [x] Extend the example/manifest pipeline with explicit classification and language-artifact
      metadata. Preserve existing IDs, thumbnails, and source contracts.
- [x] Model at least: `primaryFamily`, `secondaryFamilies`, `chartTypes`, `contentKind`,
      `features`, `difficulty`, curated rank, documentation links, and runnable language variants.
      A variant records its source/notebook path, dependencies, supported environment, and verification
      state. Do not infer Python support merely because a figure has a Plotly-shaped schema.
- [x] Use curated overrides for mode-dependent traces and mixed figures. Validate all referenced
      IDs and files. Decide whether editorial metadata lives beside examples or in a central catalog;
      require one authoritative record per field.
- [x] Version the manifest migration; update its writer, checker, data loader, and consumers
      together. Keep existing exclusion rules for internal/performance-only examples.

Acceptance: all public entries classified with no unknown families or dangling artifacts;
family counts and cross-listing are deterministic; tests cover scatter/line, graph3d, adjacency
matrix, Sankey, and multi-chart demos.

### SITE-03 — Reorganize navigation and preserve routes · P0 · M

Suggested owner: site frontend. Depends on: SITE-02.

- [x] Implement primary navigation and foundation landing pages: Get started, Python, Guides,
      Demos, and the existing chart directory. Dedicated tutorials, family pages, and detail routes
      are delivered by SITE-06–07 and SITE-15–17.
- [x] Add contextual sidebars: family/subtype navigation in the gallery, a sequential Python
      learning path, and compact chart-guide navigation.
- [x] Add consistent breadcrumbs and next-step links between setup guides, the current gallery
      preview, chart guides, recipe collections, and reference pages. Extend these to new detail
      routes when SITE-17 lands.
- [x] Map old routes and gallery query/hash links to their new destinations. Keep
      `/guides/notebooks` as a maintained compatibility entry or redirect with preserved anchors.
- [x] Preserve back/forward navigation, direct loads, modified clicks, and copied links under
      both the default base and a versioned docs base.

Acceptance: no orphan primary pages; existing public example links still reach the intended
example; mobile navigation exposes Python and the gallery without a long nested menu.

### SITE-04 — Build compact, readable page layouts · P0 · M

Suggested owner: site frontend/design. Depends on: SITE-01.

- [x] Introduce shared spacing, grid, card, toolbar, code-panel, and section-heading styles.
      Retain the current dark palette and typography as the starting point.
- [x] Use a wider content area for catalogs and examples while keeping prose to a readable line
      length. Offer side-by-side chart/code on sufficiently wide screens and stacked panels on mobile.
- [x] Target four gallery columns on wide desktop, three on smaller desktop where readable,
      two on tablet, and one on narrow mobile. Keep chart labels legible; aspect ratios may vary.
- [x] Reduce oversized top padding and repeated card chrome. Keep 15–16 px body text, readable
      code, strong focus states, and adequately sized touch controls.
- [x] Define skeleton, loading, empty, unavailable-preview, and error states shared by all grids.

Acceptance: foundation templates reflow at desktop/tablet/mobile widths; the gallery shows at least
eight complete cards at 1440 × 900, supports four/three/two/one columns, and preserves keyboard focus.
Wave 2 detail pages show chart/source side by side on desktop and stack them on mobile; the
quick-preview dialog links to complete source on the full page. Homepage six-preview density
and dedicated detail pages are recorded under SITE-05 and SITE-17. Native
browser zoom and comprehensive accessibility checks remain in SITE-23; 720 px reflow provides an
equivalent layout check for a 1440 px viewport at 200% zoom.

### SITE-05 — Replace the homepage with an example-led overview · P0 · M

Suggested owner: site frontend/documentation. Depends on: SITE-02–04, SITE-08.

- [x] Use a short headline and one explanatory sentence, adjacent to a compact chart mosaic.
- [x] Put “Start in Python / Jupyter,” “Start in JavaScript,” and “Browse chart gallery” in the
      first viewport. Show accurate installation status next to the corresponding path.
- [x] Follow with the family directory: each tile has a representative thumbnail, a descriptive
      label, a generated example count, and a direct family link.
- [x] Add a short code/result starter, popular practical recipes, and selected complete demos.
      Reuse catalog metadata instead of manually maintaining a second inventory.
- [x] Keep architectural differentiators concise and grounded in demonstrated examples. Link
      compatibility and limitations close to Plotly migration claims.

Acceptance: homepage density target met; every card leads to a relevant working destination;
the first viewport does not require mounting a grid of WebGL canvases.

## Quick starts and Python/Jupyter

### SITE-06 — Add a clear quick-start chooser and browser paths · P0 · M

Suggested owner: documentation. Depends on: SITE-03, SITE-08.

- [x] Create a short environment chooser with visible prerequisites and expected output for each
      path. Python and JavaScript receive equal prominence.
- [x] Write a complete JavaScript/TypeScript quick start with installation, file locations,
      imports, container sizing, first render, update, cleanup, and one screenshot/live result.
- [x] Write a plain HTML quick start using the bundle actually available for that release.
      Explain the separate 3D add-on only when the example requires it.
- [x] Link existing Plotly users directly to the relevant Python renderer or JavaScript migration
      path. Distinguish TypeScript Express from Python's `plotly.express`.

Acceptance: a reader can follow each path without filling in omitted setup, importing private
example helpers, or guessing a package version; validate in clean environments.

### SITE-07 — Create a first-class Python & Jupyter hub · P0 · M

Suggested owner: Python documentation. Depends on: SITE-03, SITE-08.

- [x] Add a Python hub with a visible sequence: install → first chart → use Plotly → update a
      widget → explore notebooks → troubleshoot.
- [x] Explain distribution `holochart-py` versus import `holochart`, required widget manager and
      WebGL2, supported Python versions, and which dependencies are optional.
- [x] Add “Download notebook” and “View Python source” actions to supported learning examples.
- [x] Publish a tested environment matrix for JupyterLab, Jupyter Notebook, and notebook editors.
      Record exact tested versions, operating system/browser, date, and verification scope.
- [x] Mark VS Code, Colab, Binder, and other hosts as unverified until actually exercised; avoid
      generic “works in every notebook” language.

Acceptance: Python is reachable from the homepage, main nav, supported gallery details, and
chart guides; readers can distinguish tested support from prospective environments.

### SITE-08 — Make install instructions reflect available artifacts · P0 · M

Suggested owner: release/documentation. Depends on: none.

- [x] Define one shared release-status source for homepage, quick starts, install guides, and
      Python hub. Keep npm and PyPI availability independent.
- [x] While unpublished, provide a complete browser clone/build path and Python development-checkout setup
      with prerequisites, working directory, isolated environment, and kernel registration/selection.
      Explicitly record whether a public source revision exists for each path.
- [x] Explain terminal commands versus notebook cells and use the active kernel's environment
      for notebook installs. Document when to restart the kernel after installation changes.
- [x] Implement pip/npm quick-path gating on independent publication, exact version, and smoke-test
      verification. Both registry paths remain disabled while unpublished. Installing a built Python
      wheel needs no npm installation; building its assets from source currently does.
- [x] Distinguish the five-minute chart tutorial from one-time environment/build setup.

Acceptance: each advertised install path works from a clean environment for its declared state;
no future PyPI/CDN/npm command is presented as currently available. Publication itself stays in
the release backlog.

### SITE-09 — Write the Jupyter first-chart quick start · P0 · M

Suggested owner: Python documentation. Depends on: SITE-07–08.

- [x] Provide a matching `.ipynb` and web guide, with separate cells for setup, imports, first
      figure, display, styling, and replacement update.
- [x] Lead with a small built-in dataset requiring no network access. Show both Plotly renderer
      usage and a linked direct-widget alternative.
- [x] Demonstrate `holochart.register_renderer(default=True)`, explaining that import alone does
      not register the renderer. Also show one-output selection with `renderer="holochart"`.
- [x] Include the expected chart, how to confirm the widget rendered, and immediate fixes for a
      missing widget manager, wrong kernel, and disabled WebGL2.
- [x] End with three concrete continuations: use a DataFrame, change chart type, and update data.

Acceptance: restart-and-run-all succeeds in tested JupyterLab and Notebook environments;
the first chart appears without implicit state or a previous tutorial. Verify actual browser
output, not just successful Python execution.

### SITE-10 — Document Plotly Express and graph_objects workflows · P0 · M

Suggested owner: Python documentation. Depends on: SITE-09.

- [x] Add practical examples for `plotly.express` scatter, bar, line, histogram, and heatmap where
      supported, plus graph_objects for mixed traces and explicit layouts.
- [x] Show NumPy arrays, pandas DataFrames, dates, categorical ordering, and missing data with
      explicit dependencies and supported serialization behavior.
- [x] Explain renderer defaults versus per-show dimensions/configuration. Per-show config
      replaces the renderer's default config; document the actual merge/replace semantics.
- [x] Include an unsupported-feature checklist linked to the generated compatibility reference.
      Do not equate accepted Plotly Figure objects with full Plotly feature parity.

Acceptance: examples use only tested bridge-supported traces and attributes; all imports,
dependency installs, and sample data are provided; unsupported cases have specific explanations.

### SITE-11 — Document direct widgets and Python-driven updates · P0 · M

Suggested owner: Python documentation. Depends on: SITE-09.

- [x] Show `HolochartWidget` with a JSON-safe dictionary, JSON string, and Plotly Figure; explain
      when Plotly is optional and when its encoder is needed.
- [x] Demonstrate replacement assignment to `figure` and `config`. Explain why mutating an
      existing nested dictionary does not notify the widget.
- [x] Cover full-width output, default height, layout dimensions, explicit widget overrides,
      repeated cell execution, and disposal of removed views.
- [x] Provide one tested ipywidgets control that changes the figure from Python.
- [x] State that browser interaction events and layout edits do not currently synchronize back
      to Python. Do not present selection callbacks or browser-to-Python linking as implemented.

Acceptance: the update and control examples visibly change the existing output; rerunning cells
does not accumulate duplicate chart views or listeners.

### SITE-12 — Ship an executable starter notebook collection · P0 · L

Suggested owner: Python examples. Depends on: SITE-09–11, SITE-18.

Use a dedicated location such as `examples/notebooks/`, explicitly supported by discovery and
lint tooling. One canonical notebook/source representation should generate or verify the other
published forms so downloads and web snippets cannot silently diverge.

| Notebook                    | Learning objective      | Required content                                                       |
| --------------------------- | ----------------------- | ---------------------------------------------------------------------- |
| 01-first-chart              | Install and render      | Renderer registration, small line/scatter, expected output.            |
| 02-plotly-express           | Tabular data            | DataFrame, categorical colors, labels, and supported Express mappings. |
| 03-graph-objects            | Figure composition      | Mixed traces, layout, axes, and legend.                                |
| 04-bars-and-comparison      | Compare categories      | Grouped/stacked bars, horizontal orientation, ordering.                |
| 05-time-series              | Dates and gaps          | Datetimes, missing values, multiple series, units.                     |
| 06-distributions            | Compare distributions   | Histogram, box, violin, and appropriate interpretation.                |
| 07-heatmaps                 | Matrix data             | Row/column labels, colorscale, missing cells.                          |
| 08-subplots                 | Combine related views   | Shared axes and small multiples using supported figure attributes.     |
| 09-themes-and-labels        | Produce readable output | Titles, legend placement, accessible colors, dimensions.               |
| 10-live-widget-updates      | Update existing output  | Replacement assignments and a Python-driven control.                   |
| 11-3d-charts                | Explore spatial data    | Scatter3d and surface with the bundled matching 3D add-on.             |
| 12-troubleshooting-and-data | Diagnose common issues  | Kernel checks, array/date serialization, support boundaries.           |

- [x] Include title, goal, prerequisites, tested versions, estimated tutorial time, deterministic
      data, explanatory Markdown, and a final complete example in every notebook.
- [x] Provide compact local data fixtures with provenance/license notes. Avoid API keys, remote
      downloads, credentials, and heavy dependencies in the starter collection.
- [x] Remove transient output, execution noise, and machine-specific paths from distributed
      notebooks; provide static preview images on the website without claiming static exports can
      execute the widget.
- [x] Link each notebook to gallery examples and relevant chart guides.

Acceptance: all 12 notebooks execute from a clean kernel with declared dependencies, and their
widget outputs are checked in a real browser. Downloads in the built site resolve correctly.

### SITE-13 — Add Python reference and notebook troubleshooting · P0 · M

Suggested owner: Python documentation. Depends on: SITE-07, SITE-10–11.

- [x] Document public `register_renderer` and `HolochartWidget` signatures from source, accepted
      figure forms, configuration precedence, dimensions, errors, and supported updates.
- [x] Build a symptom → check → fix table: module missing, wrong kernel, text-only widget
      representation, blank canvas, missing bundled assets, stale output, or unsupported trace.
- [x] State current boundaries: WebGL2/widget manager required; no static notebook export target;
      no browser-to-Python events; geo/graph extensions absent from the current bridge bundles.
- [x] Explain that default fonts are bundled but missing Unicode glyphs may require fallback
      downloads; do not promise unconditional offline rendering.

Acceptance: troubleshooting is linked beside failed-preview states and quick starts; every
documented capability or limitation points to current code, tests, or package documentation.

## Category-first gallery and examples

### SITE-14 — Build the gallery family directory · P0 · M

Suggested owner: site frontend. Depends on: SITE-02–04.

- [x] Replace the default undifferentiated inventory with clearly separated family sections,
      representative thumbnails, subtype labels, short use cases, and unique example counts.
- [x] Show a small curated set per family and a “See all” link. Keep “All examples” as a deliberate
      view rather than making readers scan hundreds of mixed entries first.
- [x] Give recipes, feature collections, and complete demos their own labeled area.
- [x] Make every category heading and card navigable with ordinary links; render meaningful
      content before client-side filtering initializes.

Acceptance: all taxonomy families are discoverable without manipulating filters; a first-time
visitor can tell the difference between a chart family, a feature collection, and an application.

### SITE-15 — Add dedicated family pages and subtype navigation · P0 · L

Suggested owner: site frontend/documentation. Depends on: SITE-14.

- [x] Create stable category routes with a one-paragraph introduction, “start here” examples,
      subtype tabs/links, compact grid, and chart-guide links.
- [x] Keep chart subtype visible on cards and separate common variants: grouped versus stacked
      bars, scatter versus bubble, histogram versus density, native 3D versus extrusion.
- [x] Provide filters for available Python variants, JavaScript/TypeScript, beginner/advanced,
      feature, API, and rendering dimension. Display availability from verified metadata.
- [x] Show selected filters, result counts, reset controls, and helpful zero-result suggestions.
      Counts must reflect the defined filter combination, not unrelated global totals.

Acceptance: a reader can find a Python histogram or JavaScript choropleth from its family page
without knowing a trace name; categories have useful content even with no active filters.

### SITE-16 — Improve search, filter state, and ordering · P0 · M

Suggested owner: site frontend. Depends on: SITE-02, SITE-15.

- [x] Search titles, descriptions, subtypes, aliases, and features; support user vocabulary such
      as “radar,” “candles,” “error band,” “network,” and “Jupyter.”
- [x] Offer curated/recommended order and alphabetical order. Avoid a “popular” sort without
      an actual data source.
- [x] Encode category, query, filters, sort, and selected example in shareable URLs. Define AND
      across facets and OR within multiselect facets if multiselect is provided.
- [x] Make clear/reset and browser back/forward behavior predictable; preserve browsing context
      when returning from an example detail page.

Acceptance: representative search queries return expected examples; reload reproduces the view;
invalid/obsolete parameters recover gracefully with no blank or broken page.

### SITE-17 — Create useful, addressable example detail pages · P0 · L

Suggested owner: site frontend/documentation. Depends on: SITE-02–04, SITE-15.

- [x] Give examples a full page with title, purpose, chart preview, data description, source,
      dependencies, support status, and relevant documentation. The existing dialog can remain a
      quick preview that links to this page.
- [x] Provide accessible TypeScript/JavaScript/Python tabs only where runnable variants exist.
      Remember language preference without selecting an unavailable variant on the next example.
- [x] Include copy complete source, download `.py`/`.ipynb` where available, and playground action
      where deployment supports it. A browser preview of an equivalent figure is not proof of a
      tested Python example.
- [x] Show same-subtype variations and related chart alternatives, chosen by metadata rather
      than an arbitrary next item in the manifest.
- [x] Support direct page loads and translate existing `/gallery/#<id>` links without losing
      filter context. Preserve embedded `#example-…` anchors in chart guides.

Acceptance: a copied example runs independently; detail URLs work when pasted into a new tab;
keyboard focus, dialog dismissal, and return-to-results behavior are correct.

### SITE-18 — Make reusable examples runnable in multiple languages · P0 · L

Suggested owner: examples/docs infrastructure. Depends on: SITE-02, SITE-08.

- [x] Extend the existing source extraction and `Example.vue` presentation to associate language
      variants without embedding duplicate handwritten code across docs pages.
- [x] Decide how fixture data is shared between browser and Python examples. Keep outputs
      semantically equivalent, while allowing idiomatic APIs in each language.
- [x] Separate internal `run(el)` harness code from copyable user code. Include public imports,
      data, mounting/display instructions, and cleanup where relevant.
- [x] Add snippet/artifact validation for missing files, stale notebook links, undeclared
      dependencies, unsupported language labels, and mismatched example identity.

Acceptance: at least 24 curated examples have tested Python variants spanning six supported
families; common featured examples require no imports from `examples/_lib` to run independently.

### SITE-19 — Expand useful chart variations and modernize chart guides · P0 · L

Suggested owner: chart documentation/examples. Depends on: SITE-01–02, SITE-17–18.

- [x] Select three beginner starters per family where supported, covering different tasks.
      Promote existing examples when they already teach the intended concept.
- [x] For each launch-featured subtype, provide at least five substantive variations, consistent
      with the current chart-page minimum: basic data, grouped/multiple series where appropriate,
      labeling/styling, interaction, and a realistic task.
- [x] Prioritize gaps in practical content: date handling, missing data, ordering, annotations,
      error bands, normalization, subplots, accessible colors, and responsive sizing.
- [x] Redesign chart guides with a compact overview, a visible minimal example, a variation grid,
      language-aware source, data-shape notes, reference links, and related alternatives. Retain
      useful existing sections and update the template/linter together if their structure changes.
- [x] Keep API behavior and rendering differences explicit for browser-only extensions and
      notebook-supported variants.

Acceptance: coverage report shows the actual launch matrix; guide previews link to complete
examples; untested or unsupported features are not marked complete merely to meet a quota.

### SITE-20 — Turn the cookbook into practical recipes · P1 · L

Suggested owner: documentation/examples. Depends on: SITE-17–19.

- [x] Publish recipes for small multiples, mixed line/bar, confidence bands, sorting/ranking,
      missing data, date axes, custom hover labels, linked browser views, themes, and dashboard sizing.
- [x] Give each recipe a problem statement, finished chart, complete code, key choices, and links
      to related chart families. Include Python only for supported behavior.
- [x] Separate recipes from exhaustive API reference and from full demo applications.

Acceptance: at least ten useful recipes replace the stub, with verified source and no dead ends.

### SITE-21 — Curate complete demos and realistic datasets · P1 · M

Suggested owner: documentation/examples. Depends on: SITE-02, SITE-17.

- [x] Add a demos landing page with a compact selection of complete reports/applications and
      clearly labeled domains, chart families, data provenance, and techniques.
- [x] Link demo charts to standalone reusable examples; avoid overwhelming a family page with
      dozens of nearly identical charts from the same report.
- [x] Use deterministic snapshots for starter content. Label live-data demos and describe their
      network/service requirements separately.

Acceptance: complete applications are easy to discover, while family galleries remain balanced
and useful for learning a single chart pattern.

## Quality, rollout, and maintenance

### SITE-22 — Preserve performance as density increases · P0 · M

Suggested owner: site frontend. Depends on: SITE-05, SITE-14–18.

- [x] Use static thumbnails for catalog browsing; mount live charts on intentional preview or
      through the existing bounded visibility system. Preserve teardown on navigation and eviction.
- [x] Lazy-load offscreen images and example code, reserve image dimensions, and avoid importing
      all example runtime modules into every family page.
- [x] Profile initial gallery rendering and filtering against the full inventory, with a proposed
      p95 filter response target under 100 ms on a documented reference device/browser.
- [x] Record production-build page weight, chart-context count, and load timings against SITE-01.
      Target LCP ≤ 2.5 s and CLS ≤ 0.1 on an agreed repeatable mobile profile; document deviations
      and resolve regressions before launch rather than citing development-server measurements.
- [ ] Resolve the Wave 4 gallery-directory mobile LCP budget miss: compare the unchanged artifact
      and a retained baseline under controlled host load before launch. Current failed measurements
      remain in `docs/site/wave4/performance.json` and `performance-directory-recheck.json`.

Acceptance: no WebGL context exhaustion after browsing long guides and repeated previews;
catalog scrolling is stable; filtering and page-weight budgets have recorded evidence.

### SITE-23 — Verify accessibility and responsive behavior · P0 · M

Suggested owner: site frontend/QA. Depends on: SITE-04–05, SITE-14–17.

- [x] Check keyboard access to navigation, filters, language tabs, source copy, downloads,
      gallery cards, and preview dialogs; restore focus after closing a preview.
- [x] Provide semantic headings, card labels, meaningful thumbnail alternatives, visible focus,
      screen-reader result announcements, and chart descriptions/data summaries.
- [x] Verify automated contrast, reduced motion, 390/720 px reflow, and touch targets. Communicate
      active filters and support badges with more than color.
- [ ] Review chart-canvas contrast, screen-reader speech and native 200% browser zoom with a person.
- [x] Show useful static content or a clear fallback when JavaScript/WebGL rendering is unavailable.

Acceptance: automated accessibility checks plus manual keyboard/screen-reader spot checks pass
on all new page templates; no unresolved critical accessibility failures.

### SITE-24 — Extend content, notebook, and route validation · P0 · L

Suggested owner: docs infrastructure/QA. Depends on: SITE-12–13, SITE-17–19.

- [x] Extend current page/quality checks for taxonomy validity, minimum featured coverage,
      notebook links, language metadata, missing source, and generated artifact drift.
- [x] Execute Python snippets/notebooks in isolated environments with declared dependencies;
      separately render representative notebook outputs through a real widget manager and browser.
      Python execution alone cannot validate frontend rendering.
- [x] Add focused integration checks for category routing, filter URLs, legacy links, downloads,
      copyable code, language preference, and preview disposal.
- [x] Capture visual regressions for home, family gallery, example detail, and Python quick start
      at desktop/mobile sizes. Reuse existing render-check infrastructure where practical.

Acceptance: checks fail for intentionally missing artifacts, stale taxonomy IDs, broken routes,
and failing notebook renders; CI reports the affected example/page clearly.

### SITE-25 — Launch with route continuity and editorial ownership · P0 · M

Suggested owner: documentation/release. Depends on: all P0 tickets above.

- [x] Review a production preview under the configured base path. Check source/install state,
      navigation, generated references, example assets, downloads, and legacy links.
- [x] Add descriptive page titles, descriptions, and canonical URLs for family/detail pages;
      avoid indexing every filter-query combination as a separate page.
- [ ] Run the user tasks from the success criteria, record results, and fix the highest-friction
      steps before declaring the redesign complete.
- [x] Assign responsibility for Python compatibility, featured examples, taxonomy, and install
      instructions; document how contributors add a chart variant or notebook.
- [ ] Retain the previous deploy artifact and route map for rollback; verify the deployed build
      after release rather than assuming preview results cover hosting behavior.

Acceptance: launch checklist and measured outcomes recorded; Waves 1–3 delivered together;
no prominent link leads to a stub, unavailable package, or missing notebook.

### SITE-26 — Add hosted notebook launchers after verification · P1 · M

Suggested owner: Python tooling. Depends on: SITE-12, available install artifacts.

- [x] Evaluate Colab/Binder and editor-specific setup independently, including widget manager,
      browser/GPU support, startup time, package availability, and data access.
- [ ] Add launcher buttons only for hosts with repeatable successful runs and pinned setup.
- [x] Keep downloads and local Jupyter instructions as the durable fallback.

Acceptance: every displayed launcher opens the intended notebook and produces its chart in
the named host; incompatible environments have precise status instead of a broken badge.

### SITE-27 — Improve discovery from observed usage · P1 · M

Suggested owner: documentation/design. Depends on: SITE-25.

- [ ] Review failed search queries and observed navigation problems using user studies or an
      explicitly selected analytics approach. Do not require analytics infrastructure for launch.
- [x] Tune task-language search aliases from the editorial replay; retain category descriptions,
      curated ordering and related examples until observed usage supports changing them.
- [ ] Expand Python coverage by demand and verified bridge support rather than mechanically
      translating every browser example.

Acceptance: compare repeated tasks against the launch baseline and record concrete improvements.

### SITE-28 — Explore advanced browsing tools · P2 · M

Suggested owner: site frontend/design. Depends on: SITE-25–27.

- [ ] Evaluate a chart chooser by analytical task, side-by-side chart comparisons, and saved
      example collections only after core category browsing is effective.
- [x] Consider in-browser editing against existing capabilities: the local sandbox provides
      example selection and rerun controls; source editing requires the checkout. The public
      playground is still a stub, so no deployed editor is advertised.
- [ ] Prototype optional density controls if users need both compact scanning and larger previews.

Acceptance: each addition addresses an observed need, preserves linkability/accessibility, and
does not make the default browsing path more complicated.

## Implementation map and verification

| Surface                    | Existing implementation to extend                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home and navigation        | `apps/docs/index.md`, `apps/docs/.vitepress/sidebar.ts`, `apps/docs/.vitepress/config.ts`                                                                                       |
| Layout and design tokens   | `apps/docs/.vitepress/theme/Layout.vue`, `apps/docs/.vitepress/theme/custom.css`                                                                                                |
| Gallery data and UI        | `apps/docs/.vitepress/theme/components/Gallery.vue`, `apps/docs/.vitepress/theme/data/gallery.data.ts`, `tools/gallery-gen/src/manifest.ts`                                     |
| Example display and source | `apps/docs/.vitepress/theme/components/Example.vue`, `apps/docs/.vitepress/theme/live-examples.ts`, `apps/docs/.vitepress/plugins/example-sources.ts`, `examples/_lib/types.ts` |
| Python contract            | `packages/holochart-py/src/holochart/`, `packages/holochart-py/frontend/widget.js`, `packages/holochart-py/tests/`, `tests/bundle/notebook.spec.ts`                             |
| Guide content              | `apps/docs/getting-started/`, `apps/docs/guides/notebooks.md`, `apps/docs/charts/`, `apps/docs/cookbook/`, `apps/docs/demos/`                                                   |
| Existing validation        | `apps/docs/scripts/lint-pages.ts`, `apps/docs/scripts/quality.ts`, `apps/docs/scripts/render-check/`, `tools/gallery-gen/src/check.ts`                                          |

Use the relevant existing commands when implementation lands:

```sh
pnpm --filter @mk7s/holochart-docs lint:pages
pnpm --filter @mk7s/holochart-docs typecheck
pnpm gallery:check
pnpm --filter @mk7s/holochart-docs quality
pnpm --filter @mk7s/holochart-docs build
pnpm --filter @mk7s/holochart-docs check:render
```

Build assets and install the Python test dependencies as described in
`packages/holochart-py/README.md` before running:

```sh
python -m pytest packages/holochart-py
pnpm exec playwright test -c tests/bundle/playwright.config.ts notebook.spec.ts
```

SITE-24 must add notebook execution and actual Jupyter-host rendering checks; the existing
bridge tests do not by themselves validate every downloadable notebook or notebook host.

## Scope boundaries and dependency risks

- **Publication:** source-based onboarding can launch now; frictionless pip/npm onboarding
  depends on independently verified package releases. Never hide this distinction in a footnote.
- **Bridge coverage:** geo/graph notebook examples, bidirectional events, and static export are
  separate runtime work. Add backlog links if requested; do not fabricate website support.
- **Taxonomy drift:** classify by explicit metadata and reader intent, not just trace names or
  folders. Keep original IDs stable so reorganization does not break shared links.
- **Content drift:** generate or verify snippets, notebook downloads, and gallery metadata from
  canonical sources. Record tested versions and update them with releases.
- **GPU cost:** more examples on screen should primarily mean more thumbnails; preserve bounded
  live rendering and disposal.
- **Content quantity:** prioritize diverse, explained, runnable examples over duplicating the
  existing large catalog. Do not count complete-demo panels as beginner chart tutorials.
- **Scope control:** no framework migration, new backend, account system, chart-engine rewrite,
  or rebranding is required for this redesign. Keep the existing VitePress/example pipeline.

## Redesign definition of done

- [x] Dense homepage and responsive layouts satisfy measured desktop/mobile viewport targets.
- [ ] Human screen-reader and native 200% browser-zoom review is complete.
- [x] Category directory and all family pages use the shared taxonomy and valid metadata.
- [x] Python/Jupyter and JavaScript quick starts work for the documented artifact availability.
- [x] Twelve starter notebooks and 24 tested Python gallery variants meet the content targets.
- [x] Example detail pages provide complete source, useful context, and supported downloads.
- [x] Existing gallery links, guide routes, and example anchors remain usable.
- [x] Automated accessibility, performance, notebook rendering, and production docs checks pass.
- [ ] User-task results, release-state checks, contributor guidance, and ownership are recorded.
