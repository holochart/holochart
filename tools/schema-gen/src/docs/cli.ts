/**
 * `pnpm --filter @mk7s/holochart-schema-gen run docs`: generate the attribute reference pages and
 * `plot-schema.json` for the docs site (plan E19.3). The docs app runs this before `dev` and
 * `build`; the output is build output and is gitignored.
 *
 * Options (paths relative to the repo root):
 *   --out <dir>       reference pages + manifest.json (default apps/docs/reference/attributes)
 *   --schema <file>   plot-schema.json (default apps/docs/public/plot-schema.json)
 */
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { REPO_ROOT } from '../generate.ts';
import { DEFAULT_DOCS_PATHS, generateDocs, type DocsPaths } from './generate-docs.ts';

const { values } = parseArgs({
  options: { out: { type: 'string' }, schema: { type: 'string' } },
});
const paths: DocsPaths = {
  ...DEFAULT_DOCS_PATHS,
  ...(values.out ? { outDir: values.out } : {}),
  ...(values.schema ? { schemaFile: values.schema } : {}),
};

const { files, manifest, contributions, warnings } = await generateDocs(paths);

// Remove pages of trace types that no longer exist. Only generated file types are touched.
const outAbs = path.join(REPO_ROOT, paths.outDir);
await mkdir(outAbs, { recursive: true });
for (const name of await readdir(outAbs)) {
  if (/\.(md|json)$/.test(name) && !(`${paths.outDir}/${name}` in files)) {
    await rm(path.join(outAbs, name));
  }
}

for (const [rel, content] of Object.entries(files)) {
  const abs = path.join(REPO_ROOT, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, content);
}

for (const [pkg, names] of Object.entries(contributions)) {
  console.log(`${pkg}: ${names.length > 0 ? names.join(', ') : '(no modules yet)'}`);
}
for (const w of warnings) console.warn(`warning: ${w}`);
console.log(
  `attribute reference: ${manifest.pages.length} pages → ${paths.outDir}; schema → ${paths.schemaFile}`,
);
