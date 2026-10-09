import { writeExampleArtifacts } from './artifacts.ts';
/** Generate standalone source downloads without rerendering gallery thumbnails. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { MANIFEST_FILE, PUBLIC_DIR, REPO_ROOT, readManifest } from './manifest.ts';
import {
  bundleStandalone,
  inputsHash,
  writeStandalone,
  type StandaloneIndex,
} from './standalone.ts';

const manifest = readManifest();
const checkOnly = process.argv.includes('--check');
if (!manifest) throw new Error(`Missing ${MANIFEST_FILE}.`);
const file = path.join(PUBLIC_DIR, 'gallery/sources.json');
const previous: StandaloneIndex & { inputHashes?: Record<string, string> } = existsSync(file)
  ? JSON.parse(readFileSync(file, 'utf8'))
  : { version: 1, examples: {}, failures: {} };
const index: typeof previous = { version: 1, examples: {}, failures: {}, inputHashes: {} };
let generated = 0;
for (const entry of manifest.examples) {
  const old = previous.examples[entry.id];
  if (
    old &&
    old.source === old.javascript &&
    old.inputs.length &&
    old.inputs.every((f) => existsSync(path.join(REPO_ROOT, f))) &&
    previous.inputHashes?.[entry.id] === inputsHash(old.inputs, REPO_ROOT) &&
    [old.source, old.javascript].every((f) => existsSync(path.join(PUBLIC_DIR, f))) &&
    createHash('sha256')
      .update(readFileSync(path.join(PUBLIC_DIR, old.source)))
      .digest('hex') === old.hash
  ) {
    index.examples[entry.id] = old;
    index.inputHashes![entry.id] = previous.inputHashes[entry.id]!;
    continue;
  }
  if (checkOnly)
    throw new Error(`Missing or stale standalone source ${entry.id}. Run docs gen:sources.`);
  try {
    const result = await bundleStandalone(entry, REPO_ROOT);
    if (old?.browserEvidence?.hash === result.artifact.hash && old.verification === 'rendered') {
      result.artifact.verification = 'rendered';
      result.artifact.browserEvidence = old.browserEvidence;
    }
    writeStandalone(result, PUBLIC_DIR);
    index.examples[entry.id] = result.artifact;
    index.inputHashes![entry.id] = inputsHash(result.artifact.inputs, REPO_ROOT);
    generated++;
  } catch (error) {
    index.failures[entry.id] = error instanceof Error ? error.message : String(error);
  }
  if (generated && generated % 100 === 0)
    console.log(`Standalone sources: ${generated} generated.`);
}
if (!checkOnly) writeFileSync(file, `${JSON.stringify(index, null, 2)}\n`);
writeExampleArtifacts(index, { check: checkOnly });
console.log(
  `Standalone sources: ${Object.keys(index.examples).length} available (${generated} generated); ${Object.keys(index.failures).length} need the repository harness.`,
);
