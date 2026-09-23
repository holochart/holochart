/**
 * Vite plugin serving syntax-highlighted example sources to the `<Example>` component (plan E19.2).
 *
 * - `virtual:holochart-example-sources` exports `sources`: example id → lazy loader.
 * - Each loader imports `virtual:holochart-example-source/<id>`, a module exporting the raw `code`
 *   and Shiki-highlighted `html` rendered with VitePress's own Markdown renderer, so embedded
 *   sources look exactly like fenced code blocks and cost nothing until a reader opens the tab.
 *
 * Example ids follow the rules of `examples/index.ts` (every `.ts` under `examples/` except
 * `_lib/`, `index.ts` and declaration files), so any example module works without registration.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createMarkdownRenderer, type MarkdownOptions, type Plugin } from 'vitepress';

const LIST_ID = 'virtual:holochart-example-sources';
const SOURCE_PREFIX = 'virtual:holochart-example-source/';

/** Example ids under `examplesDir`, sorted, using the rules of `examples/index.ts`. */
export async function listExampleIds(examplesDir: string): Promise<string[]> {
  const walk = async (rel: string): Promise<string[]> => {
    const entries = await readdir(path.join(examplesDir, rel), { withFileTypes: true });
    const out: string[] = [];
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const child = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) out.push(...(await walk(child)));
      else out.push(child);
    }
    return out;
  };
  return (await walk(''))
    .filter(
      (f) =>
        f.endsWith('.ts') && !f.endsWith('.d.ts') && !f.startsWith('_lib/') && f !== 'index.ts',
    )
    .map((f) => f.replace(/\.ts$/, ''))
    .sort();
}

export interface ExampleSourcesOptions {
  /** Absolute path of the repository's `examples/` directory. */
  examplesDir: string;
  /** Docs source dir, markdown options and base, as passed to VitePress. */
  srcDir: string;
  markdown?: MarkdownOptions;
  base: string;
}

export function exampleSourcesPlugin(options: ExampleSourcesOptions): Plugin {
  let renderer: ReturnType<typeof createMarkdownRenderer> | undefined;
  const highlight = async (code: string): Promise<string> => {
    renderer ??= createMarkdownRenderer(options.srcDir, options.markdown, options.base);
    const md = await renderer;
    const fence = code.includes('```') ? '````' : '```';
    return md.render(`${fence}ts\n${code}\n${fence}\n`);
  };

  return {
    name: 'holochart-example-sources',
    configureServer(server) {
      // Refresh the id list when example files are added or removed while `dev` runs.
      server.watcher.add(options.examplesDir);
      const refresh = (file: string): void => {
        if (!file.startsWith(options.examplesDir) || !file.endsWith('.ts')) return;
        const mod = server.moduleGraph.getModuleById(`\0${LIST_ID}`);
        if (mod) server.reloadModule(mod);
      };
      server.watcher.on('add', refresh);
      server.watcher.on('unlink', refresh);
    },
    resolveId(id) {
      if (id === LIST_ID || id.startsWith(SOURCE_PREFIX)) return `\0${id}`;
      return undefined;
    },
    async load(id) {
      if (id === `\0${LIST_ID}`) {
        const ids = await listExampleIds(options.examplesDir);
        const entries = ids.map(
          (exampleId) =>
            `  ${JSON.stringify(exampleId)}: () => import(${JSON.stringify(SOURCE_PREFIX + exampleId)}),`,
        );
        return `export const sources = {\n${entries.join('\n')}\n};\n`;
      }
      if (id.startsWith(`\0${SOURCE_PREFIX}`)) {
        const exampleId = id.slice(SOURCE_PREFIX.length + 1);
        if (exampleId.includes('..')) throw new Error(`Invalid example id "${exampleId}".`);
        const file = path.join(options.examplesDir, `${exampleId}.ts`);
        this.addWatchFile(file);
        const code = (await readFile(file, 'utf8')).trimEnd();
        const html = await highlight(code);
        return `export const code = ${JSON.stringify(code)};\nexport const html = ${JSON.stringify(html)};\n`;
      }
      return undefined;
    },
  };
}
