# ADR-015: tsup builds JavaScript, tsc emits declarations

- **Status:** Accepted
- **Date:** 2026-09-23
- **Related stories:** E0.2, E21.1, E21.3

## Context

Every package must emit ESM with type declarations, and the `@mk7s/holochart` full bundle must also
emit a minified IIFE (`window.Holochart`) for CDN use (E0.2). tsup (esbuild) is fast and handles the
JS side well. Its `dts` option uses rollup-plugin-dts, which injects the `baseUrl` compiler option;
TypeScript 6 deprecates `baseUrl`, so tsup's declaration step produces deprecation errors with our
toolchain (TypeScript `~6.0`). Our tsconfig also relies on `.ts` import extensions with
`rewriteRelativeImportExtensions` ([ADR-013](013-ts-import-extensions-native-type-stripping.md)),
which tsc handles natively.

## Decision

- **tsup builds JavaScript**: ESM for every package, plus IIFE for the full bundle; sourcemaps on;
  `three` external ([ADR-003](003-three-peer-dependency.md)); `dts: false`.
- **tsc emits declarations**: `tsc -p tsconfig.json --emitDeclarationOnly` writes `.d.ts` (and
  declaration maps) to `dist/`.
- Package build script: `tsup && tsc -p tsconfig.json --emitDeclarationOnly`.
- Declarations are per-file (not bundled into one `.d.ts`) for now.

## Consequences

### Positive

- Declarations come from the real compiler with our exact tsconfig; no `baseUrl` workaround.
- Declaration maps let "go to definition" land in sources.
- Fast JS builds from esbuild are kept.

### Negative

- Two build steps per package; slightly slower builds (mitigated by Turborepo caching).
- Per-file `.d.ts` output exposes internal module structure and ships more files.
- tsup and tsc configurations must be kept consistent (entry points versus `exports`).

### Follow-ups

- Optional later: bundle declarations into one `.d.ts` per entry point with api-extractor, which
  also gives an API report for review.

## Alternatives considered

### tsup `dts`

One tool, one step. Rejected because rollup-plugin-dts relies on `baseUrl`, deprecated in TS 6.

### api-extractor / dts bundling now

Produces a single clean `.d.ts` and API reports. Deferred: more configuration than needed while APIs
are still moving; possible later on top of tsc output.

### Vite library mode

Good for the full bundle, but slower per package and still needs a separate declaration step.

### tsdown / rolldown

Promising successor to tsup with its own dts pipeline. Deferred until it is stable for our setup.

## References

- `plan.md` E0.2, package `build` scripts and `tsup.config.ts` files
- [ADR-003](003-three-peer-dependency.md), [ADR-013](013-ts-import-extensions-native-type-stripping.md)
