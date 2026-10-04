# Versioning & compatibility policy

Plan E21.2. Applies to every published package: `@mk7s/holochart` and `@mk7s/holochart-*`.

## One version for all packages

All published packages share one version number and are released together (a Changesets
`fixed` group, see [releasing.md](releasing.md#why-one-fixed-version)). `@mk7s/holochart-core@0.4.2`
always goes with `@mk7s/holochart-render@0.4.2`. Mixing versions of Holochart packages in one app
is not supported.

## Semantic Versioning

We follow [SemVer 2.0.0](https://semver.org/). The public API is:

- Everything exported from a package's entry point (`import … from '@mk7s/holochart-…'`), with its
  TypeScript types, and the `window.Holochart` global of the IIFE build and its 3D add-on: the
  members `@mk7s/holochart/global` types, which are the exports of `@mk7s/holochart`. (What else
  the main script sets for the add-on, `Holochart.__iife` and a few `@internal` exports, is
  internal; the add-on requires the main script of the same version.)
- The figure spec: trace and layout attribute names, types, allowed values, and defaults, as
  declared in the schema ([ADR-002](../adr/002-schema-first-attribute-dsl.md)), plus events and
  their payloads.
- The supported `three` peer range (below).

Not public API: anything not exported from an entry point, file layout inside `dist/`, and APIs
marked `@experimental` or `@internal` in TSDoc ([stability tags](#stability-tags) below lists
them). Until the plugin API is declared stable (plan E22, M7), the low-level `render` namespace and
the trace/component contracts in `@mk7s/holochart-runtime` are **experimental** and may change in
any minor release.

Pixel output is not API: rendering may change between patch releases (anti-aliasing, tick
placement, text metrics) as long as attributes keep their documented meaning. Visible changes are
called out in the changelog.

| Change                                                       | ≥ 1.0 | 0.x   |
| ------------------------------------------------------------ | ----- | ----- |
| Bug fix, performance, docs, rendering fix                    | patch | patch |
| New attribute, trace, export, event, or option               | minor | minor |
| Deprecation (API keeps working and warns)                    | minor | minor |
| Removal or incompatible change of public API or of a default | major | minor |
| Raising the minimum supported three.js version               | minor | minor |
| Change to an `@experimental` API                             | minor | minor |

### Stability tags

Stability is declared in TSDoc, next to the code, and shown per export in the API reports
([`api-reports/`](../../api-reports/README.md)):

- **Stable** (`@public` in the reports): every export without a tag. The table above applies.
- **`@experimental`**: exported, typed and documented, but its shape may change in any minor
  release, with a changelog entry and without a deprecation period. Editors show the tag on hover.
- **`@internal`**: not part of the API at all, and no compatibility promise: it can change or go
  in any release, without a changelog entry. Two kinds:
  - An **export** tagged `@internal` is plumbing the Holochart packages share (core's scale and
    coercion helpers, the trace packages' shared calc and layout code, components' scene
    builders). It stays exported from its `@mk7s/holochart-*` package, with its declaration,
    because sibling packages import it; all packages have one version, so they always match. It
    is not a name of `@mk7s/holochart`, is hidden from the API reference, and is marked
    `@internal` in the API reports. Do not import it in an app or a plugin.
  - A **member** (of a class or an interface) tagged `@internal` is left out of the published
    declarations.

`@mk7s/holochart` lists what it exports by name (`packages/holochart/src/exports.ts`): every stable
and experimental export of core, the runtime, components and the trace packages, and no
`@internal` one. Moving the internal exports to `/internal` subpaths is deferred to the plugin API
freeze (plan E22, M7).

What is experimental today, all of it the plugin API of plan E22 (the API reports list every
name):

| Package                     | Experimental                                                                                                                                                                                                                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@mk7s/holochart-render`    | The whole package (its `@packageDocumentation` comment carries the tag), and with it the `render` namespace of `@mk7s/holochart`. Exceptions, tagged `@public`: the `fonts` and `symbols` registries and the types of their arguments.                                                        |
| `@mk7s/holochart-runtime`   | The contracts trace and component modules implement (everything in `src/contracts.ts`: `TraceModule`, `ComponentModule`, their contexts and views, `HoverPoint`, `TraceDescription`, …).                                                                                                      |
|                             | The helpers for module authors: `dataTransform`, `linearExtremes`, `domainRect`, `fitAspect`, `inscribedCircle`, `MIN_PLOT_SIZE`, `STACK_GROUPS`, `formatTemplate`, `splitExtra`, the selection and geometry helpers, `createLatestQueue`, `fxComponent`, the a11y text helpers.              |
|                             | The chart members typed by experimental types: `chart.three.root`, `.overlay`, `.viewports` and `.subplot()` (render package), `chart.axes`, `chart.subplots` and `chart.interaction` (contracts). `chart.three.renderer` and `chart.three.scene` are three.js objects and stable.            |
|                             | The chart members components and traces call: `chart.emit`, `chart.getCalcdata`, `chart.previewRanges`, `chart.commitRanges`, `chart.refreshHover`. (The `Chart` constructor is `@internal`: use `createChart`.)                                                                              |
| `@mk7s/holochart-core`      | The pure half of the same contracts: `CoreTraceModule`, `CoreComponentModule`, `TraceModuleMeta`, `TraceCategory`, `TraceDefaultsContext`, `LayoutDefaultsContext`, `Registry`, `createRegistry`.                                                                                             |
|                             | The schema DSL a module declares its attributes with: `attr` and its option types, the schema node types (`AttrSpec`, `ObjectNode`, `InferFull`, …), the schema objects (`layoutSchema`, `configSchema`, `commonTraceAttributes`, …), `withExtrusion`.                                        |
|                             | Color and date parsing (`toRGBA`, `parseDate`, …), update planning (`diffFigures`, `planUpdate`, …), and the scale types the contracts are written in (`Scale`, `AxisType`, `Tick`, `AxisExtremes`).                                                                                          |
| Trace packages              | Each trace's attribute schema (`barAttributes`, …) and calc type (`BarCalc`, …), which the module objects are typed by. `setBarExtruder` (2.5D bars in a partial bundle). The hierarchy helpers of `@mk7s/holochart-traces-hier` (`buildHierarchy`, `partition`, `nodePath`, `sankeyLayout`). |
| `@mk7s/holochart-traces-3d` | The scene API a custom 3D trace is written with: `Scene3D`, `acquireScene`, `sceneFor`, `sceneOf`, `sceneScales`, the lighting and material attributes and helpers, `sceneA11y`, `interpolateCamera`.                                                                                         |

Using the built-in modules is stable: `register(scatter, bar)`, `registry.list()`, the module
objects the trace packages export and their trace types. Writing a module of your own against the
contracts is what can break in a minor release.

A new export is stable unless it is tagged, so plugin-facing or provisional exports get
`@experimental`, and exports that exist only for another Holochart package `@internal`, in the PR
that adds them. CI fails when an export or a tag changes without the reports being regenerated
(`pnpm api:check`; `pnpm api:report` regenerates them), which puts every change to the public API
in a PR's diff. The same check fails when a stable or experimental export of a package is missing
from `@mk7s/holochart`'s list, when an `@internal` one is in it, and when a stable or experimental
declaration needs an `@internal` type. Dropping `@experimental` from an API is a `minor` change;
adding it to a stable API is a breaking one.

### Before 1.0

- `0.MINOR.PATCH`: a minor bump may contain breaking changes; a patch bump never does. Depend on
  `~0.x.y` (or an exact version) rather than `^0.x.y` if you need to avoid surprises.
- Every breaking change is listed under its own heading in the changeset and the changelog, with
  a migration note.
- The first releases are prereleases: `0.1.0-alpha.N` on the `alpha` npm dist-tag (Changesets pre
  mode), installed with `@mk7s/holochart@alpha`. npm also points `latest` at a package's first
  version, so until the first stable release `latest` follows the newest alpha. From then on,
  `latest` only points at stable versions
  ([details](releasing.md#dist-tags-in-pre-mode)).
- Only the newest minor line receives fixes.

### From 1.0

- Breaking changes only in a major release, after a deprecation (below).
- The previous major receives critical and security fixes for 6 months after the next major.

## Deprecations

A deprecated API or attribute keeps working for **at least one minor release** before it can be
removed (so an API deprecated in 0.5 can be removed in 0.6 at the earliest; from 1.0, removal also
needs a major). While deprecated:

- TSDoc carries `@deprecated` with the replacement, and schema attributes set `deprecated`
  metadata (E1.1), so docs and the attribute reference mark them.
- The first use logs a **single `console.warn` per API per page load**, naming the replacement and
  the version it will be removed in. Warnings are never repeated per frame or per point.
- The changeset that deprecates it says so, and the changelog of the removing release links the
  migration guide (E19.12).

## three.js compatibility

`three` is a peer dependency ([ADR-003](../adr/003-three-peer-dependency.md)).

| Item                  | Value                                                                    |
| --------------------- | ------------------------------------------------------------------------ |
| Peer range            | `>=0.180.0 <0.187.0`                                                     |
| `@types/three`        | optional peer, same range (packages whose `.d.ts` exposes three's types) |
| Minimum, tested in CI | `0.180.0` (`three (min)` job: typecheck + unit tests)                    |
| Development version   | pnpm catalog `^0.186.0` (all other CI jobs, visual tests)                |
| Latest, tested in CI  | newest release that passes pnpm `minimumReleaseAge` (`three (latest)`)   |

- The CI `three` jobs override the pnpm catalog in the runner only
  (`.github/workflows/ci.yml`); `three (latest)` is a canary that reports but doesn't fail the
  workflow. Visual tests run only on the catalog version.
- The lower bound is raised on purpose (a minor release, noted in the changelog) when we need a
  newer API, to a three.js release at least 3 months old.
- The upper bound is the next three minor after the newest one CI has tested (three is `0.x`, so
  every minor may break). It is widened per tested release: when `three (latest)` passes on a new
  three minor `0.N`, a patch release sets the bound to `<0.(N+1).0` and says so in the changelog. If
  a new three release breaks Holochart, the fix ships first and the bound moves with it. To try a
  newer three before that, pnpm and yarn only warn; npm needs an `overrides` entry (or
  `--legacy-peer-deps`).
- `@types/three` is an optional peer with the same range, declared by the packages whose shipped
  `.d.ts` exposes three's types (`render`, `runtime`, `components`, `traces-3d` and the full bundle
  `@mk7s/holochart`). TypeScript users install it next to `three`; JavaScript users can ignore it.
- The IIFE build bundles its own three (ADR-015); its version is listed in the release notes.

## Runtimes

- Browsers with WebGL 2 and ES2022 (current Chrome, Edge, Firefox, Safari 16.4+).
- Node.js ≥ 22 for the headless, renderer-free parts (`@mk7s/holochart-core`) and for tooling.
  The packages are ESM-only; their `default` export condition lets Node 22's `require(esm)` and
  tools that only know `default` load them.
- The published packages declare no `engines` field: they run in browsers, and an `engines.node`
  entry would make some package managers (yarn 1) refuse to install them on an older Node used
  only to run a bundler. The Node requirement above is documented, not enforced.
