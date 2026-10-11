# Release criteria

> **Status: draft for the owner to confirm (2026-10-11).** It merges the three bars that existed
> before it: the "shippable" table in [backlog.md](../../backlog.md), the M7 exit criteria in
> [plan.md](../../plan.md) and the release gates in
> [plotly-parity-backlog.md](../plotly-parity-backlog.md). Where they disagreed, the choice made
> here is marked **Choice**. Once confirmed, this page is the only bar; the other three are
> history.

What has to be true before a release line starts. IDs are from
[backlogv2.md](../../backlogv2.md). "Met" was checked on 2026-10-11.

## Alpha (`0.1.0-alpha.N`): where the project is

Installs from npm with correct metadata and types. The README and install docs work as written.
A bad callback or a missing WebGL2 fails politely. Nothing in the docs is false.

Met, apart from the last sentence, which track A of backlogv2 is closing.

## Beta (`0.x.0-beta.N`)

A beta says: safe to put in a production app, for the chart types and browsers this page names.
The API can still change, with a migration note for every break.

| #   | Criterion                                                                                                    | State on 2026-10-11                                                            | Work  |
| --- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ----- |
| B1  | No open bug from the ship backlog that loses data, hangs a promise or leaves a chart in a half-updated state | Open                                                                           | V2-A3 |
| B2  | Every ADR whose code is in a published package is Accepted or replaced                                       | Ten are Proposed                                                               | V2-A2 |
| B3  | The nightly workflows are green, and a failure opens an issue                                                | Both red since they began; Firefox has never run on Linux                      | V2-A3 |
| B4  | The browser matrix on the support page is backed by a dated run on each browser it calls tested              | Chromium yes; Firefox and WebKit by hand on macOS once; real Safari never      | V2-J1 |
| B5  | Leaks L1, L1b and L2 are fixed, and a page's WebGL context count is bounded and documented                   | Shared renderer built; leaks open                                              | V2-C8 |
| B6  | Every registered trace type can be reached by keyboard, in the npm and the script-tag builds                 | Gaps in seven 3D traces, four 2D traces and the script-tag build               | V2-F5 |
| B7  | The framework and SSR recipes in the docs have each been run in a real app, in CI                            | Type-checked only                                                              | V2-G3 |
| B8  | The public API is written down and guarded in CI                                                             | Met: API reports gate every PR                                                 | —     |
| B9  | A Plotly user can see what is and is not supported, and a figure that loses something says so                | Compatibility page exists; `scattergl` and other dropped input give no warning | V2-E2 |
| B10 | Every config attribute either changes behaviour or says that it does not                                     | At least nine do nothing                                                       | V2-B7 |
| B11 | Performance is measured in CI, with budgets, on at least one machine that is not the author's                | Bench job disabled                                                             | V2-C1 |

**Choice.** The parity backlog asked for 95% of a pinned Plotly corpus to pass before beta. That
needs the corpus runner (V2-E1), which the ship backlog and the plan both put at 1.0. This page
follows them: beta requires honest diagnostics (B9), and the corpus percentage is a 1.0
criterion. If the runner exists by beta, publish its number without a threshold.

## 1.0

1.0 says: the API is stable. Breaking changes need a major version and a deprecation first
([versioning.md](versioning.md)).

| #   | Criterion                                                                                                                                                                                   | Source            | Work         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------ |
| S1  | Every beta criterion still holds                                                                                                                                                            |                   |              |
| S2  | The plugin contracts are `@public`: a trace, a component and a scale build against packed tarballs with no experimental import                                                              | plan M7, S3.5     | V2-B1–B8     |
| S3  | The importer renders at least 80% of the pinned plotly.js mock corpus, with the denominator, the exclusions and separate "accepted", "drawn" and "reviewed" rates published                 | plan G2, PC gates | V2-E1        |
| S4  | Performance budgets are green in CI: 1M-point scatter pans at 50 fps or more, 100k points first draw under 300 ms, and every target in `docs/perf/` is met or restated with its measurement | plan G5           | V2-C1, V2-C2 |
| S5  | A `<holo-chart>` element and React, Vue, Svelte and Angular wrappers are published and tested in fixture apps                                                                               | plan M7, S3.3     | V2-G1, V2-G2 |
| S6  | 2D charts export to SVG                                                                                                                                                                     | plan M7, S3.4     | V2-D1        |
| S7  | Every attribute has generated reference docs and every trace type has at least five examples                                                                                                | plan G4           | Met          |
| S8  | Docs are versioned, and no stub page is reachable from the sidebar                                                                                                                          | plan M7, S3.10    | V2-I2, V2-I3 |
| S9  | Changesets pre mode is exited and npm publishing uses trusted publishing, with no long-lived token                                                                                          | releasing.md      | V2-A4        |

**Choice.** The plan's M7 also listed ternary, quiver and streamline charts, CSS-variable themes,
shader hooks, editable mode and Arrow adapters. The ship backlog later moved all of them to
"after 1.0". This page follows the later decision: none of them gates 1.0.

**Not decided here.** Whether tile maps (V2-E3) and the PyPI release (V2-H1) gate 1.0 or follow
it. backlogv2 ranks both P0 for "v2"; neither was a 1.0 criterion in the earlier documents.
