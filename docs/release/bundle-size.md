# Bundle size

Plan E21.1 and §5 ("Size tracking"). Budgets are checked in CI by the `bundle size` job.

## Budgets

Sizes are **minified + gzipped**, in decimal kB (1 kB = 1000 bytes, size-limit's unit), and
**exclude three.js** unless stated.

| Entry                                   | What it measures                                           | Budget |
| --------------------------------------- | ---------------------------------------------------------- | ------ |
| `partial: core + scatter`               | `createChart` + `register` from runtime, `scatter` trace   | 165 kB |
| `partial: basic`                        | runtime + components + traces-basic + themes (all exports) | 215 kB |
| `@mk7s/holochart (full, ESM)`           | everything the full bundle exports                         | 450 kB |
| `@mk7s/holochart IIFE (includes three)` | `dist/holochart.iife.min.js` as shipped, **with** three.js | 650 kB |
| each `@mk7s/holochart-*` package        | `export *` of that package                                 | report |

The IIFE budget is the full budget plus a 200 kB allowance for the bundled three.js (about
170–190 kB min + gzip on its own; ADR-015). Per-package entries are reported but not gated.

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
flatbush, workspace packages) included, the way an app bundler would. size-limit (`@size-limit/file`)
then gzips the results. The IIFE is measured as built.

Until an entry's named exports exist (for example `scatter` before the scatter trace lands), that
entry measures the whole package instead and the report adds a footnote.

In CI, the job writes the table to the job summary, uploads `size.json` as the `size-report`
artifact, compares with the latest successful `main` run, and posts or updates one PR comment
(same-repo PRs only; fork PRs get a read-only token, so they get the job summary only).

## Current sizes (2026-09-23, M1 wave 3)

| Entry                     | Size      | Budget | Wave 2    |
| ------------------------- | --------- | ------ | --------- |
| `@mk7s/holochart-core`    | 48.84 kB  | —      | 45.74 kB  |
| `@mk7s/holochart-render`  | 95.41 kB  | —      | 93.14 kB  |
| `@mk7s/holochart-runtime` | 69.97 kB  | —      | 64.89 kB  |
| partial: core + scatter   | 160.59 kB | 165 kB | 148.54 kB |
| partial: basic            | 209.63 kB | 215 kB | 181.09 kB |
| full, ESM                 | 225.53 kB | 450 kB | 203.79 kB |
| IIFE (includes three)     | 355.16 kB | 650 kB | 333.34 kB |

Wave 3 added the colorbar and annotations components, streaming (`extendTraces`), and JSON
serialization. The `basic` budget was raised again, to 215 kB, by decision on 2026-09-23; core +
scatter stays at 165 kB with about 3% headroom, so E21.5 is due before M2 adds more traces.

The partial budgets were 90 kB and 150 kB until M1 wave 2, set before the SDF text engine's
weight was known. A breakdown of core + scatter (456 kB minified) shows: troika-three-text and
its dependencies ~120 kB (26%), core 90 kB, render 83 kB, traces-basic 74 kB, runtime 60 kB.
Schema descriptions are only 5–7% of core and traces-basic. They were raised to measured +10%
by decision on 2026-09-23 (after wave 2). Plan story **E21.5 (bundle diet)** lazy-loads the text engine on first
use, strips descriptions from production builds, and then tightens the budgets again.

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
