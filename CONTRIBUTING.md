# Contributing to Holochart

Thanks for helping build Holochart. The project is pre-alpha (milestone M1, First Plot), so
tooling and conventions are still settling. When this document and the code disagree, the code
wins; please fix the document in the same PR.

Background reading: [README.md](README.md), [ARCHITECTURE.md](ARCHITECTURE.md),
[plan.md](plan.md), the ADRs in [docs/adr/](docs/adr/), and the release docs in
[docs/release/](docs/release/README.md).

Holochart is licensed under the [MIT License](LICENSE). By contributing, you agree that your
contributions are licensed under the same terms.

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
| `pnpm build`               | Build all workspaces via Turborepo (ESM + `.d.ts`, apps)       |
| `pnpm build:packages`      | Build only the published packages under `packages/`            |
| `pnpm typecheck`           | Type-check every workspace package                             |
| `pnpm typecheck:tooling`   | Type-check root configs and tests                              |
| `pnpm test`                | Run unit tests once (Vitest)                                   |
| `pnpm test:watch`          | Run unit tests in watch mode                                   |
| `pnpm test:coverage`       | Run unit tests with V8 coverage                                |
| `pnpm test:visual`         | Run Playwright visual regression over every example            |
| `pnpm test:visual -g <id>` | Run visual tests for matching example ids only                 |
| `pnpm test:visual:update`  | Rewrite visual baselines (same as `pnpm test:visual -u`)       |
| `pnpm test:visual:report`  | Summarize the last visual run: pixelmatch vs exact diffs       |
| `pnpm test:bundle`         | Build `@mk7s/holochart` and smoke-test its IIFE in Chromium    |
| `pnpm size`                | Build packages and check bundle-size budgets (size-limit)      |
| `pnpm changeset`           | Add a changeset for a user-facing change                       |
| `pnpm lint`                | Run ESLint                                                     |
| `pnpm format`              | Format the repo with Prettier                                  |
| `pnpm format:check`        | Check formatting without writing                               |

## Repository layout

