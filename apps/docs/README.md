# Holochart docs site

Source of https://mk7s.dev/holochart (plan E19). VitePress 1.x, custom theme accents, dark mode,
local search. Every page is Markdown in this directory; the attribute reference and the API
reference are generated at build time.

## Run and build

From the repository root:

```sh
pnpm run docs                                  # http://127.0.0.1:5174/holochart/ (sandbox: 5173)
pnpm --filter @mk7s/holochart-docs build      # static site in apps/docs/.vitepress/dist
pnpm --filter @mk7s/holochart-docs preview    # serve the built site
pnpm --filter @mk7s/holochart-docs lint:pages # page lint (CI)
pnpm --filter @mk7s/holochart-docs typecheck
```

`dev` and `build` first run `pnpm run gen`, which regenerates:

| Output (gitignored)                  | Generator                                              | Served at                 |
| ------------------------------------ | ------------------------------------------------------ | ------------------------- |
| `reference/attributes/*.md`          | `tools/schema-gen/src/docs` (schema-gen `docs` script) | `/reference/<trace>` etc. |
| `reference/attributes/manifest.json` | same; read by `.vitepress/sidebar.ts`                  | (sidebar only)            |
| `public/plot-schema.json`            | same                                                   | `/plot-schema.json`       |
| `reference/api/**`                   | `scripts/gen-api.ts` (TypeDoc + markdown plugin)       | `/reference/api/`         |
| `.vitepress/generated/changelog.md`  | `scripts/gen-changelog.ts`                             | included by `/changelog`  |

`gen:notebooks` builds `.ipynb` downloads, Python sources and included web snippets from the
canonical `examples/notebooks/*.py` sources. `gen:quickstarts` creates the plain HTML download
from its canonical browser starter. `gen:sources` exports complete browser modules for gallery
detail pages, including local helpers/data/assets; generated modules remain ignored in Git.
Compilation and actual copied-module browser rendering are separate verification states.

`check:discovery` replays the 33 reviewed beginner task descriptions against gallery search and
verified Python filtering. `check:site` includes this gate. These are editorial regression checks;
observed user-task results are recorded separately in the launch checklist. The cookbook uses
canonical examples and their complete source exports; the demo directory keeps deterministic
reports separate from the live weather application and links reusable standalone techniques.

Run individual generators while iterating. `gen:notebooks`, `gen:quickstarts` and `gen:sources`
accept `--check` to detect stale artifacts without rewriting them. `gen:reference` and `gen:api`
can also run independently.
`gen:api` accepts `--strict` to fail instead of writing placeholder pages when TypeDoc fails.

`gen` also runs `gen:compat` (`scripts/gen-plotly-compat.ts`), which rewrites the coverage tables
of `reference/plotly-compat.md` between its `generated:plotly-compat` markers. That page is
checked in: commit the change when the tables move, and don't edit between the markers.
`gen:compat` needs `public/plot-schema.json`, so run `gen:reference` first; `--check` exits with
1 instead of writing. plotly.js' schema comes from the reduced copy in `scripts/plotly-compat/`
(see `reduce-plotly-schema.ts` there to refresh it).

`gen:galleries` (`scripts/gen-galleries.ts`) works the same way for `reference/colorscales.md`,
`reference/marker-symbols.md` and the projection tables of `fundamentals/maps.md`: it rewrites
the regions between their `generated:…` markers from the color registries of
`@mk7s/holochart-core`, the symbol table of `@mk7s/holochart-render` and the projection tables of
`@mk7s/holochart-traces-geo` (`src/geo/constants.ts`), the pages are checked in, and `--check`
exits with 1 when one is out of date.

`gen:changelog` lists the pending changesets (`.changeset/*.md`) as "Unreleased" and merges the
`CHANGELOG.md` files that `changeset version` writes into the packages, one entry per change and
version. Its output is not checked in: `changelog.md` holds the introduction and pulls the
generated list in with `<!--@include: …-->`, so a new changeset never leaves the page stale in
git. The pure parts are tested in `tests/docs/gen-changelog.test.ts`.

The API reference covers every published package (`PACKAGES` in `gen-api.ts`); add a new
package there.

Workspace packages and examples resolve to their TypeScript sources (`source` export condition,
ADR-013), so no package build is needed first.

Environment variables:

