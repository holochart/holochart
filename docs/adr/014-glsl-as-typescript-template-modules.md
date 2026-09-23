# ADR-014: GLSL as TypeScript template-string modules

- **Status:** Accepted
- **Date:** 2026-09-23
- **Related stories:** E0.2, E2.4–E2.11, E8.8
- **Supersedes:** the original E0.2 acceptance criterion "Shader files (.glsl) imported as strings via
  a Vite plugin" (plan.md E0.2 has since been updated to match this ADR)

## Context

The render package ships many GLSL3 shaders ([ADR-009](009-glsl3-shaders-tsl-prototyping.md)). The
original plan imported `.glsl` files as strings through a Vite plugin. But the same sources are
consumed by several tools: tsup (package builds), Vite (sandbox, docs), Vitest (unit tests), tsc
(typecheck and declarations), and Node's native type stripping for scripts
([ADR-013](013-ts-import-extensions-native-type-stripping.md)). A `.glsl` import needs a loader or
plugin in each of them, plus ambient `declare module '*.glsl'` types.

## Decision

GLSL is written as TypeScript modules named `*.glsl.ts` that default-export a template string tagged
with a `/* glsl */` comment:

```ts
// sdf-symbols.glsl.ts
export default /* glsl */ `
  float sdCircle(vec2 p, float r) { return length(p) - r; }
`;
```

Shared chunks are composed through template interpolation (`${sdfSymbols}`). No `.glsl` loader or
plugin is used anywhere.

## Consequences

### Positive

- Works identically in tsup, Vite, Vitest, tsc, and Node type stripping; nothing to configure.
- No custom loaders and no ambient module declarations.
- Chunk composition and constants (e.g. symbol ids shared with TS) use plain interpolation, and
  imports are tracked by the normal module graph (HMR, tree-shaking).

### Negative

- Less editor GLSL tooling (no GLSL linting or `#include` validation inside a TS string). Mitigated
  by the `/* glsl */` tag, which syntax-highlighting extensions recognize.
- Backticks and `${` inside shader code must be escaped (rare in GLSL).
- Shader compile errors report line numbers relative to the assembled string, not the source file.

### Follow-ups

- Optional: a small helper that prefixes shader compile errors with the module name.

## Alternatives considered

### `.glsl` files via a Vite/tsup loader plugin (original E0.2 plan)

Best editor support for raw GLSL files. Rejected because every consumer (tsup, Vite, Vitest, Node,
tsc) needs its own loader and type declarations, which is fragile across the toolchain.

### `?raw` imports

Vite-only; tsup and Node do not understand the suffix. Rejected.

### glslify / `#include` preprocessing

Adds a build-time preprocessor for composition that template interpolation already covers.

## References

- `plan.md` E0.2
- [ADR-009](009-glsl3-shaders-tsl-prototyping.md), [ADR-013](013-ts-import-extensions-native-type-stripping.md)
