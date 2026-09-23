import { describe, expect, it } from 'vitest';
import {
  modebarAutoscaleUpdate,
  modebarResetUpdate,
  modebarSpikelinesUpdate,
  modebarZoomRange,
  modebarZoomUpdate,
  recordModebarResetState,
  type ModebarAxisLike,
} from './actions.ts';

function axis(
  name: string,
  range: [number, number],
  full: Record<string, unknown> = {},
  l2r: (l: number) => unknown = (l) => l,
): ModebarAxisLike {
  return { name, full, scale: { range, l2r } };
}

describe('modebarZoomRange', () => {
  it('halves or doubles the span about the center', () => {
    expect(modebarZoomRange([0, 10], 0.5)).toEqual([2.5, 7.5]);
    expect(modebarZoomRange([0, 10], 2)).toEqual([-5, 15]);
    expect(modebarZoomRange([-4, 0], 0.5)).toEqual([-3, -1]);
  });

  it('keeps reversed ranges reversed', () => {
    expect(modebarZoomRange([10, 0], 0.5)).toEqual([7.5, 2.5]);
    expect(modebarZoomRange([10, 0], 2)).toEqual([15, -5]);
  });

  it('rejects non-finite ranges and factors', () => {
    expect(modebarZoomRange([Number.NaN, 1], 0.5)).toBeUndefined();
    expect(modebarZoomRange([0, Infinity], 2)).toBeUndefined();
    expect(modebarZoomRange([0, 1], 0)).toBeUndefined();
  });
});

describe('modebarZoomUpdate', () => {
  it('zooms every axis in linear space and converts back with l2r', () => {
    // A log axis: linear coordinates are log10 values; range values are exponents too.
    const log = axis('yaxis2', [0, 4], {}, (l) => l);
    const date = axis('xaxis', [0, 1000], {}, (l) => `t${l}`);
    expect(modebarZoomUpdate([date, log], 0.5)).toEqual({
      'xaxis.range': ['t250', 't750'],
      'yaxis2.range': [1, 3],
    });
  });

  it('skips fixedrange axes and non-finite ranges', () => {
    const fixed = axis('xaxis', [0, 1], { fixedrange: true });
    const broken = axis('yaxis', [Number.NaN, 1]);
    expect(modebarZoomUpdate([fixed, broken, axis('xaxis2', [0, 2])], 2)).toEqual({
      'xaxis2.range': [-1, 3],
    });
  });
});

describe('modebarAutoscaleUpdate', () => {
  it('autoranges every non-fixed axis', () => {
    const axes = [axis('xaxis', [0, 1]), axis('yaxis', [0, 1], { fixedrange: true })];
    expect(modebarAutoscaleUpdate(axes)).toEqual({ 'xaxis.autorange': true });
  });
});

describe('reset axes', () => {
  it('records input ranges and autoranges of axis keys only, copying arrays', () => {
    const range = [1, 5];
    const layout = {
      xaxis: { range, title: 'x' },
      yaxis: { autorange: 'reversed' },
      yaxis3: { title: 'untouched' },
      xaxis_bad: { range: [0, 1] },
      legend: { range: [0, 1] },
    };
    const state = recordModebarResetState(layout);
    range[0] = 99;
    expect([...state.keys()]).toEqual(['xaxis', 'yaxis']);
    expect(state.get('xaxis')).toEqual({ range: [1, 5] });
    expect(state.get('yaxis')).toEqual({ autorange: 'reversed' });
  });

  it('restores recorded ranges and autoranges the rest', () => {
    const state = recordModebarResetState({
      xaxis: { range: ['2024-01-01', '2024-02-01'], autorange: false },
      yaxis: { autorange: 'reversed' },
    });
    const current = { xaxis: { range: [3, 4] }, yaxis2: { range: [0, 1] } };
    const axes = [
      axis('xaxis', [0, 1]),
      axis('yaxis', [0, 1]),
      axis('yaxis2', [0, 1]),
      axis('xaxis2', [0, 1]),
      axis('yaxis3', [0, 1], { fixedrange: true }),
    ];
    expect(modebarResetUpdate(axes, state, current)).toEqual({
      'xaxis.range': ['2024-01-01', '2024-02-01'],
      'xaxis.autorange': false,
      'yaxis.autorange': 'reversed',
      'yaxis2.autorange': true,
      'yaxis2.range': null,
      'xaxis2.autorange': true,
    });
  });
});

describe('modebarSpikelinesUpdate', () => {
  it('is empty when the axis schema has no showspikes', () => {
    expect(modebarSpikelinesUpdate([axis('xaxis', [0, 1])])).toEqual({});
  });

  it('flips showspikes on every axis when supported', () => {
    const off = [axis('xaxis', [0, 1], { showspikes: false }), axis('yaxis', [0, 1])];
    expect(modebarSpikelinesUpdate(off)).toEqual({
      'xaxis.showspikes': true,
      'yaxis.showspikes': true,
    });
    const on = [axis('xaxis', [0, 1], { showspikes: true })];
    expect(modebarSpikelinesUpdate(on)).toEqual({ 'xaxis.showspikes': false });
  });
});
