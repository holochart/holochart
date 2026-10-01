import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { withoutNpmConfig } from './fixtures.ts';

/** The fixture project `name`'s directory (set up by `global-setup.ts`). */
export function fixtureDir(name: string): string {
  const root = process.env.PACKAGE_FIXTURES;
  if (!root)
    throw new Error('PACKAGE_FIXTURES is not set; run with tests/package/playwright.config.ts');
  return join(root, name);
}

/**
 * Run `command` in fixture `name` (a binary of its own `node_modules/.bin`, or `node`); throws
 * with the output when it fails, and returns the output otherwise.
 */
export function runIn(name: string, command: string, args: readonly string[]): string {
  const cwd = fixtureDir(name);
  const bin = command === 'node' ? process.execPath : join(cwd, 'node_modules/.bin', command);
  const result = spawnSync(bin, args, {
    cwd,
    encoding: 'utf8',
    env: withoutNpmConfig(process.env),
    timeout: 110_000,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed in ${name} (exit ${result.status}):\n${output}`,
    );
  }
  return output;
}
