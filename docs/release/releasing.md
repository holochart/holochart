# Releasing

Plan E21.3. Releases are automated with [Changesets](https://changesets.dev) (`@changesets/cli`
v3) and [`.github/workflows/release.yml`](../../.github/workflows/release.yml). Nothing is published
from a laptop.

## Flow

1. **Contributors add changesets.** A PR that changes a published package runs `pnpm changeset`,
   picks the bump type, and commits the generated `.changeset/*.md` file (see CONTRIBUTING.md).
2. **Version PR.** On every push to `main` with pending changesets, the `version PR` job
   (`changesets/action`) runs `pnpm version-packages` (`changeset version`) and opens or updates a
   PR titled `chore(release): version packages`: new versions, `CHANGELOG.md` per package, changeset
   files consumed.
3. **Merge the version PR** when you want to release.
4. **Pack.** On that push there are no pending changesets, so the `pack` job builds the packages
   and runs `changeset pack`, which asks npm which versions are unpublished and packs them
   (`workspace:*` becomes the real version). The job summary lists the publish plan. Unreleased
   `0.0.0` placeholders are dropped (`.github/scripts/publish-plan.ts`); if nothing is left, the
   run ends here.
5. **Approve.** The `publish to npm` job targets the `npm` environment and waits for a required
   reviewer. It fails immediately if the `NPM_TOKEN` secret is missing.
6. **Publish.** `changeset publish --from-pack-dir` publishes the exact tarballs from step 4 with
   npm provenance, creates git tags (`@mk7s/holochart-core@0.1.0`, …), the job pushes them, and
   creates a GitHub release for `@mk7s/holochart@<version>` with that version's changelog section
   (marked prerelease for `-alpha` etc.).
7. **Afterwards.** The same push to `main` also runs the docs deploy (docs.yml), so the docs match
   the release; the docs site should read its displayed version from
   `packages/holochart/package.json` (docs workstream, E19). Versioned docs per major are a later
   E19 item. jsDelivr and unpkg serve the new version automatically, e.g.
   `https://cdn.jsdelivr.net/npm/@mk7s/holochart@<version>/dist/holochart.iife.min.js`.

Local equivalents (for inspection only): `pnpm changeset status`, `pnpm release:pack` (writes
tarballs to `release-artifacts/`; delete it afterwards).

## Why one fixed version

All seven published packages are one Changesets `fixed` group (`.changeset/config.json`), so any
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

## Maintainer setup (one-time)

None of this exists yet. The Release workflow is **skipped** until the repository variable
`RELEASE_ENABLED` is `true` (step 0), so pushes to `main` don't show a failing run in the meantime.

0. **Switch releases on** once steps 1–5 are done: Settings → Secrets and variables → Actions →
   Variables → `RELEASE_ENABLED` = `true`. Delete it (or set anything else) to pause releases.

1. **npm.** Make sure the `mk7s` org owns the `@mk7s` scope and you are an owner. Create a
   **granular access token** with read and write access to the `@mk7s` scope (packages and org),
   allowed to bypass 2FA for publishing, with an expiry you'll track.
2. **GitHub environment `npm`** (Settings → Environments → New environment):
   - Required reviewers: the maintainers who may approve a publish. Consider "Prevent
     self-review".
   - Deployment branches and tags: selected branches → `main` only.
   - Environment secret `NPM_TOKEN` = the token from step 1. Keep it an environment secret (not a
     repository secret) so it is only released after approval.
3. **Actions settings** (Settings → Actions → General → Workflow permissions): enable "Allow
   GitHub Actions to create and approve pull requests", or the version PR cannot be opened.
4. **Optional `RELEASE_PR_TOKEN` secret** (repository): a fine-grained PAT or GitHub App token with
   Contents and Pull requests write on this repo. PRs opened with the default `GITHUB_TOKEN` don't
   trigger CI, so without it you'll need to push an empty commit (or close and reopen) to get
   checks on the version PR.
5. **Rulesets.** If tags or `main` are protected by rulesets, allow `github-actions[bot]` to create
   `@mk7s/*` tags and the `changeset-release/main` branch.
6. **Before the first release** (M1 alpha):
   - Enter pre mode in a PR: `pnpm changeset pre enter alpha` (commits `.changeset/pre.json`), plus
     a changeset with a `minor` bump, so the first release is `0.1.0-alpha.0` on the `alpha`
     dist-tag. Run `pnpm changeset pre exit` before the first stable `0.x` release.
   - Run `pnpm release:pack` locally and inspect the tarballs (contents, `exports`, LICENSE and
     THIRD_PARTY_NOTICES, no `src/`). Consider `publint` and `@arethetypeswrong/cli` on them
     (ADR-015 follow-up; not installed).
   - Decide whether published `exports` should keep the `source` condition: it points at
     `./src/index.ts`, which is not in the tarball, so a consumer bundler configured with a
     `source` condition would fail to resolve. `publishConfig.exports` can drop it.
7. **After the first publish:** check the package pages on npmjs.com show the provenance badge.

## Provenance and trust

The publish job sets `PNPM_CONFIG_PROVENANCE=true` and has `id-token: write`, so pnpm 11 attaches a
Sigstore provenance attestation (requires the repository to be public). Keep publishing with
provenance: pnpm 11 refuses to install a version whose trust evidence is weaker than earlier
versions' (`TRUST_DOWNGRADE`), so one publish without it would break installs for pnpm users.

Follow-up: switch to npm **trusted publishing** (OIDC, no long-lived token; pnpm 11 supports it)
by registering `holochart/holochart` + `release.yml` + environment `npm` as a trusted publisher for
each package on npmjs.com, then remove `NPM_TOKEN` and the token check.

## When something goes wrong

- **Publish failed part-way:** fix the cause and re-run the `publish to npm` job. Versions already
  on npm fail with "cannot publish over"; if that blocks the rest, re-run the whole workflow so
  `pack` recomputes the plan.
- **Bad release:** never unpublish. Publish a fixed patch and deprecate the bad version of each
  package (`npm deprecate @mk7s/<pkg>@<bad> "<reason>"`). If needed, point `latest` back at the
  last good version (`npm dist-tag add @mk7s/<pkg>@<good> latest`).
- **GitHub release missing:** the tags are pushed before it; create it by hand from the tag.
