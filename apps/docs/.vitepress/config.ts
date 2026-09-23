/**
 * VitePress config for https://mk7s.dev/holochart (plan E19.1).
 *
 * - `base` is `/holochart/` (override with HOLOCHART_DOCS_BASE, e.g. `/holochart/v1/` for a
 *   versioned build or `/` for a PR preview on its own host). Links in Markdown and theme config
 *   are base-relative; never hardcode the base.
 * - Workspace packages resolve to their TypeScript sources through the `source` export condition
 *   (ADR-013), like the sandbox, so live examples need no package build.
 * - Generated sections (attribute reference, API reference) are produced by `pnpm run gen`, which
 *   runs automatically before `dev` and `build`.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type MarkdownOptions } from 'vitepress';
import { exampleSourcesPlugin } from './plugins/example-sources.ts';
import { buildSidebar, nav } from './sidebar.ts';

const DOCS_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO_ROOT = path.resolve(DOCS_ROOT, '../..');

function normalizeBase(b: string): string {
  return `/${b.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');
}

const base = normalizeBase(process.env['HOLOCHART_DOCS_BASE'] ?? '/holochart/');
/** Dev sandbox for "Open in sandbox" links; empty hides the link. */
const sandboxUrl = process.env['HOLOCHART_SANDBOX_URL'] ?? 'http://localhost:5173/';
const repoUrl = 'https://github.com/holochart/holochart';

const markdown: MarkdownOptions = {
  theme: { light: 'github-light', dark: 'github-dark' },
};

/**
 * Cloudflare Pages `_headers` for the deployed site. The deploy step places the build output under
 * a `holochart/` folder, so this file must be moved to the root of the uploaded directory (see
 * README). Rules are prefixed with `base` so they match the proxied, path-preserving URLs.
 * Hashed assets are immutable; everything else (HTML, plot-schema.json, logo) revalidates.
 */
function cloudflareHeaders(): string {
  return [
    `${base}*`,
    '  Cache-Control: public, max-age=0, must-revalidate',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    `${base}assets/*`,
    '  ! Cache-Control',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
  ].join('\n');
}

export default defineConfig({
  lang: 'en-US',
  title: 'Holochart',
  description: 'Declarative, GPU-rendered charts built on three.js.',
  base,
  cleanUrls: true,
  // Keep the page hash map out of every HTML file (hundreds of generated API pages).
  metaChunk: true,
  srcExclude: ['README.md', '**/_*.md'],
  // Generated attribute pages live in reference/attributes/ (gitignored) but are served at
  // /reference/<name>, e.g. /reference/scatter#marker.line.width (plan E19.3).
  rewrites: { 'reference/attributes/:page': 'reference/:page' },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}logo.svg` }],
    ['meta', { name: 'theme-color', content: '#6d5dfc' }],
  ],
  markdown,
  themeConfig: {
    logo: '/logo.svg',
    nav,
    sidebar: buildSidebar(DOCS_ROOT),
    outline: { level: [2, 3] },
    search: {
      provider: 'local',
      options: { detailedView: 'auto' },
    },
    socialLinks: [{ icon: 'github', link: repoUrl }],
    editLink: {
      pattern: `${repoUrl}/edit/main/apps/docs/:path`,
      text: 'Edit this page on GitHub',
    },
    footer: {
      message: `Released under the <a href="${repoUrl}/blob/main/LICENSE">MIT License</a>.`,
      copyright: 'Copyright © 2026 Holochart contributors',
    },
  },
  vite: {
    plugins: [
      exampleSourcesPlugin({
        examplesDir: path.join(REPO_ROOT, 'examples'),
        srcDir: DOCS_ROOT,
        markdown,
        base,
      }),
    ],
    define: {
      __HOLOCHART_SANDBOX_URL__: JSON.stringify(sandboxUrl),
    },
    resolve: {
      // VitePress bundles Vite 5, where custom conditions are added to the defaults.
      conditions: ['source'],
    },
    ssr: {
      resolve: { conditions: ['source'], externalConditions: ['source'] },
    },
    server: {
      // The sandbox uses 5173.
      port: 5174,
      // Examples live outside the docs app.
      fs: { allow: [REPO_ROOT] },
    },
    build: {
      target: 'es2022',
      // Example chunks carry three.js and the render package.
      chunkSizeWarningLimit: 2048,
    },
  },
  async buildEnd(siteConfig) {
    await writeFile(path.join(siteConfig.outDir, '_headers'), cloudflareHeaders());
  },
});