| Variable                | Default                                         | Purpose                                                                                                                        |
| ----------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `HOLOCHART_DOCS_BASE`   | `/holochart/`                                   | Site base. Use `/holochart/v1/` for a versioned build.                                                                         |
| `HOLOCHART_SANDBOX_URL` | `dev`: `http://localhost:5173/`; `build`: empty | Target of "Open in sandbox" links on examples. Empty hides them, which is the default for builds: the sandbox is not deployed. |

## Layout

```
.vitepress/
  config.ts                 site config, Cloudflare _headers, Vite settings
  sidebar.ts                nav and sidebars (titles come from page frontmatter)
  plugins/sidebar-accessibility.ts  semantic sidebar controls
  theme/components/ExampleSource.vue  lazy complete source and language variants
  theme/                    theme: accents (custom.css), <Example>, status banner
getting-started/ fundamentals/ charts/ customization/ guides/ express/ extending/ reference/ ...
scripts/gen-api.ts          TypeDoc API reference
scripts/gen-changelog.ts    changelog body from changesets
scripts/gen-galleries.ts    colorscale and marker symbol tables
scripts/lint-pages.ts       page lint
public/                     static files (logo)
```

## Adding a page

1. Create `<section>/<page>.md` with frontmatter:

   ```yaml
   ---
   title: Page title
   description: One sentence.
   status: stub | draft | complete
   milestone: M2 # stubs only: the milestone in which real content lands
   ---
   ```

   `status: stub` and `status: draft` pages get a banner automatically.

2. Add the page to its section in `.vitepress/sidebar.ts`.
3. Link pages with absolute site paths without extension or base: `[Core concepts](/getting-started/core-concepts)`.
   The base (`/holochart/`) is added at build time; never hardcode it.
4. VitePress compiles Markdown as Vue templates: keep `{{` and raw `<Tag>` text inside code.
   Dead links fail the build.

## Chart pages

Copy `charts/_template.md` to `charts/<family>/<chart>.md` and keep its H2 sections in order. Set
`chart:` to the trace type the page documents (a line chart uses `scatter`). When the page is
finished, set `status: complete`: from then on `lint:pages` requires every section (except the
optional "3D-native options"), one live minimal example, at least four linked variations,
and a link to `/reference/<chart>`. Launch-featured guides require five substantive non-minimal
variations. Use `<ChartOverview />`, `<ChartVariations />` and `<ExampleLink id="…" />`; retain
existing example anchors and useful detailed sections. Draft pages only get warnings.

## Examples

Embed any example from `examples/` by id (its path without `.ts`):

```md
<Example id="line/basic" />
<Example id="scatter/basic" :height="320" />
```

The component renders the example live in the browser only (never during SSR), starts it when it
scrolls into view, and disposes it when the page unmounts. Its Complete source panel lazily loads
the standalone browser module and any real Python variant, with copy and download controls.
The old private-harness source inventory is not loaded by the runtime. An "Open in sandbox"
link appears only when a sandbox URL is configured. Examples follow the contract in
`examples/_lib/types.ts`; new example files are picked up without registration. `lint:pages`
fails if a page embeds an id that doesn't exist, or an internal example: `examples/_dev/` and
`examples/_spikes/` hold fixtures for the test suites and measurements, not examples for readers.

To add an example, create `examples/<category>/<slug>.ts` exporting `meta` and `run(el)`
(see CONTRIBUTING.md). The same file feeds the sandbox and the visual regression suite.

## Gallery

`/gallery/` starts with curated sections for eleven chart families; `/gallery/all` shows every
public example that is a visual test
(examples tagged `no-visual-test` or `perf` are left out, and so are the internal ones, whose id
starts with `_`: `_dev/…`, `_spikes/…`). Family pages and the full inventory have alias search,
subtype, verified language, difficulty and feature filters. Selecting a card opens its stable
`/gallery/example/<id>` detail route with complete source and documentation links. Quick preview
opens an inline dialog; its ID stays in the hash and filters stay in the query string. Legacy
`/gallery/#scatter/basic` links still open the preview. `<Example>` and default `<ExampleLink>`
retain the anchor `#example-<id>`, with `/` becoming `-`.

