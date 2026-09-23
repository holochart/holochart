# ADR-017: Publish under the `@mk7s` npm scope

- **Status:** Accepted
- **Date:** 2026-09-23
- **Related stories:** E21.1, E21.3, E18.4, E18.5; plan §16 Q1

## Context

Holochart ships as many packages (core, render, components, trace packs, themes, express, compat,
framework wrappers, plugins) plus a full bundle. They need a consistent, ownable namespace. The
project name was decided as "Holochart" (§16 Q1); code lives at `github.com/holochart` and docs at
`mk7s.dev/holochart`. A scope prevents name squatting on individual packages and makes official
packages easy to recognize.

## Decision

- All packages are published under the **`@mk7s` npm scope**:
  - `@mk7s/holochart`: the full bundle (re-exports and registers everything; ESM + IIFE).
  - `@mk7s/holochart-*`: individual packages, e.g. `@mk7s/holochart-core`, `-render`,
    `-components`, `-traces-basic`, `-themes`, `-express`, `-compat-plotly`, `-react`, and plugins
    (`@mk7s/holochart-plugin-*`).
- Package metadata points to `https://github.com/holochart/holochart` (repository, with `directory`)
  and `https://mk7s.dev/holochart` (homepage).
- The bare, unscoped `holochart` name may be reserved later as an alias that re-exports
  `@mk7s/holochart`.

## Consequences

### Positive

- One owned namespace for every package; no risk of squatting per package.
- Consistent naming makes partial imports (E21.1) and docs predictable.
- Scope aligns with the `mk7s.dev` docs domain.

### Negative

- Scoped names are longer and less memorable than a bare `holochart`.
- The npm scope (`mk7s`) and GitHub org (`holochart`) differ, which users may find surprising.
- If the bare `holochart` alias is added, it must be kept in sync with each release.

### Follow-ups

- Trademark search for "Holochart" before the first public release (§16 Q1).
- Decide whether to reserve the bare `holochart` npm name as an alias.

## Alternatives considered

### Unscoped packages (`holochart`, `holochart-core`, ...)

Shorter names, but each package name must be claimed individually and can be squatted, and
official versus third-party packages are hard to tell apart. Rejected.

### `@holochart` scope

Would match the GitHub org. Not chosen: the project publishes through the `mk7s` npm org, which also
matches the docs domain (§16 Q1).

## References

- `plan.md` §16 Q1, E21.1, E21.3, package `package.json` files
