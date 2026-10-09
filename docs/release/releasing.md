# Releasing

Plan E21.3. Releases are automated with [Changesets](https://changesets.dev) (`@changesets/cli`
v3) and [`.github/workflows/release.yml`](../../.github/workflows/release.yml). Nothing is published
from a laptop.

## Flow

1. **Contributors add changesets.** A PR that changes a published package runs `pnpm changeset`,
   picks the bump type, and commits the generated `.changeset/*.md` file (see CONTRIBUTING.md).
2. **Version PR.** On every push to `main` with pending changesets, the `version PR` job
   (`changesets/action@v2`, the line for Changesets v3) runs `pnpm version-packages`
   (`changeset version`) and opens or updates a PR titled `chore(release): version packages`, with
   ` (alpha)` appended in pre mode. The PR has the new versions and a `CHANGELOG.md` per package,
   and it consumes the changeset files. In pre mode they move to `.changeset/pre/`, which doesn't
   count as pending.
3. **Merge the version PR** when you want to release.
4. **Pack.** On that push there are no pending changesets, so the `pack` job builds the packages
   and runs `changeset pack`. It asks npm which versions are unpublished, packs them
   (`workspace:*` becomes the exact version) and picks each one's dist-tag. The job then runs
   `publint` and `arethetypeswrong` on those tarballs (`tests/package/lint.ts`, as the CI
   `package checks` job does), and its summary lists the publish plan. Unreleased `0.0.0`
   placeholders are dropped (`.github/scripts/publish-plan.ts`). If nothing is left, the run ends
   here.
5. **Approve.** The `publish to npm` job targets the `npm` environment and waits for a required
   reviewer. It fails immediately if it has no npm credentials: neither the `NPM_TOKEN` secret nor
   `NPM_TRUSTED_PUBLISHING=true`.
6. **Publish.** `changeset publish --from-pack-dir` publishes the exact tarballs from step 4,
   with npm provenance, under the plan's dist-tag (in pre mode, the pre tag, e.g. `alpha`). It
   creates git tags (`@mk7s/holochart-core@0.1.0-alpha.0`, …), and the job pushes them. The job
   then creates a GitHub release for `@mk7s/holochart@<version>` from that version's section of
   `packages/holochart/CHANGELOG.md`, marked as a prerelease for `-alpha` and similar versions.
7. **Afterwards.** The same push to `main` also runs the docs deploy (docs.yml). jsDelivr and unpkg
   serve the new version automatically, for example
   `https://cdn.jsdelivr.net/npm/@mk7s/holochart@<version>/dist/holochart.iife.min.js` and its 3D
   add-on, `…/dist/holochart-3d.iife.min.js`.

Local equivalents, for inspection only: `pnpm changeset status --verbose`, and `pnpm release:pack`,
which writes tarballs and `publish-plan.json` to `release-artifacts/` (delete it afterwards).
Never run `changeset version` or `changeset publish` on a working copy you intend to push: the
version PR does the first, and the workflow does the second.

## Why one fixed version

The published packages are one Changesets `fixed` group (`.changeset/config.json`), so any
release bumps all of them to the same version, even unchanged ones. We chose `fixed` over `linked`
(which aligns versions only among packages that are released) and over independent versions
because:

- The packages are one product split for tree-shaking: they depend on each other with
  `workspace:*`, the full bundle re-exports all of them, and the runtime's trace/component
  contracts are internal between them. Mismatched versions would be an unsupported combination
  anyway.
- Users, docs, the CDN URL, and bug reports refer to a single "Holochart 0.4.2".
- The three.js range and deprecation windows are stated per release, not per package.

The cost is version bumps without changes for some packages, which is cheap. Private workspace
packages (`apps/*`, `examples`, `tools/*`) are never versioned or tagged
(`privatePackages: false`). A new published package must be added to the `fixed` list, to
`tests/bundle/size/entries.ts`, and start at the group's current version.

A changeset that names only some packages bumps the whole group, but only the named packages get
its text in their `CHANGELOG.md`. The others get the version heading and an "Updated dependencies"
line. Name every package a change matters to.

## Maintainer setup (one-time)

The Release workflow is **skipped** until the repository variable `RELEASE_ENABLED` is `true`, so
pushes to `main` don't show a failing run in the meantime.

