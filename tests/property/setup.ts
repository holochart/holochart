/**
 * Vitest setup file (vitest.config.ts `setupFiles`): makes every fast-check property reproducible
 * (plan E20.1).
 *
 * - Before each test, fast-check's global seed is set: `FC_SEED` when given (CI passes the commit
 *   SHA), otherwise a fresh random seed per test (and per `--repeats` repetition). Properties that
 *   pass their own `seed` keep it.
 * - A global plugin appends the seed, the counterexample path and the exact command that replays
 *   the failure to every failing property's error.
 * - A test that fails for another reason after running a property (a timeout, an assertion outside
 *   the property) prints its seed and replay command to stderr.
 *
 * Helpers and the environment variables are documented in `tests/property/seed.ts`.
 */
import path from 'node:path';
import * as fc from 'fast-check';
import { beforeEach } from 'vitest';
import { parseSeed, randomSeed, replayHint, type PropertyLocation } from './seed.ts';

interface TestState {
  seed: number;
  loc: PropertyLocation;
  /** A property ran in this test. */
  ran: boolean;
  /** A property failure already carries the replay hint. */
  reported: boolean;
}

const fixedSeed = parseSeed(process.env['FC_SEED']);
const replayPath = process.env['FC_PATH']?.trim() || undefined;
if (replayPath !== undefined && fixedSeed === undefined) {
  throw new Error('FC_PATH replays a counterexample of a known run: set FC_SEED too.');
}

// fast-check is loaded once per worker while this file runs once per test file, so the plugin
// (installed once per fast-check instance) reads the current test from a global.
const STATE = Symbol.for('holochart.fc-seeding.state');
const INSTALLED = Symbol.for('holochart.fc-seeding.installed');
type Globals = { [STATE]?: TestState; [INSTALLED]?: WeakSet<object> };
const globals = globalThis as Globals;

const reportPlugin: fc.Plugin<unknown> = () => {
  const state = globals[STATE];
  if (state) state.ran = true;
  return {
    onAllRunsComplete(details) {
      if (!details.failed || !state) return;
      state.reported = true;
      const hint = replayHint(state.loc, details.seed, details.counterexamplePath ?? undefined);
      throw new Error(`${fc.defaultReportMessage(details)}\n\n${hint}`, {
        cause: details.errorInstance,
      });
    },
  };
};

const installed = (globals[INSTALLED] ??= new WeakSet());
if (!installed.has(fc.installGlobalPlugin)) {
  installed.add(fc.installGlobalPlugin);
  fc.installGlobalPlugin(reportPlugin);
}

beforeEach((ctx) => {
  const seed = fixedSeed ?? randomSeed();
  const state: TestState = {
    seed,
    loc: {
      file: path.relative(process.cwd(), ctx.task.file.filepath),
      test: ctx.task.fullTestName,
    },
    ran: false,
    reported: false,
  };
  globals[STATE] = state;
  // `path` is not a typed global parameter, but the runner merges globals into every run.
  const replay = replayPath === undefined ? {} : { path: replayPath, endOnFailure: true };
  fc.configureGlobal({ seed, ...replay } as fc.GlobalParameters);

  ctx.onTestFailed(() => {
    if (!state.ran || state.reported) return;
    console.error(
      `[fast-check] "${state.loc.test}" failed after running a property.\n${replayHint(state.loc, seed)}`,
    );
  });
});
