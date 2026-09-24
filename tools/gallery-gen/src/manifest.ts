/**
 * Gallery manifest (plan E19.5): what `gallery.spec.ts` records per example, how the records are
 * merged into the committed manifest, and where the files live. Node-only; no browser code.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as prettier from 'prettier';

export const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
export const EXAMPLES_DIR = path.join(REPO_ROOT, 'examples');
/** Docs `public/` folder: files here are served verbatim at the site base. */
export const PUBLIC_DIR = path.join(REPO_ROOT, 'apps/docs/public');
/** Site path (relative to the docs base) of the gallery's static files. */
export const GALLERY_SITE_DIR = 'gallery';
export const MANIFEST_FILE = path.join(PUBLIC_DIR, GALLERY_SITE_DIR, 'manifest.json');
export const THUMBS_DIR = path.join(PUBLIC_DIR, GALLERY_SITE_DIR, 'thumbs');

/** Tags that keep an example out of the gallery (same rule as the visual suite, plus `perf`). */
export const EXCLUDED_TAGS: readonly string[] = ['no-visual-test', 'perf'];

/** Thumbnail encoding: WebP, re-encoded in the page from the PNG screenshot. */
export const THUMBNAIL = {
  /** Largest thumbnail width in pixels (wider examples are scaled down, aspect kept). */
  maxWidth: 640,
  /** `canvas.toBlob` quality (0–1). */
  quality: 0.8,
} as const;

/** Trace types that make an example "3D-native" (none are registered yet). */
export const THREE_D_TRACE_TYPES: ReadonlySet<string> = new Set([
  'scatter3d',
  'surface',
  'mesh3d',
  'cone',
  'streamtube',
  'volume',
  'isosurface',
  'bar3d',
]);
/** Tags that mark an example as 3D-native. */
export const THREE_D_TAGS: ReadonlySet<string> = new Set(['3d', '3d-native']);

export interface GalleryEntry {
  /** Example id: path under `examples/` without `.ts`, e.g. `scatter/basic`. */
  id: string;
  title: string;
  description: string;
  tags: string[];
  /** First segment of the id (`scatter`, `recipes`, `_dev`, …). */
  category: string;
  /** Trace types the rendered chart(s) contain (`fullData[].type`), sorted. */
  traceTypes: string[];
  /** Rendered size in CSS pixels (the example's `meta.size`, default 640×400). */
  size: { width: number; height: number };
  /** True when a trace type or a tag is 3D (see {@link THREE_D_TRACE_TYPES}). */
  threeD: boolean;
  /** Thumbnail path relative to the docs base, e.g. `gallery/thumbs/scatter/basic.webp`. */
  thumbnail: string;
  /** Thumbnail size in pixels. */
  thumbnailSize: { width: number; height: number };
}

export interface GalleryManifest {
  /** Bumped when the entry shape changes. */
  version: 1;
  /** Chart look the thumbnails were rendered with (the default template, ADR-021). */
  look: 'holochart';
  examples: GalleryEntry[];
}

/** One test's outcome, written by `gallery.spec.ts` and merged by `teardown.ts`. */
export type GalleryRecord = { id: string; skipped: true } | { id: string; entry: GalleryEntry };

export function isExcluded(tags: readonly string[]): boolean {
  return tags.some((t) => EXCLUDED_TAGS.includes(t));
}

export function isThreeD(traceTypes: readonly string[], tags: readonly string[]): boolean {
  return (
    traceTypes.some((t) => THREE_D_TRACE_TYPES.has(t)) || tags.some((t) => THREE_D_TAGS.has(t))
  );
}

/** Thumbnail path of an example relative to the docs base. */
export function thumbnailPath(id: string): string {
  return `${GALLERY_SITE_DIR}/thumbs/${id}.webp`;
}

/** Records live in the Playwright project's output folder (cleared at the start of every run). */
export function recordsDir(outputDir: string): string {
  return path.join(outputDir, 'gallery-records');
}

export function recordFile(outputDir: string, id: string): string {
  return path.join(recordsDir(outputDir), `${id.replaceAll('/', '__')}.json`);
}

export function readManifest(file = MANIFEST_FILE): GalleryManifest | undefined {
  if (!existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, 'utf8')) as GalleryManifest;
}

/**
 * Merge a run's records into the previous manifest. Rendered examples replace their entry,
 * skipped ones are dropped, examples that were not part of this run (a `-g` subset, or a failed
 * test) keep their previous entry, and entries of deleted examples are removed.
 */
export function mergeRecords(
  previous: GalleryManifest | undefined,
  records: readonly GalleryRecord[],
  existingIds: ReadonlySet<string>,
): GalleryManifest {
  const byId = new Map<string, GalleryEntry>();
  for (const e of previous?.examples ?? []) if (existingIds.has(e.id)) byId.set(e.id, e);
  for (const r of records) {
    if ('entry' in r) byId.set(r.id, r.entry);
    else byId.delete(r.id);
  }
  const examples = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  return { version: 1, look: 'holochart', examples };
}

/** Write the manifest formatted with the repo's Prettier config (so `format:check` stays green). */
export async function writeManifest(
  manifest: GalleryManifest,
  file = MANIFEST_FILE,
): Promise<void> {
  const config = await prettier.resolveConfig(file);
  const text = await prettier.format(JSON.stringify(manifest), { ...config, filepath: file });
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

/** Thumbnail files under {@link THUMBS_DIR}, as paths relative to the docs base. */
export function listThumbnails(dir = THUMBS_DIR): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (abs: string): void => {
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      const child = path.join(abs, e.name);
      if (e.isDirectory()) walk(child);
      else out.push(path.relative(PUBLIC_DIR, child).split(path.sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

/** Delete thumbnails no manifest entry points to, and folders left empty. Returns the deleted. */
export function pruneThumbnails(manifest: GalleryManifest, dir = THUMBS_DIR): string[] {
  const keep = new Set(manifest.examples.map((e) => e.thumbnail));
  const removed = listThumbnails(dir).filter((f) => !keep.has(f));
  for (const f of removed) rmSync(path.join(PUBLIC_DIR, f));
  const removeEmpty = (abs: string): boolean => {
    if (!existsSync(abs)) return true;
    let empty = true;
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      if (e.isDirectory() && removeEmpty(path.join(abs, e.name))) continue;
      empty = false;
    }
    if (empty && abs !== dir) rmSync(abs, { recursive: true });
    return empty;
  };
  removeEmpty(dir);
  return removed;
}

export function writeBinary(file: string, data: Buffer): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, data);
}
