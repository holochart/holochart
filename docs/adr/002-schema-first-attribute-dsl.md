# ADR-002: Schema-first attribute DSL

- **Status:** Accepted (2026-09-23).
- **Date:** 2026-09-23
- **Related stories:** E1.1, E1.2, E1.3, E1.7, E1.9, E19.3, E20.2, E22.1; plan §3 principles 1 and 4

## Evidence

- The `attr.*` DSL drives inferred TS types, validation, defaults, edit-type planning, generated
  layout/config types, `plot-schema.json`, and schema-derived property tests (E1.1–E1.9, E20.2).

## Context

Holochart will declare thousands of trace, layout, and config attributes. Each attribute needs a
TypeScript type, runtime validation and coercion, a default, an `editType` for the update planner, a
Plotly mapping, and reference documentation. If these live in separate hand-maintained places they
drift (risk R12, docs drift). Plan principle 1 states that the schema is the single source of truth.

## Decision

Attributes are declared once in a typed DSL (`core/schema`, E1.1). Each declaration carries value
type (`number`, `enumerated`, `flaglist`, `color`, `data_array`, `function`, ...), `dflt`, `min`/`max`,
`values`, `arrayOk`, `editType`, `description`, `plotlyPath`, `animatable`, `since`, `deprecated`.

From that declaration we generate:

- TypeScript types (`tools/schema-gen`, E1.2), checked in and diffed in CI;
- runtime validation and coercion (E1.3) and the defaults stage (E1.4);
- update plans via `editType` (E1.7);
- the attribute reference docs and `plot-schema.json` / JSON Schema (E19.3);
- `fast-check` arbitraries for property tests (E20.2).

Trace modules export their `schema` as part of the trace module contract (E22.1).

## Consequences

### Positive

- One declaration drives types, validation, defaults, docs, and tests; they cannot disagree.
- `editType` on every attribute enables minimal recompute (principle 4).
- Plugins get validation, types, and docs for free by declaring a schema.
- JSON Schema output gives editor autocomplete for JSON figures.

### Negative

- A code-generation step (`tools/schema-gen`) must be maintained and run; generated types must be
  kept in sync (CI check).
- The DSL must be expressive enough for conditional defaults and nested/array items, or special
  cases leak back into hand-written code.
- Contributors must learn the DSL before adding attributes.

### Follow-ups

- E1.1 prototype of the DSL with scatter + layout axes; accept this ADR when generated types for
  those are at least as precise as hand-written ones.

## Alternatives considered

### Hand-written TypeScript types + JSDoc

Simplest to start and gives the best editor experience for the types themselves. But validation,
defaults, `editType`, and docs would each need a parallel hand-written source, which drifts at
Plotly scale. Types are also erased at runtime, so they cannot drive coercion or docs generation.
Rejected.

## References

- `plan.md` §3 principles 1 and 4, §6 ADR table, E1.1–E1.9, E19.3, risk R12
- [ADR-001](001-figure-spec-plotly-semantics.md), [ADR-012](012-functional-accessors-non-serializable.md)
