/**
 * `pnpm gallery:check` (CI, docs job): checks that the committed gallery is in sync with
 * `examples/` without a browser (plan E19.5).
 *
 * - The manifest lists exactly the examples that are visual tests (not tagged `no-visual-test` or
 *   `perf`), and every entry has its thumbnail; no thumbnail is orphaned.
 * - Where an example's `meta` is a literal (most are), its title, description, tags and size
 *   match the manifest. Computed meta (e.g. the theme sampler) is only checked by id.
 *
 * Meta is read statically with the TypeScript parser; example code never runs in Node. Rendering
 * changes are not detected here: regenerate thumbnails with `pnpm gallery` when an example's look
 * changes (the same moment its visual baseline is updated).
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { listExampleIds } from '../../../tests/visual/examples.ts';
import {
  EXAMPLES_DIR,
  MANIFEST_FILE,
  PUBLIC_DIR,
  REPO_ROOT,
  isExcluded,
  listThumbnails,
  readManifest,
  type GalleryEntry,
} from './manifest.ts';

/** Statically known parts of an example's `meta` (undefined where not a literal). */
export interface StaticMeta {
  title?: string;
  description?: string;
  tags?: string[];
  size?: { width: number; height: number };
  /** False when the literal spreads another object or computes `size`: size is then unknown. */
  sizeKnown: boolean;
}

function literalString(node: ts.Expression): string | undefined {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
    ? node.text
    : undefined;
}

/** Reads `export const meta = { … }` from an example's source. `undefined` if not a literal. */
export function staticMeta(source: string, fileName = 'example.ts'): StaticMeta | undefined {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, false);
  let literal: ts.ObjectLiteralExpression | undefined;
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    const exported = stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    for (const decl of stmt.declarationList.declarations) {
      let init = decl.initializer;
      while (init && (ts.isSatisfiesExpression(init) || ts.isAsExpression(init))) {
        init = init.expression;
      }
      if (ts.isIdentifier(decl.name) && decl.name.text === 'meta' && init) {
        if (ts.isObjectLiteralExpression(init)) literal = init;
      }
    }
  }
  if (!literal) return undefined;
  const meta: StaticMeta = { sizeKnown: true };
  for (const prop of literal.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) {
      // A spread (`...otherMeta`) or shorthand may carry any field, including `size`.
      meta.sizeKnown = false;
      continue;
    }
    const key = prop.name.text;
    const value = prop.initializer;
    if (key === 'title' || key === 'description') {
      const text = literalString(value);
      if (text !== undefined) meta[key] = text;
    } else if (key === 'tags' && ts.isArrayLiteralExpression(value)) {
      const tags = value.elements.map((e) => literalString(e));
      if (tags.every((t) => t !== undefined)) meta.tags = tags as string[];
    } else if (key === 'size') {
      meta.sizeKnown = false;
      if (!ts.isObjectLiteralExpression(value)) continue;
      const dims: Record<string, number> = {};
      for (const p of value.properties) {
        if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) {
          if (ts.isNumericLiteral(p.initializer)) dims[p.name.text] = Number(p.initializer.text);
        }
      }
      if (dims['width'] !== undefined && dims['height'] !== undefined) {
        meta.size = { width: dims['width'], height: dims['height'] };
        meta.sizeKnown = true;
      }
    }
  }
  return meta;
}

/** Problems between the manifest and the examples; empty when in sync. */
export function checkGallery(
  entries: readonly GalleryEntry[],
  examples: ReadonlyMap<string, StaticMeta | undefined>,
  thumbnails: readonly string[],
): string[] {
  const problems: string[] = [];
  const byId = new Map(entries.map((e) => [e.id, e]));
  for (const [id, meta] of examples) {
    const excluded = meta?.tags ? isExcluded(meta.tags) : false;
    const entry = byId.get(id);
    if (excluded) {
      if (entry) problems.push(`${id}: excluded from the gallery by its tags but in the manifest.`);
      continue;
    }
    if (!entry) {
      problems.push(`${id}: missing from the gallery manifest.`);
      continue;
    }
    if (meta?.title !== undefined && meta.title !== entry.title) {
      problems.push(`${id}: title changed ("${entry.title}" → "${meta.title}").`);
    }
    if (meta?.description !== undefined && meta.description !== entry.description) {
      problems.push(`${id}: description changed.`);
    }
    if (meta?.tags && meta.tags.join('|') !== entry.tags.join('|')) {
      problems.push(
        `${id}: tags changed ([${entry.tags.join(', ')}] → [${meta.tags.join(', ')}]).`,
      );
    }
    // No `size` in a fully literal meta means the sandbox default, 640×400.
    const size = meta?.sizeKnown ? (meta.size ?? { width: 640, height: 400 }) : undefined;
    if (size && (size.width !== entry.size.width || size.height !== entry.size.height)) {
      problems.push(
        `${id}: size changed (${entry.size.width}×${entry.size.height} → ${size.width}×${size.height}).`,
      );
    }
  }
  for (const e of entries) {
    if (!examples.has(e.id)) problems.push(`${e.id}: in the manifest but the example is gone.`);
  }
  const files = new Set(thumbnails);
  for (const e of entries) {
    if (!files.has(e.thumbnail)) problems.push(`${e.id}: thumbnail ${e.thumbnail} is missing.`);
  }
  const referenced = new Set(entries.map((e) => e.thumbnail));
  for (const f of thumbnails) {
    if (!referenced.has(f)) problems.push(`${f}: thumbnail is not referenced by the manifest.`);
  }
  return problems;
}

function main(): void {
  const rel = (f: string): string => path.relative(REPO_ROOT, f);
  const manifest = readManifest();
  if (!manifest) {
    console.error(`error: ${rel(MANIFEST_FILE)} does not exist. Run \`pnpm gallery\`.`);
    process.exitCode = 1;
    return;
  }
  const examples = new Map<string, StaticMeta | undefined>();
  for (const id of listExampleIds(EXAMPLES_DIR)) {
    const file = path.join(EXAMPLES_DIR, `${id}.ts`);
    examples.set(id, existsSync(file) ? staticMeta(readFileSync(file, 'utf8'), file) : undefined);
  }
  const problems = checkGallery(manifest.examples, examples, listThumbnails());
  for (const p of problems) console.error(`error  ${p}`);
  const computed = [...examples.values()].filter((m) => !m).length;
  console.log(
    `\ngallery: ${manifest.examples.length} entries, ${examples.size} examples ` +
      `(${computed} with computed meta, checked by id only), thumbnails in ${rel(PUBLIC_DIR)}; ` +
      `${problems.length} problems.`,
  );
  if (problems.length > 0) {
    console.error('Regenerate with `pnpm gallery` (or `pnpm gallery -g <id>` for one example).');
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) main();
