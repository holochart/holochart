# Bundle size

Plan E21.1 and §5 ("Size tracking"). Budgets are checked in CI by the `bundle size` job.

## Budgets

Sizes are **minified + gzipped**, in decimal kB (1 kB = 1000 bytes, size-limit's unit), and
**exclude three.js** unless stated.

| Entry                                   | What it measures                                           | Budget |
| --------------------------------------- | ---------------------------------------------------------- | ------ |
| `partial: core + scatter`               | `createChart` + `register` from runtime, `scatter` trace   | 153 kB |
| `text engine (lazy chunk …)`            | the SDF text engine chunk, loaded on first text use        | 49 kB  |
| `fill primitive (lazy chunk …)`         | fill primitive + earcut + exact fill rules, on first fill  | 9.4 kB |
| `animation (lazy chunk …)`              | transitions, frames and `animate`, on first animation      | 6.4 kB |
| `default font, regular face (lazy …)`   | TeX Gyre Heros Regular chunk, loaded on first text use     | 95 kB  |
| `default font, bold face (lazy …)`      | the bold face chunk, loaded when bold text is drawn        | 95 kB  |
| `default font, italic face (lazy …)`    | the italic face chunk, loaded when italic text is drawn    | 98 kB  |
| `default font, bold italic face (…)`    | the bold italic face chunk                                 | 95 kB  |
| `partial: basic`                        | runtime + components + traces-basic + themes (all exports) | 234 kB |
| `controls views (lazy chunks of basic)` | menus, sliders, range selector/slider, selections views    | 16 kB  |
| `@mk7s/holochart (full, ESM)`           | everything the full bundle exports                         | 450 kB |
| `@mk7s/holochart + …-express (ESM)`     | the full bundle plus every Express function (`hx.*`)       | 371 kB |
| `@mk7s/holochart IIFE (includes three)` | `dist/holochart.iife.min.js` as shipped, **with** three.js | 650 kB |
| each `@mk7s/holochart-*` package        | `export *` of that package                                 | report |

The IIFE budget is the full budget plus a 200 kB allowance for the bundled three.js (about
170–190 kB min + gzip on its own; ADR-015). Per-package entries are reported but not gated.

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

## Current sizes (2026-09-25, M3 wave 3: Express)

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
  (2.3 kB). Making it a separate `chartToJSON()` export is an API decision.
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
  an API decision (plan E21.6).
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
