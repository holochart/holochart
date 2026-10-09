/** Slash-separated IDs become nested, addressable routes; source code stays a lazy download. */
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import galleryLoader from '../../.vitepress/theme/data/gallery.data.ts';
import { relatedExamples } from '../../.vitepress/theme/gallery-state.ts';

const docsRoot = fileURLToPath(new URL('../../', import.meta.url));
let cached: { signature: string; paths: ReturnType<typeof buildPaths> } | undefined;
function markdownFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.') || entry.name === 'public')
      return [];
    const file = path.join(root, entry.name);
    const rel = path.relative(docsRoot, file).split(path.sep).join('/');
    if (rel === 'reference/api' || rel === 'reference/attributes') return [];
    return entry.isDirectory() ? markdownFiles(file) : entry.name.endsWith('.md') ? [file] : [];
  });
}
function buildPaths(files: string[]) {
  const data = galleryLoader.load(files);
  return data.examples.map((entry) => ({
    params: { id: entry.id, entry, related: relatedExamples(entry, data.examples) },
  }));
}
export default {
  paths() {
    const files = markdownFiles(docsRoot);
    // VitePress reruns all dynamic loaders for unrelated Markdown additions. Generated API
    // pages do not affect these routes; reuse the snapshot unless an actual input changes.
    const signature = [...files, 'public/gallery/manifest.json', 'public/gallery/sources.json']
      .map((file) => {
        const absolute = path.isAbsolute(file) ? file : path.join(docsRoot, file);
        if (!existsSync(absolute)) return `${file}:missing`;
        const stat = statSync(absolute);
        return `${file}:${stat.mtimeMs}:${stat.size}`;
      })
      .join('\n');
    if (!cached || cached.signature !== signature) cached = { signature, paths: buildPaths(files) };
    return cached.paths;
  },
};
