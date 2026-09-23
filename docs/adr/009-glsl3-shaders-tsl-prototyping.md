# ADR-009: GLSL3 shaders for v1, TSL for prototyping

- **Status:** Accepted (2026-09-23).
- **Date:** 2026-09-23
- **Related stories:** E0.7 (spikes A, B), E2.4–E2.11, E8.8, E16.8; plan §5, §16 Q5, risk R8

## Evidence

- Every M0 primitive (markers, lines, fills, rects, arcs, picking) is GLSL3 on `ShaderMaterial`
  and runs on WebGL2 under both ANGLE/Metal and SwiftShader
  ([spike A](../spikes/a-markers.md), [spike E](../spikes/e-determinism.md)).
- GLSL3 gave the features we rely on (`gl_InstanceID`, `gl_VertexID`, `fwidth`, integer ids for
  picking). TSL remains the path for a later WebGPU renderer (E16.8).

## Context

Holochart's primitives (instanced SDF markers, screen-space lines, rects, arcs, meshes) need custom
shaders. three.js offers two paths: `ShaderMaterial`/`RawShaderMaterial` with GLSL (WebGL2 only), and
TSL (three Shading Language, node materials) which compiles to both GLSL for WebGL2 and WGSL for
`WebGPURenderer`. TSL is the long-term direction of three.js, but its API and WebGL2 fallback are
still evolving (risk R8), and performance-critical, well-understood GLSL techniques (SDF symbols,
`fwidth` anti-aliasing, instanced line joins) are easier to write and debug in GLSL today.

## Decision

- v1 shaders are written in **GLSL3** via `ShaderMaterial` targeting WebGL2. GLSL sources are
  TypeScript template-string modules ([ADR-014](014-glsl-as-typescript-template-modules.md)).
- **New materials are prototyped in TSL** to track its maturity and keep a migration path open.
- `WebGPURenderer` support is **opt-in after v1** (E16.8), with primitives ported to TSL/node
  materials.
- Primitives stay behind our own interfaces so the shader language is an implementation detail.
- Shader hooks (E8.8) expose named GLSL injection points for v1; TSL node hooks come with WebGPU.

## Consequences

### Positive

- Mature, debuggable, well-documented path for the performance-critical primitives in M0–M1.
- No dependency on a moving TSL API for v1.
- TSL prototypes build experience and surface migration problems early.

### Negative

- GLSL shaders will need porting for WebGPU; some work is done twice.
- User shader hooks written in GLSL will not carry over automatically to a TSL/WebGPU backend.
- No WebGPU compute (GPU binning, marching cubes) in v1.

### Follow-ups

- Spikes A (1M SDF markers) and B (thick lines) are written in GLSL; where practical, compare a TSL
  version for performance and code size. Their findings move this ADR to Accepted or Rejected.
- Revisit at each three.js minor release; tie to §16 Q5 (WebGPU timing).

## Alternatives considered

### TSL-only from day one

One shader source for WebGL2 and WebGPU and alignment with three's direction. Rejected for v1
because TSL and its WebGL2 fallback are not yet mature enough to bet the core primitives on, the
debugging story is weaker, and API churn would land directly on the critical path.

## References

- `plan.md` §5 (Shaders row), §6 ADR table, E8.8, E16.8, §16 Q5, risk R8
- [ADR-003](003-three-peer-dependency.md), [ADR-014](014-glsl-as-typescript-template-modules.md)
