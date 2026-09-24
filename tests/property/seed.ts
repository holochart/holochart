/**
 * fast-check seeding for the unit suite (plan E20.1). Pure helpers, used by the Vitest setup file
 * `tests/property/setup.ts`; see CONTRIBUTING.md ("Property tests") for the workflow.
 *
 * Environment:
 * - `FC_SEED`: the seed of every fast-check property. A 32-bit integer, or a git commit SHA (CI
 *   passes the commit, so a PR run is reproducible from its commit alone). Unset: every test draws
 *   a fresh random seed (local runs, nightly).
 * - `FC_PATH`: replay one counterexample directly (with `FC_SEED`; filter to that one test with
 *   `-t`, since the path belongs to one property). Implies `endOnFailure`.
 */

/** Largest number of leading hex digits a SHA contributes to a seed (32 bits). */
const HEX_DIGITS = 8;

/**
 * Parse `FC_SEED`: a decimal 32-bit integer (as fast-check prints seeds) or a hex commit SHA (7–40
 * digits, the first 8 give the seed). Returns `undefined` for an unset/empty value and throws for
 * anything else, so a typo never silently falls back to random seeds.
 */
export function parseSeed(raw: string | undefined): number | undefined {
  const s = raw?.trim() ?? '';
  if (s === '') return undefined;
  if (/^-?\d{1,10}$/.test(s)) {
    const n = Number(s);
    if (n >= -0x80000000 && n <= 0xffffffff) return n | 0;
  }
  if (/^[0-9a-f]{7,40}$/i.test(s)) return Number.parseInt(s.slice(0, HEX_DIGITS), 16) | 0;
  throw new Error(
    `FC_SEED must be a 32-bit integer or a git commit SHA (7–40 hex digits), got "${raw}".`,
  );
}

/** A fresh random 32-bit seed. */
export function randomSeed(): number {
  return crypto.getRandomValues(new Int32Array(1))[0]!;
}

/** Quote a string for a POSIX shell (single quotes). */
export function shellQuote(s: string): string {
  return /^[\w./:=@%+-]+$/.test(s) ? s : `'${s.replaceAll("'", `'\\''`)}'`;
}

/** A `-t` pattern that matches exactly one full test name (Vitest reads `-t` as a RegExp). */
export function exactNamePattern(fullName: string): string {
  return `^${fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
}

/** Where a property ran: the test file (relative to the repo root) and the full test name. */
export interface PropertyLocation {
  file: string;
  /** Vitest's full test name (`describe > … > test`), as matched by `-t`. */
  test: string;
}

/**
 * The command that replays a property run: the same seed (and the counterexample path when one is
 * known) on just that test.
 */
export function replayCommand(loc: PropertyLocation, seed: number, path?: string): string {
  const env = [`FC_SEED=${seed}`];
  if (path !== undefined && path !== '') env.push(`FC_PATH=${shellQuote(path)}`);
  return `${env.join(' ')} pnpm test ${shellQuote(loc.file)} -t ${shellQuote(exactNamePattern(loc.test))}`;
}

/** The text appended to a failure: seed, path and the replay command. */
export function replayHint(loc: PropertyLocation, seed: number, path?: string): string {
  const lines = [`fast-check seed: ${seed}${path ? `, path: "${path}"` : ''}`];
  lines.push(`Replay: ${replayCommand(loc, seed, path)}`);
  if (path) lines.push(`Replay the whole run (search + shrink): ${replayCommand(loc, seed)}`);
  return lines.join('\n');
}
