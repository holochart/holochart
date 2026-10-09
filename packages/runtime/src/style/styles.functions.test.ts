import { describe, expect, it, vi } from 'vitest';
import {
  createRegistry,
  supplyDefaults,
  type AnyFigure,
  type Registry,
} from '@mk7s/holochart-core';
import { spots } from '../__testing__/spots.ts';
import { withStyleFunctions } from './styles.ts';

function registry(): Registry {
  return createRegistry().register(spots);
}

const xs = [0, 1, 2];
const ys = [5, 12, 8];

describe('style functions: which traces are evaluated (E8.6)', () => {
  it('returns a figure without a data array as it is', () => {
    const core = registry();
    const empty: AnyFigure = { layout: { title: { text: 'No data' } } };
    expect(withStyleFunctions(empty, core)).toBe(empty);
    const junk = { data: 'oops' } as unknown as AnyFigure;
    expect(withStyleFunctions(junk, core)).toBe(junk);
  });

  it('passes entries that are not traces through, evaluating the traces around them', () => {
    const core = registry();
    const figure = {
      data: [null, 'junk', { type: 'spots', x: xs, y: ys, marker: { size: () => 4 } }],
    } as unknown as AnyFigure;
    const out = withStyleFunctions(figure, core);
    expect(out.data?.[0]).toBeNull();
    expect(out.data?.[1]).toBe('junk');
    expect(out.data?.[2]).toMatchObject({ marker: { size: [4, 4, 4] } });
  });

  it('evaluates a trace without a type as a scatter trace', () => {
    const core = createRegistry().register({ ...spots, type: 'scatter' });
    const size = (p: { y: number }) => p.y * 2;
    const out = withStyleFunctions({ data: [{ x: xs, y: ys, marker: { size } }] }, core);
    expect(out.data?.[0]).toEqual({ x: xs, y: ys, marker: { size: [10, 24, 16] } });
    // An empty type is no type.
    const blank = withStyleFunctions(
      { data: [{ type: '', x: xs, y: ys, marker: { size } }] },
      core,
    );
    expect((blank.data?.[0] as { marker: unknown }).marker).toEqual({ size: [10, 24, 16] });
  });

  it('leaves the functions of an unregistered trace type for validation to report', () => {
    const core = registry();
    const size = vi.fn(() => 4);
    const trace = { type: 'nope', x: xs, y: ys, marker: { size } };
    const figure = { data: [trace] };
    expect(withStyleFunctions(figure, core)).toBe(figure);
    expect(size).not.toHaveBeenCalled();
  });

  it('leaves functions on attributes that are not per-point where they are', () => {
    const core = registry();
    const mode = vi.fn(() => 'lines');
    const fill = vi.fn(() => 'tozeroy');
    const trace = { type: 'spots', x: xs, y: ys, mode, fill };
    const figure = { data: [trace] };
    expect(withStyleFunctions(figure, core)).toBe(figure);
    expect(mode).not.toHaveBeenCalled();
    expect(fill).not.toHaveBeenCalled();
  });

  it('drops a function on a trace without points, so the attribute takes its default', () => {
    const core = registry();
    const size = vi.fn(() => 40);
    const out = withStyleFunctions(
      { data: [{ type: 'spots', marker: { size, color: 'red' } }] },
      core,
    );
    expect(size).not.toHaveBeenCalled();
    expect(out.data?.[0]).toEqual({ type: 'spots', marker: { color: 'red' } });
    const full = supplyDefaults(out, core);
    expect(full.fullData[0]?.['marker']).toMatchObject({ size: 6 });
  });

  it('calls a function once per drawn point: the shorter of x and y', () => {
    const core = registry();
    const size = vi.fn((_p: unknown, i: number) => i);
    const out = withStyleFunctions(
      { data: [{ type: 'spots', x: [0, 1, 2, 3], y: [5, 6], marker: { size } }] },
      core,
    );
    expect(size).toHaveBeenCalledTimes(2);
    expect((out.data?.[0] as { marker: unknown }).marker).toEqual({ size: [0, 1] });
  });
});

describe('style functions: failures (E8.6)', () => {
  it('reports what a function threw even when it is not an Error', () => {
    const core = registry();
    const warn = vi.spyOn(core, 'warnOnce').mockImplementation(() => undefined);
    const size = (): number => {
      throw 'no size for you';
    };
    const out = withStyleFunctions(
      {
        data: [
          { type: 'spots', x: xs, y: ys },
          { type: 'spots', x: xs, y: ys, marker: { size } },
        ],
      },
      core,
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatchObject({
      path: 'data[1].marker.size',
      message: 'style function threw (no size for you); using the default',
      severity: 'error',
    });
    expect((out.data?.[1] as { marker: unknown }).marker).toEqual({});
  });

  it('keeps the results of the functions that did not throw', () => {
    const core = registry();
    vi.spyOn(core, 'warnOnce').mockImplementation(() => undefined);
    const out = withStyleFunctions(
      {
        data: [
          {
            type: 'spots',
            x: xs,
            y: ys,
            text: (_p: unknown, i: number) => `#${i}`,
            marker: {
              size: (_p: unknown, i: number) => {
                if (i === 2) throw new Error('third point');
                return 1;
              },
            },
          },
        ],
      },
      core,
    );
    expect(out.data?.[0]).toMatchObject({ text: ['#0', '#1', '#2'], marker: {} });
    expect((out.data?.[0] as { marker: object }).marker).not.toHaveProperty('size');
  });

  it('evaluates again when the datasets of the figure change', () => {
    const core = registry();
    const trace = {
      type: 'spots',
      dataset: 'd',
      x: '@a',
      y: '@b',
      marker: { size: (p: { y: number }) => p.y },
    };
    const first = { d: { a: [1, 2], b: [10, 20] } };
    const second = { d: { a: [1, 2], b: [30, 40] } };
    const a = withStyleFunctions({ data: [trace], datasets: first }, core);
    const b = withStyleFunctions({ data: [trace], datasets: second }, core);
    expect((a.data?.[0] as { marker: unknown }).marker).toEqual({ size: [10, 20] });
    expect((b.data?.[0] as { marker: unknown }).marker).toEqual({ size: [30, 40] });
  });
});
