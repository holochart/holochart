# Website redesign evidence and maintenance

The [content audit](./content-audit.md) and [inventory](./inventory.json) cover the current source
tree. The [baseline screenshots](./baseline/) and viewport measurements capture the site before
the Wave 1 template changes on 2026-10-09. Regenerate the content inventory after changing
examples, pages, or gallery classification:

```sh
pnpm --filter @mk7s/holochart-docs audit:site
```

The audit reads source and metadata without executing examples or fetching data. It reports
missing thumbnails, missing source files, and public embeds referencing unknown examples.
It distinguishes internal fixtures, excluded public examples, page statuses, content kinds,
language artifacts, and assessed learning levels. Family totals overlap because cross-listed
examples count once in each family. Detailed page/embed and example/source relationships are in
the JSON inventory.

## Taxonomy and examples

`examples/_lib/families.ts` is the authoritative browser-safe registry for chart families,
subtypes, aliases, and documentation destinations. Navigation, the chart directory, breadcrumbs,
and gallery share it. `examples/_lib/catalog.ts` supplies curated classification overrides and
joins executed notebook metadata without pulling notebook data into the global navigation. Existing example IDs and
folder-based `category` values stay stable for old links and advanced filtering.

`tools/gallery-gen/src/classification.ts` statically reads source imports and rendering hints;
`tools/gallery-gen/src/manifest.ts` joins them with the registry into the version 2 manifest.
Use the metadata-only migration when editorial classification changes without a rendering change:

```sh
node tools/gallery-gen/src/migrate.ts
pnpm gallery:check
pnpm --filter @mk7s/holochart-docs audit:site
```

Regenerate thumbnails with `pnpm gallery -g <example-id>` when the chart's appearance changes.
Do not edit generated manifest classification by hand: validation compares it with the registry
and source hints. Keep new named patterns explicit when trace names do not capture their meaning
(for example strip plots, line modes, adjacency matrices, or graphs in 3D).

The original TypeScript variants are repository sandbox harnesses; thumbnail evidence does not
establish standalone snippet execution. `gen:sources` bundles each example with its local helpers,
data, and assets, leaving only declared public dependencies. The gallery's lazy source index
records compilation and exact bundle render verification separately. Changing a source or its
bundle invalidates its previous render proof. A compiled bundle is not automatically browser tested.

Seven canonical `examples/notebooks/*.py` files generate downloadable notebooks, Python sources,
and web snippets. Four exact gallery matches expose Python variants. Notebook verification records
source hashes, fresh-kernel execution, and actual notebook-host rendering separately. The gallery
only labels a Python variant verified when its canonical hash matches the browser evidence.
See [notebook host evidence](./wave2/notebooks/README.md) for the tested hosts and update/disposal checks.
Leave uncurated learning levels `unassessed` until reviewed.

```sh
python3 examples/notebooks/generate.py --check
node apps/docs/scripts/gen-quickstarts.ts --check
node tools/gallery-gen/src/export-sources.ts --check
```

For canonical source changes, regenerate the artifacts, rerun the relevant fresh-kernel and host
checks, and then refresh the metadata. Do not transfer a render claim to a different figure.

## Package availability

`apps/docs/.vitepress/release-state.ts` maintains npm and PyPI availability independently.
`InstallStatus.vue` reads it on the homepage, chooser, Python hub, and installation guides.
`sourceInstallState` separately records whether a public source checkout exists. The current
Python bridge requires a development checkout; a public source revision has not been verified.
Only set an artifact to `published` after it exists in its registry; only set `smokeTested` after
an isolated install and render check of that exact version. Keep source instructions available
as a fallback. Publishing packages is separate release work.

See [installation verification](./install-verification.md) for exact environment versions,
source availability checks, and the boundaries between kernel and browser verification.

## Validation and remaining work

Run page lint, docs typecheck, taxonomy tests, gallery consistency, and the foundation browser
checks after changing shared navigation or catalog behavior. The full production build verifies
generated reference links and base-path asset resolution.

After building, serve the production output and capture the seven current surfaces at the same
desktop, tablet, and mobile sizes. Pass the evidence directory explicitly. Historical `baseline/` and `foundation/` remain intact:

```sh
pnpm --filter @mk7s/holochart-docs preview --port 5339 --host 127.0.0.1
# In a second terminal, from the repository root:
node apps/docs/scripts/site-capture.mjs http://127.0.0.1:5339/holochart/ wave2
```

Capture checks the page title, visible image loading, page errors, and document overflow.
Use a production preview to avoid collecting development error overlays during concurrent edits.

```sh
pnpm --filter @mk7s/holochart-docs lint:pages
pnpm --filter @mk7s/holochart-docs typecheck
pnpm exec vitest run tools/gallery-gen/src tests/docs/release-state.test.ts
pnpm gallery:check
pnpm exec playwright test -c apps/docs/scripts/render-check/playwright.config.ts foundation.spec.ts wave2.spec.ts
pnpm --filter @mk7s/holochart-docs build
```

Wave 2 adds the homepage mosaic, both onboarding paths, seven downloadable notebooks, eleven
family routes, dedicated example pages, and verified language facets. The broader twelve-notebook
and twenty-four Python-example launch targets remain in Wave 3 of `backlog-site.md`. Human
first-use timings are still unmeasured; layout and execution checks do not replace that criterion.
