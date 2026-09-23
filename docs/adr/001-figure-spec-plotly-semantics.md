# ADR-001: Figure spec follows Plotly semantics

- **Status:** Accepted (2026-09-23).
- **Date:** 2026-09-23
- **Related stories:** E1.1, E1.4, E1.5, E18.3, E18.4, E20.7, E23.\*; plan §2, §7, §16 Q2

## Evidence

- M0 core implements the `{ data, layout, config, frames }` model with Plotly attribute names,
  per-type template cycling, and `uirevision`/`datarevision` semantics (E1.1–E1.8).

## Context

Holochart targets Plotly-like coverage (goal G2: a declarative, serializable figure spec familiar to
Plotly users; success metric: the Plotly JSON importer renders at least 80% of the plotly.js image mock
corpus without errors). We need one canonical input format that every stage of the pipeline
(validate, defaults, calc, layout, render) consumes, that can be serialized to JSON (E18.3), and that
existing Plotly users and Plotly figures can adopt with minimal friction.

## Decision

The figure spec is `{ data, layout, config, frames }`:

- `data`: an array of traces discriminated by `type` (`scatter`, `bar`, ...).
- `layout`: figure-level layout, axes, subplots, annotations, shapes, template.
- `config`: non-visual behavior (interaction, rendering, `worker`, `textRenderer`, `strict`, ...).
- `frames`: animation frames.

Attribute names and semantics follow Plotly wherever reasonable (e.g. `marker.line.color`,
`hovermode`, `autorange`, `uirevision`, `editType`-style update behavior). Each attribute records its
Plotly equivalent via `plotlyPath` metadata (see [ADR-002](002-schema-first-attribute-dsl.md)), which
drives the importer in `@mk7s/holochart-compat-plotly`. Holochart-specific features (`depth`,
`material`, `view3d`, `styleRules`) are additive and never change the meaning of a Plotly attribute.

## Consequences

### Positive

- Plotly users, docs, and Stack Overflow answers transfer directly; migration is mostly mechanical.
- The importer (E18.4) is a mapping table rather than a translation engine, and the plotly.js mock
  corpus (E20.7) becomes a large, free conformance suite.
- A plain JSON spec is easy to serialize, diff (E1.8), validate, and generate from other languages.

### Negative

- We inherit Plotly's naming quirks (`error_x`, `bgcolor`) and some historical inconsistencies
  (open question §16 Q2: canonical Plotly names, camelCase aliases in TS builders only).
- The attribute surface is large (risk R1); fidelity pressure can pull us into edge-case parity work.
- Grammar-of-graphics users do not get a first-class declarative mapping language at this level.

### Follow-ups

- Decide §16 Q2 (camelCase aliases) before E1.2 type generation stabilizes.
- The Express API (E23) provides the grammar-style, tabular-data layer on top of this spec.
- Accept or reject once the importer prototype shows the mock-corpus pass rate is achievable.

## Alternatives considered

### Grammar-of-graphics spec (Vega-Lite-like)

Encodings, marks, and transforms over a tabular dataset. More compositional and concise for
statistical charts, but unfamiliar to Plotly users, makes a Plotly importer a compiler rather than a
mapper, and fits poorly with Plotly-specific traces (sankey, parcoords, 3D volumes). Rejected as the
core format; its strengths are delivered by the Express API (E23) that compiles down to this spec.

## References

- `plan.md` §2 goals (G2), §7 API forms, §6 ADR table, §16 Q2, risk R1
- [ADR-002](002-schema-first-attribute-dsl.md), [ADR-012](012-functional-accessors-non-serializable.md)
