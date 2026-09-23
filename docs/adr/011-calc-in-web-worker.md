# ADR-011: Calc can run in a Web Worker

- **Status:** Proposed (P2)
- **Date:** 2026-09-23
- **Related stories:** E1.9 (`config.worker`), E16.5, E16.7, E22.1; plan §3 principle 3, §4.2

## Context

Some calc steps are heavy: histogram binning over millions of values, KDE, contouring, marching cubes
(isosurface/volume), hierarchy layouts. On the main thread they block input and animation. Plan
principle 3 keeps validate, defaults, calc, and layout as pure functions that do not touch three.js,
so they can in principle move off the main thread (§4.2 marks them worker-able).

## Decision

Calc can run in a **Web Worker pool** when `config.worker: true`, or automatically when the input
data size exceeds a threshold. Data moves between threads as **transferred typed arrays**, not
structured-clone copies. Each trace module declares `calcWorkerSafe` in its contract (E22.1); traces
that are not worker-safe (for example, those using functional accessors,
[ADR-012](012-functional-accessors-non-serializable.md)) always run on the main thread. While calc is
pending, the figure renders progressively: axes and frame first, traces as their calc resolves
(E16.5).

## Consequences

### Positive

- The UI stays responsive for large datasets and expensive statistical traces.
- Enforces purity of calc: anything that cannot be serialized to a worker is caught early.
- Worker calc composes with future OffscreenCanvas rendering (E16.7).

### Negative

- Async calc complicates the update pipeline (stale results, cancellation, ordering).
- Transfers move ownership: the main thread loses access to transferred buffers unless we copy or
  transfer back, which interacts with the zero-copy ingestion path (E1.6).
- Worker startup and bundling (worker entry points, CDN/IIFE usage) add build complexity.
- Threshold heuristics need tuning and can surprise users.

### Follow-ups

- Benchmarks in `apps/bench` to choose the default threshold.
- Accept after an E16.5 prototype shows a net win on histogram/contour at realistic sizes.

## Alternatives considered

### Main thread only

Simplest; no async pipeline, no serialization boundary. Rejected as the only option because heavy calc
would freeze interaction on large datasets. It remains the default for small figures, and the pure
pipeline keeps it trivial.

## References

- `plan.md` §3 principle 3, §4.2 pipeline table, §6 ADR table, E16.5
- [ADR-012](012-functional-accessors-non-serializable.md)
