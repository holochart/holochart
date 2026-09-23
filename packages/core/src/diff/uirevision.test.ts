import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fixtureRegistry } from '../__fixtures__/modules.ts';
import type { FigureInput } from '../defaults/types.ts';
import { diffFigures } from './diff.ts';
import { applyUirevision, createUiState, recordGuiEdit, type UiState } from './uirevision.ts';

const registry = fixtureRegistry();

/** Simulate a zoom on `xaxis`: record both paths Plotly's zoom touches. */
function zoom(state: UiState, before: FigureInput, range: [number, number]): void {
  const xaxis = ((before.layout as { xaxis?: Record<string, unknown> }).xaxis ?? {}) as Record<
    string,
    unknown
  >;
  recordGuiEdit(state, { kind: 'layout' }, 'xaxis.range', xaxis['range'], range);
  recordGuiEdit(state, { kind: 'layout' }, 'xaxis.autorange', xaxis['autorange'], false);
}

const layoutOf = (f: FigureInput) => f.layout as Record<string, Record<string, unknown>>;

describe('applyUirevision: layout', () => {
  const x = [1, 2, 3];
  const prev: FigureInput = { data: [{ x, y: x }], layout: { uirevision: 'u', title: 'a' } };

  it('keeps the zoom while uirevision is unchanged', () => {
    const state = createUiState();
    zoom(state, prev, [1, 2]);
    const next: FigureInput = { data: [{ x, y: x }], layout: { uirevision: 'u', title: 'b' } };
    const before = structuredClone(next);
    const out = applyUirevision(prev, next, state);
    expect(layoutOf(out)['xaxis']).toEqual({ range: [1, 2], autorange: false });
    expect(layoutOf(out)['title']).toBe('b');
    expect(next).toEqual(before);
    expect(out.data).toBe(next.data);
    expect(state.layout.size).toBe(2);
    // Still kept on the following update.
    const again = applyUirevision(out, { ...next }, state);
    expect(layoutOf(again)['xaxis']).toEqual({ range: [1, 2], autorange: false });
  });

  it('drops the zoom when uirevision changes, and does not resurrect it later', () => {
    const state = createUiState();
    zoom(state, prev, [1, 2]);
    const next: FigureInput = { data: prev.data, layout: { uirevision: 'v' } };
    expect(applyUirevision(prev, next, state)).toBe(next);
    expect(state.layout.size).toBe(0);
    expect(applyUirevision(next, { layout: { uirevision: 'u' } }, state).layout).toEqual({
      uirevision: 'u',
    });
  });

  it('drops the zoom when uirevision is unset', () => {
    const state = createUiState();
    const plain: FigureInput = { layout: {} };
    zoom(state, plain, [1, 2]);
    const next: FigureInput = { layout: {} };
    expect(applyUirevision(plain, next, state)).toBe(next);
    expect(state.layout.size).toBe(0);
  });

  it('lets the app win when it sets the value itself', () => {
    const state = createUiState();
    zoom(state, prev, [1, 2]);
    const next: FigureInput = { layout: { uirevision: 'u', xaxis: { range: [5, 6] } } };
    const out = applyUirevision(prev, next, state);
    // The app's range wins; autorange was untouched by the app, so the GUI value still applies.
    expect(layoutOf(out)['xaxis']).toEqual({ range: [5, 6], autorange: false });
    expect([...state.layout.keys()]).toEqual(['xaxis.autorange']);
  });

  it('compares pre-GUI values by value (fresh literals count as unchanged)', () => {
    const withRange: FigureInput = { layout: { uirevision: 'u', xaxis: { range: [0, 10] } } };
    const state = createUiState();
    zoom(state, withRange, [2, 3]);
    const next: FigureInput = { layout: { uirevision: 'u', xaxis: { range: [0, 10] } } };
    expect(layoutOf(applyUirevision(withRange, next, state))['xaxis']).toEqual({
      range: [2, 3],
      autorange: false,
    });
  });

  it('compares uirevision values by value', () => {
    const state = createUiState();
    const p: FigureInput = { layout: { uirevision: { v: 1 } } };
    zoom(state, p, [1, 2]);
    const out = applyUirevision(p, { layout: { uirevision: { v: 1 } } }, state);
    expect(layoutOf(out)['xaxis']?.['range']).toEqual([1, 2]);
  });

  it('returns next unchanged when the app already echoes the GUI value', () => {
    const state = createUiState();
    recordGuiEdit(state, { kind: 'layout' }, 'xaxis.range', undefined, [1, 2]);
    const next: FigureInput = { layout: { uirevision: 'u' } };
    expect(applyUirevision(prev, next, state)).not.toBe(next);
    const echoed: FigureInput = { layout: { uirevision: 'u', xaxis: { range: [1, 2] } } };
    // The app now holds [1, 2], not the pre-GUI `undefined`: the app owns the value from here on.
    expect(applyUirevision(prev, echoed, state)).toBe(echoed);
  });

  it('keeps the first pre-GUI value across repeated GUI edits', () => {
    const state = createUiState();
    recordGuiEdit(state, { kind: 'layout' }, 'xaxis.range', undefined, [1, 2]);
    recordGuiEdit(state, { kind: 'layout' }, 'xaxis.range', [1, 2], [3, 4]);
    expect(state.layout.get('xaxis.range')).toEqual({ preGui: undefined, gui: [3, 4] });
    const out = applyUirevision(prev, { layout: { uirevision: 'u' } }, state);
    expect(layoutOf(out)['xaxis']?.['range']).toEqual([3, 4]);
  });

  it('normalizes paths and supports subplot axes and indexed paths', () => {
    const state = createUiState();
    recordGuiEdit(state, { kind: 'layout' }, 'xaxis2.range[1]', undefined, 9);
    expect([...state.layout.keys()]).toEqual(['xaxis2.range[1]']);
    const out = applyUirevision(prev, { layout: { uirevision: 'u' } }, state);
    expect(layoutOf(out)['xaxis2']).toEqual({ range: [undefined, 9] });
    expect(() => recordGuiEdit(state, { kind: 'layout' }, 'a..b', 1, 2)).toThrow();
  });

  it('drops an edit whose path now runs through a non-container', () => {
    const state = createUiState();
    recordGuiEdit(state, { kind: 'layout' }, 'xaxis.range', undefined, [1, 2]);
    const next: FigureInput = { layout: { uirevision: 'u', xaxis: 'oops' } };
    expect(applyUirevision(prev, next, state)).toBe(next);
    expect(state.layout.size).toBe(0);
  });

  it('shares untouched objects with next', () => {
    const state = createUiState();
    zoom(state, prev, [1, 2]);
    const yaxis = { range: [0, 1] };
    const next: FigureInput = { data: [{ x }], layout: { uirevision: 'u', yaxis } };
    const out = applyUirevision(prev, next, state);
    expect(layoutOf(out)['yaxis']).toBe(yaxis);
    expect(out.data).toBe(next.data);
  });

  it('yields a figure whose diff against the zoomed state keeps the range', () => {
    const state = createUiState();
    zoom(state, prev, [1, 2]);
    // The API applied the zoom to the current input via relayout.
    const current: FigureInput = {
      data: prev.data,
      layout: { uirevision: 'u', title: 'a', xaxis: { range: [1, 2], autorange: false } },
    };
    const next: FigureInput = { data: prev.data, layout: { uirevision: 'u', title: 'b' } };
    const d = diffFigures(current, applyUirevision(current, next, state), registry);
    expect(d.changes).toEqual([{ target: 'layout', path: 'title' }]);

    const reset: FigureInput = { data: prev.data, layout: { uirevision: 'new', title: 'a' } };
    const d2 = diffFigures(current, applyUirevision(current, reset, state), registry);
    expect(d2.changes.map((c) => c.path).sort()).toEqual([
      'uirevision',
      'xaxis.autorange',
      'xaxis.range',
    ]);
  });
});

