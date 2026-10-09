# Discovery replay and expansion decisions

Reviewed 2026-10-09 against the current working tree. No analytics service, participant session,
or demand survey was added. The launch checklist's five observed tasks remain pending.

## Repeated editorial search tasks

The 33 beginner tasks in `examples/_lib/curation.ts` already describe concrete analytical goals.
We replayed each description as a literal gallery query, globally and in its assigned family.
The [before report](./discovery-before.json) records 32 queries with no results and none locating
the expected starter. The [after report](./discovery-after.json) records all 33 locating the
expected starter first in both scopes. The search now includes those reviewed task descriptions
alongside titles, subtype aliases, family names and tags. Existing AND facets and deterministic
ordering are preserved; unrelated examples are not relabeled or made beginner to improve counts.

Twelve of these starters have an exact verified Python counterpart. Python-filtered queries
remain subject to actual notebook-host verification: an intent match cannot make a map or graph
extension appear notebook-supported. A browser check exercises task queries, URL restoration
after reload and the map/Python boundary. A unit check covers family isolation and verified
language filtering. `check:discovery`, also included in `check:site`, replays the full task set.

These measurements show improved coverage of the existing editorial vocabulary. They do not
show that people found a chart faster, identify actual failed visitor queries or establish a
demand ranking. Collect those observations in the existing launch sessions before changing
category names, global ordering, related-example recommendations or Python expansion priorities.
No additional Python trace support is claimed by this wave.

To repeat the current check:

```sh
pnpm --filter @mk7s/holochart-docs check:discovery
node apps/docs/scripts/discovery-check.ts --report /tmp/holochart-discovery.json
```

Reports retain the task, manifest and search-source hashes. The historical before report has a
different search-source hash and is retained rather than overwritten by the gate.

## Advanced browsing evaluation

| Candidate                        | Existing route or capability                                                                                                                                      | Decision and evidence needed                                                                                                                                                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chart chooser by analytical task | Reviewed family starters, searchable task language and the cookbook                                                                                               | Improve the current route first. Replay exposed vocabulary gaps; it did not establish a need for an additional multi-step chooser. In observed tasks, record whether readers can identify a family after the alias improvement.  |
| Side-by-side comparisons         | Chart guides link alternative subtypes; cookbook small multiples compares related series                                                                          | Defer a comparison workspace until participants need to compare chart types beyond those links. A future prototype must retain ordinary detail URLs, keyboard focus and bounded live contexts.                                   |
| Saved example collections        | Example/detail URLs and gallery query URLs are already shareable                                                                                                  | Defer persistence until repeated collection or revisit behavior is observed. Decide storage, export and privacy requirements with the user before adding an account or analytics dependency.                                     |
| In-browser source editing        | The local development sandbox provides an example picker, rerun and display controls; editing source requires the checkout. The public playground is still a stub | Do not advertise a deployed editor. The inspected sandbox is a run-and-inspect path. A public editor needs an actual deployed target, source/extension loading, validation and bounded chart cleanup before adding launch links. |
| Optional card density            | Current inventory shows 48 cards initially, four desktop columns and eight complete first-viewport cards; show-more keeps search across all examples              | Defer a density prototype until compact scans versus larger previews cause an observed problem. Any future preference must preserve the default layout, readable labels, URL meaning and touch targets.                          |

These are evaluated follow-ups, not shipped comparison, collection, editor or density features.
The current family directory and filters remain the default browsing path. Native zoom,
screen-reader speech and human first-use outcomes are still separate launch review gates.
