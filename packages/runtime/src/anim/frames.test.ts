import { describe, expect, it, vi } from 'vitest';
import {
  animationOptions,
  computeFrame,
  frameEdits,
  frameIndex,
  frameName,
  fromCurrent,
  insertFrames,
  removeFrames,
  resolveTarget,
  transitionOptions,
} from './frames.ts';

const names = (frames: readonly unknown[]) => frames.map((f, i) => frameName(f, i));

describe('insertFrames / removeFrames (Plotly addFrames / deleteFrames)', () => {
  it('appends in order, names unnamed frames, stringifies names and groups', () => {
    let n = 0;
    const out = insertFrames(
      [{ name: 'frame 0' }],
      [{ name: 1, group: 2 }, {}, 'junk', {}],
      undefined,
      () => n++,
    );
    // 'frame 0' is taken, so the counter moves on.
    expect(names(out)).toEqual(['frame 0', '1', 'frame 1', 'frame 2']);
    expect(out[1]).toEqual({ name: '1', group: '2' });
  });

  it('inserts at indices (clamped), replaces frames by name in place', () => {
    const frames = [{ name: 'a' }, { name: 'b' }];
    const out = insertFrames(
      frames,
      [{ name: 'x' }, { name: 'b', data: [] }, { name: 'y' }],
      [0, 0, 99],
      () => 0,
    );
    expect(names(out)).toEqual(['x', 'a', 'b', 'y']);
    expect(out[2]).toEqual({ name: 'b', data: [] });
    expect(frames).toEqual([{ name: 'a' }, { name: 'b' }]);
    // A null index appends.
    expect(names(insertFrames(frames, [{ name: 'z' }], [null], () => 0))).toEqual(['a', 'b', 'z']);
  });

  it('removes by index, all without indices; out of range throws', () => {
    const frames = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'].map((name) => ({
      name,
    }));
    // Sorted numerically (Plotly sorts lexicographically: [9, 10] would go wrong).
    expect(names(removeFrames(frames, [9, 10, 0]))).toEqual([
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
      'h',
      'i',
    ]);
    expect(removeFrames(frames, undefined)).toEqual([]);
    expect(() => removeFrames(frames, [11])).toThrow(RangeError);
  });
});

describe('computeFrame', () => {
  const frames = [
    {
      name: 'base',
      data: [{ marker: { color: 'red', size: 4 } }],
      traces: [1],
      layout: { title: { text: 'Base' }, annotations: [{ text: 'a' }, { text: 'b' }] },
    },
    {
      name: 'mid',
      baseframe: 'base',
      data: [{ marker: { size: 8 }, x: [1, 2] }, { y: [3] }],
      traces: [1, 0],
      layout: { annotations: [null, { x: 2 }] },
    },
    { name: 'top', baseframe: 'mid', layout: { 'xaxis.range': [0, 1] } },
    { name: 'loop1', baseframe: 'loop2', data: [{ y: [1] }] },
    { name: 'loop2', baseframe: 'loop1', data: [{ y: [2] }] },
  ];
  const index = frameIndex(frames);

  it('merges the baseframe chain, deepest first; arrays replace, layout arrays merge by index', () => {
    const top = computeFrame(index, 'top');
    expect(top).toEqual({
      traces: [1, 0],
      data: [{ marker: { color: 'red', size: 8 }, x: [1, 2] }, { y: [3] }],
      layout: {
        title: { text: 'Base' },
        annotations: [null, { text: 'b', x: 2 }],
        'xaxis.range': [0, 1],
      },
    });
    expect(computeFrame(index, 'nope')).toBeUndefined();
  });

  it('stops at a cycle', () => {
    expect(computeFrame(index, 'loop1')).toEqual({ traces: [0], data: [{ y: [1] }] });
  });

  it('frame edits: attribute strings per trace; out-of-range traces warn', () => {
    const warn = vi.fn();
    const edits = frameEdits(computeFrame(index, 'top')!, 1, warn);
    expect([...edits.traces]).toEqual([[0, { y: [3] }]]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('trace index 1'));
    expect(edits.layout).toEqual({
      'title.text': 'Base',
      'annotations[0]': null,
      'annotations[1].text': 'b',
      'annotations[1].x': 2,
      'xaxis.range': [0, 1],
    });
  });
});

describe('resolveTarget (what animate plays)', () => {
  const frames = [
    { name: 'a', group: 'g' },
    { name: 'b', group: 'g' },
    { name: 'c', group: 1 },
    { group: 'g' },
  ];
  const played = (t: Parameters<typeof resolveTarget>[0]) =>
    resolveTarget(t, frames).map((f) => f.name);

  it('null: every frame; a string or number: a group (never a frame name)', () => {
    expect(played(null)).toEqual(['a', 'b', 'c', 'frame 3']);
    expect(played('g')).toEqual(['a', 'b', 'frame 3']);
    expect(played(1)).toEqual(['c']);
    expect(played('a')).toEqual([]);
  });

  it('a list: names and frame objects (other items skipped); unknown names throw', () => {
    expect(played(['c', null, { data: [] }, 'a'])).toEqual(['c', null, 'a']);
    expect(played([null])).toEqual([]);
    expect(() => played(['a', 'zz'])).toThrow('frame not found: "zz"');
    expect(played({ layout: {} })).toEqual([null]);
  });

  it('fromcurrent plays what follows the current frame (not when it is first or last)', () => {
    const list = resolveTarget(null, frames);
    expect(fromCurrent(list, 'b').map((f) => f.name)).toEqual(['c', 'frame 3']);
    expect(fromCurrent(list, 'a')).toHaveLength(4);
    expect(fromCurrent(list, 'frame 3')).toHaveLength(4);
    expect(fromCurrent(list, null)).toHaveLength(4);
  });
});

describe('animation options', () => {
  it("Plotly's defaults", () => {
    const o = animationOptions(undefined);
    expect([o.mode, o.direction, o.fromcurrent]).toEqual(['afterall', 'forward', false]);
    expect(o.frame(0)).toEqual({ duration: 500, redraw: true });
    expect(o.transition(0)).toEqual({
      duration: 500,
      easing: 'cubic-in-out',
      ordering: 'layout first',
    });
    expect(animationOptions({ mode: 'bogus' as 'next' }).mode).toBe('afterall');
  });

  it('per-frame arrays (the first repeats past the end); transitions capped by frames', () => {
    const o = animationOptions({
      frame: [{ duration: 100 }, { duration: 1000, redraw: false }],
      transition: { duration: 300, easing: 'bounce-out' },
    });
    expect(o.frame(1)).toEqual({ duration: 1000, redraw: false });
    expect(o.frame(5)).toEqual({ duration: 100, redraw: true });
    expect(o.transition(0).duration).toBe(100);
    expect(o.transition(1)).toEqual({
      duration: 300,
      easing: 'bounce-out',
      ordering: 'layout first',
    });
    expect(transitionOptions({ duration: -5, easing: 'nope' })).toMatchObject({
      duration: 500,
      easing: 'cubic-in-out',
    });
  });
});
