# Bundle size

Plan E21.1 and §5 ("Size tracking"). Budgets are checked in CI by the `bundle size` job.

## Budgets

Sizes are **minified + gzipped**, in decimal kB (1 kB = 1000 bytes, size-limit's unit), and
**exclude three.js** unless stated.

| Entry                                              | What it measures                                                                                      | Budget   |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------- |
| `partial: core + scatter`                          | `createChart` + `register` from runtime, `scatter` trace                                              | 157 kB   |
| `text engine (lazy chunk …)`                       | the SDF text engine chunk, loaded on first text use                                                   | 49 kB    |
| `fill primitive (lazy chunk …)`                    | fill primitive + earcut + exact fill rules, on first fill                                             | 9.4 kB   |
| `animation (lazy chunk …)`                         | transitions, frames and `animate`, on first animation                                                 | 6.4 kB   |
| `line level of detail (lazy chunk …)`              | min/max pyramid for lines of 100k+ points, on first use                                               | 2.3 kB   |
| `custom marker symbols … (lazy chunk)`             | SVG-path SDFs, image and glyph atlases, on first use                                                  | 3.9 kB   |
| `pattern fills (lazy chunk …)`                     | Plotly's pattern rules, shader code and attribute writer, on first pattern                            | 2.25 kB  |
| `style rules and functions (lazy …)`               | `styleRules` and function-valued attributes, on first use                                             | 4 kB     |
| `chart summaries and data table (…)`               | generated summaries and the visible data table (two chunks, summed)                                   | 5.8 kB   |
| `default font, regular face (lazy …)`              | TeX Gyre Heros Regular chunk, loaded on first text use                                                | 95 kB    |
| `default font, bold face (lazy …)`                 | the bold face chunk, loaded when bold text is drawn                                                   | 95 kB    |
| `default font, italic face (lazy …)`               | the italic face chunk, loaded when italic text is drawn                                               | 98 kB    |
| `default font, bold italic face (…)`               | the bold italic face chunk                                                                            | 95 kB    |
| `partial: basic`                                   | runtime + components + traces-basic + themes (all exports)                                            | 248 kB   |
| `controls views (lazy chunks of basic)`            | menus, sliders, range selector/slider, selections views                                               | 16 kB    |
| `keyboard navigation and legend keys (…)`          | data keyboard navigation (first focus) and legend keys (two chunks)                                   | 5.7 kB   |
| `legend scrolling (lazy chunk of basic)`           | scrolled legend viewport, scrollbar, wheel/drag/touch/keyboard scrolling, on first overflow           | 1.8 kB   |
| `@mk7s/holochart (full, ESM)`                      | everything the full bundle exports, 3D included                                                       | 540 kB   |
| `sankey flow particles (lazy chunk of full)`       | the `link.flow` particle primitive, on first sankey flow                                              | 3.6 kB   |
| `3D mesh primitive and lighting (lazy …)`          | mesh primitive, lighting, light rigs, material types, transparency sorting, on first 3D mesh          | 11.7 kB  |
| `3D lines, sprites and spheres (lazy …)`           | 3D lines, sprite markers, sphere impostors, depth sorting, on first 3D lines or markers               | 10.7 kB  |
| `2.5D view and extrusion primitive (…)`            | 2.5D camera, projector, stencil clipping, prisms, extrusion primitive, on first `view3d` or `depth`   | 13.5 kB  |
| `2.5D view component (lazy chunk of full)`         | the `layout.view3d` component's view: tilted axes and grids, turning drags, on first `view3d`         | 2.7 kB   |
| `trace keyboard stops and 3D descriptions …`       | the trace packages' accessibility chunks (one per package, summed), on first keyboard focus           | 4.6 kB   |
| `partial: core + geo`                              | runtime + the geo package (`tracesGeo`): the geo subplot, scattergeo, choropleth, d3-geo              | 209 kB   |
| `3D globe (lazy chunks of core + geo)`             | what draws a `globe3d` subplot: sphere geometry, base layers, the traces' globe views, on first globe | 11.9 kB  |
| `extra map projections (lazy chunk of core + geo)` | the 68 projection types of d3-geo-projection, when a figure names one                                 | 13.3 kB  |
| `country names (lazy chunk of core + geo)`         | the table of `locationmode: 'country names'`, on first use                                            | 15.8 kB  |
| `basemap 1:110m, countries and land (…)`           | Natural Earth data a map at `resolution: 110` loads                                                   | 32.1 kB  |
| `basemap 1:110m, lakes, rivers, subunits (…)`      | loaded when a map shows them                                                                          | 8.95 kB  |
| `basemap 1:50m, countries and land (…)`            | Natural Earth data a map at `resolution: 50` loads                                                    | 182.5 kB |
| `basemap 1:50m, lakes, rivers, subunits (…)`       | loaded when a map shows them                                                                          | 107.5 kB |
| `geo keyboard stops and view keys (…)`             | the geo traces' accessibility chunk, on first keyboard focus                                          | 0.9 kB   |
| `partial: core + graph`                            | runtime + the graph package (`tracesGraph`): the graph and chord traces and their layouts             | 236 kB   |
| `partial: core + graph3d`                          | runtime + `tracesGraph3d`: the graph3d trace and the 3D scene it is drawn in                          | 224 kB   |
| `graph keyboard stops (…)`                         | the graph package's accessibility chunk (graph, graph3d, chord), on first keyboard focus              | 3.8 kB   |
| `graph layout worker client and link bundling (…)` | loaded when a graph first lays out off the main thread (`worker`) or bundles links (`link.bundle`)    | 8.7 kB   |
| `graph layout worker (dist/layout-worker.js)`      | the worker file itself, as shipped: every layout and the bundling, one file without imports           | 30.5 kB  |
| `@mk7s/holochart IIFE, 2D (includes three)`        | `dist/holochart.iife.min.js` as shipped, **with** three.js: everything but 3D                         | 693 kB   |
| `@mk7s/holochart 3D add-on IIFE (…)`               | `dist/holochart-3d.iife.min.js` as shipped: the 3D package and render's 3D chunks                     | 115 kB   |
| each `@mk7s/holochart-*` package                   | `export *` of that package                                                                            | report   |
| `@mk7s/holochart-traces-geo`                       | `export *` of the geo package, which the full bundle never imports (ADR-026); gated by the rows above | report   |
| `@mk7s/holochart-traces-graph`                     | `export *` of the graph package, which the full bundle never imports (ADR-029); gated by its row      | report   |

The IIFE budget is the full budget plus a 200 kB allowance for the bundled three.js (about
170–190 kB min + gzip on its own; ADR-015). Per-package entries are reported but not gated.

Since M6 the script-tag build is **split** (ADR-015): `holochart.iife.min.js` is 2D only (every
package but `traces-3d`, and without render's 3D chunks), and pages with 3D charts add
`holochart-3d.iife.min.js` after it. The add-on bundles only the 3D package and render's 3D
chunks (inlined); three.js, core, the runtime, render and traces-basic are the main script's
(`scripts/build/iife-split.ts`), so its row is exactly what 3D adds to a script-tag page. The main
script carries the three.js classes the add-on uses (`packages/holochart/src/iife/three.ts`, ~3.8
kB, mostly the mesh primitive's material types and lights). The ESM full bundle keeps the 3D
package: its heavy code is in the two lazy 3D rows, loaded the first time a scene draws a mesh or
3D lines and markers.

An ESM entry's size is its **initial** download. Code an entry loads on demand with a dynamic
`import()` is its **lazy** size, reported next to it: the SDF text engine (troika-three-text,
bidi-js, webgl-sdf-generator, troika-worker-utils, troika-three-utils; plan E21.5), which has its
own gated row, the fill primitive (below, plan E21.6), the controls' views (below, E21.6), the
animation code (below, E7.3 / E7.4), and the built-in default font (below). So core + scatter
costs its initial size before the first frame, the text engine's size plus the regular font face
once it draws a label, the fill chunk once it draws a fill, and the animation chunk once it
animates; `basic` adds a control's chunk once a figure shows that control.

The **fill primitive** (plan E21.6) — the fill mesh and shaders, earcut, and the exact
even-odd / nonzero code (`fill-arrangement.ts`) — loads the first time a chart draws a fill:
scatter `fill` and stacked areas, filled shapes, annotation boxes and arrowheads. Charts draw
fills through `LazyFillPrimitive` (render's `fill-loader.ts`), whose `ready` covers the load, so
`chart.ready`, update promises and image export wait for it like they wait for text. It is
measured on its own and reported in the **Fill** column. `FillPrimitive` and
`createFillPrimitive` stay public, synchronous exports; since a module that is also statically
reachable is never split into a chunk, render's ESM build emits the lazy entry as a separate file,
`dist/fill-lazy.js`, with its own copy of the fill modules and the shared helpers imported from
`./index.js` (see `packages/render/tsdown.config.ts`). Apps that import the public fill exports
(the `render` namespace of the full bundle, or render's `export *`) therefore keep a copy in their
initial chunk and still load the lazy one on the first fill (5.6 kB, as earcut is already there).
The IIFE inlines the chunk (its Fill column reads "inlined").

The **controls' views** (plan E21.6, M3 wave 2) — the DOM views of the update menus, sliders and
range selector, the range slider's thumbnail, masks and drag handling, and the selection outlines,
with the code only they use (the API command dispatch and binding tracking shared by menus and
sliders, the range selector's date math, the range slider's drag math, the selection outline
geometry) — load the first time a figure uses that component: a non-empty `layout.updatemenus` or
`layout.sliders`, an x axis with a visible `rangeslider` or `rangeselector`, or a visible
`layout.selections` item. Schemas, defaults and margin pushes stay in the package entry (validation,
`supplyDefaults` and layout need them synchronously). The components draw through
`lazyRenderer` (components' `src/shared/lazy-view.ts`): until the view has loaded, the component
holds a hidden placeholder primitive whose `ready` covers the load and the view's creation, so
`chart.ready`, update promises, image export and `componentsReady` wait for it like they wait for
text and layout images; the view is then created with the latest draw context, and its DOM is
moved to where a synchronously created view would have mounted it (an anchor left in the draw
order), so the tab order of the chart's controls is unchanged. Once loaded (by any chart), views
are created synchronously, as before. Nothing imports these modules statically, so components'
ESM build emits each as its own chunk, `dist/controls-<component>-<hash>.js`, plus
`dist/controls-shared-<hash>.js` for the command code menus and sliders share (chunk names are set
in `packages/components/tsdown.config.ts`); code they share with the entry lands in shared chunks
that `index.js` imports. To keep that code out of the package entry, the view factories
(`createUpdatemenusView`, `createSlidersView`, `cssEasing`, `createRangeselectorView`) and those
view-only helpers are no longer exported (they were unreleased); their types still are. The five
chunks are measured summed, gated by their own row and reported in the **Controls** column; the
IIFE inlines them.

The **animation code** (plan E7.3, E7.4, M3 wave 3) — the transition engine (interpolation of
numbers, OKLab colors, per-point arrays matched by `ids`, axis ranges), Plotly's easings, the frame
list and `baseframe` merging, and `animate`'s queue and timing — loads the first time a chart
animates: `chart.animate`, `addFrames` / `deleteFrames` (and the functional wrappers), or `react`
with a `layout.transition`. The chart methods stay in the runtime entry and load
`src/anim/animation.ts` with a dynamic `import()`; runtime's ESM build emits it as
`dist/animation-<hash>.js` (code it shares with the entry, such as the update planner, lands in a
shared chunk that `index.js` imports). It is measured on its own, gated by its row and reported in
the **Animation** column; the IIFE inlines it. The sliders' handle glide keeps its CSS
`cubic-bezier` approximations of the easings, so the exact easing curves stay out of the initial
bundle.

The **default font** (plan E2.18) is TeX Gyre Heros, shipped with render in four faces. For ESM
consumers each face is a generated module exporting the OTF file as a base64 `data:` URL
(`packages/render/src/fonts/generated/`, from `packages/render/fonts/*.otf` by
`node scripts/fonts/generate-default-fonts.ts`; `tests/build/default-fonts.test.ts` fails when
they are stale), imported with a dynamic `import()`, so every bundler emits it as its own lazy
chunk. A page loads one face at a time and only the faces its text uses (plain text: regular
only), so the faces are measured one by one, each with a gated row, and reported summed in the
**Fonts** column; they never count toward an initial size. Base64 costs about a third over the
binary: a face is ~134 kB raw, ~64 kB gzipped as an `.otf`, and ~86 kB gzipped as a chunk. The
IIFE does not contain the fonts: they ship as `dist/fonts/*.otf` next to the script and are
fetched relative to it (its Fonts column reads "files"). Apps that prefer to self-host the files
set `configureText({ defaultFontFaces })` (see the styling guide).

Entries and budgets live in one place, [`tests/bundle/size/entries.ts`](../../tests/bundle/size/entries.ts),
which [`.size-limit.ts`](../../.size-limit.ts) reads. The bundle smoke tests
(`tests/bundle/*.spec.ts`) check that the lazy chunks load in a browser: the font faces
(`esm-fonts.spec.ts`), the fill chunk (`esm-fill.spec.ts`: not requested without fills, drawn when
`chart.ready` resolves), the controls' chunks (`esm-controls.spec.ts`: none requested by a figure
without controls, only the used component's chunks otherwise, drawn and in DOM order when
`chart.ready` resolves), and the IIFE's inlined engine, fill code and controls (`iife.spec.ts`).

## Budget policy

Plan risk R9. Through ship wave R2 the budgets were raised more than a dozen times, mostly "by
decision" after a wave had already outgrown them (the history is in the sections below and in the
comments of `entries.ts`). Since ship wave R3 a budget is a commitment, and changing one has a
cost:

1. **A budget changes only with a ledger line.** [`tests/bundle/size/policy.ts`](../../tests/bundle/size/policy.ts)
   holds every budget as it was when the policy began (`BUDGETS_AT_ADOPTION`) and an append-only
   ledger of changes since (`BUDGET_CHANGES`). The `limit` of an entry in `entries.ts` must be its
   adopted budget or the `to` of its latest ledger line; a new budgeted entry starts with a line
   (`from: 'new'`), a removed one ends with one (`to: 'removed'`).
2. **A ledger line names its cause**: what grew (the features or dependencies), by how much (kB
   measured before and after, on CI), and why the code could not load lazily or be trimmed
   instead. "By decision" is not a cause. Lowering a budget takes a line too: it says what made
   the room.
3. **The full ESM bundle has a hard ceiling of 560 kB** (`FULL_ESM_CEILING_KB`: the M6 budget of
   540 kB plus 20 kB). Its budget can be raised up to the ceiling and no further. At the ceiling,
   new code goes into a lazy chunk or an add-on package, or something else gets smaller first.
   Moving the ceiling takes an ADR, not a ledger line.

Order of work when an entry is over budget: make the new code lazy (a dynamic `import()` behind
first use, as the fill, controls and animation chunks are), then trim, and only then raise the
budget, to the measured size on CI plus at most 2 % (CI measures about 0.3 % more than a local
macOS run, and CI is the reference).

`checkBudgetPolicy` enforces rules 1–3 mechanically: `pnpm test` runs it
(`tests/bundle/size/policy.test.ts`), and `.size-limit.ts` runs it before `pnpm size` measures
anything, so a raised `limit` without a ledger line, a line without a cause, or a full ESM budget
over the ceiling fails locally and in the `unit` and `bundle size` CI jobs. What it cannot check
is whether a cause is a good one; that is the reviewer's part.

## Running it

```sh
pnpm size          # build packages, bundle each entry, run size-limit (fails over budget)
pnpm size:report   # Markdown table (after `pnpm size`); --base <main.json> adds deltas
```

How it measures: [`tests/bundle/size/bundle.ts`](../../tests/bundle/size/bundle.ts) bundles each
entry from the packages' built `dist/` with rolldown (the bundler behind tsdown and Vite 8),
tree-shaken and minified, with `three` external and every other dependency (d3, troika, earcut,
flatbush, workspace packages) included, the way an app bundler would. Code splitting is on, as in
an app: each dynamic `import()` becomes its own chunk. The entry chunk plus every chunk it imports
statically is written to `<id>.js` (the **initial** size); the lazy chunks measured on their own
(`LAZY_PARTS`) go to `<id>.lazy.<part>.js` — the fill chunk (render's `dist/fill-lazy.js` and
earcut) to `<id>.lazy.fill.js`, the controls' views (components' `dist/controls-*.js`) to
`<id>.lazy.controls.js`, the animation code (runtime's `dist/animation-*.js`) to `<id>.lazy.animation.js`, each font face to `<id>.lazy.font-<face>.js` — and every other
chunk to `<id>.lazy.js` (the **lazy** size), so each output chunk is counted exactly once and
nothing drops out of the numbers (a chunk mixing a part with other code fails the script).
`manifest.json` records which packages the lazy chunks contain and which parts exist.
size-limit (`@size-limit/file`) then gzips the results; a `lazyOf` entry in `entries.ts` gates
another entry's lazy file, or with `lazyPart` one of its parts (the text-engine, fill, animation and
font rows measure core + scatter's, the controls row basic's), and `bundle.ts` fails if that entry
has no such chunks. The report adds per-entry **Lazy**, **Fill**, **Controls**, **Animation** and
**Fonts** columns (gzip level 9, like size-limit; Controls sums the components' chunks, Fonts the
faces). The IIFE is
measured as built: it is a single file, so the build inlines the text engine, the fill code and
the controls' views (as modules initialized on first use) and its lazy columns read "inlined".

Until an entry's named exports exist (for example `scatter` before the scatter trace lands), that
entry measures the whole package instead and the report adds a footnote.

In CI, the job writes the table to the job summary, uploads `size.json` as the `size-report`
artifact, compares with the latest successful `main` run, and posts or updates one PR comment
(same-repo PRs only; fork PRs get a read-only token, so they get the job summary only).

## Sizes after large graphs (G5, G7, G10, 2026-10-06)

The final rows of the graph package. A `graph` layout can now run off the main thread and be
drawn while it settles (`worker`), a large graph is drawn with a level of detail that follows the
zoom (`lod`), and links can be bundled (`link.bundle`). Measured with `pnpm size` locally.

| Entry                                                        | Size      | Budget  |
| ------------------------------------------------------------ | --------- | ------- |
| partial: core + graph                                        | 233.83 kB | 236 kB  |
| the same before large graphs (G5 and G10 in)                 | 226.91 kB | 231 kB  |
| the same before the pointer and the descriptions (G2–G4, G8) | 218.54 kB | 223 kB  |
| graph layout worker client and link bundling (lazy chunk)    | 8.24 kB   | 8.7 kB  |
| graph keyboard stops (lazy chunk)                            | 3.60 kB   | 3.8 kB  |
| graph layout worker (`dist/layout-worker.js`)                | 29.77 kB  | 30.5 kB |
| partial: core + graph3d                                      | 220.47 kB | 224 kB  |
| keyboard navigation and legend keys (lazy chunks of basic)   | 5.57 kB   | 5.7 kB  |
| `@mk7s/holochart` (full, ESM)                                | 538.05 kB | 540 kB  |
| `@mk7s/holochart` IIFE, 2D (includes three)                  | 688.37 kB | 693 kB  |
| `@mk7s/holochart-traces-graph` (all)                         | 233.10 kB | report  |

What the numbers say:

- **Large graphs add 6.9 kB to the first chunk**, which is what has to answer at once. By module,
  minified alone: the view side of a layout that is still to come (asking for it, drawing the
  positions the worker reports once per frame, holding `chart.ready`) 1.55 kB; what a calc waits
  for, the rule for `worker` and the answers that are kept, 1.36 kB; the level of detail 1.35 kB;
  the spatial index of the links that hover uses 1.05 kB; the rest, about 1.5 kB, is in calc, the
  view, the link geometry that is patched while a node is dragged, and the three attributes.
- **8.2 kB load on demand**: the client of the layout worker (2.2 kB alone), the handler it runs
  on the main thread in slices when no worker can be started (1.4 kB), the protocol (0.8 kB),
  force-directed bundling (3.3 kB) and hierarchical bundling (1.6 kB). A figure loads the chunk
  the first time one of its layouts runs off the main thread or its links are bundled; with the
  defaults (`worker: false`, no bundling) it never does.
- **That chunk is a copy.** The package's entry exports the same modules (`layoutInWorker`,
  `setGraphWorkerUrl`, `bundleLinks`, …) for apps that lay graphs out themselves, and a module the
  entry imports stays in the entry's chunk however lazily someone else imports it: with one copy
  the row measured 241.43 kB. The package build therefore points the trace's `import()` at
  copies of those modules under ids of their own (`packages/traces-graph/tsdown.config.ts`); an
  app that uses none of the entry's exports drops the entry's copy like any unused code. Both
  copies share the one worker of the page (`src/worker/shared.ts`, which is in the build once).
- **The layouts are in three places**: the first chunk (calc runs them), the lazy chunk imports
  them from there, and the worker file carries its own copy, because a worker shares no chunk
  with the page.
- **`partial: core + graph3d` no longer carries the 2D layouts it never runs.** Its calc took
  the registry of custom layouts from `layout/index.ts`, the table of every built-in layout.
  The registry is now a file of its own (`layout/registry.ts`) and `graph3d` imports it from
  there: the row went from 234.58 kB to 220.47 kB, and its budget from 236 kB to 224 kB.
- **Three budgets outside the package moved** (ledger lines in `tests/bundle/size/policy.ts`):
  the keyboard chunk of basic to 5.7 kB (two additions to the keyboard contract, 0.09 kB), the
  graph keyboard stops to 3.8 kB, and the 2D script-tag build to 693 kB (Express gained
  `graph`, `chord` and `adjacencyMatrix`, about 3.0 kB; it has no lazy chunks). The full ESM
  bundle is at 538.05 of 540 kB, about 0.3 kB under its budget once CI's margin is counted.
- **Still not lazy, and next if the graph row has to shrink**: the view side of the stream
  (1.55 kB, by loading it with the first calc that waits) and the node drag (about 4 kB, on the
  first press on a node).

## Sizes after the graph package (G1, 2026-10-06)

Network graphs are a package of their own, `@mk7s/holochart-traces-graph`, which the full bundle
does not import (ADR-029): an app adds it with `import '@mk7s/holochart/graph'`. A test bundles
the full entry as an app would and fails if a module of the graph package is in it
(`tests/bundle/esm-no-graph.spec.ts`). The package has one budgeted row, on a
`partial: core + graph` entry: the runtime with `tracesGraph` registered. It has no lazy chunks of
its own; what the entry loads on demand is the runtime's and render's (text engine, fonts, fill,
markers, animation, keyboard), which the core + scatter rows gate. The budget is the measured
size plus about 2 %. Measured with `pnpm size` locally.

| Entry                                | Size      | Budget |
| ------------------------------------ | --------- | ------ |
| partial: core + graph                | 185.59 kB | 190 kB |
| the same, `graph` registered alone   | 176.05 kB | —      |
| partial: core + scatter              | 155.06 kB | 157 kB |
| full, ESM                            | 534.86 kB | 540 kB |
| `@mk7s/holochart-traces-graph` (all) | 117.71 kB | report |

What the numbers say:

- **A graph costs 21.0 kB** over core + scatter: the trace (model, calc, links with arrowheads
  and curves, box nodes, labels, legend, hover and selection) and the preset, circular and grid
  layouts. The rest of the entry is what scatter also needs: the runtime, render's lines,
  markers, rects and text, and the parts of traces-basic the trace builds on. The second row is
  not an entry of its own: it was measured once, with `graph` in place of `tracesGraph`.
- **The chord trace adds 9.5 kB** to the row, since `tracesGraph` registers both.
- **`export *` of the package** also counts the layouts that no arrangement runs yet.

## Sizes after the graph layouts (G2–G4, 2026-10-06)

Every arrangement of the `graph` trace now runs its layout: force-directed, layered, the tidy and
radial trees, the dendrogram, the arc diagram and the hive plot. The layouts are part of the
`partial: core + graph` entry, not lazy chunks: calc is synchronous, so a layout that loaded on
demand would need a pending state and a second pass (ADR-029), and an app without a graph does not
load the package at all. The budget is again the measured size plus about 2 %. Measured with
`pnpm size` locally; the layouts on their own with a one-off bundle of each (minified, gzipped).

| Entry                                             | Size      | Budget |
| ------------------------------------------------- | --------- | ------ |
| partial: core + graph                             | 218.54 kB | 223 kB |
| the same before the layouts (preset, circular, …) | 185.59 kB | 190 kB |
| layered layout, alone                             | 11.76 kB  | —      |
| force layout (springs and ForceAtlas2), alone     | 7.29 kB   | —      |
| tidy tree, radial tree and dendrogram, together   | 4.99 kB   | —      |
| arc diagram layout, alone                         | 1.35 kB   | —      |
| hive plot layout, alone                           | 1.30 kB   | —      |
| the seven layouts, together                       | 25.58 kB  | —      |

What the numbers say:

- **The layouts are 25.6 kB of the 33.0 kB the entry grew by.** The layered layout is the
  largest: cycle breaking, network simplex ranking, crossing reduction, Brandes–Köpf placement,
  three kinds of routes and clusters. The three trees share their forest builder and contour
  pass, which is why they cost less together (5.0 kB) than their sum (9.8 kB).
- **The trace side is about 7 kB**: the option containers and their mapping to the layouts,
  routed and secondary links, the titles of cluster frames and hive axes, turned labels, box
  nodes that shrink to fit, the `force.simulate` animation and the tween of a folding tree.
- **The same layouts are in the layout worker** (`dist/layout-worker.js`, its own row): a worker
  shares no chunk with the page, so it carries its own copy.
- **The full bundle has no graph code**: `dist/index.js` imports nothing from the package (only
  its declarations name `GraphTrace`, for typed figures). It measured 534.86 kB in this tree,
  against 534.76 kB in the geo section below.
- **No layout is still to come**: the seven above are every arrangement of ADR-029 that needs
  one (`preset`, `circular` and `grid` were in the row before). What came after them is in the
  section "Sizes after large graphs" above: the pointer (G5), the descriptions (G10) and large
  graphs (G7), each with a ledger line.

## Sizes after the geo package (GEO2–GEO8, 2026-10-04)

Maps are a package of their own, `@mk7s/holochart-traces-geo`, which the full bundle does not
import (ADR-026): an app adds it with `import '@mk7s/holochart/geo'`. A test bundles the full
entry as an app would and fails if a module of the geo package, d3-geo, d3-geo-projection or
topojson-client is in it (`tests/bundle/esm-no-geo.spec.ts`). The package therefore has rows of
its own, on a `partial: core + geo` entry: the runtime with `tracesGeo` registered. Everything a
map loads on demand is a lazy chunk with a budget: the projections of d3-geo-projection, the
country-name table, the keyboard code, and the basemap data, two chunks per resolution
(ADR-024). Budgets are the measured size plus about 2 %. Measured with `pnpm size` locally.

| Entry                                      | Before          | After     | Budget   |
| ------------------------------------------ | --------------- | --------- | -------- |
| full, ESM                                  | 533.75 kB       | 534.76 kB | 540 kB   |
| partial: core + scatter                    | not re-measured | 154.95 kB | 157 kB   |
| partial: core + geo                        | —               | 204.77 kB | 209 kB   |
| 3D globe (lazy)                            | —               | 11.58 kB  | 11.9 kB  |
| extra map projections (lazy)               | —               | 12.94 kB  | 13.3 kB  |
| country names (lazy)                       | —               | 15.40 kB  | 15.8 kB  |
| basemap 1:110m, countries and land (lazy)  | —               | 31.30 kB  | 32.1 kB  |
| basemap 1:110m, lakes, rivers, subunits    | —               | 8.68 kB   | 8.95 kB  |
| basemap 1:50m, countries and land (lazy)   | —               | 178.28 kB | 182.5 kB |
| basemap 1:50m, lakes, rivers, subunits     | —               | 104.99 kB | 107.5 kB |
| geo keyboard stops and view keys (lazy)    | —               | 0.79 kB   | 0.9 kB   |
| keyboard navigation and legend keys (lazy) | 5.42 kB         | 5.48 kB   | 5.5 kB   |
| IIFE (2D, includes three)                  | —               | 684.95 kB | 690 kB   |

What the numbers say:

- **A map costs 50 kB of code** over core + scatter, of which d3-geo and topojson-client are
  about 12 kB (the GEO1 measurement below) and 4.6 kB is what a 3D globe needs up front (its
  viewport, camera and matrix, and the loaders of its lazy code); a world map at the default resolution then loads
  31 kB of data, 40 kB with lakes, rivers and US states.
- **The full bundle grew by 1.0 kB**, none of it map code: the Express functions `scatterGeo`,
  `lineGeo` and `choropleth` (0.61 kB; they build figures and import nothing from the geo
  package) and the runtime's additions for subplots like this one. The "Before" figure is the
  tree as it stood before the geo work; the 538.10 kB in the S2.14 section below was measured
  before later R3 trims.
- **1:50m data is over ADR-024's target**: 283 kB with all layers against 235 kB, because it is
  quantized on a 2e4 grid (1.1 km). The 1e4 grid the target was measured on is 236 kB but drops
  three small countries and puts small islands on a visible grid.
- **The keyboard chunk has 0.02 kB of headroom.** The runtime's hook that lets a trace word its
  own view-key announcement (GEO6) added 0.06 kB to it. CI measures about 0.3 % more than this
  machine, so the next addition to that chunk needs a trim or a ledger line.
- **A 3D globe (GEO8) loads on demand**: 11.6 kB of the geo package's own lazy code, and
  render's mesh chunk (10.7 kB), 3D-line chunk (9.8 kB) and picker chunk (about 6 kB). The
  pickers are a public export of render that 3D scenes import statically; a lazy chunk that
  imported `createPicker` the same way put them in the initial chunk of every map (5.7 kB), so
  render now also builds them as `dist/picker-lazy.js`, reached through `loadPicker()`.
- **Two corrections to how lazy chunks are counted** (`tests/bundle/size/bundle.ts`): a chunk the
  bundler emits for an `import()` that tree shaking removed is not counted, since it is never
  fetched (without this, the picker chunk showed up in the lazy size of apps that have no
  globe); and render's shared helper chunk no longer trips the "mixes a lazy part with code"
  check when the fill chunk is its only user (the runtime alone).
- The script-tag build has no maps yet (ADR-026 plans a third script).

## Geo candidates, measured for GEO1 (2026-10-03)

Backlog story GEO1 asks for the sizes of the candidate dependencies and basemap data of the
geographic charts before any of them is chosen. These are the numbers. **Nothing here ships yet,
no entry is added and no budget changes**; the ADRs that GEO1 produces decide what is used.

Measured by [`docs/spikes/scripts/geo-sizes.mjs`](../spikes/scripts/geo-sizes.mjs), which bundles
the way `bundle.ts` does (rolldown 1.2.9, tree-shaken, minified, then gzip level 9; brotli at
quality 11 beside it), from the copies in `examples/node_modules`: d3-geo 3.1.1,
d3-geo-projection 4.0.0, topojson-client 3.1.0, world-atlas 2.0.2 (Natural Earth 4.1.0 as
TopoJSON) and maplibre-gl 6.11.2. Local macOS run, Node 26.8.1.

```sh
node docs/spikes/scripts/geo-sizes.mjs                               # the tables below
node docs/spikes/scripts/geo-sizes.mjs --out <dir> --plotly --timing # + Plotly's files, timings
```

**Marginal** is what an entry adds to a bundle that already holds the d3 code Holochart ships: the
bundle of Holochart's d3 imports plus the entry, minus the bundle of those imports alone. Holochart
imports `color` from d3-color, `format` and `formatLocale` from d3-format, and `timeFormatLocale`
and `utcFormat` from d3-time-format (23.49 kB min, 8.39 kB gzip, with the d3-time they pull in).
d3-array is a dependency of core but no source file imports it, and none of it is in the bundles,
so the geo candidates share nothing with what is there: marginal and standalone sizes differ by
less than 0.1 kB gzip. Checked against the built packages: the first-step subset plus
topojson-client adds 11.64 kB gzip to `export *` of core and 11.92 kB to the full bundle.

### Code

| Entry                                                           | Min      | Gzip     | Brotli   | Marginal gzip |
| --------------------------------------------------------------- | -------- | -------- | -------- | ------------- |
| d3-array: what d3-geo uses (`Adder`, `merge`, `range`)          | 0.73 kB  | 0.47 kB  | 0.43 kB  | 0.35 kB       |
| d3-geo: whole module                                            | 36.80 kB | 13.30 kB | 11.87 kB | 13.24 kB      |
| d3-geo: one projection (`geoMercator`)                          | 16.54 kB | 6.52 kB  | 5.92 kB  | 6.45 kB       |
| d3-geo: first step (14 exports, no `geoPath`)                   | 28.22 kB | 10.62 kB | 9.53 kB  | 10.57 kB      |
| d3-geo: first step + `geoPath`                                  | 32.24 kB | 11.92 kB | 10.70 kB | 11.87 kB      |
| d3-geo: first step + every Plotly projection d3-geo has (15)    | 30.73 kB | 11.44 kB | 10.25 kB | 11.38 kB      |
| d3-geo-projection: whole module, with the d3-geo it needs       | 81.35 kB | 30.81 kB | 27.00 kB | 30.70 kB      |
| d3-geo-projection: the classic nine, with the d3-geo they need  | 19.91 kB | 8.07 kB  | 7.27 kB  | 7.99 kB       |
| d3-geo-projection: every Plotly projection d3-geo lacks (67), … | 46.42 kB | 18.90 kB | 16.74 kB | 18.84 kB      |
| topojson-client: whole module                                   | 6.86 kB  | 2.43 kB  | 2.20 kB  | 2.36 kB       |
| topojson-client: `feature` + `mesh`                             | 3.22 kB  | 1.27 kB  | 1.15 kB  | 1.20 kB       |
| topojson-client: `feature` + `mesh` + `merge`                   | 4.32 kB  | 1.58 kB  | 1.44 kB  | 1.51 kB       |

The first step is GEO2's: `geoEquirectangular`, `geoMercator`, `geoNaturalEarth1`,
`geoOrthographic`, `geoAlbersUsa`, `geoGraticule`, `geoInterpolate`, `geoDistance`, `geoArea`,
`geoCentroid`, `geoBounds`, `geoContains`, `geoStream` and `geoCircle`.

d3-geo tree-shakes, but most of it is the machinery every projection needs (rotation, antimeridian
and circle clipping, adaptive resampling, the stream transforms): one projection alone is 6.5 kB
gzip, half the module. After that a projection is cheap. The ten more that Plotly has and d3-geo
supplies add 0.8 kB together; `geoPath` adds 1.3 kB.

### Plotly's projections

`layout.geo.projection.type` in plotly.js 4.1.1 has 84 names (the keys of `projNames` in
`src/plots/geo/constants.js`), 82 distinct projections: `natural earth` and `natural earth1` are
one, as are `winkel tripel` and `winkel3`. d3-geo and d3-geo-projection cover all of them.

- **In d3-geo (16 names, 15 projections):** albers, albers usa, azimuthal equal area, azimuthal
  equidistant, conic conformal, conic equal area, conic equidistant, equal earth,
  equirectangular, gnomonic, mercator, natural earth, natural earth1, orthographic,
  stereographic, transverse mercator.
- **Need d3-geo-projection (68 names, 67 projections):** airy, aitoff, august, baker, bertin1953,
  boggs, bonne, bottomley, bromley, collignon, craig, craster, cylindrical equal area,
  cylindrical stereographic, eckert1 to eckert6, eisenlohr, fahey, foucaut, foucaut sinusoidal,
  ginzburg4, ginzburg5, ginzburg6, ginzburg8, ginzburg9, gringorten, gringorten quincuncial,
  guyou, hammer, hill, homolosine, hufnagel, hyperelliptical, kavrayskiy7, lagrange, larrivee,
  laskowski, loximuthal, miller, mollweide, mt flat polar parabolic, mt flat polar quartic,
  mt flat polar sinusoidal, natural earth2, nell hammer, nicolosi, patterson, peirce quincuncial,
  polyconic, rectangular polyconic, robinson, satellite, sinu mollweide, sinusoidal, times,
  van der grinten, van der grinten2 to van der grinten4, wagner4, wagner6, wiechel,
  winkel tripel, winkel3.

The "classic nine" are the ones Plotly 1.x had from d3-geo-projection: kavrayskiy7, miller,
robinson, eckert4, mollweide, hammer, winkel tripel, aitoff and sinusoidal.

What d3-geo-projection adds to a bundle that already holds "first step + every Plotly projection
d3-geo has":

| Added                                     | Min      | Gzip     | Brotli   |
| ----------------------------------------- | -------- | -------- | -------- |
| the classic nine                          | 4.13 kB  | 1.70 kB  | 1.51 kB  |
| every Plotly projection d3-geo lacks (67) | 30.71 kB | 12.40 kB | 10.84 kB |
| the whole module                          | 60.27 kB | 22.32 kB | 19.27 kB |

One projection at a time, each of the 67 adds between 0.07 kB (sinusoidal) and 1.23 kB (peirce
quincuncial) gzip, median 0.26 kB; 37 are under 0.3 kB and 15 are 0.5 kB or more. The heaviest
share their elliptic-function code (peirce quincuncial 1.23, gringorten quincuncial 1.13, guyou
1.09, gringorten 0.98, eisenlohr 0.89 kB), so the singles sum to 23.4 kB while all 67 together are
12.4 kB. The classic nine one by one: robinson 0.58, winkel tripel 0.53, aitoff 0.37, eckert4
0.23, mollweide 0.22, hammer 0.21, miller 0.12, kavrayskiy7 0.11, sinusoidal 0.07 kB. The script
prints the full list. d3-geo-projection tree-shakes cleanly: what Plotly does not use (the
interrupted, polyhedral and other projections, `geoProject`, `geoStitch`, `geoQuantize`) is the
other 9.9 kB of the module.

### Natural Earth basemap data (world-atlas)

| File                | Raw = minified JSON | Gzip      | Brotli    | As a chunk, object literal (min / gzip) | As a chunk, `JSON.parse` string (min / gzip) |
| ------------------- | ------------------- | --------- | --------- | --------------------------------------- | -------------------------------------------- |
| countries-110m.json | 107.76 kB           | 38.40 kB  | 32.97 kB  | 105.99 / 38.32 kB                       | 107.80 / 38.46 kB                            |
| land-110m.json      | 55.21 kB            | 20.70 kB  | 18.20 kB  | 55.21 / 20.74 kB                        | 55.25 / 20.78 kB                             |
| countries-50m.json  | 756.42 kB           | 230.10 kB | 205.59 kB | 754.01 / 229.71 kB                      | 756.46 / 230.16 kB                           |
| land-50m.json       | 545.53 kB           | 169.40 kB | 152.68 kB | 545.53 / 169.43 kB                      | 545.58 / 169.46 kB                           |

The files are already minified. As a lazy JS chunk the two forms are the same size within 0.2 %:
the object literal (what rolldown's own JSON import emits) saves the quotes around keys, the
`JSON.parse` string (what Vite emits for large JSON) gzips as well. `JSON.parse` evaluates about
twice as fast: countries-50m takes 18.0 ms as a literal, 8.6 ms as a `JSON.parse` chunk and 6.3 ms
as `JSON.parse` of fetched text; countries-110m 2.2, 1.2 and 0.9 ms (Node 26, median of 15, one
machine: indicative). Decoding every object with `feature` takes 3 ms at 50m.

Geometry after `topojson.feature`. Rings are closed, so a ring's vertex count includes the repeated
first point. All four files are quantized to a longitude step of 0.0036° (1e5 steps).

| File           | Object    | Arcs  | Arc points | Features | Polygons | Rings | Vertices |
| -------------- | --------- | ----- | ---------- | -------- | -------- | ----- | -------- |
| countries-110m | countries | 595   | 8,246      | 177      | 285      | 286   | 10,587   |
| countries-110m | land      | 595   | 8,246      | 1        | 124      | 125   | 5,127    |
| land-110m      | land      | 130   | 5,129      | 1        | 125      | 126   | 5,123    |
| countries-50m  | countries | 1,959 | 80,617     | 241      | 1,616    | 1,629 | 99,539   |
| countries-50m  | land      | 1,959 | 80,617     | 1        | 1,427    | 1,429 | 60,835   |
| land-50m       | land      | 1,425 | 60,635     | 1        | 1,419    | 1,421 | 60,629   |

**One file serves four layers.** `countries-*.json` already contains a `land` object (the merge of
the countries, sharing their arcs), so `land-*.json` is not needed and `topojson.merge` is not
either. Lines come from `mesh`:

| From           | Layer                                         | Lines | Vertices |
| -------------- | --------------------------------------------- | ----- | -------- |
| countries-110m | coastlines: `mesh(land)`                      | 125   | 5,127    |
| countries-110m | borders: `mesh(countries, (a, b) => a !== b)` | 159   | 2,807    |
| countries-50m  | coastlines                                    | 1,429 | 60,835   |
| countries-50m  | borders                                       | 187   | 19,439   |

So "a 50m world" is 60,835 vertices of land fill in 1,429 rings, 99,539 vertices of country fills
in 1,629 rings, 60,835 vertices of coastline and 19,439 of borders; the same at 110m is 5,127,
10,587, 5,127 and 2,807. Shipping countries-50m alone instead of countries-50m and land-50m saves
169.4 kB gzip; at 110m, 20.7 kB. The separate land files differ slightly from the merged land
(1,419 against 1,427 polygons at 50m), as they come from Natural Earth's physical layer.

Precision is the largest lever on the data. The same two files rounded to a step of 0.036° (1e4
steps, the grid of Plotly's older files; about 4 km at the equator) keep nearly every vertex:

| File                            | Minified JSON | Gzip      | Brotli    | Countries vertices | Land vertices |
| ------------------------------- | ------------- | --------- | --------- | ------------------ | ------------- |
| countries-110m, requantized 1e4 | 91.89 kB      | 28.41 kB  | 24.81 kB  | 10,584             | 5,126         |
| countries-50m, requantized 1e4  | 620.59 kB     | 136.26 kB | 116.50 kB | 98,651             | 60,271        |

What world-atlas lacks for GEO2's layers:

| GEO2 layer       | From world-atlas                                                                        |
| ---------------- | --------------------------------------------------------------------------------------- |
| `showland`       | yes: `land`                                                                             |
| `showcountries`  | yes: interior `mesh` of `countries`                                                     |
| `showcoastlines` | yes: `mesh` of `land`                                                                   |
| `showocean`      | no data needed: the projection's outline filled under the land                          |
| `showlakes`      | no                                                                                      |
| `showrivers`     | no                                                                                      |
| `showsubunits`   | no (no states or provinces; the `usa` scope and `locationmode: 'USA-states'` need them) |

Also: country ids are ISO 3166-1 numeric (`"716"`), not the ISO-3 codes `locationmode: 'ISO-3'`
joins on, and the only property is `name`, so a numeric-to-ISO-3 table is needed; three features
at 110m and five at 50m have no id (N. Cyprus, Somaliland, Kosovo; at 50m also Indian Ocean Ter.
and Siachen Glacier); 110m has 177 countries and 50m 241, so small states are missing at 110m;
there are no label points (Plotly's files carry a `ct` centroid per feature). world-atlas 2.0.2
packages Natural Earth 4.1.0 (2018). The package is ISC; Natural Earth states that its data is in
the public domain.

### Plotly's own topojson, for comparison

Downloaded by `--plotly` from `cdn.plot.ly` into the `--out` directory, not into the repository.
plotly.js 4 has two sets. `https://cdn.plot.ly/un/` is the default `topojsonURL` since the switch
to United Nations geodata for coastlines, countries, land and ocean, with Natural Earth for lakes,
rivers and subunits (built in the repo's `topojson/` directory; the npm package no longer contains
the files). `https://cdn.plot.ly/` holds the older files, built by `sane-topojson` from Natural
Earth 4.1.0, the same source as world-atlas. Every file has the seven objects `coastlines`,
`land`, `ocean`, `lakes`, `rivers`, `countries` and `subunits`; countries have ISO-3 ids and a
centroid, subunits a postal code and their country. `subunits` holds the US states at 110m (51
features) and the states of the USA, Canada, Australia and Brazil at 50m (100).

| File                           | Raw        | Gzip       | Brotli     | Lon step | Arcs  |
| ------------------------------ | ---------- | ---------- | ---------- | -------- | ----- |
| un/world_110m.json             | 285.05 kB  | 108.80 kB  | 92.62 kB   | 0.00036° | 1,521 |
| un/world_50m.json              | 1692.31 kB | 611.34 kB  | 499.26 kB  | 0.00036° | 9,010 |
| un/usa_110m.json               | 68.51 kB   | 23.33 kB   | 19.60 kB   | 0.0093°  | 743   |
| un/usa_50m.json                | 304.14 kB  | 97.05 kB   | 82.99 kB   | 0.0024°  | 1,721 |
| un, all 18 files (9 scopes)    | 4458.39 kB | 1511.04 kB | 1267.54 kB |          |       |
| older world_110m.json          | 136.64 kB  | 40.46 kB   | 34.59 kB   | 0.036°   | 1,040 |
| older world_50m.json           | 1100.03 kB | 232.74 kB  | 190.24 kB  | 0.036°   | 4,785 |
| older usa_110m.json            | 49.10 kB   | 16.13 kB   | 13.43 kB   | 0.013°   | 666   |
| older usa_50m.json             | 470.76 kB  | 147.19 kB  | 97.85 kB   | 0.013°   | 7,152 |
| older, all 14 files (7 scopes) | 3850.37 kB | 1069.77 kB | 776.70 kB  |          |       |

The older set has no `antarctica` or `oceania` files (HTTP 403). The continent scopes both sets
have (africa, asia, europe, north-america, south-america) are 8 to 27 kB gzip at 110m and 39 to
335 kB at 50m; the script prints every file with its objects.

What a layer costs, from the older world files (one object and the arcs it uses; layers share
arcs, so the rows sum to more than the file):

| Layer      | 110m: features | 110m: vertices | 110m: gzip | 50m: features | 50m: vertices | 50m: gzip |
| ---------- | -------------- | -------------- | ---------- | ------------- | ------------- | --------- |
| countries  | 177            | 10,583         | 29.52 kB   | 241           | 98,354        | 140.80 kB |
| land       | 127            | 5,126          | 16.81 kB   | 1,420         | 59,859        | 104.81 kB |
| coastlines | 134            | 5,127          | 16.85 kB   | 1,428         | 59,896        | 105.16 kB |
| ocean      | 2              | 5,118          | 16.72 kB   | 1             | 59,843        | 103.77 kB |
| lakes      | 25             | 475            | 1.80 kB    | 275           | 12,376        | 18.92 kB  |
| rivers     | 13             | 1,145          | 3.21 kB    | 461           | 25,523        | 47.20 kB  |
| subunits   | 51             | 2,169          | 5.68 kB    | 100           | 34,001        | 49.72 kB  |
| whole file |                |                | 40.46 kB   |               |               | 232.74 kB |

Plotly's older `world_110m.json` holds all seven layers in 40.5 kB gzip, 2 kB more than
world-atlas's countries-110m with two, and `world_50m.json` in 232.7 kB against 230.1 kB, because
of the coarser grid. The UN world files use a grid ten times finer than world-atlas and are 2.6 to
2.7 times the size of the older ones.

License and attribution, as far as the files and the repository say: the files carry no license
or attribution field (their keys are `type`, `objects`, `arcs`, `transform`, `bbox`). plotly.js is
MIT, and its changelog names the sources, but `topojson/` has no README or license of its own and
states no terms for the UN geodata; the UN geoportal that `topojson/config.mjs` downloads from did
not resolve from this machine, so its terms are unread. `sane-topojson` is MIT and its data is
Natural Earth. The UN terms have to be read before the `un/` files could be redistributed; the
older files and world-atlas rest on Natural Earth alone.

### maplibre-gl 6.11.2

| What                                                   | Min        | Gzip      | Brotli    |
| ------------------------------------------------------ | ---------- | --------- | --------- |
| `dist/maplibre-gl.mjs` (as shipped)                    | 590.23 kB  | 149.48 kB | 126.41 kB |
| `dist/maplibre-gl-shared.mjs` (as shipped)             | 515.92 kB  | 146.90 kB | 120.87 kB |
| `dist/maplibre-gl-worker.mjs` (as shipped)             | 19.13 kB   | 6.11 kB   | 5.49 kB   |
| `dist/maplibre-gl.css` (as shipped)                    | 83.31 kB   | 10.49 kB  | 8.61 kB   |
| bundled: `export *` (main + shared)                    | 1066.70 kB | 281.92 kB | 231.71 kB |
| bundled: `Map` only                                    | 1019.39 kB | 270.99 kB | 222.80 kB |
| bundled: `LngLat` only                                 | 376.72 kB  | 105.41 kB | 87.70 kB  |
| bundled: the worker as its own entry (worker + shared) | 510.00 kB  | 144.26 kB | 118.92 kB |

A page with a map downloads the main module, the shared module and the worker: 302.5 kB gzip of
JavaScript as shipped, plus 10.5 kB of CSS. That is more than half of Holochart's full ESM bundle
(538 kB). It does not tree-shake in any useful way: importing only `Map` saves 4 %, and importing
only `LngLat`, a class of two numbers, still costs 105 kB. The package ships prebundled, minified
files, so a bundler has little to work with.

The worker needs attention in a bundled app. The main module builds the worker's URL at run time
from `import.meta.url` and a file name chosen at run time, which rolldown does not follow: the
bundle of `export *` contains no worker. The app has to serve `maplibre-gl-worker.mjs` and
`maplibre-gl-shared.mjs` beside its bundle or point MapLibre at them (`setWorkerUrl`). Served as
the shipped files, page and worker fetch the shared module from one URL. Bundled as a separate
worker entry, the worker carries its own copy of nearly all the shared code (144 kB gzip), 426 kB
gzip in total. Also, the package's `sideEffects` field lists only its CSS and `src/`, so a module
that merely imports the worker file gets nothing (rolldown drops it, 0 bytes); the worker has to
be an entry.

### What `traces-geo` would add

Dependencies only, marginal over the d3 code Holochart ships; Holochart's own geo code comes on
top. Data rows use the `JSON.parse` chunk.

| What                                                            | Min       | Gzip      | Brotli    |
| --------------------------------------------------------------- | --------- | --------- | --------- |
| d3-geo first step + topojson-client (`feature`, `mesh`)         | 31.76 kB  | 11.69 kB  | 10.32 kB  |
| … with every Plotly projection d3-geo has (15)                  | 34.30 kB  | 12.50 kB  | 11.16 kB  |
| … with every Plotly projection (82), d3-geo-projection included | 65.13 kB  | 24.98 kB  | 22.00 kB  |
| first step + topojson-client + countries-110m chunk             | 139.56 kB | 50.15 kB  | 43.32 kB  |
| first step + topojson-client + countries-50m chunk              | 788.22 kB | 241.84 kB | 215.47 kB |
| first step + topojson-client + both chunks                      | 896.03 kB | 280.31 kB | 248.47 kB |

What the numbers say:

- The code is small and the data is not. The dependencies of a first geo subplot are 11.7 kB
  gzip, and every projection Plotly has brings them to 25.0 kB. One 110m basemap is 38 kB and one
  50m basemap 230 kB, 3 and 20 times the first-step code.
- For scale: the full ESM bundle is at 538.10 kB with a budget of 540 kB and a ceiling of 560 kB.
  The first-step dependencies alone are six times its budget headroom and more than half of
  what is left under the ceiling, before any Holochart code.
- "Every projection Plotly has" costs 13.3 kB gzip more than the first step: 0.8 kB for the ten
  others in d3-geo and 12.4 kB for the 67 from d3-geo-projection. The classic nine are 1.7 kB.
- One countries file per resolution is enough for land, countries, coastlines and borders. Lakes,
  rivers and subunits are not in world-atlas; in Plotly's older files they cost about 11 kB gzip
  at 110m and 116 kB at 50m (layer by layer, above).
- A coarser grid takes countries-50m from 230 to 136 kB gzip and countries-110m from 38 to 28 kB
  with the same vertices.
- d3-geo-projection and topojson-client list `commander` among their dependencies (for their
  command-line tools). It is not bundled, but it is installed with them.

## Sizes after S2.14: keyboard and screen-reader coverage (ship wave R3, 2026-10-03)

S2.14 adds keyboard stops for every chart family, keyboard orbit of 3D scenes and descriptions of
the remaining 3D traces. The full bundle had 2.4 kB of headroom locally (537.58 of 540 kB) and the
script-tag build 4.2 kB, so the code is lazy: each trace package has one accessibility chunk
(`dist/a11y-*.js`, the new row), loaded on a chart's first keyboard focus; the 3D chunk also loads
after the first description of a 3D trace, and now holds the descriptions of `scatter3d` and
`surface` too. The chunks import nothing. Their loaders (`a11y-loader.ts`) hand them the functions
they need, because a lazy chunk that imports from its package makes a bundler split the modules
they share into chunks of their own, whose import and export lists cost more than the code (the
first version, with imports, added 4.2 kB to the full bundle's initial chunk; this one 0.5 kB),
and because a bundle with one trace of a package would otherwise keep the other traces' hover code.

The 2D script (`holochart.iife.min.js`) inlines every lazy chunk, and the 2D packages' chunks
(about 2.9 kB) do not fit its budget, so its build replaces their loaders with no-ops
(`scriptWithoutTraceA11yPlugin` in `packages/holochart/tsdown.config.ts`): in the script-tag build
those families are not keyboard navigable yet. The 3D add-on carries the 3D chunk. Measured with
`pnpm size` locally.

| Entry                                      | Before    | After     | Budget |
| ------------------------------------------ | --------- | --------- | ------ |
| partial: core + scatter                    | 156.06 kB | 156.32 kB | 157 kB |
| partial: basic                             | 247.73 kB | 247.95 kB | 250 kB |
| keyboard navigation and legend keys (lazy) | 5.13 kB   | 5.42 kB   | 5.5 kB |
| full, ESM                                  | 537.58 kB | 538.10 kB | 540 kB |
| trace keyboard stops and 3D descriptions   | —         | 4.10 kB   | 4.6 kB |
| IIFE (2D, includes three)                  | 685.77 kB | 686.64 kB | 690 kB |
| 3D add-on IIFE                             | 110.57 kB | 111.54 kB | 115 kB |

## Sizes after M6 (waves 1–3, 2026-09-30)

M6 waves 1–3 add the 3D traces (scatter3d, surface, mesh3d, cone, streamtube, isosurface, volume,
bar3d), Express `scatter3d`/`line3d`, and the 2.5D view (`layout.view3d`) with extrusion (`depth`
on bar, pie, funnel, waterfall, heatmap, area, treemap and icicle). The 2.5D code is a lazy chunk
of the full bundle; in the script-tag build it ships in the 3D add-on, including the 2.5D view
component's view, so the 2D script keeps only the component's schema and loader. The 3D add-on
budget was raised by decision (81 → 105 → 115 kB). Measured with `pnpm size` locally.

| Entry                               | After M6 wave 0 | After M6  | Budget      |
| ----------------------------------- | --------------- | --------- | ----------- |
| partial: basic                      | 245.4 kB        | 245.75 kB | 248 kB      |
| full, ESM                           | 468.53 kB       | 536.68 kB | 540 kB      |
| IIFE (2D, includes three)           | 681.45 kB       | 684.88 kB | 690 kB      |
| 3D add-on IIFE                      | 30.83 kB        | 110.45 kB | 34 → 115 kB |
| 2.5D view and extrusion (lazy, new) | —               | 12.53 kB  | 13.5 kB     |
| 2.5D view component (lazy, new)     | —               | 2.43 kB   | 2.7 kB      |

## Sizes after M6 wave 0: the script-tag split (2026-09-29)

M6 wave 0 adds the 3D scene subplot (`traces-3d`) and render's lazily loaded 3D chunks (mesh,
lighting and materials; 3D lines, sprites and spheres). The IIFE inlined all of it and reached
708.8 kB against its 690 kB budget, and the 3D traces of waves 1–3 add more, so the script-tag
build was split by decision into the 2D script and a 3D add-on (above). The full ESM budget was
raised to 540 kB for M6 by decision. Measured with `pnpm size` locally (macOS; CI measures about
0.3–0.5% more).

| Entry                       | Before the split   | After     | Budget       |
| --------------------------- | ------------------ | --------- | ------------ |
| full, ESM                   | 468.53 kB          | 468.53 kB | 475 → 540 kB |
| IIFE (2D, includes three)   | 708.8 kB (with 3D) | 681.45 kB | 690 kB       |
| 3D add-on IIFE              | —                  | 30.83 kB  | 34 kB        |
| 3D mesh primitive (lazy)    | 10.6 kB            | 10.6 kB   | 11.7 kB      |
| 3D lines and markers (lazy) | 9.71 kB            | 9.71 kB   | 10.7 kB      |

The 2D script without the shared three.js classes would be 677.65 kB (the pre-M6 size plus M6
wave 0's 2D changes); sharing them costs 3.8 kB. The two scripts together (712.3 kB) are 3.5 kB
more than the single script was.

## Sizes after M5 wave 2 (2026-09-28)

M5 wave 2 adds keyboard access (E6.5, E17.4: navigating the data and the legend; the code is two
lazy chunks of `basic`, loaded on the chart's first focus and with the first legend of an
interactive chart), touch and pen input through one Pointer Events pipeline (E6.6), focus
handling and the carry-forward fixes. Measured with `pnpm size` locally (macOS) at the wave 2
merge, and again with M5 wave 3's legends (multiple legends, scrolling: a new 1.62 kB lazy chunk),
P1 parity work and `supplyDefaults` fixes in. CI (Linux) measures about 0.3% (basic) to 0.5%
(IIFE) more, and CI is the reference: the estimate column applies the ratios measured after M4
wave 2 (core + scatter +0.38%, basic +0.32%, full +0.36%, IIFE +0.51%) to the wave 3 numbers.

| Entry                           | Wave 1    | Wave 2    | Wave 3 (in progress) | Est. CI (wave 3) | Budget |
| ------------------------------- | --------- | --------- | -------------------- | ---------------- | ------ |
| partial: core + scatter         | 151.63 kB | 152.83 kB | 153.35 kB            | ≈ 153.9 kB       | 157 kB |
| partial: basic                  | 240.93 kB | 242.62 kB | 244.50 kB            | ≈ 245.3 kB       | 248 kB |
| full, ESM                       | 450.25 kB | 453.24 kB | 456.33 kB            | ≈ 458.0 kB       | 475 kB |
| IIFE (includes three)           | 664.85 kB | 671.96 kB | 676.59 kB            | ≈ 680.0 kB       | 690 kB |
| keyboard and legend keys (lazy) | —         | 5.03 kB   | 5.13 kB              |                  | 5.5 kB |
| legend scrolling (lazy)         | —         | —         | 1.62 kB              |                  | 1.8 kB |
| chart summaries and table       | 5.24 kB   | 5.24 kB   | 5.24 kB              |                  | 5.8 kB |
| sankey flow particles           | 3.21 kB   | 3.21 kB   | 3.21 kB              |                  | 3.6 kB |

Headroom on CI (estimated, wave 3): ~3.1 kB for core + scatter, ~2.7 kB for `basic`, ~17 kB for
the full bundle and ~10 kB for the IIFE; `basic` is now the tightest budget. Other lazy rows: text
engine 46.62 kB, fill 8.88 kB, controls views 14.55 kB, pattern fills 2.00 kB, style rules
3.62 kB. The wave 3 `supplyDefaults` fixes from the nightly property run (match-group range
breaks, range slider thumbnail ranges, scaled font sizes) account for about 0.2 kB of each entry
that includes core.

## Sizes after M5 wave 1 (2026-09-28)

M5 adds `traces-hier` (sunburst, sankey, treemap, icicle) and Express's hierarchy functions to
the full bundle, and accessibility (summaries, data table), locales plumbing and sankey flow
particles. Heavy parts are lazy chunks in the ESM build; the IIFE inlines them.

| Entry                     | Local (macOS) | Est. CI (+0.3%) | Budget       |
| ------------------------- | ------------- | --------------- | ------------ |
| partial: core + scatter   | 151.63 kB     | ≈ 152.1 kB      | 153 → 157 kB |
| partial: basic            | 240.93 kB     | ≈ 241.6 kB      | 242 → 248 kB |
| full, ESM                 | 450.25 kB     | ≈ 451.6 kB      | 450 → 475 kB |
| IIFE (includes three)     | 664.85 kB     | ≈ 666.8 kB      | 650 → 690 kB |
| chart summaries and table | 5.24 kB       |                 | 5.8 kB       |
| sankey flow particles     | 3.21 kB       |                 | 3.6 kB       |

IIFE growth in wave 1: treemap/icicle ~8.2 kB, accessibility ~7.2 kB (its lazy chunks inlined),
sankey flow ~4.7 kB, Express hierarchy ~1.4 kB. The budgets were raised for all of M5 by decision,
leaving room for wave 2's keyboard, touch and focus handling in `basic`.

## Sizes after M4 wave 2 (2026-09-28)

The M4 trace types (`traces-sci`, `traces-finance`) sit outside `basic`; what reached `basic` in
waves 1 and 2 is plumbing: pattern hooks in the rect, arc and fill primitives and bar, pie and
scatter (the pattern code itself is a 2.0 kB lazy chunk), funnel axis defaults, legend `parts`
glyphs, hover `extraText`, template entries.

| Entry                   | CI (Linux) | Local (macOS) | Budget       |
| ----------------------- | ---------- | ------------- | ------------ |
| partial: core + scatter | 149.67 kB  | 149.10 kB     | 153 kB       |
| partial: basic          | 238.60 kB  | 237.84 kB     | 238 → 242 kB |
| full, ESM               | 408.90 kB  | 407.42 kB     | 450 kB       |
| IIFE (includes three)   | 616.64 kB  | 613.52 kB     | 650 kB       |
| pattern fills (lazy)    | 2.02 kB    | 2.00 kB       | 2.25 kB      |

**CI is the reference.** The same tree measures about 0.3% larger on CI than in a local macOS run
(gzip output differs between the environments), so a local result within ~1 kB of a budget can
still fail CI. `basic` was raised to 242 kB by decision after it failed CI at 238.60 kB.

## Sizes after M4 wave 0 (2026-09-27)

Style rules and functions (E8.5, E8.6), custom marker symbols and image sprites (E8.11), line
level of detail (E16.2), and the M3 carry-forward (legend group titles, bar periods, overlay grid
order). Each workstream put its heavy code in a lazy chunk; what stays in the initial chunks is the
glue that decides to load it, plus the carry-forward fixes.

| Entry                                 | Before (M3 wave 3) | After     | Change   | Budget       |
| ------------------------------------- | ------------------ | --------- | -------- | ------------ |
| partial: core + scatter               | 145.90 kB          | 148.04 kB | +2.14 kB | 153 kB       |
| partial: basic                        | 232.78 kB          | 235.74 kB | +2.96 kB | 234 → 238 kB |
| full, ESM                             | 339.04 kB          | 342.40 kB | +3.36 kB | 450 kB       |
| IIFE (includes three)                 | 535.69 kB          | 546.99 kB | +11.3 kB | 650 kB       |
| line level of detail (lazy, new)      | —                  | 2.08 kB   | new      | 2.3 kB       |
| custom markers and images (lazy, new) | —                  | 3.55 kB   | new      | 3.9 kB       |
| style rules and functions (lazy, new) | —                  | 3.6 kB    | new      | 4 kB         |

The `basic` budget was raised to 238 kB by decision instead of trimming further: the new trace
types of M4 go into new packages (`traces-sci`, `traces-finance`) outside `basic`. The IIFE
inlines the lazy chunks, hence its larger step.

## Sizes after M3 wave 3: Express (2026-09-25)

Measured on the M3 wave 3 working tree before and after the Express package (plan E23.1–E23.4,
E10.7, E10.8) and the legend's room for facet labels landed, everything else equal. Initial
sizes; the lazy chunks are unchanged.

| Entry                        | Before    | After     | Change   | Budget |
| ---------------------------- | --------- | --------- | -------- | ------ |
| `@mk7s/holochart-core`       | 69.67 kB  | 69.69 kB  | +0.02 kB | —      |
| `@mk7s/holochart-components` | 107.99 kB | 108.08 kB | +0.09 kB | —      |
| `@mk7s/holochart-express`    | —         | 106.48 kB | new      | —      |
| partial: core + scatter      | 145.90 kB | 145.90 kB | 0        | 153 kB |
| partial: basic               | 232.65 kB | 232.78 kB | +0.13 kB | 234 kB |
| full, ESM                    | 326.12 kB | 339.04 kB | +12.9 kB | 450 kB |
| IIFE (includes three)        | 522.51 kB | 535.69 kB | +13.2 kB | 650 kB |

The full bundle now includes Express as a namespace (`export * as express from
'@mk7s/holochart-express'`; `Holochart.express` in the IIFE), because its `scatter`, `strip`,
`timeline`, `box`, … share their names with the trace modules and helpers the bundle exports.
Express adds about **12.8 kB** to the full bundle and 13 kB to the IIFE: the table model and CSV
parser, the grouping engine, facet grids, animation controls, the 16 functions, the KDE and
`ff.distplot`; ESM apps that never touch `express` tree-shake it away. The package row
(106.43 kB) is mostly the runtime and core it imports (`newPlot` for its render-into-an-element
overload, the registry for the default template's colors); an app that draws charts has those
already. The other entries grow by the legend's room for top-row subplot titles and facet labels
(components) and `FACET_LABEL_NAME` (core); `basic` now uses 99.5% of its budget (1.22 kB left).

## Sizes after M3 wave 3 transitions and animation (2026-09-25)

Measured on the M3 wave 3 working tree before and after transitions, frames and `animate` (E7.3,
E7.4) landed, everything else equal. Initial sizes; the text engine, fill, controls and font
chunks are unchanged.

| Entry                          | Before    | After     | Change   | Animation (lazy) | Budget |
| ------------------------------ | --------- | --------- | -------- | ---------------- | ------ |
| `@mk7s/holochart-runtime`      | 92.10 kB  | 93.69 kB  | +1.59 kB | 5.81 kB          | —      |
| `@mk7s/holochart-components`   | 107.99 kB | 107.99 kB | 0        | 5.81 kB          | —      |
| `@mk7s/holochart-traces-basic` | 118.53 kB | 118.58 kB | +0.05 kB | 5.81 kB          | —      |
| partial: core + scatter        | 145.51 kB | 145.90 kB | +0.39 kB | 5.81 kB          | 153 kB |
| animation (lazy, new)          | —         | 5.81 kB   | new      | —                | 6.4 kB |
| partial: basic                 | 232.17 kB | 232.65 kB | +0.48 kB | 5.81 kB          | 234 kB |
| full, ESM                      | 325.63 kB | 326.12 kB | +0.49 kB | 5.81 kB          | 450 kB |
| IIFE (includes three)          | 517.24 kB | 522.51 kB | +5.27 kB | inlined          | 650 kB |

What the entry gains: the `addFrames` / `deleteFrames` / `animate` methods and functional
wrappers, the chart's hooks for the lazily loaded code (the `react` branch for
`layout.transition`, `fullLayout._currentFrame`, in-between runs without validation), and longer
`animatable` lists on scatter and bar. `basic` now uses 99.4% of its budget (1.35 kB left). The
runtime package on its own grows more because the animation chunk mixes colors with render's
`mixColors` (OKLab), which a runtime without traces didn't include before; every entry with traces
already has it.

## Sizes after M3 wave 2 (2026-09-25)

Measured on the M3 wave 2 working tree before and after the controls' views were made lazy
(E21.6), everything else equal. Initial sizes; Lazy, Fill and the fonts (346.61 kB, four faces)
are unchanged for every entry.

| Entry                          | Before         | After     | Change    | Controls (lazy) | Budget   |
| ------------------------------ | -------------- | --------- | --------- | --------------- | -------- |
| `@mk7s/holochart-core`         | 69.67 kB       | 69.67 kB  | 0         | —               | —        |
| `@mk7s/holochart-render`       | 69.85 kB       | 69.85 kB  | 0         | —               | —        |
| `@mk7s/holochart-runtime`      | 92.10 kB       | 92.10 kB  | 0         | —               | —        |
| `@mk7s/holochart-components`   | 117.19 kB      | 107.99 kB | −9.20 kB  | 14.35 kB        | —        |
| `@mk7s/holochart-traces-basic` | 118.53 kB      | 118.53 kB | 0         | —               | —        |
| `@mk7s/holochart-traces-stats` | 160.25 kB      | 160.25 kB | 0         | —               | —        |
| `@mk7s/holochart-themes`       | 9.41 kB        | 9.41 kB   | 0         | —               | —        |
| partial: core + scatter        | 145.51 kB      | 145.51 kB | 0         | —               | 153 kB   |
| text engine (lazy)             | 46.62 kB       | 46.62 kB  | 0         | —               | 49 kB    |
| fill primitive (lazy)          | 8.52 kB        | 8.52 kB   | 0         | —               | 9.4 kB   |
| font faces (lazy, each)        | 85.75–88.59 kB | unchanged | 0         | —               | 95–98 kB |
| partial: basic                 | 243.45 kB      | 232.17 kB | −11.28 kB | 14.49 kB        | 234 kB   |
| controls views (lazy, new)     | —              | 14.49 kB  | new       | —               | 16 kB    |
| full, ESM                      | 336.52 kB      | 325.63 kB | −10.89 kB | 14.48 kB        | 450 kB   |
| IIFE (includes three)          | 514.70 kB      | 517.24 kB | +2.54 kB  | inlined         | 650 kB   |

`basic` was 9.45 kB over its budget and now uses 99.2% of it (1.83 kB left); the controls row's
budget is measured + ~10%. The chunks compress separately, so moving 14.5 kB of lazy code takes
11.3 kB out of `basic`. What stays in the entry for these components: their schemas and defaults
(~3.8 kB gzipped on their own for menus and sliders), the layout and margin code, the component
wiring and the lazy loader (~0.9 kB). The IIFE grows because rolldown wraps the inlined views, and
the entry modules they import, as lazily initialized modules. View-only code left in modules the
entry needs, a few hundred bytes: `shared/dom.ts`'s `applyDomFont`, `nextFrame` and `uniqueDomId`
(the module is shared with the modebar), and the placement functions in the menus', sliders' and
range selector's `layout.ts`.

## Sizes after M3 wave 0 (2026-09-24)

Measured on `main` (b4e5d00) plus the E21.6 trims only (below); the rest of M3 wave 0 moves these
numbers too, so re-run `pnpm size` for the merged tree. Initial download per entry. Lazy chunks
are listed separately: the text engine (loaded the first time a chart draws text; the export code
rides in the same lazy chunk), the fill chunk (the first time a chart draws a fill), and the
default font's faces (the regular face with the first text; bold and italic only when used).
Charts without text or fills load none of them. The last column is the M2 wave 2 initial size,
measured the same way on `main`.

| Entry                          | Initial   | Lazy     | Fill    | Budget | M2 wave 2 |
| ------------------------------ | --------- | -------- | ------- | ------ | --------- |
| `@mk7s/holochart-core`         | 61.65 kB  | —        | —       | —      | 61.65 kB  |
| `@mk7s/holochart-render`       | 63.68 kB  | 45.73 kB | 5.60 kB | —      | 61.49 kB  |
| `@mk7s/holochart-runtime`      | 74.59 kB  | 1.03 kB  | —       | —      | 74.66 kB  |
| `@mk7s/holochart-components`   | 94.00 kB  | 45.73 kB | 8.52 kB | —      | 101.97 kB |
| `@mk7s/holochart-traces-basic` | 114.59 kB | 45.73 kB | 8.52 kB | —      | 122.62 kB |
| `@mk7s/holochart-themes`       | 8.52 kB   | —        | —       | —      | 8.61 kB   |
| partial: core + scatter        | 129.99 kB | 46.62 kB | 8.52 kB | 153 kB | 139.02 kB |
| text engine (lazy)             | 46.62 kB  | —        | —       | 49 kB  | 46.62 kB  |
| fill primitive (lazy)          | 8.52 kB   | —        | —       | 9.4 kB | —         |
| partial: basic                 | 205.75 kB | 46.62 kB | 8.52 kB | 234 kB | 213.41 kB |
| full, ESM                      | 240.16 kB | 46.62 kB | 5.59 kB | 450 kB | 239.56 kB |
| IIFE (includes three)          | 418.06 kB | inlined  | inlined | 650 kB | 417.46 kB |

The fill row's budget is measured + ~10%; the other budgets are unchanged (core + scatter now uses
85% of its budget, basic 88%).

Wave 2 added rich text (~3.7 kB of core + scatter, ~5 kB of basic), the accessible description
and lazy export path (~3 kB / ~5 kB), and to `basic` only the `table` trace (~6.5 kB) and the
`timeline()` helper (~1 kB).

| Default font face (lazy)   | Size     | Budget |
| -------------------------- | -------- | ------ |
| TeX Gyre Heros regular     | 85.75 kB | 95 kB  |
| TeX Gyre Heros bold        | 86.03 kB | 95 kB  |
| TeX Gyre Heros italic      | 88.59 kB | 98 kB  |
| TeX Gyre Heros bold italic | 86.23 kB | 95 kB  |

The default look (ADR-021) added the `holochart` template to core and its registration to the
runtime (~1 kB), and the font loader (~0.7 kB). The IIFE loads `fonts/*.otf` shipped next to it
instead of inlining them.

Wave 1 added area fills (the fill primitive and exact-fill code, ~12 kB of core + scatter), fonts
and colorscale interpolation, grid and domain placement, pie (~10 kB of basic), shapes and images
(~10 kB), and the themes and color data (~8 kB; scatter-only bundles ship only the plotly.js
colorscales, the rest arrive with `registerBuiltinColors()`). By decision, the budgets were raised
to about 10% above the measured sizes (142 / 212 kB); E21.6 (M3 wave 0, below) split the fill code
out, so charts without fills don't load it.

History: the partial budgets started at 90 kB and 150 kB, set before the SDF text engine's weight
was known. They were raised to measured + 10% in M1 (165 / 200 kB after wave 2, `basic` 215 kB
after wave 3) by decision, then tightened to measured + ~10% (120 / 170 kB) after the diet below,
raised to measured + ~10% (142 / 212 kB) after M2 wave 1, and to 153 / 234 kB after M2 wave 2
(rich text, table, accessibility and export), both by decision.

Splitting the text engine out costs about 1.8 kB in total (two chunks compress separately, and the
loader adds a little code), and the IIFE about 3.3 kB (the inlined engine is wrapped as a lazily
initialized module). `preloadTextEngine()` from `@mk7s/holochart-render` starts the download early.

## Default font (2026-09-23, M2 default look)

Measured on the working tree with the new default look in progress (core and themes numbers are
still moving, so the table above is not refreshed yet):

| Lazy chunk (core + scatter) | min+gz   | Budget |
| --------------------------- | -------- | ------ |
| TeX Gyre Heros Regular      | 85.75 kB | 95 kB  |
| TeX Gyre Heros Bold         | 86.03 kB | 95 kB  |
| TeX Gyre Heros Italic       | 88.59 kB | 98 kB  |
| TeX Gyre Heros Bold Italic  | 86.23 kB | 95 kB  |
| all four (the Fonts column) | 346.6 kB | —      |

The face loader, the `data:`→`blob:` conversion and the face matching add about 0.7 kB to the
initial chunk of anything that draws text (render's text exports: 10.9 → 11.6 kB), and replace
the troika CDN fallback faces the metrics oracle registered before. The IIFE grows by the same
code only; its four `.otf` files (133–139 kB each, uncompressed) are separate downloads. The text
engine chunk is unchanged (45.73 kB).

## Diet

Plan E21.5. Three steps: lazy-load the text engine (above), strip schema descriptions from
production builds, and audit tree-shaking.

**Descriptions** ([ADR-020](../adr/020-strip-schema-descriptions.md)). A rolldown plugin
(`scripts/build/strip-descriptions.ts`) blanks the `description` of every `attr.*()` call, and the
argument of helpers such as `fontSchema('…')`, in `dist/index.js` and the IIFE (about 470
strings). Core, runtime, components and traces-basic also ship `dist/index.development.js` with
descriptions, under the `development` export condition. Sources, the docs attribute reference
(byte-identical), TypeDoc, vitest and the JSDoc in `index.d.ts` keep them.
`tests/build/strip-descriptions.test.ts` checks the output. Measured on the same tree, built with
`HOLOCHART_KEEP_DESCRIPTIONS=1` (before) and without (after):

| Entry                          | Before    | After     | Change           |
| ------------------------------ | --------- | --------- | ---------------- |
| `@mk7s/holochart-core`         | 49.14 kB  | 42.92 kB  | −6.23 kB (−13%)  |
| `@mk7s/holochart-runtime`      | 70.62 kB  | 63.98 kB  | −6.64 kB (−9%)   |
| `@mk7s/holochart-components`   | 87.72 kB  | 79.24 kB  | −8.48 kB (−10%)  |
| `@mk7s/holochart-traces-basic` | 89.46 kB  | 78.26 kB  | −11.20 kB (−13%) |
| partial: core + scatter        | 118.83 kB | 107.90 kB | −10.93 kB (−9%)  |
| partial: basic                 | 167.82 kB | 154.09 kB | −13.74 kB (−8%)  |
| full, ESM                      | 183.75 kB | 170.04 kB | −13.71 kB (−7%)  |
| IIFE (includes three)          | 359.19 kB | 345.33 kB | −13.86 kB (−4%)  |

Initial sizes; the lazy text engine (44.17 kB) and render (53.02 kB) are unchanged. After both
steps the partial budgets were tightened to 120 / 170 kB (measured + ~10%).

**Tree-shaking audit** (core + scatter, per-module sizes from a source build). No component and
no unused render primitive is included: from render only markers, lines, text, the render root,
the point index (flatbush) and the colorscale LUT, all used by scatter or hover; every package is
`sideEffects: false` and there are no registries that import everything. Findings:

- Fixed in E21.6 (below). The bar schema (`barAttributes`, `barLayoutAttributes`) survives in the
  scatter partial, about 0.13–0.18 kB: each package's `dist/index.js` is one file, and top-level `attr.*()` calls and an
  object spread look side-effectful to the app's bundler. Left as is: `/* @__PURE__ */` on those
  declarations saves 0.13 kB; one output file per module (tsdown `unbundle`) saves 0.18 kB for
  every such case but changes the published layout (ADR-015).
- `Chart#toJSON` is a class method, so every chart bundles `core/serialize` and `runtime/json.ts`
  (2.3 kB). Making it a separate `chartToJSON()` export is an API decision. Decided in wave R3:
  the method is gone and `chartToJSON(chart)` is the only way to serialize.
- Fixed in E21.6 by loading the fill code lazily (below). In `basic`, annotations draw boxes and
  arrowheads with the fill primitive, which pulls in earcut
  and the self-intersection code (`fill-arrangement.ts`): 7.4 kB, of which the arrangement is
  2.6 kB. Annotation shapes are simple polygons; a cheaper path would recover most of it.

## Trims (plan E21.6, M3 wave 0)

Measured on `main` plus these changes only, step by step (the measurement bundles gzipped at level
9; size-limit's numbers differ by a few bytes):

| Entry                          | Schema leaks | Fill split (initial) | Fill (lazy) |
| ------------------------------ | -----------: | -------------------: | ----------: |
| partial: core + scatter        |     −1.41 kB |             −7.63 kB |    +8.52 kB |
| partial: basic                 |     −0.07 kB |             −7.59 kB |    +8.52 kB |
| `@mk7s/holochart-traces-basic` |     −0.11 kB |             −7.92 kB |    +8.52 kB |
| `@mk7s/holochart-components`   |     −0.09 kB |             −7.88 kB |    +8.52 kB |
| `@mk7s/holochart-render`       |         0 kB |             +2.19 kB |    +5.60 kB |
| full, ESM                      |     +0.02 kB |             +0.58 kB |    +5.59 kB |

**Fill split.** Described under Budgets: scatter fills, shapes and annotations draw through
`LazyFillPrimitive`, which loads `fill-lazy` on first use. Its `object` is the fill's mesh from
the start (a hidden placeholder the fill primitive draws into once loaded), so callers keep
setting `renderOrder` on it and `getTraceObjects()` returns the same kind of object. Entries that
keep the public fill exports (render's `export *`, the full bundle's `render` namespace) grow: they
keep their copy and gain the loader, and the fill chunk's imports from render's `index.js` make
app bundlers put that module in its own initial chunk. Its import/export name lists (~1.3 kB
before gzip in core + scatter, included above) are most of render's +2.2 kB. A self-contained fill chunk
(its own copies of the shared helpers) avoids the extra chunk but measured +2.3 kB lazy and
+0.07 kB initial for core + scatter, so it was not taken. The IIFE grows by 0.6 kB (the loader,
and the inlined chunk wrapped as a lazily initialized module).

**Schema leaks.** A package's `dist/index.js` is one file, so an app bundler cannot drop an unused
module's top-level `attr.*()` calls or object spreads: they look side-effectful. The scatter
partial carried the bar, pie and table schemas (plus `coordinate()` calls, a `layoutSchema` spread
and `tableFont`), ~1.4 kB. They are now wrapped in `/* @__PURE__ */` IIFEs (bar, pie and table
`attributes.ts`, bar's `layoutSchema`); a `/* @__PURE__ */` on the outer call alone is not enough,
since bundlers keep the arguments' side effects. Also annotated: `plotlyjsGroup()` calls in core's
`colors/builtins.ts`, and top-level `new Matrix4()` / `new Vector4()` scratch objects in render's
`pick-window.ts` and traces-basic's `table/clip.ts` (a few dozen bytes each). The wrappers cost
~10 bytes in bundles that use the schemas.

**Audit (rolldown, per module).** After these changes, the core + scatter and basic partials carry
no other unused package code. Left, with sizes:

- `Chart#toJSON` still bundles the serializer (core `serialize/` + runtime `json.ts`, ~2.3 kB):
  an API decision (plan E21.6). Removed in wave R3 in favour of `chartToJSON(chart)`.
- Scatter's trace-level fill code (`scatter/fill.ts`, `fill-trace.ts`, `shared/stack/area.ts`:
  7.3 kB gzipped per module before minification, a few kB min + gzip) stays in the initial chunk:
  calc, autorange and `hoveron: 'fills'` use it synchronously. Splitting it needs the trace
  pipeline to await it (scatter interaction and stack belong to another workstream this wave).
- d3-time keeps a few top-level `interval.range` property reads and an unused `timeInterval()`
  call (dependency code, ~0.2 kB; bundlers keep property reads).

## Partial bundles

The full bundle registers every trace and component. To ship only what you use, import the
runtime and register trace modules yourself (`register()` lives in `@mk7s/holochart-runtime`;
core stays renderer-free, ADR-019):

```ts
import { createChart, register } from '@mk7s/holochart-runtime';
import { scatter, bar } from '@mk7s/holochart-traces-basic';

register(scatter, bar);
// createChart(…) now renders scatter and bar traces; other trace types are not included.
```

`three` must be installed next to Holochart (peer dependency). The exact `createChart` signature
is defined by the runtime (ADR-019, in progress); see the docs site's getting-started page.

## Follow-ups

- Prebuilt CDN variant bundles `holochart-basic`, `holochart-cartesian`, `holochart-3d` (plan
  E21.1): add IIFE entries to `packages/holochart/tsdown.config.ts` once the trace packages exist,
  and a size entry with a budget for each.
- Narrow `partial-basic` to named exports once the runtime API settles.
