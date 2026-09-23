/**
 * Produces the attribute reference for the docs site (plan E19.3): one Markdown page per trace
 * type plus layout and config, a `manifest.json` the VitePress config reads to build the sidebar,
 * and `plot-schema.json` served with the site. Returns contents instead of writing them so the CLI
 * and tests share one code path.
 */
import path from 'node:path';
import * as prettier from 'prettier';
import { plotSchema, type PlotSchema } from '@mk7s/holochart-core';
import { REPO_ROOT } from '../generate.ts';
import { discoverRegistry } from './discover.ts';
import { renderReference, type ReferencePageInfo, type RenderOptions } from './render.ts';
import { chartPagesByTrace, examplesByTrace } from './scan.ts';

/** Where the docs generator reads from and writes to, relative to the repo root. */
export interface DocsPaths {
  /** Directory for generated reference pages and `manifest.json`. */
  outDir: string;
  /** Path of the published `plot-schema.json`. */
  schemaFile: string;
  /** Docs chart pages, scanned for `chart:` frontmatter. */
  chartsDir: string;
  /** Canonical examples, scanned for trace usage. */
  examplesDir: string;
}

export const DEFAULT_DOCS_PATHS: DocsPaths = {
  outDir: 'apps/docs/reference/attributes',
  schemaFile: 'apps/docs/public/plot-schema.json',
  chartsDir: 'apps/docs/charts',
  examplesDir: 'examples',
};

/** Sidebar manifest written next to the generated pages. */
export interface ReferenceManifest {
  pages: ReferencePageInfo[];
}

/** Generated files plus diagnostics. */
export interface DocsOutput {
  /** Path relative to the repo root (`/`-separated) → formatted content. */
  files: Record<string, string>;
  manifest: ReferenceManifest;
  /** Package name → trace types / components it contributed. */
  contributions: Record<string, string[]>;
  warnings: string[];
}

async function format(relPath: string, source: string): Promise<string> {
  const filepath = path.join(REPO_ROOT, relPath);
  const config = await prettier.resolveConfig(filepath);
  return prettier.format(source, { ...config, filepath });
}

/**
 * Render reference files for a given schema. Exposed separately from {@link generateDocs} so tests
 * can feed a fixture schema.
 */
export async function renderDocsFiles(
  schema: PlotSchema,
  paths: DocsPaths = DEFAULT_DOCS_PATHS,
  options: RenderOptions = {},
): Promise<{ files: Record<string, string>; manifest: ReferenceManifest }> {
  const { pages, manifest } = renderReference(schema, options);
  const raw: Record<string, string> = {};
  for (const [name, content] of Object.entries(pages)) raw[`${paths.outDir}/${name}`] = content;
  const manifestDoc: ReferenceManifest = { pages: manifest };
  raw[`${paths.outDir}/manifest.json`] = JSON.stringify(manifestDoc, null, 2);
  raw[paths.schemaFile] = JSON.stringify(schema, null, 2);
  const files: Record<string, string> = {};
  for (const [rel, source] of Object.entries(raw)) files[rel] = await format(rel, source);
  return { files, manifest: manifestDoc };
}

/** Discover every registered trace/component in the workspace and render the reference. */
export async function generateDocs(paths: DocsPaths = DEFAULT_DOCS_PATHS): Promise<DocsOutput> {
  const { registry, contributions, warnings } = await discoverRegistry(REPO_ROOT);
  const schema = plotSchema(registry);
  const traceTypes = Object.keys(schema.traces);
  const options: RenderOptions = {
    chartPages: await chartPagesByTrace(path.join(REPO_ROOT, paths.chartsDir), '/charts/'),
    examplesByTrace: await examplesByTrace(path.join(REPO_ROOT, paths.examplesDir), traceTypes),
  };
  const { files, manifest } = await renderDocsFiles(schema, paths, options);
  return { files, manifest, contributions, warnings };
}
