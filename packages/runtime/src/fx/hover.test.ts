import { createScale, type FullAxis, type FullLayout, type FullTrace } from '@mk7s/holochart-core';
import { describe, expect, it } from 'vitest';
import type { AxisInfo, HoverPoint, TraceModule } from '../contracts.ts';
import {
  buildPoint,
  contrastColor,
  labelStyle,
  labelText,
  truncateName,
  type HoverEntry,
} from './hover.ts';

function axis(id: 'x' | 'y', full: Partial<FullAxis> = {}): AxisInfo {
  const scale = createScale({ type: 'linear', range: [0, 10], length: 100 });
  return {
    id,
    name: `${id}axis`,
    letter: id,
    type: 'linear',
    full: { type: 'linear', hoverformat: '', ...full } as unknown as FullAxis,
    scale,
    start: 0,
    end: 100,
    l2c: (l) => scale.l2p(l),
  };
}

function entry(trace: Record<string, unknown>, input: Record<string, unknown> = {}): HoverEntry {
  const xaxis = axis('x');
  const yaxis = axis('y', { hoverformat: '.2f' } as Partial<FullAxis>);
  return {
    index: 0,
    module: {} as TraceModule,
    trace: {
      type: 'dots',
      name: 'trace 0',
      x: [1, 2],
      y: [3, 4],
      ...trace,
    } as unknown as FullTrace,
    input,
    calc: undefined,
    subplot: {
      id: 'xy',
      xaxis,
      yaxis,
      rect: { x: 10, y: 20, width: 100, height: 100 },
    } as unknown as HoverEntry['subplot'],
    ctx: {
      fullLayout: {} as FullLayout,
      xaxis,
      yaxis,
      transform: { scaleX: 10, offsetX: 0, scaleY: 10, offsetY: 0, scaleZ: 1, offsetZ: 0 },
    },
    skip: false,
  };
}

const P: HoverPoint = { pointIndex: 1, distance: 0, px: 20, py: 40 };
const LAYOUT = { colorway: ['#123456'] } as unknown as FullLayout;

describe('labelText', () => {
  it("shows (x, y) in closest mode with the axes' hover formats", () => {
    expect(labelText(entry({}), P, 'closest', false, LAYOUT)).toEqual({
      text: '(2, 4.00)',
      extra: undefined,
    });
  });

  it('shows only the other axis value in x / y modes, and the name with several traces', () => {
    expect(labelText(entry({}), P, 'x', true, LAYOUT)).toEqual({ text: '4.00', extra: 'trace 0' });
    expect(labelText(entry({}), P, 'y', false, LAYOUT).text).toBe('2');
  });

  it('follows hoverinfo flags, hovertext and text', () => {
    const e = entry({ text: ['a', 'b'] }, { hoverinfo: 'y+text', hovertext: ['h0', 'h1'] });
    expect(labelText(e, P, 'closest', true, LAYOUT)).toEqual({
      text: '4.00<br>h1',
      extra: undefined,
    });
    expect(labelText(entry({}, { hoverinfo: 'none' }), P, 'closest', true, LAYOUT).text).toBe('');
  });

  it('writes unified rows as "name : value"', () => {
    expect(labelText(entry({ name: 'A' }), P, 'x unified', true, LAYOUT).text).toBe('A : 4.00');
  });

  it('prefers hovertemplate, per point, with its <extra> box and fallback', () => {
    const e = entry({}, { hovertemplate: ['', '%{y} %{nope}<extra></extra>'] });
    expect(labelText(e, P, 'closest', true, LAYOUT)).toEqual({ text: '4.00 -', extra: '' });
    const named = entry({ name: 'a very long trace name' }, { hovertemplate: '%{x}' });
    expect(labelText(named, P, 'closest', false, LAYOUT).extra).toBe('a very long ...');
  });
});

describe('label helpers', () => {
  it('truncates names to namelength', () => {
    expect(truncateName('abcdef', 5)).toBe('ab...');
    expect(truncateName('abcdef', -1)).toBe('abcdef');
    expect(truncateName('abcdef', 0)).toBe('');
  });

  it('picks readable text colors', () => {
    expect(contrastColor('#000000')).toBe('#fff');
    expect(contrastColor('#ffffff')).toBe('#444');
    expect(contrastColor('rgba(0,0,0,0.1)')).toBe('#444');
  });

  it('resolves hoverlabel per point from the trace, then the layout', () => {
    const e = entry({}, { hoverlabel: { bgcolor: ['red', 'blue'], namelength: 3 } });
    const layout = {
      hoverlabel: { bordercolor: 'green', font: { size: 20 } },
    } as unknown as FullLayout;
    const s = labelStyle(e, 1, '#abc', layout, false);
    expect(s).toMatchObject({ bgcolor: 'blue', bordercolor: 'green', fontSize: 20, namelength: 3 });
    expect(labelStyle(entry({}), 0, '#abc', LAYOUT, false).bgcolor).toBe('#abc');
  });

  it('builds Plotly-shaped event points', () => {
    const e = entry({ customdata: ['c0', 'c1'] });
    const point = buildPoint(e, { ...P, fields: { 'marker.size': 7 } }, true);
    expect(point).toMatchObject({
      curveNumber: 0,
      pointNumber: 1,
      pointIndex: 1,
      x: 2,
      y: 4,
      customdata: 'c1',
      'marker.size': 7,
      bbox: { x0: 30, x1: 30, y0: 80, y1: 80 },
    });
  });
});
