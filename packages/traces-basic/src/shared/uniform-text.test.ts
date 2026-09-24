import type { UniformText, UniformTextItem } from '@mk7s/holochart-core';
import { describe, expect, it, vi } from 'vitest';
import {
  currentUniformTextSize,
  negotiateUniformText,
  releaseUniformText,
} from './uniform-text.ts';

const HIDE: UniformText = { mode: 'hide', minsize: 10 };
const OFF: UniformText = { mode: false, minsize: 0 };

/** A fake trace view: records fixed items and counts refreshes, like a bar or pie view. */
function view(scope: object, items: UniformTextItem[], type = 'bar') {
  const v = {
    items,
    drawn: undefined as number | undefined,
    refreshes: 0,
    uniforms: [] as UniformText[],
    draw(uniform: UniformText): void {
      v.drawn = negotiateUniformText(scope, type, v, v.items, uniform, (u) => {
        v.refreshes++;
        v.uniforms.push(u);
        v.draw(u);
      });
    },
  };
  return v;
}

describe('uniformtext coordinator', () => {
  it('gives every view of a type the smallest size and refreshes the others once', () => {
    const scope = {};
    const a = view(scope, [{ fontSize: 20, scale: 1 }]);
    const b = view(scope, [{ fontSize: 12, scale: 1 }]);
    a.draw(HIDE);
    expect(a.drawn).toBe(20);
    b.draw(HIDE);
    expect(b.drawn).toBe(12);
    // A drew with 20: refreshed synchronously, with the group's uniformtext.
    expect(a.drawn).toBe(12);
    expect(a.refreshes).toBe(1);
    expect(a.uniforms).toEqual([HIDE]);
    expect(b.refreshes).toBe(0);
    // Redrawing with identical items settles without refreshing anyone.
    b.draw(HIDE);
    a.draw(HIDE);
    expect([a.refreshes, b.refreshes]).toEqual([1, 0]);
    expect(currentUniformTextSize(scope, 'bar')).toBe(12);
  });

  it('keeps trace types and charts apart', () => {
    const scope = {};
    const bar = view(scope, [{ fontSize: 20, scale: 1 }], 'bar');
    const pie = view(scope, [{ fontSize: 12, scale: 1 }], 'pie');
    const other = view({}, [{ fontSize: 8, scale: 1 }], 'bar');
    bar.draw(HIDE);
    pie.draw(HIDE);
    other.draw({ mode: 'show', minsize: 0 });
    expect([bar.drawn, pie.drawn, other.drawn]).toEqual([20, 12, 8]);
    expect(bar.refreshes + pie.refreshes + other.refreshes).toBe(0);
  });

  it('ignores hidden candidates for the size', () => {
    const scope = {};
    const a = view(scope, [
      { fontSize: 12, scale: 0.5 },
      { fontSize: 14, scale: 1 },
    ]);
    a.draw(HIDE);
    // 6 px < minsize: a hidden candidate; the size comes from the 14 px label.
    expect(a.drawn).toBe(14);
  });

  it('refreshes the remaining views when one releases, but not from dispose', () => {
    const scope = {};
    const a = view(scope, [{ fontSize: 20, scale: 1 }]);
    const b = view(scope, [{ fontSize: 12, scale: 1 }]);
    const c = view(scope, [{ fontSize: 11, scale: 1 }]);
    a.draw(HIDE);
    b.draw(HIDE);
    c.draw(HIDE);
    expect([a.drawn, b.drawn]).toEqual([11, 11]);
    const before = a.refreshes;
    releaseUniformText(scope, 'bar', c);
    expect([a.drawn, b.drawn]).toEqual([12, 12]);
    expect(a.refreshes).toBe(before + 1);
    releaseUniformText(scope, 'bar', b, false);
    expect(a.drawn).toBe(12);
    expect(a.refreshes).toBe(before + 1);
    expect(currentUniformTextSize(scope, 'bar')).toBe(20);
  });

  it('turns the others off when one view sees the mode off', () => {
    const scope = {};
    const a = view(scope, [{ fontSize: 20, scale: 1 }]);
    const b = view(scope, [{ fontSize: 12, scale: 1 }]);
    a.draw(HIDE);
    b.draw(HIDE);
    b.draw(OFF);
    expect(b.drawn).toBeUndefined();
    expect(a.drawn).toBeUndefined();
    expect(a.uniforms.at(-1)).toEqual(OFF);
    expect(currentUniformTextSize(scope, 'bar')).toBeUndefined();
  });

  it('does nothing without a mode', () => {
    const refresh = vi.fn();
    expect(negotiateUniformText({}, 'bar', {}, [{ fontSize: 12, scale: 1 }], OFF, refresh)).toBe(
      undefined,
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it('stops refreshing a view whose items keep changing', () => {
    const scope = {};
    const a = view(scope, [{ fontSize: 20, scale: 1 }]);
    a.draw(HIDE);
    let size = 12;
    const unstable = {};
    const refresh = vi.fn(() => {
      // Each refresh records a new size: the coordinator must give up after a few rounds.
      negotiateUniformText(scope, 'bar', unstable, [{ fontSize: size--, scale: 1 }], HIDE, refresh);
    });
    negotiateUniformText(scope, 'bar', unstable, [{ fontSize: size, scale: 1 }], HIDE, refresh);
    expect(refresh.mock.calls.length).toBeLessThanOrEqual(4);
  });
});
