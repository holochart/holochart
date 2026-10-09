/** Refresh only taxonomy/source metadata. Does not render or re-encode thumbnails. */
import { migrateManifest, readManifest, writeManifest } from './manifest.ts';

const previous = readManifest();
if (!previous)
  throw new Error('Gallery manifest is missing. Generate thumbnails first with pnpm gallery.');
const manifest = migrateManifest(previous);
await writeManifest(manifest);
console.log(
  `gallery metadata: migrated ${manifest.examples.length} entries to version ${manifest.version}; thumbnails retained.`,
);
