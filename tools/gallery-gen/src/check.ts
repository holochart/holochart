/**
 * `pnpm gallery:check` (CI, docs job): checks that the committed gallery is in sync with
 * `examples/` without a browser (plan E19.5).
 *
 * - The manifest lists exactly the public examples that are visual tests (not tagged
 *   `no-visual-test` or `perf`), and every entry has its thumbnail; no thumbnail is orphaned.
 * - Internal examples (`_dev/…`, `_spikes/…`) are never in the manifest.
 * - Where an example's `meta` is a literal (most are), its title, description, tags and size
 *   match the manifest. Computed meta (e.g. the theme sampler) is only checked by id.
 *
 * Meta is read statically with the TypeScript parser; example code never runs in Node. Rendering
 * changes are not detected here: regenerate thumbnails with `pnpm gallery` when an example's look
 * changes (the same moment its visual baseline is updated).
 */
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import ts from 'typescript';
import { chartFamilies, exampleOverrides, subtypeById } from '../../../examples/_lib/catalog.ts';
import { classificationFor } from './classification.ts';
import { listExampleIds } from '../../../tests/visual/examples.ts';
import {
  EXAMPLES_DIR,
  MANIFEST_FILE,
  PUBLIC_DIR,
  REPO_ROOT,
  isExcluded,
  isInternalExample,
  listThumbnails,
  readManifest,
  type GalleryEntry,
  type GalleryManifest,
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

/** Validate editorial IDs, canonical routes and runnable artifact references before publishing. */
export function checkClassification(manifest: GalleryManifest, repoRoot = REPO_ROOT): string[] {
  const problems: string[] = [];
  if (manifest.version !== 2)
    return ['Gallery manifest version must be 2; run node tools/gallery-gen/src/migrate.ts.'];
  const families = new Set(chartFamilies.map((f) => f.id));
  const ids = new Set<string>();
  const validFile = (file: string, root = repoRoot): boolean => {
    const resolved = path.resolve(root, file);
    return (
      !path.isAbsolute(file) &&
      !file.split(/[\\/]/).includes('..') &&
      resolved.startsWith(`${path.resolve(root)}${path.sep}`) &&
      existsSync(resolved)
    );
  };
  const docsFile = (route: string): string =>
    `apps/docs/${route.split('#')[0]!.slice(1).replace(/\/$/, '/index')}.md`;
  for (const family of chartFamilies) {
    for (const type of family.chartTypes) {
      if (!validFile(docsFile(type.docs)))
        problems.push(`taxonomy ${type.id}: missing docs ${type.docs}.`);
    }
  }
  for (const e of manifest.examples) {
    if (ids.has(e.id)) problems.push(`${e.id}: duplicate manifest entry.`);
    ids.add(e.id);
    if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)+$/.test(e.id))
      problems.push(`${e.id}: invalid public example ID.`);
    if (!families.has(e.primaryFamily))
      problems.push(`${e.id}: unknown primary family ${e.primaryFamily}.`);
    for (const f of e.secondaryFamilies ?? []) {
      if (!families.has(f)) problems.push(`${e.id}: unknown secondary family ${f}.`);
      if (f === e.primaryFamily)
        problems.push(`${e.id}: primary family duplicated in secondary families.`);
    }
    if (!e.chartTypes?.length) problems.push(`${e.id}: no chart subtype classification.`);
    for (const t of e.chartTypes ?? [])
      if (!subtypeById(t)) problems.push(`${e.id}: unknown chart subtype ${t}.`);
    if (
      !['chart', 'recipe', 'theme', 'interaction', 'layout', 'accessibility', 'demo'].includes(
        e.contentKind,
      )
    )
      problems.push(`${e.id}: unknown content kind.`);
    if (!['beginner', 'intermediate', 'advanced', 'unassessed'].includes(e.difficulty))
      problems.push(`${e.id}: unknown difficulty.`);
    if (e.curatedRank !== null && (!Number.isInteger(e.curatedRank) || e.curatedRank < 0))
      problems.push(`${e.id}: invalid curated rank.`);
    for (const docs of e.docs ?? [])
      if (!docs.startsWith('/') || !validFile(docsFile(docs)))
        problems.push(`${e.id}: dangling docs ${docs}.`);
    if (e.thumbnail !== `gallery/thumbs/${e.id}.webp`)
      problems.push(`${e.id}: noncanonical thumbnail path.`);
    if (!e.variants?.length) problems.push(`${e.id}: no runnable source variants.`);
    for (const v of e.variants ?? []) {
      if (!validFile(v.source))
        problems.push(`${e.id}: missing or unsafe source artifact ${v.source}.`);
      if (v.notebook && !validFile(v.notebook))
        problems.push(`${e.id}: missing or unsafe notebook artifact ${v.notebook}.`);
      if (v.language === 'python' && !/\.(?:py|ipynb)$/.test(v.source))
        problems.push(`${e.id}: Python variant must reference an actual Python artifact.`);
      if (!['typescript', 'javascript', 'python'].includes(v.language))
        problems.push(`${e.id}: unsupported language label ${v.language}.`);
      if (
        v.download &&
        (!v.download.startsWith('/') ||
          !validFile(v.download.slice(1), path.join(repoRoot, 'apps/docs/public')))
      )
        problems.push(`${e.id}: missing or unsafe published source ${v.download}.`);
      if (v.language === 'python' && validFile(v.source)) {
        const source = readFileSync(path.join(repoRoot, v.source), 'utf8');
        const hash = createHash('sha256').update(source).digest('hex');
        const proof = v.verification?.sourceSha256 ?? v.identity?.sourceSha256;
        if (proof && proof !== hash) problems.push(`${e.id}: stale Python source SHA.`);
        const packages: Record<string, string> = {
          holochart: 'holochart-py',
          numpy: 'numpy',
          plotly: 'plotly',
          ipywidgets: 'ipywidgets',
        };
        for (const imported of source.matchAll(/^(?:from|import)\s+(\w+)/gm)) {
          const dependency = packages[imported[1]!];
          if (
            dependency &&
            !(Array.isArray(v.dependencies) ? v.dependencies : []).some(
              (declared) =>
                declared === dependency ||
                declared.startsWith(`${dependency}[`) ||
                (imported[1] === 'plotly' && declared === 'holochart-py[plotly]'),
            )
          )
            problems.push(`${e.id}: undeclared Python dependency ${dependency}.`);
        }
        if (v.identity) {
          if (!source.includes(`# %% Figure ${e.id}\n`) || v.identity.expectedWidgetOutputs !== 1)
            problems.push(
              `${e.id}: Python artifact identity does not match a single-example source.`,
            );
          if (!/^[a-f0-9]{64}$/.test(v.identity.figureSha256))
            problems.push(`${e.id}: invalid shared figure SHA.`);
          if (!v.identity.browserSourceHashes?.[`examples/${e.id}.ts`])
            problems.push(`${e.id}: Python figure has no canonical browser identity.`);
          for (const [file, sha] of Object.entries(v.identity.browserSourceHashes ?? {})) {
            if (
              !validFile(file) ||
              createHash('sha256')
                .update(readFileSync(path.join(repoRoot, file)))
                .digest('hex') !== sha
            )
              problems.push(`${e.id}: Python counterpart uses stale browser source ${file}.`);
          }
        }
      }
      if (!v.environments?.length || !Array.isArray(v.dependencies))
        problems.push(`${e.id}: variant lacks environment/dependencies.`);
      if (!v.verification || !['rendered', 'executed', 'unverified'].includes(v.verification.state))
        problems.push(`${e.id}: variant lacks verification state.`);
      if (
        v.verification?.artifact &&
        !validFile(
          v.verification.artifact,
          v.verification.artifactBase === 'repo'
            ? repoRoot
            : path.join(repoRoot, 'apps/docs/public'),
        )
      )
        problems.push(`${e.id}: missing verification artifact ${v.verification.artifact}.`);
    }
    // Authoritative classification refresh catches drift when source modes/imports or overrides change.
    if (validFile(`examples/${e.id}.ts`)) {
      const expected = classificationFor(e, path.join(repoRoot, 'examples'));
      for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
        if (JSON.stringify(e[key]) !== JSON.stringify(expected[key]))
          problems.push(`${e.id}: stale ${key}; refresh gallery metadata.`);
      }
    }
  }
  for (const id of Object.keys(exampleOverrides))
    if (!ids.has(id)) problems.push(`${id}: curated override references an unpublished example.`);
  return problems;
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
    if (isInternalExample(id)) {
      if (entry) problems.push(`${id}: internal example in the gallery manifest.`);
      continue;
    }
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
  const problems = [
    ...checkGallery(manifest.examples, examples, listThumbnails()),
    ...checkClassification(manifest),
  ];
  for (const p of problems) console.error(`error  ${p}`);
  const computed = [...examples.values()].filter((m) => !m).length;
  const internal = [...examples.keys()].filter(isInternalExample).length;
  console.log(
    `\ngallery: ${manifest.examples.length} entries, ${examples.size} examples ` +
      `(${internal} internal, not published; ${computed} with computed meta, checked by id only), ` +
      `thumbnails in ${rel(PUBLIC_DIR)}; ` +
      `${problems.length} problems.`,
  );
  if (problems.length > 0) {
    console.error('Regenerate with `pnpm gallery` (or `pnpm gallery -g <id>` for one example).');
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) main();
