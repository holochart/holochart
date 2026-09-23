# ADR-006: Use d3 micro-libraries for data math

- **Status:** Accepted. Plotly-compatible format strings come for free.
- **Date:** 2026-09-23
- **Related stories:** E3.1, E3.3, E5.8, E8.2, trace epics (stats, hier, sci, geo); plan §5, risk R9

## Context

The calc and layout stages need scales, tick generation, number and date formatting, time intervals,
color interpolation, curve generation, hierarchy layouts (treemap, sunburst, icicle), sankey layout,
contouring, Delaunay/Voronoi, and geographic projections. Plotly itself uses d3 for much of this, and
its format strings (`tickformat: '.2f'`, `'%Y-%m-%d'`) are d3-format and d3-time-format syntax.
Writing and maintaining all of this ourselves would be a large, bug-prone effort.

## Decision

We use the d3 micro-libraries as regular dependencies of the packages that need them:
`d3-scale`, `d3-array`, `d3-format`, `d3-time`, `d3-time-format`, `d3-interpolate`, `d3-color`,
`d3-scale-chromatic`, `d3-shape` (curves), `d3-hierarchy`, `d3-sankey`, `d3-contour`, `d3-delaunay`,
and `d3-geo`. We import individual modules, never the `d3` umbrella package. d3 code runs only in the
pure stages (defaults, calc, layout) and never touches the DOM.

## Consequences

### Positive

- Format strings, scales, and time handling match Plotly's behavior, which helps the importer
  ([ADR-001](001-figure-spec-plotly-semantics.md)) and user migration.
- Battle-tested, well-documented, ISC-licensed, tree-shakeable ES modules.
- Pure functions fit the worker-able pipeline ([ADR-011](011-calc-in-web-worker.md)).

### Negative

- Adds bundle weight (risk R9); must be tracked with `size-limit` budgets per entry point.
- d3 APIs work on JS arrays and numbers; hot paths over millions of points may need typed-array
  versions of our own.
- Upstream bugs or slow maintenance in less active modules (e.g. `d3-sankey`) become our problem.

### Follow-ups

- List d3 (ISC) in `THIRD_PARTY_NOTICES`.
- Wrap d3 scales behind our scale interface (`d2l`, `l2p`, `p2d`, E3.1) so they can be swapped per
  axis type.

## Alternatives considered

### Write our own

Full control over performance and typed-array support, no dependency risk. Rejected: a large amount
of subtle code (time zones, DST, locale formatting, contouring, projections) that d3 already gets
right, and we would lose exact Plotly format-string compatibility. We still write our own code where
profiling shows d3 is a bottleneck.

## References

- `plan.md` §5 (Math & data utilities row), §6 ADR table, E3.1, risk R9
