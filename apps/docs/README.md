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

## Attribute reference

Generated from the attribute schema: one page per registered trace type, plus layout and config.
Every attribute has a deep-link anchor equal to its path, e.g.
`/reference/layout#xaxis.range` or `/reference/scatter#marker.line.width`. Trace modules are
discovered by shape from `packages/traces-*` and `packages/components`, so a new trace appears once
its package exports the module. Trace types that have a chart page but no module yet get a
placeholder page. To change what the reference says, change the schema (descriptions,
`plotlyPath`, `animatable`, ...), not the generated Markdown.

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