1. **npm.** Make sure the `mk7s` npm org owns the `@mk7s` scope and you are an owner of it.
2. **npm credentials.** Use one of these:
   - **Token** (needed for the first publish, see below): a **granular access token** with read
     and write access to the `@mk7s` scope (packages and org), allowed to bypass 2FA for
     publishing, with an expiry you'll track. Store it as the `npm` environment secret
     `NPM_TOKEN` (step 3).
   - **Trusted publishing** (OIDC, no long-lived token, recommended once the packages exist). On
     npmjs.com, for each of the 16 packages: Settings → Trusted publishing → GitHub Actions, with
     organization/user `holochart`, repository `holochart`, workflow `release.yml` and environment
     `npm`. Then set the repository variable `NPM_TRUSTED_PUBLISHING` = `true`. The workflow then
     writes no `.npmrc`, and pnpm exchanges the job's OIDC token (`id-token: write`) for a
     short-lived npm token. Delete the `NPM_TOKEN` secret and revoke the token. Finally, set each
     package's publishing access to "Require two-factor authentication and disallow tokens".
     npm's CLI-side requirements are npm ≥ 11.5.1 and Node ≥ 22.14. If pnpm's own exchange
     fails, the fallback is `setup` with Node 24.
3. **GitHub environment `npm`** (Settings → Environments → New environment):
   - Required reviewers: the maintainers who may approve a publish. Consider "Prevent
     self-review".
   - Deployment branches and tags: selected branches → `main` only.
   - Environment secret `NPM_TOKEN`, when you use a token. Keep it an environment secret (not a
     repository secret), so that it is only released after approval.
4. **Actions settings** (Settings → Actions → General → Workflow permissions): enable "Allow
   GitHub Actions to create and approve pull requests", or the version PR cannot be opened.
5. **Optional `RELEASE_PR_TOKEN` secret** (repository): a fine-grained PAT or GitHub App token with
   Contents and Pull requests write on this repo. PRs opened with the default `GITHUB_TOKEN` don't
   trigger CI, so without it you'll need to push an empty commit (or close and reopen the PR) to
   get checks on the version PR.
6. **Rulesets.** If tags or `main` are protected by rulesets, allow `github-actions[bot]` to create
   `@mk7s/*` tags and the `changeset-release/main` branch.
7. **Switch releases on:** Settings → Secrets and variables → Actions → Variables →
   `RELEASE_ENABLED` = `true`. Delete it (or set anything else) to pause releases.

## First release (0.1.0-alpha.0)

The repository is already in pre mode (`.changeset/pre.json`: `{ "mode": "pre", "tag": "alpha" }`)
with one squashed `minor` changeset for the 14 packages of the first alpha
(`.changeset/initial-release.md`); the geo and graph packages, the 15th and 16th, each have a
changeset of their own and are in the same fixed group. So `pnpm changeset status` shows every
package going `0.0.0 → 0.1.0-alpha.0`. In order:

**Owner, before anything reaches npm**

1. Run the trademark search for "Holochart" (plan.md, backlog decision 5). The npm names can't be
   reused once published.
2. Set up the `mk7s` npm org for the `@mk7s` scope and an npm token (setup steps 1–2). Trusted
   publishing can only be configured on packages that exist, so the first publish uses the token.
   Switch to trusted publishing right after it.
3. Create the `npm` GitHub environment with required reviewers and the `NPM_TOKEN` secret (step 3).
   Do Actions settings, the optional PR token and rulesets (steps 4–6).
4. Set `RELEASE_ENABLED=true` (step 7).

**Release**

5. Merge the branch that carries `pre.json` and `initial-release.md` into `main`. The workflow
   opens `chore(release): version packages (alpha)`.
6. Review the version PR. Every `packages/*/package.json` should be at `0.1.0-alpha.0`, and
   `.changeset/initial-release.md` should have moved to `.changeset/pre/`. Read
   `packages/holochart/CHANGELOG.md`, which becomes the GitHub release notes. Its
   `## 0.1.0-alpha.0` section should have the summary under "Minor Changes". Edit the CHANGELOG in
   the PR if needed, and make sure CI is green.
7. Merge it. The `pack` job's summary should list 16 packages at `0.1.0-alpha.0` with the tag
   `alpha`, and the tarball checks should pass.
