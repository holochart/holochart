# ADR-NNN: Title

> **How to use this template**
>
> 1. Copy this file to `docs/adr/NNN-short-kebab-title.md`, using the next free number.
> 2. Fill in every section. Keep it short: an ADR records one decision and why it was made.
> 3. Open a PR with status **Proposed**, and add a row to the index in [README.md](README.md).
> 4. Status transitions: **Proposed** becomes **Accepted** or **Rejected** once there is enough evidence
>    (for the initial ADRs, the E0.7 technical spikes A–E provide it). An accepted ADR is never edited
>    to reverse it; instead, write a new ADR and mark the old one **Superseded by ADR-XXX**.
> 5. Delete this note in the copy.

- **Status:** Proposed | Accepted | Rejected | Superseded by ADR-XXX
- **Date:** YYYY-MM-DD
- **Deciders:** names or roles
- **Related stories:** e.g. E2.3, E0.7 (spike D)

## Context

What problem are we solving? Which forces, constraints, and requirements apply (performance,
compatibility, team skills, ecosystem)? Link the relevant plan sections, stories, and risks.

## Decision

What we will do, stated in the active voice ("We will..."). Be concrete: name the APIs, config
options, packages, or file layouts that the decision fixes.

## Consequences

### Positive

- What becomes easier or better.

### Negative

- What becomes harder, what we give up, and what new risks we take on.

### Follow-ups

- Stories, spikes, docs, or tests that this decision creates or depends on.

## Alternatives considered

### Alternative A

Short description, and why it was rejected (or the tradeoff that tipped the decision).

### Alternative B

...

## References

- `plan.md` sections and stories
- Related ADRs, external docs, benchmarks, spike write-ups
