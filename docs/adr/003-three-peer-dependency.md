# ADR-003: `three` is a peer dependency

- **Status:** Accepted (2026-09-23).
- **Date:** 2026-09-23
- **Related stories:** E0.1, E0.2, E2.\*, E8.8, E16.8, E21.2; plan §5, risk R8

## Evidence

- Every package declares `three >=0.180.0` as a peer and builds with it external; the IIFE CDN
  bundle is the documented exception (ADR-015). The bundle smoke test loads it in Chromium.

## Context

Holochart renders through three.js and exposes it as an escape hatch (render hooks, scene access,
material overrides, shader hooks; plan §8 layers 8–10). Many users already have `three` in their app
(react-three-fiber, custom scenes). If Holochart bundled its own copy, apps would load two copies of
three, which wastes bytes and breaks `instanceof` checks and shared objects (materials, textures,
`Object3D`s passed across the boundary). three also changes quickly (WebGPU/TSL transition, risk R8).

## Decision

All Holochart packages that import three declare it as a **peer dependency** with the range
`>=0.180.0`. The monorepo develops and tests against `three ^0.186` (pnpm catalog, installed as a
dev dependency). Package builds mark `three` as external. The IIFE CDN
bundle (E0.2) is the one exception: it bundles its own copy of three, because three ships no global
build and classic scripts cannot use import maps (see [ADR-015](015-tsup-js-tsc-declarations.md) and
`packages/holochart/README.md`). The lower bound is raised
deliberately when we depend on newer APIs, and the tested range is stated in docs and checked in CI.

## Consequences

### Positive

- One three instance per app; objects from user code and Holochart interoperate.
- Users control the three version and can upgrade independently of Holochart releases.
- Smaller Holochart bundles.

### Negative

- We must support a range of three versions, not one. API churn can break older versions in range.
- Users see peer-dependency warnings if their three is outside the range.
- CDN/IIFE usage needs an extra script tag for three.

### Follow-ups

- CI matrix job testing the lowest supported (`0.180.x`) and latest three.
- Keep three usage behind our own primitive interfaces (`render`) so API changes stay contained.
- Revisit the lower bound when [ADR-009](009-glsl3-shaders-tsl-prototyping.md) moves to TSL.

## Alternatives considered

### Bundle three into Holochart

Guarantees the exact tested version and simplifies CDN usage. Rejected because it duplicates three in
any app that already uses it (bundle size, broken `instanceof`, two renderers' worth of state) and
blocks users from upgrading three on their own schedule.

### Regular dependency with a caret range

Package managers may still install a second copy on version mismatch. Same failure mode as bundling,
just less predictable.

## References

- `plan.md` §5 (three.js row), E0.1 ("`three` declared as a peer dependency with a tested version
  range"), risk R8
- [ADR-009](009-glsl3-shaders-tsl-prototyping.md)
