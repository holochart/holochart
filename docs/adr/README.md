# Architecture Decision Records

Each significant architectural or toolchain decision is recorded as an ADR in this directory.
To add one, copy [000-template.md](000-template.md) to the next free number, fill it in, and open a PR
with status **Proposed**. ADRs move to **Accepted** or **Rejected** once there is evidence (for the
initial ADRs, the E0.7 technical spikes A–E). Accepted ADRs are not rewritten; a new ADR supersedes
them and the old one is marked **Superseded by ADR-XXX**.

| ADR | Title                                                                                                   | Status        |
| --- | ------------------------------------------------------------------------------------------------------- | ------------- |
| 000 | [Template](000-template.md)                                                                             | n/a           |
| 001 | [Figure spec follows Plotly semantics](001-figure-spec-plotly-semantics.md)                             | Accepted      |
| 002 | [Schema-first attribute DSL](002-schema-first-attribute-dsl.md)                                         | Accepted      |
| 003 | [`three` is a peer dependency](003-three-peer-dependency.md)                                            | Accepted      |
| 004 | [One WebGL context per figure, scissored subplot viewports](004-one-webgl-context-per-figure.md)        | Proposed      |
| 005 | [WebGL SDF text with a DOM mirror](005-webgl-sdf-text-with-dom-mirror.md)                               | Proposed      |
| 006 | [Use d3 micro-libraries for data math](006-d3-micro-libraries.md)                                       | Accepted      |
| 007 | [On-demand rendering](007-on-demand-rendering.md)                                                       | Accepted      |
| 008 | [Pixel-space orthographic camera for 2D subplots](008-pixel-space-orthographic-2d-camera.md)            | Accepted      |
| 009 | [GLSL3 shaders for v1, TSL for prototyping](009-glsl3-shaders-tsl-prototyping.md)                       | Accepted      |
| 010 | [CPU spatial indexes for 2D hover, GPU ID picking for 3D](010-cpu-spatial-hover-gpu-picking-3d.md)      | Accepted      |
| 011 | [Calc can run in a Web Worker](011-calc-in-web-worker.md)                                               | Proposed (P2) |
| 012 | [Functional accessors are non-serializable; `styleRules`](012-functional-accessors-non-serializable.md) | Proposed      |
| 013 | [`.ts` import extensions and native type stripping](013-ts-import-extensions-native-type-stripping.md)  | Accepted      |
| 014 | [GLSL as TypeScript template-string modules](014-glsl-as-typescript-template-modules.md)                | Accepted      |
| 015 | [Package builds with tsdown (JS, bundled declarations, IIFE)](015-tsup-js-tsc-declarations.md)          | Accepted      |
| 016 | [Keep pnpm `minimumReleaseAge` on](016-pnpm-minimum-release-age.md)                                     | Accepted      |
| 017 | [Publish under the `@mk7s` npm scope](017-mk7s-npm-scope.md)                                            | Accepted      |
| 018 | [Visual regression harness](018-visual-regression-harness.md)                                           | Accepted      |
| 019 | [A runtime package owns charts, the pipeline and the plugin contracts](019-runtime-package.md)          | Accepted      |
| 020 | [Strip schema descriptions from production builds](020-strip-schema-descriptions.md)                    | Proposed      |
| 021 | [A dark, dense default look, applied by the runtime](021-default-look.md)                               | Accepted      |