```
packages/        Published libraries (@mk7s/holochart and @mk7s/holochart-*)
  core/          Figure model, schema system, validation, defaults, update planner
  render/        three.js layer: renderer, viewports, GPU primitives, picking
  runtime/       createChart, register, pipeline orchestration (ADR-019)
  components/    Axes, legend, colorbar, annotations, shapes, hover labels, modebar
  traces-basic/  scatter, bar, pie, table
  themes/        Templates, palettes, colorscales
  holochart/     Full bundle
apps/sandbox/    Vite dev sandbox (pnpm dev)
apps/docs/       Docs site (VitePress), served at mk7s.dev/holochart/
examples/        Canonical examples: sandbox, docs, gallery, and visual tests
  _lib/          Example contract (types.ts), seeded RNG (rng.ts), helpers
  _dev/          Primitive-level dev examples
tests/visual/    Playwright visual regression harness and baselines
tests/bundle/    IIFE smoke test and bundle-size entries (size-limit)
tests/property/  fast-check seeding for the unit suite (Vitest setup file)
tools/           Internal tooling (schema-gen, ...)
deploy/          Docs proxy for mk7s.dev (Cloudflare)
docs/adr/        Architecture Decision Records
docs/release/    Versioning policy, bundle size, release process, docs hosting
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
plus repo-tooling tests under `tests/` (lint rules, visual-diff helpers, property seeding).
Keep data-pipeline code (validation, defaults, calc, layout) pure so it can be tested without a
GPU. `fast-check` is available for property-based tests (see below).

`pnpm test:coverage` enforces 90% coverage for `packages/core` (lines, functions, branches,
statements); the trace-calc threshold (85%) is still planned.

### Property tests

Properties (`fc.assert(fc.property(…))`) are seeded by the Vitest setup file
[`tests/property/setup.ts`](tests/property/setup.ts), so every run can be replayed:

| Where                            | Seed                                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| Local `pnpm test`                | A fresh random seed per test                                                                       |
| PR and `main` CI                 | `FC_SEED` = the commit SHA: the same commit always runs the same cases                             |
| Nightly (`property-nightly.yml`) | Random per test and per repetition, 25 runs of every property-test file (`--repeats 24`), 4 shards |

A property that passes its own `seed` keeps it. When a property fails, its error ends with the
seed, the counterexample path, and the command that replays it, for example:

```text
fast-check seed: -684789228, path: "6:1:0:2"
Replay: FC_SEED=-684789228 FC_PATH=6:1:0:2 pnpm test packages/core/src/x.test.ts -t '^suite > test$'
Replay the whole run (search + shrink): FC_SEED=-684789228 pnpm test packages/core/src/x.test.ts -t '^suite > test$'
```

A test that fails another way after running a property (most often a timeout) prints its seed
and replay command to stderr. The variables:

- `FC_SEED`: a 32-bit integer (as printed) or a commit SHA (its first 8 hex digits). Replays a CI
  failure with `FC_SEED=<sha>`.
- `FC_PATH`: jumps straight to the shrunk counterexample (needs `FC_SEED`; keep the `-t` filter,
  since a path belongs to one property).

To explore more cases locally, repeat tests with fresh seeds, e.g.
`pnpm test packages/core/src/__testing__/schema-properties.test.ts --repeats 49`. The nightly
workflow can also be started by hand (Actions → Property tests (nightly) → Run workflow) with a
different `repeats` count. When a property finds a bug, fix it and add the counterexample as a
plain regression test next to the property (see "regressions found by the E20.2 properties" in
`packages/core/src/__testing__/schema-properties.test.ts`).

### Visual regression tests

`pnpm test:visual` renders every example in Chromium with SwiftShader (software GL, for
deterministic output) and compares it with `tests/visual/__baselines__/<id>.png` using the
example's `testTolerance`. On failure, look at:

- `tests/visual/__actual__/`: what was rendered
- `tests/visual/__diff__/`: pixel diffs
- `playwright-report/`: the Playwright HTML report (`pnpm exec playwright show-report`)

Tests gate on the pixelmatch count only. Each compared example also records the **exact diff**:
pixels whose RGBA differs at all and the largest channel delta (plan E20.9). You'll find it in
the `diff` annotation in the HTML report, in `pnpm test:visual:report`, and in the CI job
summary. A non-zero exact diff inside tolerance means the baseline is no longer bit-exact. Small
exact diffs are expected after changes to quad geometry: they shift SwiftShader's fixed-point
interpolation (PR #5 finding).

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

### Changesets

Every user-facing change to a published `@mk7s/holochart*` package needs a changeset: run
`pnpm changeset`, pick the affected packages and the bump type, write a short summary for users,
and commit the generated `.changeset/*.md` file with your PR. Internal-only changes (tests, CI,
tooling, sandbox, docs site) don't need one.

- Bump types follow [docs/release/versioning.md](docs/release/versioning.md). Before 1.0, a
  breaking change is a `minor`; say "BREAKING:" at the start of the summary and add a migration
  note. Deprecations are `minor` too.
- All published packages share one version (a `fixed` group), so picking the package you changed
  is enough; the others follow.
- Releases happen through a "Version Packages" PR that a maintainer merges; see
  [docs/release/releasing.md](docs/release/releasing.md).

## Pull requests

1. Branch from `main`, keep the PR focused, and link the plan story it implements (e.g. `E2.4`).
2. Fill in the [PR template](.github/pull_request_template.md).
3. Make sure all required status checks pass.
4. Get an approving review, then squash-merge.

### Stacked PRs

Prefer PRs against `main`. Stack a PR on another PR's branch only when it truly depends on
unmerged work, and say so at the top of the description ("Stacked on #12").

The repository has "Automatically delete head branches" turned on: when a PR merges, its branch is
deleted and GitHub retargets any PR based on it to the merged PR's base. To land a stack safely:

1. **Merge bottom-up.** Merge the PR closest to `main` first. Never merge a PR whose base is still
   another PR's branch: its commits land on that branch, not on `main` (that is how #3, #4 and #5
   missed `main` until #6).
2. **Wait for the retarget.** After each merge, check that the next PR's base now reads `main`
   (and rebase it if GitHub reports conflicts) before merging it. Re-run CI if needed.
3. Repeat up the stack. If a base branch was deleted before its dependents were retargeted (for
   example, it was deleted by hand), change the dependent PR's base to `main` yourself.

Squash-merging means each PR in a stack lands as its own commit, so rebase the rest of the stack on
`main` after each merge if its diff still shows the lower PR's commits.

### Required status checks

Defined in `.github/workflows/ci.yml`:

| Check               | What it runs                                                                  |
| ------------------- | ----------------------------------------------------------------------------- |
| `lint`              | ESLint and `prettier --check`                                                 |
| `typecheck`         | `tsc` across the workspace                                                    |
| `unit`              | Vitest with coverage artifact, on Node 22 and Node 26                         |
| `build`             | Package builds, on Node 22 and Node 26                                        |
| `visual`            | Playwright visual tests in the pinned container; diff report uploaded on fail |
| `bundle smoke test` | Builds the IIFE and loads it in headless Chromium                             |
| `bundle size`       | `pnpm size` budgets; report in the job summary and a PR comment               |
| `docs build`        | Builds the docs site (`apps/docs`)                                            |

Also run, not required yet: `three (min)` (typecheck + unit tests against the lowest supported
three.js) and `three (latest)` (canary against the newest three.js; never fails the workflow).
Make `bundle size`, `docs build` and `three (min)` required once they have been green on `main`.

Planned but not active yet: benchmarks (`apps/bench`) and Turborepo remote caching
(`TURBO_TOKEN`/`TURBO_TEAM` secrets).

Other workflows: `release.yml` (version PR and npm publish, see
[docs/release/releasing.md](docs/release/releasing.md)) and `docs.yml` (deploys the docs site, see
[docs/release/docs-hosting.md](docs/release/docs-hosting.md)).

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
- [ ] Changeset added for user-facing changes to published packages.
