# Changesets

Every user-facing change to a published `@mk7s/holochart*` package needs a changeset. Run
`pnpm changeset`, pick the packages and bump type, write a one-line summary for users, and commit
the generated Markdown file with your PR. Internal-only changes (tests, CI, tooling, docs site,
sandbox) don't need one.

All published packages share one version (a `fixed` group), so a bump to any package releases all
of them at the same version. The release flow, versioning rules, and the reasons for these
settings are in [docs/release/](../docs/release/README.md).

Changesets docs: https://changesets.dev
