# API reports

One file per published package: every export of its entry point, with its signature and its
stability tag. They are generated from the built declarations (`dist/index.d.ts`, what users
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

## Reading a report

The line above each declaration is its stability:

- `// @public`: stable. SemVer applies.
- `// @experimental`: may change in any minor release. Either the declaration is tagged
  `@experimental`, or its package is experimental as a whole (the header of the report says so;
  today that is `@mk7s/holochart-render`) and the declaration is not tagged `@public`.
- A member with its own `// @experimental` is experimental inside a stable declaration. Other
  members follow their declaration.
- `@deprecated` is shown too. `@internal` declarations never appear: the build strips them from
  the declarations.
- `(undocumented)` means the declaration has no doc comment.

`// Warning: (ae-forgotten-export)` marks a type that an export refers to but that the entry point
does not export. Users cannot name it, yet its shape is part of the API, so the report lists it
(without `export`). Either export it or stop exposing it.

`@mk7s/holochart` re-exports other packages (`export * from "@mk7s/holochart-core"`): their
exports are in their own reports.

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
exports before they ship.

## Details

- The tool is `tools/api-report` (API Extractor, configured in `src/cli.ts`; no per-package
  config files).
- API Extractor prints `@public` on everything without one of its own release tags
  (`@alpha`/`@beta`), which it does not derive from `@experimental`. The tool rewrites that line
  to the stability described above.
- Union members are sorted. The declaration build lists the members of inferred unions in an
  order that changes from one build to the next, and the reports have to be reproducible.
- Only the main entry point of each package is covered. `@mk7s/holochart/global` (`global.d.ts`)
  is a hand-written file, reviewed as such.
