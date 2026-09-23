# Contributing to Holochart

Thanks for helping build Holochart. The project is pre-alpha (milestone M0, Foundation), so
tooling and conventions are still settling. When this document and the code disagree, the code
wins; please fix the document in the same PR.

Background reading: [README.md](README.md), [ARCHITECTURE.md](ARCHITECTURE.md),
[plan.md](plan.md), and the ADRs in [docs/adr/](docs/adr/).

## Prerequisites and setup

| Tool     | Version                                                                          |
| -------- | -------------------------------------------------------------------------------- |
| Node     | 22 or newer (`.nvmrc` pins 22; Node 26 also works and is tested in CI)           |
| pnpm     | 11, pinned via `packageManager` (`pnpm@11.15.1`); install with `corepack enable` |
| Chromium | Playwright-managed, for visual tests                                             |

```sh
corepack enable
pnpm install
pnpm exec playwright install chromium
```

Shared dependency versions (TypeScript, three, Vite, Vitest, d3 libraries, etc.) live in the pnpm
catalog in `pnpm-workspace.yaml`. Reference them from a package with `"catalog:"` rather than
pinning a version locally.

## Command reference

Run everything from the repository root.

| Command                    | What it does                                                   |
| -------------------------- | -------------------------------------------------------------- |
| `pnpm dev`                 | Start the dev sandbox (`apps/sandbox`) with the example picker |
| `pnpm build`               | Build all packages via Turborepo (ESM + `.d.ts`)               |
| `pnpm typecheck`           | Type-check every workspace package                             |
| `pnpm typecheck:tooling`   | Type-check root configs and tests                              |
| `pnpm test`                | Run unit tests once (Vitest)                                   |
| `pnpm test:watch`          | Run unit tests in watch mode                                   |
| `pnpm test:coverage`       | Run unit tests with V8 coverage                                |
| `pnpm test:visual`         | Run Playwright visual regression over every example            |
| `pnpm test:visual -g <id>` | Run visual tests for matching example ids only                 |
| `pnpm test:visual:update`  | Rewrite visual baselines (same as `pnpm test:visual -u`)       |
| `pnpm lint`                | Run ESLint                                                     |
| `pnpm format`              | Format the repo with Prettier                                  |
| `pnpm format:check`        | Check formatting without writing                               |

## Repository layout

```
packages/        Published libraries (@mk7s/holochart and @mk7s/holochart-*)
  core/          Figure model, schema system, validation, defaults, update planner
  render/        three.js layer: renderer, viewports, GPU primitives, picking
  components/    Axes, legend, colorbar, annotations, shapes, hover labels, modebar
  traces-basic/  scatter, bar, pie, table
  themes/        Templates, palettes, colorscales
  holochart/     Full bundle
apps/sandbox/    Vite dev sandbox (pnpm dev)
examples/        Canonical examples: sandbox, docs, gallery, and visual tests
  _lib/          Example contract (types.ts), seeded RNG (rng.ts), helpers
  _dev/          Primitive-level dev examples
tests/visual/    Playwright visual regression harness and baselines
tools/           Internal tooling (schema-gen, ...)
docs/adr/        Architecture Decision Records
plan.md          The project plan
```

Workspace packages resolve to each other's TypeScript sources through the `source` export
condition, so you never need to build a dependency before using it in the sandbox, tests, or
scripts. Node scripts run with native type stripping: `node --conditions=source path/to/script.ts`.

## Examples and the sandbox

Every example is a single source of truth: it appears in the sandbox, will be embedded in the docs
and gallery, and is a visual regression test.

An example lives at `examples/<category>/.../<slug>.ts` and exports:

- `meta`: `{ title, description, tags, testTolerance?, size? }`
- `run(el)`: renders into `el` and returns `{ ready?, renderer?, dispose }`

The contract is defined in [examples/\_lib/types.ts](examples/_lib/types.ts). Rules:

- `dispose()` must free everything the example created (geometries, materials, textures,
  renderer, listeners).
- Resolve `ready` once the frame is final (for example after async text glyphs load), so the
  visual test captures the right frame.
- Use the seeded RNG from `examples/_lib/rng.ts`, never `Math.random()`, so output is
  deterministic.
- Tag an example `no-visual-test` only if it cannot be made deterministic.

Run `pnpm dev` and pick an example, or open it directly with `?example=_dev/hello-cube`. The
sandbox shows a stats overlay (FPS, draw calls, triangles, geometries, textures from
`renderer.info`) and has DPR and light/dark toggles. Add `&test=1` to render in test mode, the
same way the visual harness does.

## Testing

### Unit tests

Vitest runs `*.test.ts` files colocated with sources under `packages/*/src` and `tools/*/src`,
plus repo-tooling tests under `tests/` (lint rules, visual-diff helpers).
Keep data-pipeline code (validation, defaults, calc, layout) pure so it can be tested without a
GPU. `fast-check` is available for property-based tests.

Coverage thresholds are planned (`core` at 90% or more, trace calc at 85% or more) but are
disabled until the packages have real code. Run `pnpm test:coverage` to see current numbers.

### Visual regression tests

`pnpm test:visual` renders every example in Chromium with SwiftShader (software GL, for
deterministic output) and compares it with `tests/visual/__baselines__/<id>.png` using the
example's `testTolerance`. On failure, look at:

- `tests/visual/__actual__/`: what was rendered
- `tests/visual/__diff__/`: pixel diffs
- `playwright-report/`: the Playwright HTML report (`pnpm exec playwright show-report`)

