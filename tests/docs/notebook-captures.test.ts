import { describe, expect, it } from 'vitest';
import { captureDifference } from '../../tools/gallery-gen/src/compare-captures.ts';

const capture = (z: unknown, hash = 'source-hash') => ({
  figure: { data: [{ z }] },
  sourceHashes: { 'surface/basic.ts': hash },
  meta: { title: 'Surface', testTolerance: 0.004 },
});

describe('notebook capture comparison across Node versions', () => {
  it('accepts observed Node 22/26 surface rounding without rewriting canonical figures', () => {
    expect(
      captureDifference(
        capture([[0.00015363350254360054, -0.04247396008360293]]),
        capture([[0.00015363350254360048, -0.042473960083602984]]),
      ),
    ).toBeUndefined();
  });

  it('rejects meaningful figure changes and altered array shape', () => {
    expect(captureDifference(capture([1]), capture([1.000001]))).toBe('$.figure.data.0.z.0');
    expect(captureDifference(capture([1]), capture([1, 2]))).toBe('$.figure.data.0.z.length');
    expect(captureDifference(capture([1]), capture({ '0': 1 }))).toBe('$.figure.data.0.z');
  });

  it('still requires exact source hashes, metadata, and object keys', () => {
    const original = capture([1]);
    expect(captureDifference(original, capture([1], 'changed'))).toBe(
      '$.sourceHashes.surface/basic.ts',
    );
    expect(
      captureDifference(original, {
        ...original,
        meta: { ...original.meta, testTolerance: 0.004 + Number.EPSILON },
      }),
    ).toBe('$.meta.testTolerance');
    expect(captureDifference(original, { ...original, extra: true })).toBe('$ (keys)');
  });
});
