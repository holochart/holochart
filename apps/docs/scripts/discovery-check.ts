/** Editorial task replay; this is not observed human usage or an analytics feed. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { familyStarters } from '../../../examples/_lib/curation.ts';
import {
  emptyFilters,
  filterExamples,
  hasVerifiedLanguage,
  type BrowsableExample,
} from '../.vitepress/theme/gallery-state.ts';

export function replayDiscovery(examples: readonly BrowsableExample[]) {
  return Object.entries(familyStarters).flatMap(([family, tasks]) =>
    tasks.map(({ id, task }) => {
      const global = filterExamples(examples, { ...emptyFilters(), q: task });
      const local = filterExamples(examples, { ...emptyFilters(family), q: task });
      const python = filterExamples(examples, {
        ...emptyFilters(family),
        q: task,
        language: 'python',
      });
      const expected = examples.find((e) => e.id === id);
      return {
        family,
        query: task,
        expectedId: id,
        globalResults: global.length,
        globalRank: global.findIndex((e) => e.id === id) + 1,
        familyResults: local.length,
        familyRank: local.findIndex((e) => e.id === id) + 1,
        verifiedPython: expected ? hasVerifiedLanguage(expected, 'python') : false,
        pythonIds: python.map((e) => e.id),
      };
    }),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(import.meta.dirname, '../../..');
  const manifestFile = path.join(root, 'apps/docs/public/gallery/manifest.json');
  const { examples } = JSON.parse(readFileSync(manifestFile, 'utf8')) as {
    examples: BrowsableExample[];
  };
  const tasks = replayDiscovery(examples);
  const sha = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
  const report = {
    checkedAt: new Date().toISOString(),
    method:
      'Replay the 33 source-reviewed beginner task descriptions as literal gallery queries, globally and inside their family. Editorial regression evidence only; no participants, analytics, startup timings or completion-time claims.',
    identities: {
      manifestSha256: sha(manifestFile),
      taskSourceSha256: sha(path.join(root, 'examples/_lib/curation.ts')),
      searchSourceSha256: sha(path.join(root, 'apps/docs/.vitepress/theme/gallery-state.ts')),
    },
    summary: {
      tasks: tasks.length,
      zeroResults: tasks.filter((t) => !t.globalResults).length,
      missingExpected: tasks.filter((t) => !t.globalRank || !t.familyRank).length,
      expectedFirst: tasks.filter((t) => t.globalRank === 1 && t.familyRank === 1).length,
      verifiedPythonTasks: tasks.filter((t) => t.verifiedPython).length,
      pythonSupportLeaks: tasks.filter(
        (t) => !t.verifiedPython && t.pythonIds.includes(t.expectedId),
      ).length,
    },
    tasks,
  };
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf('--report');
  if (outputIndex >= 0) {
    const output = args[outputIndex + 1];
    if (!output) throw new Error('--report requires a file path.');
    writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  }
  console.log('Editorial discovery replay:', JSON.stringify(report.summary));
  if (report.summary.missingExpected || report.summary.pythonSupportLeaks) process.exitCode = 1;
}
