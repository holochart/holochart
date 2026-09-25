/**
 * Sidebar and nav for the docs site (plan E19 information architecture). Hand-written sections
 * list their pages in reading order and take titles from each page's frontmatter; the attribute
 * reference and API reference are read from the manifests their generators write.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { DefaultTheme } from 'vitepress';

type Item = DefaultTheme.SidebarItem;

/** Frontmatter `title` of a page, or its file name. */
function pageTitle(srcDir: string, page: string): string {
  const file = path.join(srcDir, page.endsWith('/') ? `${page}index.md` : `${page}.md`);
  try {
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(file, 'utf8'))?.[1] ?? '';
    const title = /^title:\s*(.+)$/m.exec(fm)?.[1]?.trim();
    if (title) return title.replace(/^(['"])(.*)\1$/, '$2');
  } catch {
    // Fall through to the file name; a missing page shows up as a dead link in the build.
  }
  return path.basename(page) || page;
}

function readJson<T>(file: string, fallback: T): T {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

interface ReferenceManifest {
  pages: {
    name: string;
    kind: 'trace' | 'layout' | 'config';
    title: string;
    link: string;
    pending?: boolean;
  }[];
}

export function buildSidebar(srcDir: string): DefaultTheme.Sidebar {
  const pages = (base: string, names: readonly string[]): Item[] =>
    names.map((name) => {
      const page = `${base}${name}`;
      return { text: pageTitle(srcDir, page), link: `/${page}` };
    });

  const guide: Item[] = [
    {
      text: 'Getting started',
      items: pages('getting-started/', [
        'installation',
        'first-chart',
        'core-concepts',
        'from-plotly',
        'from-d3',
        'from-chartjs',
      ]),
    },
    {
      text: 'Fundamentals',
      collapsed: false,
      items: pages('fundamentals/', [
        'traces',
        'layout-axes-subplots',
        'shapes-images',
        'styling-themes',
        'hover-text-templates',
        'interaction-events',
        'controls',
        'updating-charts',
        'transitions-animation',
        'colors-colorscales',
        'dates-time-series',
        'data-formats',
        'configuration',
      ]),
    },
    {
      text: 'Customization',
      collapsed: true,
      items: pages('customization/', [
        '',
        'themes-templates',
        'per-point-styling',
        'materials-lighting',
        'markers-patterns',
        'three-objects',
      ]),
    },
    {
      text: 'Guides',
      collapsed: true,
      items: pages('guides/', [
        'performance',
        'accessibility',
        'dashboards',
        'export',
        'frameworks',
        'ssr',
      ]),
    },
    { text: 'Express API', collapsed: true, items: pages('express/', ['']) },
    {
      text: 'Extending Holochart',
      collapsed: true,
      items: pages('extending/', ['custom-trace', 'component-plugin', 'trace-module-contract']),
    },
    {
      text: 'Project',
      collapsed: true,
      items: pages('', ['roadmap', 'changelog', 'migration']),
    },
  ];

  const charts: Item[] = [
    { text: 'Overview', link: '/charts/' },
    {
      text: 'Basic',
      items: pages('charts/basic/', [
        'scatter',
        'line',
        'area',
        'bubble',
        'bar',
        'horizontal-bar',
        'pie',
        'table',
        'gantt',
      ]),
    },
    {
      text: 'Statistical',
      items: pages('charts/statistical/', [
        'histogram',
        'histogram2d',
        'histogram2d-contour',
        'box',
        'violin',
        'strip',
        'splom',
        'parallel-coordinates',
        'parallel-categories',
      ]),
    },
  ];

  const demos: Item[] = [{ text: 'Demos', items: pages('demos/', ['openrouter']) }];

  const manifest = readJson<ReferenceManifest>(
    path.join(srcDir, 'reference/attributes/manifest.json'),
    { pages: [] },
  );
  const figurePages = manifest.pages.filter((p) => p.kind !== 'trace');
  const tracePages = manifest.pages.filter((p) => p.kind === 'trace');
  const apiSidebar = readJson<Item[]>(path.join(srcDir, 'reference/api/sidebar.json'), []);

  const reference: Item[] = [
    { text: 'Overview', link: '/reference/' },
    {
      text: 'Attributes',
      items: [
        ...figurePages.map((p) => ({
          text: p.title.replace(/ (attributes|options)$/, ''),
          link: p.link,
        })),
        ...(tracePages.length > 0
          ? [
              {
                text: 'Traces',
                collapsed: false,
                items: tracePages.map((p) => ({
                  text: p.pending ? `${p.name} (coming soon)` : p.name,
                  link: p.link,
                })),
              },
            ]
          : []),
      ],
    },
    { text: 'JavaScript API', collapsed: true, items: apiSidebar },
    {
      text: 'More',
      items: pages('reference/', ['events', 'colorscales', 'marker-symbols', 'plotly-compat']),
    },
  ];

  return {
    '/getting-started/': guide,
    '/fundamentals/': guide,
    '/customization/': guide,
    '/guides/': guide,
    '/express/': guide,
    '/extending/': guide,
    '/roadmap': guide,
    '/changelog': guide,
    '/migration': guide,
    '/charts/': charts,
    '/demos/': demos,
    '/reference/': reference,
  };
}

export const nav: DefaultTheme.NavItem[] = [
  {
    text: 'Guide',
    link: '/getting-started/installation',
    activeMatch: '^/(getting-started|fundamentals|customization|guides|express|extending)/',
  },
  { text: 'Charts', link: '/charts/', activeMatch: '^/charts/' },
  { text: 'Reference', link: '/reference/', activeMatch: '^/reference/' },
  { text: 'Demos', link: '/demos/openrouter', activeMatch: '^/demos/' },
  { text: 'Gallery', link: '/gallery/' },
  { text: 'Playground', link: '/playground/' },
  {
    // Versioning plan (E19.1): one build per released minor under /holochart/vN/, with
    // /holochart/ tracking the latest release. Until 1.0 there is a single, unversioned build.
    text: '0.x (pre-alpha)',
    items: [
      { text: 'Roadmap', link: '/roadmap' },
      { text: 'Changelog', link: '/changelog' },
      { text: 'Migration guides', link: '/migration' },
    ],
  },
];