describe('applyUirevision: traces', () => {
  it('keeps a legend toggle on a uid trace, following it when traces are reordered', () => {
    const a = { uid: 'a', name: 'A' };
    const b = { uid: 'b', name: 'B' };
    const prev: FigureInput = { data: [a, b], layout: { uirevision: 1 } };
    const state = createUiState();
    recordGuiEdit(state, { kind: 'trace', uid: 'b', index: 1 }, 'visible', undefined, 'legendonly');
    const next: FigureInput = { data: [{ ...b }, a], layout: { uirevision: 1 } };
    const out = applyUirevision(prev, next, state);
    expect(out.data).toEqual([{ uid: 'b', name: 'B', visible: 'legendonly' }, a]);
    expect(out.data?.[1]).toBe(a);
    expect(next.data?.[0]).toEqual(b);
  });

  it('uses trace.uirevision over layout.uirevision', () => {
    const state = createUiState();
    recordGuiEdit(state, { kind: 'trace', uid: 'a', index: 0 }, 'visible', undefined, false);
    const prev: FigureInput = { data: [{ uid: 'a', uirevision: 't1' }], layout: { uirevision: 1 } };
    // Layout revision changed, trace revision did not: keep.
    const kept = applyUirevision(
      prev,
      { data: [{ uid: 'a', uirevision: 't1' }], layout: { uirevision: 2 } },
      state,
    );
    expect(kept.data).toEqual([{ uid: 'a', uirevision: 't1', visible: false }]);
    // Trace revision changed: drop.
    const next: FigureInput = { data: [{ uid: 'a', uirevision: 't2' }], layout: { uirevision: 2 } };
    expect(applyUirevision(prev, next, state)).toBe(next);
    expect(state.traces.size).toBe(0);
  });

  it('falls back to layout.uirevision for traces without their own', () => {
    const state = createUiState();
    recordGuiEdit(state, { kind: 'trace', index: 0 }, 'visible', undefined, 'legendonly');
    const prev: FigureInput = { data: [{}], layout: { uirevision: 'r' } };
    const out = applyUirevision(prev, { data: [{ x: [1] }], layout: { uirevision: 'r' } }, state);
    expect(out.data).toEqual([{ x: [1], visible: 'legendonly' }]);
    const next: FigureInput = { data: [{}], layout: { uirevision: 's' } };
    expect(applyUirevision(prev, next, state)).toBe(next);
  });

  it('drops index-keyed edits when the trace is gone or gained a uid', () => {
    const prev: FigureInput = { data: [{}, {}], layout: { uirevision: 'r' } };
    const state = createUiState();
    recordGuiEdit(state, { kind: 'trace', index: 1 }, 'visible', undefined, false);
    const shorter: FigureInput = { data: [{}], layout: { uirevision: 'r' } };
    expect(applyUirevision(prev, shorter, state)).toBe(shorter);
    expect(state.traces.size).toBe(0);

    recordGuiEdit(state, { kind: 'trace', index: 1 }, 'visible', undefined, false);
    const withUid: FigureInput = { data: [{}, { uid: 'z' }], layout: { uirevision: 'r' } };
    expect(applyUirevision(prev, withUid, state)).toBe(withUid);
    expect(state.traces.size).toBe(0);
  });

  it('drops uid-keyed edits when the uid disappears', () => {
    const state = createUiState();
    recordGuiEdit(state, { kind: 'trace', uid: 'a', index: 0 }, 'visible', undefined, false);
    const prev: FigureInput = { data: [{ uid: 'a' }], layout: { uirevision: 'r' } };
    const next: FigureInput = { data: [{ uid: 'b' }], layout: { uirevision: 'r' } };
    expect(applyUirevision(prev, next, state)).toBe(next);
    expect(state.traces.size).toBe(0);
  });
});

