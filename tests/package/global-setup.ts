import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFixtures } from './fixtures.ts';
import { getPacks } from './packs.ts';
import { serveStatic } from './server.ts';

/**
 * Packs the packages, installs them into the fixture projects in a fresh directory outside the
 * workspace (`$PACKAGE_FIXTURES` for the specs) and serves it; the returned teardown stops the
 * server and deletes the directory (kept with `PACKAGE_KEEP=1`).
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'holochart-package-'));
  process.env.PACKAGE_FIXTURES = root;
  console.log(`Package fixtures: ${root}`);
  let server: Server;
  try {
    const packs = getPacks(join(root, 'packs'));
    console.log(
      `Installing ${packs.length} tarballs:\n${packs.map((p) => `  ${p.tarball}`).join('\n')}`,
    );
    createFixtures(root, packs);
    server = await serveStatic(root);
  } catch (error) {
    if (!process.env.PACKAGE_KEEP) rmSync(root, { recursive: true, force: true });
    throw error;
  }
  return async () => {
    await new Promise((resolve) => server.close(resolve));
    if (process.env.PACKAGE_KEEP) console.log(`Kept package fixtures: ${root}`);
    else rmSync(root, { recursive: true, force: true });
  };
}