8. Approve the `publish to npm` deployment.
9. Verify on npm. `npm view @mk7s/holochart dist-tags` should show `alpha: 0.1.0-alpha.0`. Each
   package page should show the provenance badge ("Built and signed on GitHub Actions"). A clean
   `npm i @mk7s/holochart@alpha three` should work. Check that the git tags and the GitHub
   prerelease exist. npm gives a package that has never been published a `latest` tag on its
   first publish, so `latest` will also point to `0.1.0-alpha.0`. See
   [Dist-tags in pre mode](#dist-tags-in-pre-mode).
10. Check that the CDN URLs work pinned to the exact version:
    `https://cdn.jsdelivr.net/npm/@mk7s/holochart@0.1.0-alpha.0/dist/holochart.iife.min.js` and
    `…/holochart-3d.iife.min.js`. A range like `@0.1` doesn't match prereleases, so it only
    resolves once `0.1.0` is out. The 3D add-on must come from the same version as the main
    script.
11. Update the docs to the published version:
    - The alpha warning on `getting-started/installation.md` and the CDN snippets there, in
      `fundamentals/locales.md` and in `charts/3d/index.md`. Pin them to `@0.1.0-alpha.0` while in
      alpha, and to `@0.1` after `0.1.0`.
    - The "pre-alpha" notes in `getting-started/first-chart.md` and the sidebar (`0.x (pre-alpha)`
      in `.vitepress/sidebar.ts`).
    - `changelog.md` (see [Docs changelog page](#docs-changelog-page)).
12. Switch to trusted publishing (setup step 2) and revoke the token.

**Later**

13. Further alphas: merge changesets as usual. Each version PR gives `0.1.0-alpha.1`,
    `-alpha.2`, …
14. Before the first stable release, leave pre mode (next section).

## Pre mode

`.changeset/pre.json` puts Changesets in pre mode. Versions become `<next>-<tag>.<n>`: the first
`minor` from `0.0.0` is `0.1.0-alpha.0`, and further changesets give `0.1.0-alpha.1`, and so on.
The fixed group keeps one counter. Changesets v3 keeps no `initialVersions` or consumed-changeset
list in `pre.json`. Instead, `changeset version` moves consumed changesets to `.changeset/pre/`.

- **Enter** (done for 0.1.0): `pnpm changeset pre enter alpha` in a PR, plus a changeset.
- **Exit** before the first stable release: run `pnpm changeset pre exit` in a PR (it sets
  `"mode": "exit"`). The next version PR then releases `0.1.0`, using every changeset in
  `.changeset/pre/` plus the pending ones as the `0.1.0` changelog. Prune or rewrite
  `.changeset/pre/` in that PR, so the stable notes say what changed since `0.0.0` and not every
  alpha step. After that version PR, `pre.json` and `.changeset/pre/` are gone. Use another tag
  later (`pnpm changeset pre enter beta`) for beta releases.

### Dist-tags in pre mode

`changeset pack` gives each release a dist-tag. The pre tag (`alpha`) applies to a package that
has never been published, or that has had a stable release. For a package whose published
versions are all prereleases of the current tag and which already has a `latest` tag, the
dist-tag is `latest`. Together with npm's rule that a new package's first version also becomes
`latest`:

- `0.1.0-alpha.0` is published with `--tag alpha`, and npm also points `latest` at it.
- `0.1.0-alpha.1` and later alphas are published to `latest`, which keeps `latest` on the newest
  alpha, not a stale one. `alpha` stays at `0.1.0-alpha.0` unless moved by hand.
- From the first stable release on, `latest` only points at stable versions, and prereleases go
  to their tag (the policy in [versioning.md](versioning.md#before-10)).

Tell users to install `@alpha` until `0.1.0`. To keep `alpha` current as well, run
`npm dist-tag add @mk7s/<pkg>@<version> alpha` for each package after a later alpha publishes.
Trusted publishing can also manage dist-tags, but the permission is opt-in.

## Provenance and trust

The publish job has `id-token: write` and sets `PNPM_CONFIG_PROVENANCE=true`, and every package
has `publishConfig.provenance: true`. So pnpm 11 attaches a Sigstore provenance attestation,
which requires the repository to be public. Trusted publishing adds provenance automatically.
Keep publishing with provenance: pnpm 11 refuses to install a version whose trust evidence is
weaker than earlier versions' (`TRUST_DOWNGRADE`), so one publish without it would break installs
for pnpm users.

## Docs changelog page

`apps/docs/changelog.md` is a stub until the first version. After the version PR, generate it from
`packages/holochart/CHANGELOG.md`. Every package but `traces-geo` and `traces-graph` carries the
same text, because the initial release names those 14. Keep the page's front matter and replace
the body with that file minus its `# @mk7s/holochart` heading. Strip the `- <hash>: ` prefix from
list items, and drop the "Updated dependencies" lists. Do this by hand per release, or with a
small script in the docs build if releases become frequent.

## When something goes wrong

- **Publish failed part-way:** fix the cause and re-run the `publish to npm` job. Versions already
  on npm fail with "cannot publish over". If that blocks the rest, re-run the whole workflow so
  `pack` recomputes the plan.
- **Bad release:** never unpublish. Publish a fixed version and deprecate the bad version of each
  package (`npm deprecate @mk7s/<pkg>@<bad> "<reason>"`). If needed, point the tag back at the last
  good version (`npm dist-tag add @mk7s/<pkg>@<good> <tag>`).
- **GitHub release missing:** the tags are pushed before it, so create it by hand from the tag.
