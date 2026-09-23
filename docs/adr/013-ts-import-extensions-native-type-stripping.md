# ADR-013: `.ts` import extensions, native type stripping, and a `source` export condition

- **Status:** Accepted
- **Date:** 2026-09-23
- **Related stories:** E0.1, E0.2, E0.3, E20.1

## Context

The monorepo has many TypeScript packages, tools (`tools/schema-gen`), tests, and apps. We want:

- Node scripts and tools to run TypeScript directly, without a loader dependency or build step.
- Workspace packages to consume each other's **sources** in dev, tests, and the sandbox, so a change
  in `core` is visible in `render` without rebuilding `dist/`.
- Emitted JavaScript that runs unchanged in Node and bundlers.

Node (≥ 22.18, and 26) can strip erasable TypeScript syntax natively, but it requires explicit file
extensions in relative imports and rejects syntax that needs code generation.

## Decision

- **Relative imports use the `.ts` extension** (`import { x } from './scale.ts'`).
  `tsconfig.base.json` sets `allowImportingTsExtensions` and `rewriteRelativeImportExtensions` (tsc
  rewrites to `.js` in emitted output), plus `verbatimModuleSyntax` (explicit `import type`) and
  `erasableSyntaxOnly`: **no enums, namespaces, or constructor parameter properties**.
- **Scripts and tools run with Node's native type stripping**:
  `node --conditions=source path/to/script.ts` (Node ≥ 22.18 / 26), instead of tsx or ts-node.
- **Workspace packages resolve to TS sources via a custom `source` export condition.** Each package's
  `exports` lists `"source": "./src/index.ts"` before `types`/`import` (which point at `dist/`).
  tsconfig sets `customConditions: ["source"]`; Vitest sets `resolve.conditions: ['source']`; Vite
  apps set `resolve.conditions` to `['source', ...defaultClientConditions]` so the default client
  conditions are kept. Published consumers never set `source`, so they get `dist/`.

## Consequences

### Positive

- No runtime loader dependency; one TS dialect works in Node, tsc, tsdown, Vite, and Vitest.
- Dev, tests, and typecheck see live sources across packages without prebuilding.
- Emitted JS has correct `.js` specifiers without a post-processing step.

### Negative

- `.ts` extensions in imports look unusual to some contributors; editors must be configured to
  auto-import with extensions.
- No enums/namespaces/parameter properties; use `as const` objects and union types instead.
- Every tool that resolves workspace packages must be told about the `source` condition; forgetting
  it silently resolves to stale `dist/` output (or fails if `dist/` is missing).
- Node ≥ 22.18 is required for contributors.

## Alternatives considered

### Extensionless imports with bundler resolution only

Familiar and works in bundlers, but Node's native type stripping cannot resolve extensionless
specifiers, so scripts would need a loader. Rejected.

### tsx / ts-node

Mature loaders that accept any TS syntax. Rejected: extra dependency and startup cost, behavior that
diverges from tsc, and redundant now that Node strips types natively.

### Project references / `dist`-based dev

Packages consume each other's built output. Rejected: requires building before every test or dev run
and makes watch mode across packages slow and error-prone.

## References

- `tsconfig.base.json`, `vitest.config.ts`, package `exports` maps
- [ADR-014](014-glsl-as-typescript-template-modules.md), [ADR-015](015-tsup-js-tsc-declarations.md)
