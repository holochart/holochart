/**
 * Sidebar and nav for the docs site (plan E19 information architecture). Hand-written sections
 * list their pages in reading order and take titles from each page's frontmatter; the attribute
 * reference and API reference are read from the manifests their generators write.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { DefaultTheme } from 'vitepress';
import { chartFamilies } from '../../../examples/_lib/families.ts';

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
      text: 'Get started',
      items: pages('getting-started/', [
        '',
        'installation',
        'javascript',
        'html',
        'python-jupyter',
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
        '3d-scenes',
        'maps',
        'graphs',
        'shapes-images',
        'styling-themes',
        'conditional-styling',
        'hover-text-templates',
        'interaction-events',
        'controls',
        'updating-charts',
        'transitions-animation',
        'colors-colorscales',
        'dates-time-series',
        'locales',
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
        'extrusion-2-5d',
        'custom-markers',
        'markers-patterns',
        'three-objects',
      ]),
    },
    {
      text: 'Guides',
      collapsed: true,
      items: pages('guides/', [
        '',
        'performance',
        'accessibility',
        'dashboards',
        'export',
        'frameworks',
        'notebooks',
        'typescript',
        'ssr',
        'csp',
        'troubleshooting',
      ]),
    },
    {
      text: 'Express API',
      collapsed: true,
      items: pages('express/', [
        '',
        'data',
        'mappings',
        'facets',
        'animation',
        'statistics',
        'imshow',
        'hierarchy',
      ]),
    },
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

  const cookbook: Item[] = [
    { text: 'Recipe directory', link: '/cookbook/' },
    {
      text: 'Practical recipes',
      items: pages('cookbook/', [
        'small-multiples',
        'mixed-line-bar',
        'confidence-bands',
        'sorting-ranking',
        'missing-data',
        'date-axes',
        'custom-hover',
        'linked-views',
        'themes',
        'dashboard-sizing',
      ]),
    },
    { text: 'Choose a chart family', link: '/charts/' },
    { text: 'Browse complete demos', link: '/demos/' },
  ];

  // Chart families and subtype destinations come from the same public registry as the gallery.
  const charts: Item[] = [
    { text: 'All chart guides', link: '/charts/' },
    { text: 'Try charts in Python & Jupyter', link: '/python/' },
    ...chartFamilies.map((family) => ({
      text: family.label,
      collapsed: true,
      items: family.chartTypes.map((chart) => ({ text: chart.label, link: chart.docs })),
    })),
  ];

  const python: Item[] = [
    {
      text: 'Python & Jupyter',
      items: [
        { text: 'Learning path', link: '/python/' },
        {
          text: '1. Set up a development checkout',
          link: '/getting-started/installation#python-and-jupyter-from-source',
        },
        { text: '2. Render your first chart', link: '/getting-started/python-jupyter' },
        { text: '3. Use Plotly Express and graph_objects', link: '/python/plotly' },
        { text: '4. Update a widget', link: '/python/widgets' },
        { text: '5. Explore downloadable notebooks', link: '/python/notebooks/' },
        { text: 'Python API reference', link: '/python/api' },
        { text: 'Tested environments', link: '/python/environments' },
        { text: 'Notebook troubleshooting', link: '/python/troubleshooting' },
      ],
    },
    { text: 'Plotly compatibility', link: '/reference/plotly-compat' },
    { text: 'Troubleshooting', link: '/guides/troubleshooting' },
  ];

  const demos: Item[] = [
    {
      text: 'Demos',
      items: pages('demos/', [
        '',
        'openrouter',
        'tqqq-soxl',
        'science-basics',
        'dallas-weather',
        'tirzepatide',
        'thc-gummies',
        'usc-texas',
        'index-funds',
        'live-weather',
        'repo-graphs',
        'airline-globe',
      ]),
    },
  ];

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
      items: pages('reference/', [
        'events',
        'errors',
        'colorscales',
        'marker-symbols',
        'plotly-compat',
      ]),
    },
  ];

  return {
    '/getting-started/python-jupyter': python,
    '/getting-started/': guide,
    '/fundamentals/': guide,
    '/customization/': guide,
    '/guides/notebooks': python,
    '/python/': python,
    '/guides/': guide,
    '/express/': guide,
    '/extending/': guide,
    '/roadmap': guide,
    '/changelog': guide,
    '/migration': guide,
    '/charts/': charts,
    '/cookbook/': cookbook,
    '/demos/': demos,
    '/reference/': reference,
  };
}

export const nav: DefaultTheme.NavItem[] = [
  { text: 'Get started', link: '/getting-started/', activeMatch: '^/getting-started/' },
  { text: 'Gallery', link: '/gallery/', activeMatch: '^/gallery/' },
  { text: 'Python & Jupyter', link: '/python/', activeMatch: '^/(python/|guides/notebooks)' },
  {
    text: 'Guides',
    link: '/guides/',
    activeMatch:
      '^/(charts|cookbook|fundamentals|customization|guides/(?!notebooks)|express|extending)/',
  },
  { text: 'Reference', link: '/reference/', activeMatch: '^/reference/' },
  { text: 'Demos', link: '/demos/', activeMatch: '^/demos/' },
  {
    text: 'More',
    items: [
      { text: 'Playground', link: '/playground/' },
      { text: 'Roadmap · 0.x pre-alpha', link: '/roadmap' },
      { text: 'Changelog', link: '/changelog' },
      { text: 'Migration guides', link: '/migration' },
    ],
  },
];
