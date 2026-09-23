# ADR-012: Functional accessors allowed but non-serializable; `styleRules` as the serializable alternative

- **Status:** Proposed
- **Date:** 2026-09-23
- **Related stories:** E1.1 (`function` value type), E8.5, E8.6, E18.3, E16.5; plan §8 layers 6–7

## Context

Developers coming from d3 expect to style points with functions:
`marker.color: (d, i) => d.y > 10 ? 'gold' : 'gray'`. That is concise and powerful, but functions
cannot be serialized to JSON (E18.3), cannot be sent to a worker
([ADR-011](011-calc-in-web-worker.md)), cannot be imported from or exported to Plotly, and are opaque
to the schema, validation, and docs. The figure spec is meant to be declarative and serializable
([ADR-001](001-figure-spec-plotly-semantics.md)).

## Decision

- **Functional accessors are allowed** on every `arrayOk` attribute (E8.6), with signature
  `(point, i, trace) => value`. The schema has a `function` value type marked non-serializable.
- A figure containing functions is flagged **non-serializable**. `toJSON()` warns and evaluates the
  functions into per-point arrays.
- A serializable alternative, **`styleRules`**, is provided (E8.5):
  `styleRules: [{ when: { y: { gt: 10 } }, set: { 'marker.color': 'gold' } }]`, with operators such
  as `eq`, `gt`, `in`, `between`, `regex`, `and`, `or`, `not`. Rules compile to per-point arrays in the
  calc stage.
- In the customization cascade, style rules (layer 6) apply before style functions (layer 7).

## Consequences

### Positive

- d3-style ergonomics for JS users without compromising the declarative core.
- `styleRules` covers most conditional styling in pure JSON, so it survives serialization, worker
  calc, playground sharing, and chart-image servers.
- Both approaches resolve to per-point arrays, so renderers see one representation.

### Negative

- Two ways to do conditional styling; docs must explain when to use which.
- Figures with functions lose round-trip fidelity (`toJSON` bakes values), and their traces are not
  worker-safe.
- `styleRules` is a small query language we must design, validate, document, and keep stable.

### Follow-ups

- Docs guidance: prefer `styleRules`; use functions for logic rules cannot express.
- Accept once the E8.5 operator set covers the common cases in the examples corpus.

## Alternatives considered

### Serializable only

Keeps every figure JSON-clean and worker-safe. Rejected because it forces users to precompute arrays
for anything beyond the rule language, which is unfriendly for JS developers and blocks idiomatic
d3-style usage.

## References

- `plan.md` §6 ADR table, §8 customization cascade, E8.5, E8.6, E18.3
- [ADR-001](001-figure-spec-plotly-semantics.md), [ADR-002](002-schema-first-attribute-dsl.md),
  [ADR-011](011-calc-in-web-worker.md)
