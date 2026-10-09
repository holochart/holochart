/** Launch-content gates. Execution and browser evidence must refer to the distributed source. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface Verification {
  state?: string;
  browserVerified?: boolean;
  sourceSha256?: string;
  artifact?: string;
}
interface Variant {
  id: string;
  source: string;
  download: string;
  sourceSha256: string;
  expectedWidgetOutputs: number;
  verification: Verification;
}
interface Notebook {
  slug: string;
  source: string;
  notebook: string;
  goal?: string;
  prerequisites?: string[];
  tutorialMinutes?: number;
  dataProvenance?: string;
  dependencies: string[];
  expectedWidgetOutputs: number;
  verification: Verification;
  galleryVariants?: Variant[];
}
interface Entry {
  id: string;
  primaryFamily: string;
}
interface HostRecord {
  slug: string;
  exampleId?: string;
  sourceSha256?: string;
  canvases: number;
  errors: string[];
}

export function checkNotebookCollection(
  root: string,
  notebooks: Notebook[],
  entries: Entry[],
  limits = { notebooks: 12, variants: 24, families: 6 },
): { problems: string[]; notebooks: number; variants: number; families: number } {
  const problems: string[] = [];
  const ids = new Map(entries.map((entry) => [entry.id, entry.primaryFamily]));
  const variantIds = new Set<string>();
  const families = new Set<string>();
  const sourceHash = (file: string): string | undefined => {
    const full = path.resolve(root, file);
    if (!full.startsWith(`${path.resolve(root)}${path.sep}`) || !existsSync(full)) {
      problems.push(`Missing or unsafe artifact: ${file}`);
      return;
    }
    return createHash('sha256').update(readFileSync(full)).digest('hex');
  };
  const evidence = (
    name: string,
    source: string,
    expected: number,
    v: Verification,
    exampleId?: string,
  ): void => {
    const hash = sourceHash(source);
    if (v.state !== 'rendered' || v.browserVerified !== true || v.sourceSha256 !== hash)
      problems.push(`${name}: execution/browser verification is missing or stale.`);
    if (!v.artifact || !existsSync(path.resolve(root, v.artifact))) {
      problems.push(`${name}: missing verification evidence.`);
      return;
    }
    for (const host of ['lab', 'notebooks']) {
      const report = path.resolve(root, path.dirname(v.artifact), `${host}.json`);
      if (!existsSync(report)) {
        problems.push(`${name}: missing ${host} host report.`);
        continue;
      }
      const records = JSON.parse(readFileSync(report, 'utf8')) as HostRecord[];
      const record = records.find((r) => (exampleId ? r.exampleId === exampleId : r.slug === name));
      if (
        !record ||
        record.sourceSha256 !== hash ||
        record.canvases !== expected ||
        record.errors.length
      )
        problems.push(`${name}: ${host} rendering evidence does not match this artifact.`);
    }
  };

  for (const notebook of notebooks) {
    if (
      !notebook.goal ||
      !notebook.prerequisites?.length ||
      !notebook.tutorialMinutes ||
      !notebook.dataProvenance
    )
      problems.push(
        `${notebook.slug}: incomplete learning prerequisites, goal, time or provenance.`,
      );
    if (!notebook.dependencies.some((d) => d.startsWith('holochart-py')))
      problems.push(`${notebook.slug}: bridge dependency is not declared.`);
    evidence(notebook.slug, notebook.source, notebook.expectedWidgetOutputs, notebook.verification);
    for (const [canonical, download] of [
      [notebook.source, `apps/docs/public/notebooks/${notebook.slug}.py`],
      [notebook.notebook, `apps/docs/public/notebooks/${notebook.slug}.ipynb`],
    ]) {
      if (sourceHash(canonical!) !== sourceHash(download!))
        problems.push(`${notebook.slug}: distributed artifact drift: ${download}`);
    }
    const notebookFile = path.resolve(root, notebook.notebook);
    if (existsSync(notebookFile)) {
      const distributed = JSON.parse(readFileSync(notebookFile, 'utf8')) as {
        cells: { cell_type: string; execution_count?: number | null; outputs?: unknown[] }[];
      };
      if (
        distributed.cells.some(
          (c) => c.cell_type === 'code' && (c.execution_count !== null || c.outputs?.length),
        )
      )
        problems.push(
          `${notebook.slug}: distributed notebook contains transient execution output.`,
        );
    }
    for (const variant of notebook.galleryVariants ?? []) {
      if (variantIds.has(variant.id))
        problems.push(`${variant.id}: duplicate Python gallery variant.`);
      variantIds.add(variant.id);
      const family = ids.get(variant.id);
      if (!family) problems.push(`${variant.id}: unknown gallery example.`);
      else families.add(family);
      evidence(
        variant.id,
        variant.source,
        variant.expectedWidgetOutputs,
        variant.verification,
        variant.id,
      );
      if (sourceHash(variant.source) !== variant.sourceSha256)
        problems.push(`${variant.id}: stale standalone source identity.`);
      const download = `apps/docs/public/${variant.download.replace(/^\//, '')}`;
      if (sourceHash(variant.source) !== sourceHash(download))
        problems.push(`${variant.id}: missing or stale downloadable Python source.`);
    }
  }
  if (notebooks.length < limits.notebooks)
    problems.push(`Need ${limits.notebooks} starter notebooks; found ${notebooks.length}.`);
  if (variantIds.size < limits.variants)
    problems.push(`Need ${limits.variants} exact Python variants; found ${variantIds.size}.`);
  if (families.size < limits.families)
    problems.push(`Need ${limits.families} supported families; found ${families.size}.`);
  return {
    problems,
    notebooks: notebooks.length,
    variants: variantIds.size,
    families: families.size,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(import.meta.dirname, '../../..');
  const notebooks = JSON.parse(
    readFileSync(path.join(root, 'examples/notebooks/manifest.json'), 'utf8'),
  ) as { notebooks: Notebook[] };
  const gallery = JSON.parse(
    readFileSync(path.join(root, 'apps/docs/public/gallery/manifest.json'), 'utf8'),
  ) as { examples: Entry[] };
  const result = checkNotebookCollection(root, notebooks.notebooks, gallery.examples);
  console.log(
    `Site content: ${result.notebooks} notebooks, ${result.variants} exact Python variants, ${result.families} families.`,
  );
  if (result.problems.length) {
    console.error(result.problems.join('\n'));
    process.exitCode = 1;
  } else
    console.log('Notebook downloads, identities and both real-host verification reports match.');
}
