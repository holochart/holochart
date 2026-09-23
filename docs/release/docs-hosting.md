# Docs hosting

The docs site (`apps/docs`, VitePress, `base: '/holochart/'`) is served at
**https://mk7s.dev/holochart/** as part of the **mk7s** Cloudflare Pages project.

## How it's published (current)

The docs are built in this repo and copied into the mk7s site, which deploys everything in one go:

```bash
pnpm docs:publish            # build docs → ../mk7s/public/holochart (no deploy)
pnpm docs:publish --deploy   # ...then build mk7s and deploy it to production
pnpm docs:publish --deploy --branch preview   # preview deployment instead
```

[`scripts/publish-docs-mk7s.mjs`](../../scripts/publish-docs-mk7s.mjs):

1. Builds `@mk7s/holochart-docs` (regenerating the schema reference and API pages).
2. Replaces `<mk7s>/public/holochart/` with the build. Vite copies `public/` into `dist/` verbatim.
3. Merges the docs' `_headers` rules (already scoped to `/holochart/*`) into
   `<mk7s>/public/_headers` between `# BEGIN holochart` / `# END holochart` markers. Pages only
   reads the root `_headers`.
4. Adds `/holochart /holochart/ 308` to `<mk7s>/public/_redirects`.
5. With `--deploy`: `npm run build` in mk7s, then `npx wrangler pages deploy dist --project-name mk7s`
   from the mk7s folder (so its `functions/` deploy too). Needs `npx wrangler login` once.

The mk7s `vite.config.js` mirrors Pages routing for `/holochart` in its dev and preview servers
(`/holochart` → `/holochart/`, directories → `index.html`, clean URLs → `.html`). `--mk7s <dir>`
points the script at a different checkout (default `../mk7s`).

First published 2026-09-23 (deployment `8354fd9c`, production).

## Alternative (not in use): separate Pages project behind a proxy

Kept in case the docs should deploy from CI independently of the mk7s site: a separate Pages
project, with mk7s.dev forwarding `/holochart/*` to it with the path unchanged.

```
browser ── https://mk7s.dev/holochart/guide/ ──► proxy on mk7s.dev (Worker route or Pages Function)
                                                   │ same path
                                                   ▼
                          https://holochart-docs.pages.dev/holochart/guide/   (Pages project)
```

### What CI would do

[`.github/workflows/docs.yml`](../../.github/workflows/docs.yml) runs on every push to `main` (and
manually), in the `docs` environment:

1. Skips the deploy with a notice unless `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set.
2. Builds the packages and `pnpm --filter @mk7s/holochart-docs build`.
3. Stages `apps/docs/.vitepress/dist` as `holochart/` inside the deploy folder, so
   `holochart-docs.pages.dev/holochart/…` has exactly the final URLs. It also writes a `_redirects`
   file (`/` → `/holochart/`) and a `_headers` rule that marks the `*.pages.dev` mirror `noindex`
   (the proxy strips that header on mk7s.dev).
4. Deploys with `cloudflare/wrangler-action` (`wrangler pages deploy … --branch=main`) to the
   Pages project `holochart-docs` (override with the repository variable
   `CLOUDFLARE_PAGES_PROJECT`).

The CI `docs build` job (ci.yml) builds the site on every PR without deploying.

The proxy is **not** deployed by CI; it changes the mk7s.dev zone, so a maintainer deploys it once.

## Proxy code

[`deploy/cloudflare/`](../../deploy/cloudflare/):

| File                              | Purpose                                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `proxy.js`                        | Shared logic: forwards `/holochart/*`, redirects `/holochart` → `/holochart/`, keeps redirects on mk7s.dev, strips `X-Robots-Tag`, 404s everything else |
| `worker.js` + `wrangler.toml`     | Option A: a Worker on the route `mk7s.dev/holochart*`                                                                                                   |
| `functions/holochart/[[path]].js` | Option B: a Pages Function inside the mk7s.dev Pages project                                                                                            |

Both read an optional `DOCS_ORIGIN` variable (default `https://holochart-docs.pages.dev`), which
also lets you point mk7s.dev at a preview deployment.

- **Option A (Worker route)** keeps the mk7s.dev project untouched and can be deployed from this
  repo. Worker routes on a proxied zone run in front of the Pages custom domain; verify with the
  checks below after deploying.
- **Option B (Pages Function)** keeps everything inside the mk7s.dev project (no zone-level
  route), but lives in that project's repository and deploys with it. Functions count against the
  Pages Functions request quota; static mk7s.dev pages are unaffected.

Use one, not both.

## Maintainer setup

1. **Cloudflare account id:** dashboard → Workers & Pages → the account id in the right sidebar
   (or `npx wrangler whoami`).
2. **Pages project:** create a Direct Upload project named `holochart-docs` with production branch
   `main`: dashboard → Workers & Pages → Create → Pages → Upload assets (upload any placeholder),
   or `npx wrangler pages project create holochart-docs --production-branch=main`.
3. **API token for CI:** My Profile → API Tokens → Create custom token with
   **Account → Cloudflare Pages → Edit** on this account only. Nothing else (no zone permissions).
4. **GitHub environment `docs`** (Settings → Environments): deployment branches `main` only; add
   environment secrets `CLOUDFLARE_API_TOKEN` (step 3) and `CLOUDFLARE_ACCOUNT_ID` (step 1).
   Optional repository variable `CLOUDFLARE_PAGES_PROJECT` if the project isn't `holochart-docs`.
   Re-run the `Docs` workflow (Actions → Docs → Run workflow) and check
   `https://holochart-docs.pages.dev/holochart/`.
5. **Proxy, option A (Worker):** with an account that can edit Workers and Workers Routes on the
   mk7s.dev zone (a separate, local token or `wrangler login`; not the CI token):
   ```sh
   cd deploy/cloudflare
   npx wrangler deploy        # creates holochart-docs-proxy and the mk7s.dev/holochart* route
   ```
   The `mk7s.dev` DNS record must be proxied (orange cloud), which it is for a Pages custom domain.
6. **Proxy, option B (Pages Function):** in the mk7s.dev project, copy
   `deploy/cloudflare/functions/holochart/[[path]].js` to `functions/holochart/[[path]].js` and
   `deploy/cloudflare/proxy.js` to `proxy.js` at the project root (next to `functions/`), then
   deploy mk7s.dev as usual. Make sure mk7s.dev has no `holochart/` static folder or `_redirects`
   rule that would shadow the function.
7. **Verify:**
   ```sh
   curl -sI https://mk7s.dev/holochart | grep -i location          # → https://mk7s.dev/holochart/
   curl -sI https://mk7s.dev/holochart/ | grep -iE '^(HTTP|x-robots)'  # 200, no X-Robots-Tag
   curl -sI https://holochart-docs.pages.dev/holochart/ | grep -i x-robots  # noindex
   ```
   Then click through a few pages and check that assets load from `/holochart/assets/…`.

## Notes

- The docs site should set its canonical host to mk7s.dev (for example VitePress
  `sitemap.hostname: 'https://mk7s.dev/holochart/'`), so search engines index mk7s.dev only.
- Rollback: Cloudflare dashboard → the `holochart-docs` project → Deployments → pick a previous
  deployment → Rollback. The proxy needs no change.
- `wrangler-action` installs wrangler with npm at deploy time (outside the pnpm workspace, so
  pnpm's `minimumReleaseAge` does not apply to it). Pin `wranglerVersion` in docs.yml if you want
  a fixed version.
