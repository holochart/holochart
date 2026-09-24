# ADR-020: Strip schema descriptions from production builds

- **Status:** Accepted (2026-09-24, M2 exit review)
- **Date:** 2026-09-23
- **Deciders:** maintainers
- **Related stories:** E21.5 (bundle diet), E1.1, E1.2, E19.3, E21.1

## Context

Every attribute is declared with its Markdown description next to it (ADR-002):

```ts
size: attr.number({ min: 1, description: 'Font size in CSS pixels.' }),
```

About 470 descriptions live in core (layout, config, common trace attributes), runtime (hover
labels), components (legend, title, annotations, modebar) and traces-basic (scatter, bar,
colorbars, error bars). They are needed by the generated attribute reference, `plot-schema.json`
for the docs site, the generated JSDoc of the figure types, TypeDoc and the playground. At runtime
nothing reads them: validation messages are built from the constraints (`describeExpected()` in
core), not from descriptions. Yet they ship in every bundle, about 9–13% of the gzipped size of
core, runtime, components and traces-basic, and 9% of the `core + scatter` partial.

Constraints:

- Descriptions must stay next to their attributes: that is the point of the schema-first DSL.
- npm consumers use any bundler (or none), so the production build must not depend on the
  consumer's bundler configuration (`define`, `NODE_ENV`) to drop them.
- The docs generator (`tools/schema-gen`), TypeDoc, vitest and the dev servers import the
  TypeScript sources through the `source` export condition (ADR-013) and must keep seeing them.

## Decision

We will strip descriptions at build time with a rolldown plugin,
`scripts/build/strip-descriptions.ts`, used by the tsdown builds that ship to users.

- **What is stripped.** (1) Every `description` property of an object literal passed to an
  `attr.*()` builder (leaf options and the meta argument of `attr.object`, `attr.subplotObject`,
  `attr.items`; inside `attr.ts`, the bare builder calls). (2) The argument passed to a schema
  helper's `description` parameter, such as `fontSchema('Title font.')`: a helper is any function
  with a parameter named `description`, declared in the same module or exported from a workspace
  package (the plugin indexes them at build start and fails on name clashes). The build fails if
  such a parameter is used for anything but a stripped description, or if a helper argument is not
  a plain string expression. Constants that only fed descriptions become unused and are
  tree-shaken. A `description` literal left outside those patterns is reported as a build warning.
- **What is kept.** Trace `meta.description` (part of `registry.list()`, two strings), all
  runtime strings, and small option values that only feed templated descriptions
  (`colorscaleAttributes({ colorAttr })`), which the plugin cannot tell from data.
- **How.** The edits replace characters with spaces and keep newlines, so every line and column
  is unchanged and the transform returns `map: null`: sourcemaps stay exact without a
  sourcemap-rewriting dependency.
- **Where.** `dist/index.js` of every library package (via `scripts/build/tsdown-preset.ts`) and
  the `@mk7s/holochart` ESM and IIFE builds. The IIFE resolves workspace sources, so the plugin
  covers all packages there.
- **Development build.** Packages that declare schemas (core, runtime, components, traces-basic)
  also emit `dist/index.development.js`, the same code with descriptions, exported under the
  `development` condition before `import`:

  ```json
  ".": {
    "source": "./src/index.ts",
    "types": "./dist/index.d.ts",
    "development": "./dist/index.development.js",
    "import": "./dist/index.js"
  }
  ```

  Bundlers that set the condition in development (Vite, webpack `mode: 'development'`, Rspack)
  pick it up; the default (`import`) is the stripped build, so bundlers that don't set the
  condition (esbuild and Rollup by default) get the small one. All packages resolve with the
  same conditions, so a dev app never mixes the two builds.

- `HOLOCHART_KEEP_DESCRIPTIONS=1` builds `dist/index.js` unstripped, only to measure the savings.

### Runtime schema introspection

`plotSchema(registry)` (our `Plotly.PlotSchema.get()`) and `schemaToJSON()` still return every
attribute with its `valType`, constraints, defaults, `editType` and roles; in production builds
the nodes have no `description` key. A trace's top-level description falls back to its
`meta.description`, which is kept. `registry.list()` is unchanged. Tools that need the full text
(editors, playgrounds) should load the published `plot-schema.json` from the docs site, or run in
development, where the `development` build has it.

### What users see

- **Production installs:** no difference except size. Warnings and validation errors read the
  same. Editor hovers still show descriptions: they come from the JSDoc in `index.d.ts`, which is
  generated from the sources.
- **Dev servers** (Vite, webpack in development mode): the `development` build, with
  descriptions, so `plotSchema()` matches the docs.
- **Monorepo** (sandbox, docs, vitest, schema-gen, TypeDoc): sources, unchanged.

## Consequences

### Positive

- `core + scatter` initial size −10.9 kB (−9.2%), `basic` −13.7 kB (−8.2%), full ESM −13.7 kB,
  IIFE −13.9 kB, with the sources and the docs unchanged (the generated attribute reference is
  byte-identical).
- No consumer configuration, no `process.env` in shipped code, exact sourcemaps.

### Negative

- Four packages ship two JS builds (about +0.8 MB of JS and +1.6 MB of sourcemaps unpacked across
  them); only one is ever bundled.
- The plugin recognizes syntax, not types: descriptions reached through other patterns (an
  options object built elsewhere and passed by reference, a helper whose parameter has another
  name) are not stripped. A build warning and `tests/build/strip-descriptions.test.ts` (which
  bundles every package with the plugin and checks the output against the descriptions collected
  from the sources, and checks the built `dist/` after a build) catch regressions.
- Production `plotSchema()` output differs from development's by the `description` keys.

### Follow-ups

- If render or themes ever declare attribute schemas, give them the development build too
  (`libraryConfig({ development: true })`); the test lists the packages it checks.

## Alternatives considered

### Separate `*.descriptions.ts` modules

Move descriptions into modules loaded only by docs and dev builds. Rejected: descriptions would no
longer sit next to their attributes, every attribute edit would touch two files, and the generated
types and docs would need a join step.

### `process.env.NODE_ENV !== 'production'` guards

`description: DEV ? '…' : undefined` around every string. Rejected: it clutters ~470 declarations,
depends on the consumer's bundler replacing `process.env.NODE_ENV` (esbuild and Rollup don't by
default; unbundled ESM throws on `process`), and leaves dead strings in bundles when it doesn't.

### Dropping descriptions at runtime (`delete opts.description` in the builders)

Saves memory, not bytes: the strings are still in the bundle.

### A `production` condition instead of `development`

Ship descriptions by default and strip only under `production`. Rejected: bundlers that don't set
`production` (esbuild and Rollup by default, the size budgets' own measurement) would ship the
large build; defaulting to the small one is safer.

## References

- `plan.md` E21.5; `docs/release/bundle-size.md` ("Diet")
- ADR-002 (schema-first DSL), ADR-013 (`source` condition), ADR-015 (tsdown builds)
- `scripts/build/strip-descriptions.ts`, `scripts/build/tsdown-preset.ts`,
  `tests/build/strip-descriptions.test.ts`
