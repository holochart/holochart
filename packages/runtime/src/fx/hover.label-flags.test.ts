/**
 * Hover label content by `hoverinfo` flags in each hovermode, a trace's own formatted template
 * values, axis value text, the color a label takes from its point, and the indices an aggregated
 * point reports. The point is `(2, 4)` of a trace named "trace 0"; the y axis formats with `.2f`.
 */
import { createScale, type FullAxis, type FullLayout, type FullTrace } from '@mk7s/holochart-core';
import { describe, expect, it } from 'vitest';
import type { AxisInfo, HoverPoint, TraceModule } from '../contracts.ts';
import { axisLabel, buildPoint, labelText, pointColor, type HoverEntry } from './hover.ts';

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

function entry(trace: Record<string, unknown>, index = 0): HoverEntry {
  const xaxis = axis('x');
  const yaxis = axis('y', { hoverformat: '.2f' } as Partial<FullAxis>);
  return {
    index,
    module: {} as TraceModule,
    trace: {
      type: 'dots',
      name: 'trace 0',
      x: [1, 2],
      y: [3, 4],
      text: ['a', 'b'],
      ...trace,
    } as unknown as FullTrace,
    input: {},
    calc: undefined,
    subplot: {
      id: 'xy',
      xaxis,
      yaxis,
      rect: { x: 10, y: 20, width: 100, height: 100 },
    } as unknown as HoverEntry['subplot'],
    rect: { x: 10, y: 20, width: 100, height: 100 },
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
const LAYOUT = { colorway: ['#111111', '#222222'] } as unknown as FullLayout;

describe('hoverinfo flags', () => {
  it('closest mode shows the one coordinate asked for, without parentheses', () => {
    expect(labelText(entry({ hoverinfo: 'x' }), P, 'closest', false, LAYOUT).text).toBe('2');
    expect(labelText(entry({ hoverinfo: 'y' }), P, 'closest', false, LAYOUT).text).toBe('4.00');
    expect(labelText(entry({ hoverinfo: 'x+text' }), P, 'closest', false, LAYOUT).text).toBe(
      '2<br>b',
    );
  });

  it('x mode leaves the x value to the common label: only y and text count', () => {
    expect(labelText(entry({ hoverinfo: 'x' }), P, 'x', false, LAYOUT)).toEqual({
      text: '',
      extra: undefined,
    });
    expect(labelText(entry({ hoverinfo: 'x+text' }), P, 'x', false, LAYOUT).text).toBe('b');
    expect(labelText(entry({ hoverinfo: 'x+y' }), P, 'x', false, LAYOUT).text).toBe('4.00');
  });

  it('y mode leaves the y value to the common label: only x and text count', () => {
    expect(labelText(entry({ hoverinfo: 'y' }), P, 'y', false, LAYOUT).text).toBe('');
    expect(labelText(entry({ hoverinfo: 'x+y' }), P, 'y', false, LAYOUT).text).toBe('2');
    // The name box still shows next to an empty label when several traces are hovered.
    expect(labelText(entry({ hoverinfo: 'y+name' }), P, 'y', true, LAYOUT)).toEqual({
      text: '',
      extra: 'trace 0',
    });
  });

  it('unified rows show the name, the value, or both, as the flags say', () => {
    const row = (hoverinfo: string, mode: 'x unified' | 'y unified' = 'x unified') =>
      labelText(entry({ hoverinfo }), P, mode, true, LAYOUT);
    expect(row('y+name').text).toBe('trace 0 : 4.00');
    expect(row('y').text).toBe('4.00');
    expect(row('name').text).toBe('trace 0');
    expect(row('name+text').text).toBe('trace 0<br>b');
    expect(row('text').text).toBe('b');
    // Nothing to say beside the title: no row.
    expect(row('x').text).toBe('');
    // Rows carry the name themselves: no secondary box.
    expect(row('y+name').extra).toBeUndefined();
    expect(row('x+name', 'y unified').text).toBe('trace 0 : 2');
  });
});

describe('hovertemplate values a trace formatted itself', () => {
  it('fills %{name} with the trace’s label, and formats the raw value when a format is given', () => {
    const slice: HoverPoint = {
      ...P,
      fields: { percent: 0.25, value: 1234 },
      labels: { percent: '25%', value: '1,234' },
    };
    const e = entry({ hovertemplate: '%{percent} of %{value} (%{percent:.3f}) at %{y}' });
    expect(labelText(e, slice, 'closest', false, LAYOUT).text).toBe('25% of 1,234 (0.250) at 4.00');
  });
});

describe('axis value text', () => {
  const y = axis('y', { hoverformat: '.2f' } as Partial<FullAxis>);

  it('formats a value with the axis hover format', () => {
    expect(axisLabel(y, 4)).toBe('4.00');
  });

  it('is empty for a missing value', () => {
    expect(axisLabel(y, undefined)).toBe('');
    expect(axisLabel(y, null)).toBe('');
  });

  it('is the value as written without an axis, or when the axis cannot place it', () => {
    expect(axisLabel(undefined, 12.5)).toBe('12.5');
    expect(axisLabel(y, 'n/a')).toBe('n/a');
  });
});

describe('the color of a hovered point', () => {
  it('is the color the trace reports for the point', () => {
    const e = entry({ marker: { color: 'red' } });
    expect(pointColor(e, { ...P, color: 'rgb(9, 9, 9)' }, LAYOUT)).toBe('rgb(9, 9, 9)');
  });

  it('else the marker color, per point when it is an array', () => {
    expect(pointColor(entry({ marker: { color: 'red' } }), P, LAYOUT)).toBe('red');
    expect(pointColor(entry({ marker: { color: ['red', 'blue'] } }), P, LAYOUT)).toBe('blue');
  });

  it('else the line color, then the fill color', () => {
    const lines = entry({ line: { color: 'green' }, fillcolor: 'pink' });
    expect(pointColor(lines, P, LAYOUT)).toBe('green');
    expect(pointColor(entry({ fillcolor: 'pink' }), P, LAYOUT)).toBe('pink');
    // Marker colors that are numbers go through a colorscale: they are not CSS colors.
    const scaled = entry({ marker: { color: [0.1, 0.9] }, line: { color: 'green' } });
    expect(pointColor(scaled, P, LAYOUT)).toBe('green');
  });

  it('else the trace’s color of the colorway, which repeats', () => {
    expect(pointColor(entry({}, 1), P, LAYOUT)).toBe('#222222');
    expect(pointColor(entry({}, 2), P, LAYOUT)).toBe('#111111');
  });
});

describe('event points', () => {
  it('report every data index behind an aggregated point as pointNumbers', () => {
    const bin: HoverPoint = { ...P, pointIndex: 0, pointIndices: [0, 3, 7] };
    const point = buildPoint(entry({}), bin, false);
    expect(point).toMatchObject({ pointNumber: 0, pointNumbers: [0, 3, 7] });
    expect(buildPoint(entry({}), P, false)).not.toHaveProperty('pointNumbers');
  });
});
