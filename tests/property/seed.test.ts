import { describe, expect, it } from 'vitest';
import {
  exactNamePattern,
  parseSeed,
  randomSeed,
  replayCommand,
  replayHint,
  shellQuote,
} from './seed.ts';

describe('parseSeed', () => {
  it('is undefined when unset or empty', () => {
    expect(parseSeed(undefined)).toBeUndefined();
    expect(parseSeed('')).toBeUndefined();
    expect(parseSeed('  ')).toBeUndefined();
  });

  it('reads decimal 32-bit seeds as fast-check prints them', () => {
    expect(parseSeed('42')).toBe(42);
    expect(parseSeed('-684789228')).toBe(-684789228);
    expect(parseSeed('2147483647')).toBe(2147483647);
    expect(parseSeed('4294967295')).toBe(-1);
  });

  it('derives a seed from a commit SHA (first 8 hex digits)', () => {
    const sha = 'b4e5d00c9a1f2e3d4c5b6a79881726354a5b6c7d';
    expect(parseSeed(sha)).toBe(0xb4e5d00c | 0);
    expect(parseSeed(sha.toUpperCase())).toBe(parseSeed(sha));
    expect(parseSeed('b4e5d00')).toBe(0xb4e5d00);
  });

  it('rejects anything else', () => {
    expect(() => parseSeed('nope')).toThrow(/FC_SEED/);
    expect(() => parseSeed('1.5')).toThrow(/FC_SEED/);
    expect(() => parseSeed('0x1f')).toThrow(/FC_SEED/);
    expect(() => parseSeed('a'.repeat(41))).toThrow(/FC_SEED/);
  });
});

describe('randomSeed', () => {
  it('returns 32-bit integers', () => {
    for (let i = 0; i < 20; i++) {
      const s = randomSeed();
      expect(s | 0).toBe(s);
    }
  });
});

describe('replay commands', () => {
  const loc = { file: 'packages/core/src/x.test.ts', test: "props > '@' text (fixed point)" };

  it('quotes for a POSIX shell only when needed', () => {
    expect(shellQuote('1:0:2')).toBe('1:0:2');
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
  });

  it('matches exactly one test name', () => {
    const re = new RegExp(exactNamePattern(loc.test));
    expect(re.test(loc.test)).toBe(true);
    expect(re.test(`${loc.test} 2`)).toBe(false);
  });

  it('replays with the seed and, when known, the counterexample path', () => {
    expect(replayCommand(loc, -5)).toBe(
      `FC_SEED=-5 pnpm test packages/core/src/x.test.ts -t '^props > '\\''@'\\'' text \\(fixed point\\)$'`,
    );
    expect(replayCommand(loc, 7, '3:1:0')).toMatch(/^FC_SEED=7 FC_PATH=3:1:0 pnpm test /);
    const hint = replayHint(loc, 7, '3:1:0');
    expect(hint).toContain('fast-check seed: 7, path: "3:1:0"');
    expect(hint.split('\n')).toHaveLength(3);
    expect(replayHint(loc, 7).split('\n')).toHaveLength(2);
  });
});
