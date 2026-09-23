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
  TypeScript types, and the `window.Holochart` global of the IIFE build.
- The figure spec: trace and layout attribute names, types, allowed values, and defaults, as
  declared in the schema ([ADR-002](../adr/002-schema-first-attribute-dsl.md)), plus events and
  their payloads.
- The supported `three` peer range (below).

Not public API: anything not exported from an entry point, file layout inside `dist/`, and APIs
marked `@experimental` or `@internal` in TSDoc. Until the plugin API is declared stable (plan E22,
M7), the low-level `render` namespace and the trace/component contracts in
`@mk7s/holochart-runtime` are **experimental** and may change in any minor release.

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

### Before 1.0

- `0.MINOR.PATCH`: a minor bump may contain breaking changes; a patch bump never does. Depend on
  `~0.x.y` (or an exact version) rather than `^0.x.y` if you need to avoid surprises.
- Every breaking change is listed under its own heading in the changeset and the changelog, with
  a migration note.
- Milestone releases are prereleases: M1 ships as `0.1.0-alpha.N` on the `alpha` npm dist-tag
  (Changesets pre mode). `latest` only ever points at a non-prerelease version.
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

| Item                  | Value                                                                  |
| --------------------- | ---------------------------------------------------------------------- |
| Peer range            | `>=0.180.0`                                                            |
| Minimum, tested in CI | `0.180.0` (`three (min)` job: typecheck + unit tests)                  |
| Development version   | pnpm catalog `^0.186.0` (all other CI jobs, visual tests)              |
| Latest, tested in CI  | newest release that passes pnpm `minimumReleaseAge` (`three (latest)`) |

- The CI `three` jobs override the pnpm catalog in the runner only
  (`.github/workflows/ci.yml`); `three (latest)` is a canary that reports but doesn't fail the
  workflow. Visual tests run only on the catalog version.
- The lower bound is raised on purpose (a minor release, noted in the changelog) when we need a
  newer API, to a three.js release at least 3 months old. The upper bound stays open; if a new
  three release breaks Holochart, the fix ships in a patch.
- The IIFE build bundles its own three (ADR-015); its version is listed in the release notes.

## Runtimes

- Browsers with WebGL 2 and ES2022 (current Chrome, Edge, Firefox, Safari 16.4+).
- Node.js ≥ 22 for the headless, renderer-free parts (`@mk7s/holochart-core`) and for tooling.
