# Bundle size

Plan E21.1 and §5 ("Size tracking"). Budgets are checked in CI by the `bundle size` job.

## Budgets

Sizes are **minified + gzipped**, in decimal kB (1 kB = 1000 bytes, size-limit's unit), and
**exclude three.js** unless stated.

| Entry                                   | What it measures                                           | Budget |
| --------------------------------------- | ---------------------------------------------------------- | ------ |
| `partial: core + scatter`               | `createChart` + `register` from runtime, `scatter` trace   | 142 kB |
| `text engine (lazy chunk …)`            | the SDF text engine chunk, loaded on first text use        | 49 kB  |
| `partial: basic`                        | runtime + components + traces-basic + themes (all exports) | 212 kB |
| `@mk7s/holochart (full, ESM)`           | everything the full bundle exports                         | 450 kB |
| `@mk7s/holochart IIFE (includes three)` | `dist/holochart.iife.min.js` as shipped, **with** three.js | 650 kB |
| each `@mk7s/holochart-*` package        | `export *` of that package                                 | report |

The IIFE budget is the full budget plus a 200 kB allowance for the bundled three.js (about
170–190 kB min + gzip on its own; ADR-015). Per-package entries are reported but not gated.

An ESM entry's size is its **initial** download. Code an entry loads on demand with a dynamic
`import()` is its **lazy** size, reported next to it; today that is only the SDF text engine
(troika-three-text, bidi-js, webgl-sdf-generator, troika-worker-utils, troika-three-utils; plan
E21.5), which has its own gated row. So core + scatter costs its initial size before the first
frame and the text engine's size once it draws a label.

Entries and budgets live in one place, [`tests/bundle/size/entries.ts`](../../tests/bundle/size/entries.ts),
which [`.size-limit.ts`](../../.size-limit.ts) reads.

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
statically is written to `<id>.js` (the **initial** size); every other chunk goes to
`<id>.lazy.js` (the **lazy** size), so each output chunk is counted exactly once and nothing drops
out of the numbers. `manifest.json` records which packages the lazy chunks contain. size-limit
(`@size-limit/file`) then gzips the results; a `lazyOf` entry in `entries.ts` gates another entry's
lazy file (the text-engine row measures core + scatter's), and `bundle.ts` fails if that entry has
no lazy chunks. The report adds a per-entry **Lazy** column (gzip level 9, like size-limit). The
IIFE is measured as built: it is a single file, so the build inlines the text engine (as a module
initialized on first use) and its lazy column reads "inlined".

Until an entry's named exports exist (for example `scatter` before the scatter trace lands), that
entry measures the whole package instead and the report adds a footnote.

In CI, the job writes the table to the job summary, uploads `size.json` as the `size-report`
artifact, compares with the latest successful `main` run, and posts or updates one PR comment
(same-repo PRs only; fork PRs get a read-only token, so they get the job summary only).

## Current sizes (2026-09-23, M2 wave 1)

Initial download per entry, with the lazily loaded text engine in its own column (a chart
downloads it the first time it draws text; charts without text never do).

| Entry                          | Initial   | Lazy     | Budget | M2 wave 0 |
| ------------------------------ | --------- | -------- | ------ | --------- |
| `@mk7s/holochart-core`         | 57.74 kB  | —        | —      | 42.92 kB  |
| `@mk7s/holochart-render`       | 58.99 kB  | 45.73 kB | —      | 53.02 kB  |
| `@mk7s/holochart-runtime`      | 68.70 kB  | —        | —      | 64.00 kB  |
| `@mk7s/holochart-components`   | 98.54 kB  | 45.73 kB | —      | 79.24 kB  |
| `@mk7s/holochart-traces-basic` | 106.86 kB | 45.73 kB | —      | 78.26 kB  |
| `@mk7s/holochart-themes`       | 8.09 kB   | —        | —      | 0 kB      |
| partial: core + scatter        | 129.20 kB | 45.73 kB | 142 kB | 107.92 kB |
| text engine (lazy)             | 45.73 kB  | —        | 49 kB  | 44.17 kB  |
| partial: basic                 | 192.93 kB | 45.73 kB | 212 kB | 154.10 kB |
| full, ESM                      | 217.96 kB | 45.73 kB | 450 kB | 170.06 kB |
| IIFE (includes three)          | 394.36 kB | inlined  | 650 kB | 345.35 kB |

Wave 1 added area fills (the fill primitive and exact-fill code, ~12 kB of core + scatter), fonts
and colorscale interpolation, grid and domain placement, pie (~10 kB of basic), shapes and images
(~10 kB), and the themes and color data (~8 kB; scatter-only bundles ship only the plotly.js
colorscales, the rest arrive with `registerBuiltinColors()`). By decision, the budgets were raised
to about 10% above the measured sizes (142 / 212 kB); E21.6 code-splits render so charts without
fills don't load the fill code.

History: the partial budgets started at 90 kB and 150 kB, set before the SDF text engine's weight
was known. They were raised to measured + 10% in M1 (165 / 200 kB after wave 2, `basic` 215 kB
after wave 3) by decision, then tightened to measured + ~10% (120 / 170 kB) after the diet below,
and raised to measured + ~10% (142 / 212 kB) after M2 wave 1 by decision.

Splitting the text engine out costs about 1.8 kB in total (two chunks compress separately, and the
loader adds a little code), and the IIFE about 3.3 kB (the inlined engine is wrapped as a lazily
initialized module). `preloadTextEngine()` from `@mk7s/holochart-render` starts the download early.

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

- The bar schema (`barAttributes`, `barLayoutAttributes`) survives in the scatter partial, about
  0.13–0.18 kB: each package's `dist/index.js` is one file, and top-level `attr.*()` calls and an
  object spread look side-effectful to the app's bundler. Left as is: `/* @__PURE__ */` on those
  declarations saves 0.13 kB; one output file per module (tsdown `unbundle`) saves 0.18 kB for
  every such case but changes the published layout (ADR-015).
- `Chart#toJSON` is a class method, so every chart bundles `core/serialize` and `runtime/json.ts`
  (2.3 kB). Making it a separate `chartToJSON()` export is an API decision.
- In `basic`, annotations draw boxes and arrowheads with the fill primitive, which pulls in earcut
  and the self-intersection code (`fill-arrangement.ts`): 7.4 kB, of which the arrangement is
  2.6 kB. Annotation shapes are simple polygons; a cheaper path would recover most of it.

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
