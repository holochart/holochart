# ADR-015: Package builds with tsdown (JS, bundled declarations, IIFE)

- **Status:** Accepted, amended 2026-09-23 (tsdown replaces tsup + `tsc --emitDeclarationOnly`; see
  [History](#history))
- **Date:** 2026-09-23
- **Related stories:** E0.2, E21.1, E21.3

## Context

Every package must emit ESM with type declarations, and the `@mk7s/holochart` full bundle must also
emit a minified IIFE (`window.Holochart`) with sourcemaps for CDN use (E0.2). E0.2 also asks for one
bundled `.d.ts` per package entry instead of per-file declarations, which expose internal module
structure and ship hundreds of files.

Constraints:

- TypeScript `~6.0`, which deprecates `baseUrl`. tsup's `dts` option (rollup-plugin-dts driven by
  tsup) injects `baseUrl` and fails with deprecation errors.
- Relative imports use `.ts` extensions with `rewriteRelativeImportExtensions`
  ([ADR-013](013-ts-import-extensions-native-type-stripping.md)), so tsc-emitted `.d.ts` files
  reference `./x.ts` specifiers that a declaration bundler must follow.
- `three` is a peer dependency and stays external in the package builds
  ([ADR-003](003-three-peer-dependency.md)), but three.js no longer ships a UMD/global build, so a
  script-tag bundle cannot load three from a separate `<script>`.

## Decision

We build every package with **tsdown** (rolldown + rolldown-plugin-dts), which replaces both tsup
and the separate `tsc --emitDeclarationOnly` step.

- Each package has a `tsdown.config.ts`; the package `build` script is `tsdown`.
- **ESM**: `dist/index.js` + sourcemap, `platform: 'neutral'`, `target: 'es2022'`. Packages listed in
  `dependencies` and `peerDependencies` (including `three`) are external automatically.
- **Declarations**: `dts: true` emits **one bundled `dist/index.d.ts` per entry** (plus a declaration
  map, from `declarationMap` in `tsconfig.base.json`). rolldown-plugin-dts runs the real TypeScript
  6 compiler with the package's tsconfig, so our compiler options and `.ts` specifiers work as-is and
  no `baseUrl` is injected. Imports of other packages (workspace or third-party) stay as imports.
- **Full-bundle IIFE**: `@mk7s/holochart` has a second build, `dist/holochart.iife.min.js` (+
  `.map`), format `iife`, `globalName: 'Holochart'`, minified. It is **self-contained: three.js and
  all other dependencies are bundled** (`deps.alwaysBundle`), and workspace packages resolve through
  the `source` export condition so the bundle and its sourcemap come from TypeScript sources. It is
  also exported as the subpath `@mk7s/holochart/holochart.iife.min.js`. This is the ADR-003
  "decided with that build" follow-up: bundling three is acceptable for the script-tag build only,
  because script-tag users cannot share a three instance with Holochart anyway (no global build of
  three exists). Bundler users get the ESM build with `three` as a peer.
- `exports` maps keep `source` first, then `types`, then `import`.
- `tsc --noEmit` remains the type checker (`pnpm typecheck`); the build does not replace it.
- Verification: a throwaway consumer project with `skipLibCheck: false` type-checks against the
  built `dist` under `moduleResolution` `bundler`, `node16`, and `nodenext`; `pnpm test:bundle`
  (`tests/bundle/`) loads the IIFE in headless Chromium (SwiftShader), checks `window.Holochart`,
  and renders a frame with the bundled three.js.

## Consequences

### Positive

- One build tool and one step per package; builds take about a second per package.
- Consumers see one clean `index.d.ts` per package; internal module layout is no longer published.
- Declarations still come from the real compiler with our exact tsconfig.
- The IIFE works from a plain `<script>` tag with no import map, and is smoke-tested in a browser.

### Negative

- tsdown is pre-1.0 (`~0.23`, pinned to a minor in the catalog); config keys have changed between
  minors (for example `external`/`noExternal` became `deps.neverBundle`/`deps.alwaysBundle`).
  Upgrades need a quick review.
- The IIFE is large (about 835 kB min, 237 kB gzip), mostly three.js, and its three.js copy is private:
  mixing three objects from another copy on the page breaks `instanceof` checks (documented in
  `packages/holochart/README.md`).
- rolldown ships native binaries (optional per-platform dependencies), like esbuild did for tsup.

### Follow-ups

- Optional: api-extractor on top of the bundled `.d.ts` for API reports (E21.1), and
  `publint` / `@arethetypeswrong/core` (both tsdown integrations) before the first publish (E21.3).
- A size budget for the IIFE once real traces land (E23).
- If a per-trace or "lite" IIFE is needed, add entries to `packages/holochart/tsdown.config.ts`.

## Alternatives considered

### tsup JS + `tsc --emitDeclarationOnly` (the original decision)

Worked, but emits per-file `.d.ts`; bundling them would need a third tool. Superseded by this
amendment.

### tsup JS + rollup-plugin-dts (or dts-bundle-generator) over tsc output

Keeps tsup, adds a rollup pass per package over the `.d.ts` tree. Three tools and two extra steps per
package. dts-bundle-generator is unmaintained since 2024 and would need its own TS program.

### @microsoft/api-extractor over tsc output

Produces a bundled `.d.ts` and API reports, but ships its own TypeScript version (lagging TS 6),
needs a config file per package, and still leaves tsup + tsc in place. Kept as a later, optional
add-on for API reports.

### tsup `dts`

One tool, one step. Rejected because its rollup-plugin-dts integration injects `baseUrl`, deprecated
in TS 6.

### Vite library mode

Good for the full bundle, but slower per package and still needs a separate declaration step.

### IIFE that expects three via an import map or `window.THREE`

Smaller IIFE and a shared three instance. Rejected: three.js no longer ships a global build, and an
IIFE cannot consume an import map (import maps apply to ES modules only), so users would need a
module shim. Users who want a shared three should use the ESM build.

## History

- **2026-09-23, original decision:** tsup builds JavaScript (ESM, `dts: false`) and
  `tsc -p tsconfig.json --emitDeclarationOnly` writes per-file `.d.ts` and declaration maps; build
  script `tsup && tsc -p tsconfig.json --emitDeclarationOnly`. Bundled declarations were a follow-up
  (api-extractor), and tsdown was deferred "until it is stable for our setup".
- **2026-09-23, amendment (E0.2 completion):** tsdown 0.23 was verified with TypeScript 6.0 and our
  `.ts` specifiers (bundled `.d.ts` per package, consumer type-check under `bundler`/`node16`/
  `nodenext` with `skipLibCheck: false`), so it replaces tsup and the separate tsc step, and also
  builds the IIFE. The file name is kept so existing links stay valid.

## References

- `plan.md` E0.2; `packages/*/tsdown.config.ts`; `tests/bundle/`; `packages/holochart/README.md`
- [ADR-003](003-three-peer-dependency.md), [ADR-013](013-ts-import-extensions-native-type-stripping.md),
  [ADR-016](016-pnpm-minimum-release-age.md)
