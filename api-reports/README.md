# API reports

One file per published package (and one for `@mk7s/holochart/global`): every export of its entry
point, with its signature and its stability tag. They are generated from the built declarations (`dist/index.d.ts`, what users
install) by [API Extractor](https://api-extractor.com/) and committed, so a change to the public
API shows up in a pull request's diff, whether it was meant or not.

| Command           | What it does                                                             |
| ----------------- | ------------------------------------------------------------------------ |
| `pnpm api:report` | Build the packages and regenerate every report                           |
| `pnpm api:check`  | Build the packages and fail if a committed report differs (CI runs this) |

Do not edit the reports by hand. When `pnpm api:check` or the `package checks` CI job fails:

1. Run `pnpm api:report` and read the diff.
2. If the change is not what you meant (a helper exported by accident, a renamed option), fix the
   source.
3. If it is, commit the reports with your change and add a changeset. Removing or changing a
   `@public` export is a breaking change ([versioning policy](../docs/release/versioning.md)).

Both commands also fail, with the names, when `@mk7s/holochart` and the packages it lists
disagree: a stable or experimental export of core, the runtime, components or a trace package is
missing from the full bundle's export list (`packages/holochart/src/exports.ts`, `exports-3d.ts`),
or an `@internal` one is in it. Add the name to the list, or tag it `@internal` if it is only there
for another Holochart package.

## Reading a report

The line above each declaration is its stability:

- `// @public`: stable. SemVer applies.
- `// @experimental`: may change in any minor release. Either the declaration is tagged
  `@experimental`, or its package is experimental as a whole (the header of the report says so;
  today that is `@mk7s/holochart-render`) and the declaration is not tagged `@public`.
- A member with its own `// @experimental` is experimental inside a stable declaration. Other
  members follow their declaration.
- `// @internal`: exported for the other Holochart packages only. Not API, no compatibility
  promise, hidden from the API reference, and not exported by `@mk7s/holochart`. It is in the
  report so that a change of tag shows in review.
- `@deprecated` is shown too. Members tagged `@internal` never appear: the build leaves them out
  of the declarations.
- `(undocumented)` means the declaration has no doc comment.

`// Warning: (ae-forgotten-export)` marks a type that an export refers to but that the entry point
does not export. Users cannot name it, yet its shape is part of the API, so the report lists it
(without `export`). Either export it or stop exposing it.

`// Warning: (ae-incompatible-release-tags)` marks a stable or experimental declaration whose
signature needs an `@internal` type. Tag that type `@experimental` (or leave it untagged) if it is
part of the shape users see, or stop exposing it. The reports have none of these today.

`@mk7s/holochart` re-exports other packages by name (`export { validate }`): the signatures and
tags of those names are in the reports of the packages that declare them.

`holochart-global.api.md` is the report of `@mk7s/holochart/global`, the types of the script-tag
build's `window.Holochart`: the names of its members, and which of them the 3D add-on adds. Their
signatures are those of the exports of `@mk7s/holochart` with the same names.

## How stability is declared

In TSDoc, next to the code:

```ts
/**
 * What a trace module implements.
 * @experimental
 */
export interface TraceModule {}
```

A package is experimental as a whole when the `@packageDocumentation` comment of its
`src/index.ts` is tagged `@experimental`; `@public` on a declaration then marks an exception. An
export without a tag in any other package is stable, so tag new plugin-facing or provisional
exports `@experimental`, and exports that are only there for another Holochart package
`@internal`, before they ship.

## Details

- The tool is `tools/api-report` (API Extractor, configured in `src/cli.ts`; no per-package
  config files).
- API Extractor prints `@public` on everything without one of its own release tags
  (`@alpha`/`@beta`), which it does not derive from `@experimental`. The tool rewrites that line
  to the stability described above.
- Union members are sorted. The declaration build lists the members of inferred unions in an
  order that changes from one build to the next, and the reports have to be reproducible.
- The main entry point of each package is covered, and `@mk7s/holochart/global` (`global.d.ts`, a
  hand-written file). The global's report is written by the tool itself, from the members of the
  `HolochartGlobal` type: API Extractor would follow the file into the package's own declarations
  and report all of them a second time.
- `@mk7s/holochart/geo` has no report of its own. It registers `@mk7s/holochart-traces-geo` and
  re-exports all of it (`export *`), so that package's report is its API
  (`packages/holochart/src/geo.test.ts` checks that the two export the same values).
  `@mk7s/holochart/graph` is the same for `@mk7s/holochart-traces-graph` (`graph.test.ts`).
