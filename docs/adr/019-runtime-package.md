# ADR-019: A runtime package owns charts, the pipeline and the plugin contracts

- **Status:** Accepted
- **Date:** 2026-09-23
- **Deciders:** M1 runtime workstream
- **Related stories:** E22.1, E22.2, E7.1, E4.1, E4.3, E9.1, E21.1; plan §4.1, §4.2, §4.4, §7

## Context

Plan §4.1 originally put the figure model, calc pipeline, layout engine, event bus, registry and
update planner in `core`, and three.js code in `render`. Something has to connect them: create a
render root for an element, run validate → defaults → calc → layout → plot → render, map updates to
the stages their edit types declare, and hand traces and components their scales, viewports and
primitives.

Constraints:

- `core` must stay pure and renderer-free (plan §3 principle 3): its code runs in tests without a
  GPU and, later, in a Web Worker (ADR-011). It cannot import `render` or three.js.
- Trace modules need both sides: a schema and `supplyDefaults` (pure) and a `plot` part that
  creates GPU primitives. Plan E22.1 wants built-ins to use only a public contract, the same one
  third-party plugins use.
- Components (axes, legend, title, …) also need layout-time hooks (margin pushes) and drawing.
- Partial bundles (E21.1) must be able to register only the modules they use.

## Decision

We add `@mk7s/holochart-runtime` (`packages/runtime`), depending on `core` and `render`:

- **Chart runtime.** `createChart(el, figure, options?)` returns a `Chart` with `update`, `react`,
  `restyle`, `relayout`, `updateAttributes`, `addTraces`, `deleteTraces`, `moveTraces`, `resize`,
  `on`/`once`/`off`, `destroy`, and escape hatches (`chart.three`, `getTraceObjects`). The
  Plotly-style functional API (`newPlot`, `react`, `restyle`, `relayout`, `update`, `purge`, …) is
  keyed by element. Every call returns a promise that resolves after the frame is drawn.
- **Pipeline orchestration.** Update calls edit the figure input synchronously and merge the stages
  core's planner declares into one pending plan, run once per microtask (several calls cost one
  pipeline run and one frame, ADR-007). Supply-defaults always runs; calc runs per invalidated
  trace; layout (size, margins, axis domains → one scissored 2D viewport per cartesian subplot,
  autorange → `DataTransform` per subplot) runs when a `calc`/`layout`/`ticks`/`plot` stage is
  declared; trace views receive a `TraceUpdatePlan { calc, plot, style, transform }`, so a color
  restyle is style-only and an axis-range relayout is transform-only (uniforms, no uploads).
- **Contracts.** The runtime defines the render-side contracts: `TraceModule` extends core's
  `TraceModule` with `calc`, `extremes` (autorange) and `plot: { create(ctx) → TraceView }` where
  `TraceView { update(ctx, plan), dispose? }`; later `hoverPoints`, `legendIcon`, … join it.
  `ComponentModule` extends core's with `pushMargin` and `draw: { create(ctx) → ComponentView }`.
  Contexts give access to primitives, the viewport, scales (`AxisInfo`), subplots, the overlay and
  `invalidate`. Core keeps typing the render parts as `unknown`.
- **Registry.** `register(...modules)` accepts trace modules, components and templates (locales,
  symbols and scale types later), warns on duplicate names, is idempotent for the same object, and
  supports introspection (`registry.list()`). It wraps core's registry, which keeps driving
  defaults, validation and edit-type planning. `createChartRegistry()` gives isolated registries.
- **Dependency direction.** `traces-*` and `components` depend on `runtime` (never the reverse). A
  trace package exports one module object combining core's schema/defaults parts with the runtime's
  render parts. The `@mk7s/holochart` bundle registers the built-ins and re-exports core and the
  runtime (`render` stays namespaced).

## Consequences

### Positive

- `core` stays pure and worker-ready; everything that touches three.js or the DOM lives in
  `render` (primitives) or `runtime` (orchestration).
- One public contract for built-ins and plugins; partial bundles are
  `register(scatter, bar)` on top of the runtime (E21.1).
- The pipeline is unit-testable with a fake renderer and scheduler (no WebGL in Vitest); layout
  math, planning and update semantics are pure functions.

### Negative

- One more package to version and document; plan §4.1's "core owns layout/event bus/registry"
  wording moves partly to the runtime (layout math that needs no renderer may move back to core if
  a worker needs it).
- The runtime and core registries are two layers over the same modules; the runtime one must be the
  only one apps touch.
- Contract changes ripple into every trace package; the contract is internal until M7 (E22).

### Follow-ups

- Wave 2: axes component (ticks, lines, labels) through `ComponentModule.draw`, iterative
  automargin (E4.2) through `pushMargin`, full scatter (lines/text/fills), hover and zoom (uirevision
  GUI edits via core's `recordGuiEdit`).
- Lifecycle hooks (E22.5), locale/symbol/scale-type registration (E22.2), `crossTraceCalc`.
- An import-boundary lint rule so built-ins import only public entry points (E22.1).

## Alternatives considered

### Put the runtime in `core`

Simplest graph, as plan §4.1 first sketched. Rejected: core would import three.js (through
`render`), breaking the pure-pipeline and worker goals.

### Put the runtime in the `@mk7s/holochart` bundle

No new package, but partial bundles would have no place to get `createChart` without every
built-in, and trace packages could not depend on the contracts without depending on the bundle
(a cycle).

### Put the contracts in `render`

`render` would learn about figures, traces and axes, which it deliberately does not (primitives only
draw typed arrays through a `DataTransform`).

## References

- `plan.md` §3, §4.1, §4.2, §4.4, §7, E22.1, E22.2, E7.1, E4.1, E4.3, E21.1
- [ADR-004](004-one-webgl-context-per-figure.md), [ADR-007](007-on-demand-rendering.md),
  [ADR-008](008-pixel-space-orthographic-2d-camera.md), [ADR-011](011-calc-in-web-worker.md)
