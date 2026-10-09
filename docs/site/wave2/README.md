# Wave 2 implementation evidence — 2026-10-09

The core experience is implemented on `codex`, in the working tree. Packages have not been
published and the site has not been deployed. The root `pnpm run docs` command starts the local
site at `http://127.0.0.1:5174/holochart/`.

## Content and verification scope

- Six static homepage previews and eleven metadata-driven family tiles, with adjacent Python
  and browser onboarding, a complete starter, practical recipes and selected demos.
- Eleven family routes, an SSR family directory, a separate inventory, and 786 addressable
  example pages. Cards link to full pages; Quick preview buttons open dialogs.
- Complete browser source exports for all 786 entries, including local helpers, data and
  assets. Nineteen exact copied bundles have browser render/cleanup proofs across eleven
  families; the other 767 are compiled, with browser verification still pending.
- Seven canonical Python sources generate 36 synchronized notebook/source/web artifacts.
  All seven pass fresh-kernel and real JupyterLab/Notebook rendering checks. Four exact gallery
  figures expose verified Python variants. See [notebook evidence](./notebooks/README.md).
- JavaScript and plain HTML quick starts were rendered from a fresh public-main checkout
  (`15251ef05d3453f4253e4c08d25a91596ca9ac3b`) with an empty dependency store: 410 packages
  downloaded, zero reused, fourteen package builds, zero cache hits. Updating the chart retained
  its canvas and changed pixels; cleanup removed it. No page exceptions occurred. The browser
  setup explicitly adds the public Holochart workspace package to the sandbox before use.

Public `main` does not yet contain the Python bridge or map/graph extensions. Their instructions
require a development checkout containing those sources. Registry publication, additional
notebook hosts, and the broader twelve-notebook/twenty-four-Python-example targets remain later work.

## Checks

Forty focused tooling/release tests pass. Page lint and docs TypeScript checks pass. Static quality
gates check 433 TypeScript snippets and 1,997 internal links with zero errors, dead links or unknown
anchors. Gallery consistency reports 786 entries and zero problems. Generated artifact checks pass.

Eight foundation browser tests and eight Wave 2 integration tests pass in development, with one
worker and retries disabled. All sixteen also pass under `/holochart/v1/`, including deep routes,
download URLs, facets, history, mobile navigation, source tabs, clipboard and preference fallback.

The production build passed in 478.43 seconds with an 8 GiB Node heap. All sixteen browser checks
pass against that output with one worker and retries disabled (1.8 minutes). The production-only
check also verifies meaningful family-directory HTML before client enhancement.

Twenty-one [viewport records](./viewports.json) and matched screenshots cover seven surfaces:

| Surface                | Desktop                                      | Tablet                                      | Mobile                                      |
| ---------------------- | -------------------------------------------- | ------------------------------------------- | ------------------------------------------- |
| Home                   | [Screenshot](./home-desktop.png)             | [Screenshot](./home-tablet.png)             | [Screenshot](./home-mobile.png)             |
| Family directory       | [Screenshot](./directory-desktop.png)        | [Screenshot](./directory-tablet.png)        | [Screenshot](./directory-mobile.png)        |
| Full inventory         | [Screenshot](./inventory-desktop.png)        | [Screenshot](./inventory-tablet.png)        | [Screenshot](./inventory-mobile.png)        |
| Statistical family     | [Screenshot](./family-desktop.png)           | [Screenshot](./family-tablet.png)           | [Screenshot](./family-mobile.png)           |
| Histogram detail       | [Screenshot](./detail-desktop.png)           | [Screenshot](./detail-tablet.png)           | [Screenshot](./detail-mobile.png)           |
| Python quick start     | [Screenshot](./python-start-desktop.png)     | [Screenshot](./python-start-tablet.png)     | [Screenshot](./python-start-mobile.png)     |
| JavaScript quick start | [Screenshot](./javascript-start-desktop.png) | [Screenshot](./javascript-start-tablet.png) | [Screenshot](./javascript-start-mobile.png) |

Both the directory and inventory show eight complete cards at 1440×900. Inventory reflows to
four/three/two/one columns at the tested widths. The homepage shows six complete static previews
and both starts in its first desktop viewport, with zero live canvases. All captures have zero
document overflow and uncaught page errors. Detail capture waits for the real chart canvas and
completed rendering, rather than recording a loading placeholder.

## Reproduce

```sh
pnpm run docs
pnpm --filter @mk7s/holochart-docs build
pnpm --filter @mk7s/holochart-docs preview --port 5339 --host 127.0.0.1
DOCS_PORT=5339 DOCS_RENDER_SERVER=preview pnpm exec playwright test -c apps/docs/scripts/render-check/playwright.config.ts foundation.spec.ts wave2.spec.ts --workers=1 --retries=0
node apps/docs/scripts/site-capture.mjs http://127.0.0.1:5339/holochart/ wave2
```

The capture script writes seven surfaces at desktop (1440×900), tablet (820×1180), and mobile
(390×844) widths. Historical `baseline/` and `foundation/` evidence remains intact. Software WebGL2
checks establish the tested Chromium/SwiftShader scope, not all browsers or hardware GPUs. Native
zoom, broad accessibility/performance profiling and human first-use timing remain later tickets.
