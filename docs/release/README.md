# Release & distribution

How Holochart is versioned, measured, released, and hosted (plan E21, E19).

| Document                                 | Covers                                                                                                    |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [versioning.md](versioning.md)           | SemVer and pre-1.0 rules, deprecations, supported three.js range                                          |
| [bundle-size.md](bundle-size.md)         | Size budgets, `pnpm size`, partial bundles with `register()`                                              |
| [releasing.md](releasing.md)             | Changesets flow, the release workflow, maintainer setup, the first release checklist, pre mode, recovery  |
| [browser-support.md](browser-support.md) | Supported browsers, what CI runs on Firefox and WebKit, known issues, the manual Safari/Firefox checklist |
| [docs-hosting.md](docs-hosting.md)       | Docs deploy to Cloudflare Pages and the `mk7s.dev/holochart/` proxy                                       |

Holochart is released under the MIT license. All packages are published under the `@mk7s` npm
scope ([ADR-017](../adr/017-mk7s-npm-scope.md)).