describe('applyUirevision: properties', () => {
  const value = fc.oneof(
    fc.constantFrom(undefined, null, 1, 'u', 'legendonly', false),
    fc.array(fc.integer(), { maxLength: 2 }),
  );
  const figure = fc.record(
    {
      data: fc.array(
        fc.oneof(
          fc.record(
            { uid: fc.constantFrom('a', 'b', undefined), uirevision: value, visible: value },
            { requiredKeys: [] },
          ),
          value,
        ),
        { maxLength: 3 },
      ),
      layout: fc.oneof(
        fc.record(
          { uirevision: value, xaxis: fc.oneof(fc.record({ range: value }), value) },
          { requiredKeys: [] },
        ),
        value,
      ),
    },
    { requiredKeys: [] },
  ) as fc.Arbitrary<FigureInput>;
  const edit = fc.record({
    target: fc.oneof(
      fc.constant({ kind: 'layout' as const }),
      fc.record({
        kind: fc.constant('trace' as const),
        uid: fc.constantFrom('a', 'b', undefined),
        index: fc.nat(3),
      }),
    ),
    path: fc.constantFrom('xaxis.range', 'xaxis.range[0]', 'visible', 'xaxis.autorange'),
    pre: value,
    gui: value,
  });

  it('never throws or mutates its inputs, and shares next when nothing is kept', () => {
    fc.assert(
      fc.property(figure, figure, fc.array(edit, { maxLength: 4 }), (prev, next, edits) => {
        const state = createUiState();
        for (const e of edits) recordGuiEdit(state, e.target, e.path, e.pre, e.gui);
        const before = structuredClone([prev, next]);
        const out = applyUirevision(prev, next, state);
        expect([prev, next]).toEqual(before);
        if (state.layout.size === 0 && state.traces.size === 0) expect(out).toBe(next);
      }),
    );
  });
});