When a rendering change is intentional, update baselines with `pnpm test:visual:update` (or
`pnpm test:visual -u -g <id>` for one example) and commit the new PNGs. Baseline changes are
reviewed in the PR like code.

CI runs visual tests in the pinned container `mcr.microsoft.com/playwright:v1.63.0-noble`. If your
local baselines differ from CI (different OS or CPU architecture), take the CI rendering instead:
download the `visual-diff-report` artifact of the failed run and copy the PNGs from its
`tests/visual/__actual__/` into `tests/visual/__baselines__/`. Alternatively, regenerate them in
that container from a separate clone (installing there replaces `node_modules` with Linux
binaries):

```sh
docker run --rm -v "$PWD":/work -w /work mcr.microsoft.com/playwright:v1.63.0-noble \
  bash -lc "corepack enable && pnpm install --frozen-lockfile && pnpm test:visual:update"
```

## Code conventions

### TypeScript

- TypeScript 6.0, `strict`, plus `noUncheckedIndexedAccess` and `noImplicitOverride`.
- `verbatimModuleSyntax`: use `import type` for type-only imports.
- `erasableSyntaxOnly`: no `enum`, no `namespace`, no constructor parameter properties. Use
  union types or `as const` objects instead of enums.
- Relative imports include the `.ts` extension (`import { x } from './scale.ts'`). The build
  rewrites them to `.js`. See [ADR-013](docs/adr/013-ts-import-extensions-native-type-stripping.md).
- Shaders are GLSL3 written as TypeScript template-string modules named `*.glsl.ts` and tagged
  `/* glsl */`, so no loader is needed anywhere. See
  [ADR-014](docs/adr/014-glsl-as-typescript-template-modules.md).
- Attributes are declared once in the schema; types, validation, defaults, and docs derive from it.
  Do not hand-write parallel types for schema attributes.

### GPU-native primitives

Never create one three.js object per data point. Markers, lines, bars, and cells use instanced or
batched primitives from `@mk7s/holochart-render`. The local ESLint rule
`holochart/no-per-point-objects` flags `new Mesh(`, `new Sprite(`, `new Points(`, or `new Line(`
inside loops or `.forEach`/`.map` callbacks in `packages/*/src`. If you believe a case is a false
positive, disable it on that line with a comment explaining why.

### Lint and formatting

ESLint 10 flat config (ESLint recommended, typescript-eslint recommended, eslint-config-prettier,
plus the local rule above) and Prettier 3 (single quotes, 100-column width, trailing commas). Run
`pnpm lint` and `pnpm format` before pushing; CI runs `pnpm format:check`.

## Branching and commits

- Trunk-based development on `main`. Keep branches short-lived and named `<type>/<short-desc>`,
  for example `feat/scatter-markers` or `fix/axis-ticks`. Milestone integration branches such as
  `m0/foundation` may exist.
- PRs are squash-merged, so the PR title becomes the commit message on `main`.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for PR titles (and ideally for
  your commits):
  - Types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`
  - Scope: the package name without the prefix, e.g. `feat(render): add instanced marker primitive`,
    `fix(core): coerce date strings`
  - Breaking changes: `feat(core)!: ...` or a `BREAKING CHANGE:` footer

### Changesets (coming soon)

Changesets is not installed yet. Once it is, every user-facing change to a published package will
need a changeset: run `pnpm changeset`, pick the affected packages and bump type, write a short
user-facing summary, and commit the generated file with your PR. Internal-only changes (tests, CI,
tooling, sandbox) will not need one.

## Pull requests

1. Branch from `main`, keep the PR focused, and link the plan story it implements (e.g. `E2.4`).
2. Fill in the [PR template](.github/pull_request_template.md).
3. Make sure all required status checks pass.
4. Get an approving review, then squash-merge.

### Required status checks

Defined in `.github/workflows/ci.yml`:

| Check       | What it runs                                                                  |
| ----------- | ----------------------------------------------------------------------------- |
| `lint`      | ESLint and `prettier --check`                                                 |
| `typecheck` | `tsc` across the workspace                                                    |
| `unit`      | Vitest with coverage artifact, on Node 22 and Node 26                         |
| `build`     | Package builds, on Node 22 and Node 26                                        |
| `visual`    | Playwright visual tests in the pinned container; diff report uploaded on fail |

Planned but not active yet: bundle-size checks (`size-limit`), benchmarks (`apps/bench`), docs
build (`apps/docs`), and Turborepo remote caching (`TURBO_TOKEN`/`TURBO_TEAM` secrets).

### Review checklist

Authors should self-review against this list; reviewers check it too.

- [ ] PR title follows Conventional Commits with the right scope.
- [ ] Tests added or updated: unit tests for pure logic, examples for anything visual.
- [ ] Visual baseline changes are intentional and have been reviewed image by image.
- [ ] No per-point object allocation; data-sized work uses instanced/batched primitives and typed
      arrays.
- [ ] `dispose()` frees all GPU resources (geometries, materials, textures, render targets) and
      listeners.
- [ ] The schema is the source of truth for any new or changed attribute.
- [ ] Docs updated; architectural changes come with a new or updated ADR in `docs/adr/`.
- [ ] Bundle size considered (new dependencies justified, tree-shakeable, `three` stays a peer).
- [ ] Accessibility considered (DOM mirror, keyboard, contrast) where the change is user-facing.
- [ ] Changeset added for user-facing changes to published packages (once Changesets lands).