Thumbnails come from `tools/gallery-gen`, which runs the visual suite's pipeline (the same
Playwright config, Chromium + SwiftShader flags, sandbox test mode and screenshot helpers in
`tests/visual/harness.ts`) and, instead of comparing, re-encodes each screenshot as WebP in the
page (`canvas.toBlob`, no image dependency), in the default `holochart` look:

| Output (committed)                | Content                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| `public/gallery/thumbs/<id>.webp` | ≤ 640 px wide, quality 0.8, about 10 KB each                                                      |
| `public/gallery/manifest.json`    | id, title, description, tags, category, rendered trace types, size, `threeD`, thumbnail path/size |

The page (`gallery/index.md` → `.vitepress/theme/components/Gallery.vue`) reads the manifest
through a build-time data loader (`.vitepress/theme/data/gallery.data.ts`) that also finds the
pages embedding each example. Without a manifest the page shows an empty state.

```sh
pnpm gallery                  # render every example (a few minutes; 4 workers, SwiftShader)
pnpm gallery -g "bar/"        # re-render a subset; other entries are kept, deleted examples dropped
pnpm gallery:check            # no browser: manifest and thumbnails match examples/ (CI)
```

**Thumbnails are committed, not generated at build time.** Rendering several hundred examples needs
Playwright's Chromium and takes minutes, which the docs build and the deploy job (plain
`ubuntu-latest`, no browsers) shouldn't pay on every run; the whole set is about 7 MB of WebP and
only changes when an example's look does. `pnpm gallery:check` runs in the CI docs job and fails
when an example is added, removed or re-tagged, or its literal title, description, tags or size
changed, without regenerating the gallery. It can't see pure rendering changes: when you update an
example's visual baseline (`pnpm test:visual:update -g <id>`), also run `pnpm gallery -g <id>`.

## Attribute reference

Generated from the attribute schema: one page per registered trace type, plus layout and config.
Every attribute has a deep-link anchor equal to its path, e.g.
`/reference/layout#xaxis.range` or `/reference/scatter#marker.line.width`. Trace modules are
discovered by shape from `packages/traces-*` and `packages/components`, so a new trace appears once
its package exports the module. Trace types that have a chart page but no module yet get a
placeholder page. To change what the reference says, change the schema (descriptions,
`plotlyPath`, `animatable`, ...), not the generated Markdown.

## Quality gates

`scripts/quality.ts` (plan E19.10) measures docs completeness. It is static and offline: nothing
is fetched and no example is executed, and it runs in a few seconds.

```sh
pnpm --filter @mk7s/holochart-docs quality                    # report; exits 1 if a hard gate fails
pnpm --filter @mk7s/holochart-docs quality --json report.json # also write the numbers as JSON
```

With `GITHUB_STEP_SUMMARY` set (GitHub Actions), a short Markdown summary is appended to it.

| Gate                          | Kind        | What it checks                                                                                                                                                                                    |
| ----------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Attribute descriptions        | hard, 100%  | Every attribute of layout, config and every discovered trace, leaves (`valType`) and containers (`role: object` / `items`) alike, has a non-empty `description`. Missing ones are listed by path. |
| Attributes used in examples   | report only | Share of leaf attributes that some example under `examples/` sets (target ≥ 70%), overall, per namespace, and the least covered groups (`bar.error_x`, …).                                        |
| Trace types with ≥ 5 examples | hard        | Every **released** trace type has at least 5 examples. Draft chart pages' types are only reported.                                                                                                |
| Snippet type-check            | hard        | Every ` ```ts ` / ` ```typescript ` block of the hand-written pages compiles.                                                                                                                     |
| Internal links                | hard        | Markdown links to site paths (`/fundamentals/traces#…`, `./page`) resolve to a page. Anchors and external links (counted per host, never fetched) are report only.                                |
| Spelling                      | report only | A list of common misspellings (`teh`, `recieve`, `seperate`, …) and doubled words (`the the`) in prose. Full dictionary spell checking is deferred: there is no English word list in CI.          |

Details:

- **Released** means the trace type is named by `chart:` in the frontmatter of a chart page
  (`charts/**`, not `index.md` or `_*.md`) with `status: complete`. Examples are counted per trace
  type from `type: '<name>'` in their source; a trace without `type` counts as `scatter`, Plotly's
  default.
