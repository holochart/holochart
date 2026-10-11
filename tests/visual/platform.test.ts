import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { listExampleIds } from './examples.ts';
import { BASELINE_PLATFORM, baselinePlatformOf, gatesBaseline } from './platform.ts';

const LISTED = 'demos/tqqq-soxl/drawdowns';

describe('gatesBaseline', () => {
  it('gates an example that is not listed, on any machine', () => {
    expect(baselinePlatformOf('scatter/basic')).toBeUndefined();
    // Not an own key of the list.
    expect(baselinePlatformOf('toString')).toBeUndefined();
    for (const platform of ['linux', 'darwin', 'win32']) {
      expect(gatesBaseline('scatter/basic', platform, false)).toBe(true);
      expect(gatesBaseline('scatter/basic', platform, true)).toBe(true);
    }
  });

  it("gates a listed example on its baseline's platform only, outside CI", () => {
    expect(baselinePlatformOf(LISTED)).toBe('linux');
    expect(gatesBaseline(LISTED, 'linux', false)).toBe(true);
    expect(gatesBaseline(LISTED, 'darwin', false)).toBe(false);
    expect(gatesBaseline(LISTED, 'win32', false)).toBe(false);
  });

  it('always gates in CI', () => {
    expect(gatesBaseline(LISTED, 'linux', true)).toBe(true);
    expect(gatesBaseline(LISTED, 'darwin', true)).toBe(true);
  });

  it('lists only examples that exist', () => {
    const ids = new Set(listExampleIds(path.resolve(import.meta.dirname, '../../examples')));
    for (const id of Object.keys(BASELINE_PLATFORM)) expect(ids.has(id), id).toBe(true);
  });
});
