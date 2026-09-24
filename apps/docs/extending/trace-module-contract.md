---
title: Trace module contract
description: Reference for the TraceModule interface every trace type implements.
status: stub
milestone: M1
---

# Trace module contract

Every trace type, built-in or third-party, is a trace module: an object implementing the
`TraceModule` interface and registered with `register()`. This page will document the contract in
full. The interface is being finalized in M1 and becomes a stable public API in M7.

The current shape, in summary:

<!-- docs-gates: no-typecheck (a summary of the interface, not compilable code) -->

```ts
interface TraceModule<Attrs, Calc> {
  type: string; // 'scatter'
  categories: TraceCategory[]; // ['cartesian', 'symbols', 'showLegend', 'errorBarsOK', ...]
  schema: AttributeSchema<Attrs>; // single source of truth
  supplyDefaults(input, full, layout, ctx): void;
  calc(fullTrace, fullLayout, ctx): Calc; // pure
  crossTraceCalc?(calcdata[], fullLayout): void; // stacking, grouping
  plot: TraceRenderer<Calc>; // create / update / dispose
  hoverPoints?(calc, cursor, hovermode): HoverPoint[];
  selectPoints?(calc, selection): number[];
  legendIcon?(fullTrace): LegendGlyph;
  colorbar?(fullTrace): ColorbarSpec | null;
  animatable?: string[]; // attribute paths that support transitions
  meta: { description: string; docsPage: string; plotlyEquivalent?: string };
}
```

Planned topics:

- Each member in detail, with the pipeline stage that calls it
- `TraceRenderer`: `create(ctx)`, `update(ctx, plan)`, and `dispose()`
- The render context: primitives, scales, viewport, theme, and the resource manager
- Trace categories and what they enable
- Registration, duplicate detection, and registry introspection

See also [Writing a custom trace](/extending/custom-trace).
