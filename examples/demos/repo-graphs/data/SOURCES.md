# Data sources

Everything this demo draws is read from this repository. Nothing is downloaded.

```bash
node examples/demos/repo-graphs/data/generate.mts
pnpm exec prettier --write "examples/demos/repo-graphs/data/*.json"
```

`generate.mts` needs Node 22 or newer (it is TypeScript, run as it is) and `git` on the path. It
reads the working tree, so files that are not committed yet are counted; `head` in each file is
the commit that was checked out. Run it again after the packages or the history change, then
update the visual baselines and the gallery thumbnails of the demo:

```bash
pnpm test:visual:update -g " demos/repo-graphs/"
pnpm gallery -g " demos/repo-graphs/"
```

## packages.json

The workspace packages, as `pnpm-workspace.yaml` lists them: every directory under `packages/`,
`tools/` and `apps/` that has a `package.json`, and `examples`.

- `packages`: `name`, `dir`, `kind` (`package`, `tool` or `app`; `examples` counts as an app),
  `description`, and `modules`, the number of source modules of a package (see below).
- `dependencies`: `[dependent, dependency, field]`, as indices into `packages`: every workspace
  package named in `dependencies`, `peerDependencies` or `devDependencies`. Dependencies on
  packages from npm are left out.

## imports.json

The source modules of the packages under `packages/` and the imports between them.

- `packages`: the directory names under `packages/`.
- `modules`: `[package, path, lines]`: every `.ts` file under a package's `src/`, except tests
  (`*.test.ts`, `*.test-d.ts`, `*.spec.ts`), declarations (`*.d.ts`) and the directories
  `__testing__`, `__fixtures__` and `__snapshots__`. `lines` counts every line of the file.
- `imports`: `[importing module, imported module, kind]`, one entry per pair. The specifiers are
  read with the TypeScript parser from `import` and `export … from` declarations and from
  `import()` calls, so imports in comments and strings are not counted. A relative specifier is
  resolved to its file; a package name (`@mk7s/holochart-core`, `@mk7s/holochart/graph`) to the
  source file its `exports` map names. Imports of anything else (three.js, d3, Node) are left
  out. `kind` is `0` for an import of values, `1` for a type-only import and `2` for a dynamic
  `import()`; a pair with several keeps the first of these it has.

## commits.json

The commits reachable from `HEAD` (at most 400), from
`git log --date-order --format='%H %P %ct %s'`, oldest first, so that no commit comes before one
of its parents.

- `commits`: `[hash, parents, time, subject]`: the first seven characters of the hash, the
  parents as indices into the list, the commit time in seconds since 1970 and the subject line.
  Author and committer names and e-mail addresses are not read.

## The pipeline

The stages and flows of the rendering pipeline are not generated: they are written out in
`analysis.mts` (`STAGES`, `FLOWS`) from the "Rendering pipeline" section of `ARCHITECTURE.md`
and the stage order of the update planner (`packages/core/src/edit/plan.ts`).
