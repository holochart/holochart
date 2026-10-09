/** Read actual guide examples and explain launch coverage without inferring beginner status. */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { GalleryEntry } from '../../../tools/gallery-gen/src/manifest.ts';
export interface GuideExample {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  thumbnailSize: { width: number; height: number };
  python: boolean;
}
export interface ChartGuide {
  title: string;
  chart: string;
  minimal: string;
  variations: string[];
  dataShape: string;
  alternatives: { title: string; href: string }[];
  featured: boolean;
  support: string;
}
export interface ChartGuideCatalog {
  guides: Record<string, ChartGuide>;
  examples: Record<string, GuideExample>;
}
export const launchGuideRoutes = new Set([
  'charts/basic/bar.md',
  'charts/basic/line.md',
  'charts/basic/scatter.md',
  'charts/statistical/box.md',
  'charts/statistical/histogram.md',
  'charts/scientific/heatmap.md',
  'charts/basic/pie.md',
  'charts/financial/candlestick.md',
  'charts/scientific/polar.md',
  'charts/maps/scattergeo.md',
  'charts/maps/choropleth.md',
  'charts/graphs/graph.md',
  'charts/hierarchical/sankey.md',
  'charts/3d/scatter3d.md',
  'charts/3d/surface.md',
]);
export function chartGuideFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name);
    return entry.isDirectory()
      ? chartGuideFiles(file)
      : entry.name.endsWith('.md') && !entry.name.startsWith('_') && entry.name !== 'index.md'
        ? [file]
        : [];
  });
}
const ids = (source: string): string[] =>
  [...source.matchAll(/<(?:Example|ExampleLink)\b[^>]*?\bid=(["'])(.+?)\1/g)].map(
    (match) => match[2]!,
  );
const section = (source: string, heading: string): string =>
  source.split(`## ${heading}\n`)[1]?.split(/\n## /)[0] ?? '';
export function buildChartGuideCatalog(
  docsRoot: string,
  entries: readonly GalleryEntry[],
): ChartGuideCatalog {
  const catalog: ChartGuideCatalog = { guides: {}, examples: {} };
  const byId = new Map(entries.map((e) => [e.id, e]));
  for (const file of chartGuideFiles(path.join(docsRoot, 'charts'))) {
    const source = readFileSync(file, 'utf8');
    const rel = path.relative(docsRoot, file).split(path.sep).join('/');
    const chart = /^chart:\s*(.+)$/m.exec(source)?.[1] ?? '';
    const title = /^title:\s*(.+)$/m.exec(source)?.[1] ?? chart;
    const minimal = ids(section(source, 'Minimal example'))[0] ?? ids(source)[0];
    if (!minimal || !byId.has(minimal)) continue;
    const variations = [...new Set(ids(section(source, 'Variations')))].filter(
      (id) => id !== minimal && byId.has(id),
    );
    const dataShape =
      section(source, 'Data format')
        .split(/\n\n/)[0]
        ?.replace(/<[^>]+>/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/`/g, '')
        .replace(/\n/g, ' ')
        .replace(/^[-*] /, '')
        .slice(0, 360) ?? '';
    const alternatives = [
      ...section(source, 'Related charts').matchAll(/\[([^\]]+)\]\((\/charts\/[^)]+)\)/g),
    ]
      .slice(0, 4)
      .map((m) => ({ title: m[1]!, href: m[2]! }));
    const support = ['graph', 'graph3d', 'chord'].includes(chart)
      ? 'Graph extension: browser-only. The Python bridge does not bundle the graph extension.'
      : ['scattergeo', 'choropleth'].includes(chart)
        ? 'Geo extension: browser-only. Python map previews are not available in the current bridge.'
        : 'Browser preview requires WebGL2. Python is listed only for actual source variants with their own notebook verification.';
    catalog.guides[rel] = {
      title,
      chart,
      minimal,
      variations,
      dataShape,
      alternatives,
      featured: launchGuideRoutes.has(rel),
      support,
    };
    for (const id of new Set(ids(source))) {
      const e = byId.get(id);
      if (!e) continue;
      catalog.examples[id] = {
        id,
        title: e.title,
        description: e.description,
        thumbnail: e.thumbnail,
        thumbnailSize: e.thumbnailSize,
        python: e.variants.some(
          (v) => v.language === 'python' && v.verification.browserVerified === true,
        ),
      };
    }
  }
  return catalog;
}
