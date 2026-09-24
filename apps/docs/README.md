# Holochart docs site

Source of https://mk7s.dev/holochart (plan E19). VitePress 1.x, custom theme accents, dark mode,
local search. Every page is Markdown in this directory; the attribute reference and the API
reference are generated at build time.

## Run and build

From the repository root:

```sh
pnpm --filter @mk7s/holochart-docs dev        # http://localhost:5174/holochart/ (sandbox: 5173)
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

Run `pnpm run gen:reference` or `pnpm run gen:api` on their own when iterating on one of them.
`gen:api` accepts `--strict` to fail instead of writing placeholder pages when TypeDoc fails.

Workspace packages and examples resolve to their TypeScript sources (`source` export condition,
ADR-013), so no package build is needed first.

Environment variables:

| Variable                | Default                  | Purpose                                                                 |
| ----------------------- | ------------------------ | ----------------------------------------------------------------------- |
| `HOLOCHART_DOCS_BASE`   | `/holochart/`            | Site base. Use `/holochart/v1/` for a versioned build.                  |
| `HOLOCHART_SANDBOX_URL` | `http://localhost:5173/` | Target of "Open in sandbox" links. Set to an empty string to hide them. |

## Layout

```
.vitepress/
  config.ts                 site config, Cloudflare _headers, Vite settings
  sidebar.ts                nav and sidebars (titles come from page frontmatter)
  plugins/example-sources.ts  highlighted example sources for <Example>
  theme/                    theme: accents (custom.css), <Example>, status banner
getting-started/ fundamentals/ charts/ customization/ guides/ express/ extending/ reference/ ...
scripts/gen-api.ts          TypeDoc API reference
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
optional "3D-native options"), at least 5 example embeds with at least 4 in "Variations", and a
link to `/reference/<chart>`. Draft pages only get warnings.

## Examples

Embed any example from `examples/` by id (its path without `.ts`):

```md
<Example id="_dev/markers-symbols" />
<Example id="scatter/basic" :height="320" />
```

The component renders the example live in the browser only (never during SSR), starts it when it
scrolls into view, disposes it when the page unmounts, and has a TypeScript source tab (highlighted
at build time), a copy button, and an "Open in sandbox" link. Examples follow the contract in
`examples/_lib/types.ts`; new example files are picked up without registration. `lint:pages`
fails if a page embeds an id that doesn't exist.

To add an example, create `examples/<category>/<trace>/<slug>.ts` exporting `meta` and `run(el)`
(see CONTRIBUTING.md). The same file feeds the sandbox and the visual regression suite.

## Gallery

`/gallery/` (plan E19.5) shows a thumbnail of every example that is a visual test (examples
tagged `no-visual-test` or `perf` are left out), filterable by category, trace type, tag and
"3D-native", with a title search. Selecting a card opens the example live with its source and
links to the docs pages that embed it (each `<Example>` has the anchor `#example-<id>`, `/`
becoming `-`). The open example is in the URL hash (`/gallery/#scatter/basic`), the filters in
the query string.

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

**Thumbnails are committed, not generated at build time.** Rendering ~110 examples needs
Playwright's Chromium and takes minutes, which the docs build and the deploy job (plain
`ubuntu-latest`, no browsers) shouldn't pay on every run; the whole set is about 1 MB of WebP and
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
