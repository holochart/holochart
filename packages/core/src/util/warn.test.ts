import { afterEach, describe, expect, it, vi } from 'vitest';
import { deprecate, warnOnce } from './warn.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('warnOnce', () => {
  it('warns once per key, per warn function', () => {
    const a = vi.fn();
    const b = vi.fn();
    warnOnce('k', 'first', a);
    warnOnce('k', 'again', a);
    warnOnce('other', 'second', a);
    warnOnce('k', 'first', b);
    expect(a.mock.calls).toEqual([['first'], ['second']]);
    expect(b.mock.calls).toEqual([['first']]);
  });

  it('goes to console.warn by default', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnOnce('warn.test:default', 'hello');
    warnOnce('warn.test:default', 'hello');
    expect(warn.mock.calls).toEqual([['hello']]);
  });
});

describe('deprecate', () => {
  it('prefixes the message and keeps its keys apart from other warnings', () => {
    const warn = vi.fn();
    warnOnce('config.foo', 'plain', warn);
    deprecate('config.foo', '`config.foo` is deprecated; use `config.bar`.', warn);
    deprecate('config.foo', '`config.foo` is deprecated; use `config.bar`.', warn);
    expect(warn.mock.calls).toEqual([
      ['plain'],
      ['[holochart] `config.foo` is deprecated; use `config.bar`.'],
    ]);
  });
});
