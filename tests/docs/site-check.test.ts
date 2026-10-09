import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkNotebookCollection } from '../../apps/docs/scripts/site-check.ts';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'holochart-site-check-'));
  roots.push(root);
  const put = (file: string, text: string) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  };
  const code = 'from holochart import HolochartWidget\n';
  const hash = createHash('sha256').update(code).digest('hex');
  const artifact = 'docs/site/proof/README.md';
  const verification = { state: 'rendered', browserVerified: true, sourceSha256: hash, artifact };
  const notebooks = [
    {
      slug: 'starter',
      source: 'examples/notebooks/starter.py',
      notebook: 'examples/notebooks/starter.ipynb',
      goal: 'First chart',
      prerequisites: ['Widget-enabled kernel'],
      tutorialMinutes: 5,
      dataProvenance: 'Synthetic local data.',
      dependencies: ['holochart-py'],
      expectedWidgetOutputs: 1,
      verification,
      galleryVariants: [
        {
          id: 'bar/starter',
          source: 'examples/notebooks/variants/bar-starter.py',
          download: '/notebooks/variants/bar-starter.py',
          sourceSha256: hash,
          expectedWidgetOutputs: 1,
          verification,
        },
      ],
    },
  ];
  const nb = JSON.stringify({
    cells: [{ cell_type: 'code', source: code, execution_count: null, outputs: [] }],
  });
  for (const file of [
    notebooks[0]!.source,
    notebooks[0]!.galleryVariants[0]!.source,
    'apps/docs/public/notebooks/starter.py',
    'apps/docs/public/notebooks/variants/bar-starter.py',
  ])
    put(file, code);
  for (const file of [notebooks[0]!.notebook, 'apps/docs/public/notebooks/starter.ipynb'])
    put(file, nb);
  put(artifact, '# Real-host evidence');
  const records = [
    { slug: 'starter', sourceSha256: hash, canvases: 1, errors: [] },
    {
      slug: 'gallery-bar-starter',
      exampleId: 'bar/starter',
      sourceSha256: hash,
      canvases: 1,
      errors: [],
    },
  ];
  for (const host of ['lab', 'notebooks'])
    put(`docs/site/proof/${host}.json`, JSON.stringify(records));
  const check = () =>
    checkNotebookCollection(root, notebooks, [{ id: 'bar/starter', primaryFamily: 'basic' }], {
      notebooks: 1,
      variants: 1,
      families: 1,
    });
  return { root, put, notebooks, check };
}

describe('site artifact and real-host gates', () => {
  it('accepts matching distributed code and both real-host records', () => {
    expect(fixture().check().problems).toEqual([]);
  });
  it('rejects a missing download with its affected path', () => {
    const f = fixture();
    rmSync(path.join(f.root, 'apps/docs/public/notebooks/variants/bar-starter.py'));
    expect(f.check().problems.join('\n')).toContain(
      'Missing or unsafe artifact: apps/docs/public/notebooks/variants/bar-starter.py',
    );
  });
  it('invalidates browser claims after canonical source edits', () => {
    const f = fixture();
    f.put(f.notebooks[0]!.source, 'print("changed source")\n');
    expect(f.check().problems.join('\n')).toContain(
      'starter: execution/browser verification is missing or stale',
    );
  });
  it('rejects a stale taxonomy identity even when files and proofs exist', () => {
    const f = fixture();
    f.notebooks[0]!.galleryVariants[0]!.id = 'missing/type';
    expect(f.check().problems).toContain('missing/type: unknown gallery example.');
  });
  it('rejects a failed or incomplete notebook-host render', () => {
    const f = fixture();
    const file = 'docs/site/proof/notebooks.json';
    const report = JSON.parse(readFileSync(path.join(f.root, file), 'utf8'));
    report[0].canvases = 0;
    report[1].errors = ['Widget failed to render'];
    f.put(file, JSON.stringify(report));
    expect(
      f.check().problems.filter((p) => p.includes('notebooks rendering evidence')),
    ).toHaveLength(2);
  });
  it('rejects distributed notebook execution noise', () => {
    const f = fixture();
    const noisy = JSON.stringify({
      cells: [{ cell_type: 'code', execution_count: 4, outputs: ['cached'] }],
    });
    f.put(f.notebooks[0]!.notebook, noisy);
    f.put('apps/docs/public/notebooks/starter.ipynb', noisy);
    expect(f.check().problems).toContain(
      'starter: distributed notebook contains transient execution output.',
    );
  });
});