- **Attribute usage** parses each example with the TypeScript compiler API and collects the keys
  of its object literals (`marker.line.width`, `'xaxis.range'`). Arrays are transparent, numbered
  ids (`xaxis2`, `scene3`) count as their base name, and literals are attributed to a trace type,
  `layout` or `config` when the scan can tell. It is an estimate, not a runtime trace.
- **Snippets** are written as one module each to `node_modules/.cache/docs-gates/` with a
  generated `tsconfig.json` extending `tsconfig.base.json`, so imports resolve like in the docs
  app (every workspace package resolves to its sources). A snippet may use these names without
  declaring them, as the conventional context of the docs: `el` (the container), `chart` (a
  `Chart`), `figure`, `data`, `layout` and `createChart`. Anything else it uses (sample data, other
  imports, types) must be in the snippet. When a snippet is deliberately not compilable (a summary
  of an interface, an API that doesn't exist yet), put this comment on the line before its fence;
  it doesn't render:

  ```md
  <!-- docs-gates: no-typecheck (reason) -->
  ```

  Prefer fixing the snippet over opting out; the report lists every opted-out block.

- **Links:** dead internal links already fail `vitepress build` (the config has no
  `ignoreDeadLinks`); this gate catches them without a build. Links to generated pages
  (`/reference/<trace>` from `reference/attributes/`, `/reference/api/`, `/plot-schema.json`) are
  only checked when the generated files exist (run `pnpm run gen` first); otherwise they are
  skipped with a note.
- **Spelling exceptions** go in `scripts/quality/dictionary.txt`: one word from the misspellings
  list or one intentional doubled-word phrase (`that that`) per line.

## Deployment

The site is static. `pnpm --filter @mk7s/holochart-docs build` writes it to
**`apps/docs/.vitepress/dist`**, built for the base `/holochart/`.

Hosting: a dedicated Cloudflare Pages project, proxied path-preserving from
`https://mk7s.dev/holochart/*`. The deploy step:

1. Places the contents of `.vitepress/dist` under a `holochart/` folder of the upload directory.
2. Moves `holochart/_headers` to the root of the upload directory (Cloudflare Pages only reads
   `_headers` at the root). Its rules are already prefixed with the base: hashed files under
   `/holochart/assets/` are cached for a year as immutable; HTML and everything else revalidates.
3. Optionally copies `holochart/404.html` to the root as well, so unknown paths get the docs 404
   page instead of Pages' default.

Clean URLs (`/holochart/reference/layout`) work as-is on Pages, which serves `layout.html` for
them.

### Versioning plan

Until 1.0 there is one build at `/holochart/`, tracking `main`. From 1.0, each major version is
also built with `HOLOCHART_DOCS_BASE=/holochart/v1/` (`v2/`, ...) into its own folder of the
upload, and `/holochart/` stays the latest release. The nav's version menu (in
`.vitepress/sidebar.ts`) then links the published versions.
PR previews can build with `HOLOCHART_DOCS_BASE=/` on a preview host.

## Redesign content and release gates

Run `pnpm --filter @mk7s/holochart-docs check:site` after generation. It checks notebook downloads,
exact Python identities, public browser source drift and both real-host proof reports. Gallery
checks reject unknown taxonomy IDs, undeclared dependencies and missing featured coverage.
Focused production browser tests check category routes, facets/history, legacy links, source
copy/downloads, language fallback, keyboard navigation, static fallbacks and preview disposal.
CI executes the notebook collection in fresh kernels and through actual widget managers;
new CI workflow steps still need their first remote run after these changes are committed.

Every gallery source exports complete public imports, fixture data and cleanup. Generated tiny
`public/gallery/artifacts/<id>.json` records let an inline source tab load only its own metadata
and chosen source. `gen:sources` validates compilation; `node tools/gallery-gen/src/smoke-sources.ts
<id> …` from the repository root verifies exact copied modules with a real browser. These are
separate claims. Inline code keeps the same language preference as example detail pages.

Add a Python gallery variant by following `examples/notebooks/README.md`: capture the exact
browser figure and helper hashes, create the canonical literal source, generate its standalone
single-figure download, and verify execution plus both supported notebook hosts. Shared deterministic
data is checked for exact figure identity; browser thumbnails alone never prove Python support.

Release roles, human first-use tasks, retained routes and rollback are recorded in
`docs/site/wave3/launch-checklist.md`. Do not mark deployment, screen-reader review or observed
user timings complete based solely on automated preview tests.
