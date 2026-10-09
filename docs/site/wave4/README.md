# Wave 4 expansion verification

Implemented in the local `codex` working tree on 2026-10-09. The site has not been deployed and
no packages were published. Human launch review from Wave 3 remains pending.

## Cookbook and demos

The [cookbook](../../../apps/docs/cookbook/index.md) provides ten source-grounded recipes with
static thumbnail cards, a live finished chart per recipe, complete browser source, adaptation
choices and related families. Five have an exact verified Python counterpart. The directory
uses a small build-time payload rather than importing all 786 gallery entries or their sources.
Linked browser views implement matched zoom/pan in one figure; interval bands explicitly use
synthetic forecast bounds, with no fitted confidence-model claim.

[source-checks.json](./source-checks.json) records ten copied-source rendering/cleanup proofs with
exact bundle identities: five retained proofs and five newly exercised exports. The current full
ledger has 58 rendered bundles and 728 compiled-only exports. This does not claim copied-bundle
rendering for all 786 entries.

The [demo directory](../../../apps/docs/demos/index.md) preserves eleven destinations: ten
reports with bundled or seeded data and a separate on-request live weather application. Static
cards identify domains, chart families, provenance, data-note links and reusable non-demo
starters. The live application uses a labelled technique preview rather than a cached forecast.
This wave changed the directory; it did not change the underlying reports or test live providers.

## Discovery and notebook environments

[discovery.md](./discovery.md) records an editorial replay of 33 existing analytical tasks:
32 empty searches before, zero after, with every intended starter first globally and in its
family. Verified Python and family filters still apply. This is task-vocabulary regression
coverage, not observed visitor behavior or a measured human completion-time improvement.

[environments.md](./environments.md) records independent VS Code, Colab and Binder evaluation.
Local JupyterLab/Notebook verification remains the durable fallback: fourteen learning notebooks
and 24 exact gallery variants, 76 source-matched host checks. VS Code's bounded attempt did not
reach an observable notebook frontend; Colab/Binder have no actual hosted run. No remote startup
durations, supported-host badges or hosted launchers are claimed. Those require public immutable
install/notebook inputs and repeated actual-host rendering.

Advanced chooser, comparison, collection, editor and density options have a documented evaluation.
Further prototypes and Python expansion remain tied to observed needs. No analytics system,
account service or new library/trace capability was added.

## Local validation

- Thirty focused unit checks pass: five cookbook source-contract checks, four demo catalog checks,
  six gallery-state checks and fifteen existing notebook-content/SEO/page-discovery checks.
- Page lint: 177 handwritten pages, 47 chart guides, zero warnings or errors.
- Quality: 433 TypeScript snippets checked, seven intentional opt-outs, 2,117 internal links,
  zero dead links. The pre-existing report-only spelling issue for `constructor` remains harmless.
- Docs and root tooling/test/generator typechecks pass.
- Distributed-source checks match all 120 notebook/source/web artifacts and both real host reports;
  the 33-task discovery gate is included in `check:site`.

The final production build passes without disabling dead-link checks. Route continuity retains
all 4,746 existing HTML destinations and 374 chart anchors. All 58 browser checks have passing
results: the initial run passed 57, and a focused recheck passed the navigation test after it
was corrected to wait for gallery hydration before interacting with server-rendered links.
No site code or production artifact changed for that test correction. Both runs used one worker
and zero retries. This includes chart/source/download checks for all ten recipes, desktop/mobile
accessibility checks, language boundaries, keyboard interactions, lifecycle cleanup, fallback and
no-JavaScript navigation.

[viewports.json](./viewports.json) records 24 production captures across eight surfaces at
1440×900, 820×1180 and 390×844. All have zero document overflow, page exceptions or failed same-origin
assets. The gallery directory and inventory retain eight complete cards in the desktop viewport;
the cookbook and demos use four desktop columns. Cookbook and demo captures were visually reviewed
at desktop and mobile sizes.

[integration-checks.json](./integration-checks.json) ties these checks to the final production
HTML identity. [performance.json](./performance.json) records thirty cold mobile samples across
six catalog routes and sixty desktop search updates. Cookbook p75 LCP is 1,516 ms, demos 1,384 ms
and desktop filter p95 35 ms; all catalog samples have zero WebGL contexts and CLS below 0.001.
Five of six routes meet the 2,500 ms LCP target. The gallery directory misses it at 3,592 ms;
a single five-sample focused repeat also misses at 4,012 ms. Both failed reports are retained.
See [performance-review.md](./performance-review.md) for byte comparisons, host-load limitations
and the open launch gate. These results do not claim all performance budgets passed.

Remote CI is configured to generate and browser-smoke cookbook exports plus the choropleth
language-filter fixture before building; it is not claimed executed in this session.

## Repeat locally

```sh
pnpm --filter @mk7s/holochart-docs build
pnpm --filter @mk7s/holochart-docs check:site
DOCS_RENDER_SERVER=preview DOCS_PORT=5339 pnpm exec playwright test \
  -c apps/docs/scripts/render-check/playwright.config.ts \
  foundation.spec.ts wave2.spec.ts wave3.spec.ts wave3-content.spec.ts wave4.spec.ts \
  --workers=1 --retries=0
node apps/docs/scripts/site-capture.mjs http://127.0.0.1:5339/holochart/ wave4
SITE_BASE_URL=http://127.0.0.1:5339/holochart/ \
SITE_REPORT_PATH=docs/site/wave4/performance.json SITE_SAMPLES=5 \
SITE_ROUTES=',gallery/,gallery/all/,gallery/basic/,cookbook/,demos/' \
node docs/site/wave3/measure.mjs
```

Restart the production preview after a rebuild; its startup manifest must match the new files.
The performance script uses the documented mobile profile and an isolated normal headless
software compositor for desktop filtering. See [the measurement method](../wave3/README.md).
