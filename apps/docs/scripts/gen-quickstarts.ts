/** Keep the standalone HTML tutorial's chart code identical to its canonical browser module. */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { releaseState } from '../.vitepress/release-state.ts';

const dir = new URL('../public/quickstarts/', import.meta.url);
const [moduleSource, page] = await Promise.all([
  readFile(new URL('browser.ts', dir), 'utf8'),
  readFile(new URL('browser.html', dir), 'utf8'),
]);
// The published script, pinned to the exact version (a range does not match a pre-release); the
// file beside the page until a release is published and smoke-tested.
const npm = releaseState.npm;
const scriptUrl =
  npm.status === 'published' && npm.smokeTested
    ? `https://cdn.jsdelivr.net/npm/${npm.packageName}@${npm.version}/dist/holochart.iife.min.js`
    : './holochart.iife.min.js';
const script = moduleSource.replace(
  "import { createChart } from '@mk7s/holochart';",
  'const { createChart } = Holochart;',
);
const standalone = await format(
  page.replace(
    '<script type="module" src="/src/quickstart.ts"></script>',
    `<script src="${scriptUrl}"></script>\n<script>\n${script}\n</script>`,
  ),
  { ...(await resolveConfig(fileURLToPath(new URL('html.html', dir)))), parser: 'html' },
);
const output = new URL('html.html', dir);
if (process.argv.includes('--check')) {
  if ((await readFile(output, 'utf8')) !== standalone)
    throw new Error('Plain HTML quick start is stale; run gen-quickstarts.ts.');
} else {
  await writeFile(output, standalone);
}
