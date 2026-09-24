import { describe, expect, it } from 'vitest';
import { strip } from './strip.ts';

const TIPS = [
  { day: 'Thu', bill: 17.2, smoker: 'No', size: 2 },
  { day: 'Fri', bill: 21.0, smoker: 'Yes', size: 3 },
  { day: 'Thu', bill: 12.5, smoker: 'Yes', size: 2 },
  { day: 'Sat', bill: 30.1, smoker: 'No', size: 4 },
];

describe('strip', () => {
  it('builds box traces with all points and an invisible box, like px.strip', () => {
    const { data, layout } = strip({ data: TIPS, x: 'day', y: 'bill' });
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      type: 'box',
      orientation: 'v',
      boxpoints: 'all',
      pointpos: 0,
      jitter: 0.3,
      hoveron: 'points',
      fillcolor: 'rgba(0,0,0,0)',
      line: { width: 0 },
      x: ['Thu', 'Fri', 'Thu', 'Sat'],
      y: [17.2, 21.0, 12.5, 30.1],
      showlegend: false,
      hovertemplate: 'day=%{x}<br>bill=%{y}<extra></extra>',
    });
    expect(layout).toEqual({
      boxmode: 'group',
      xaxis: { title: { text: 'day' } },
      yaxis: { title: { text: 'bill' } },
    });
  });

  it('splits color groups into offset groups, in category order, with mapped colors', () => {
    const { data, layout } = strip({
      data: TIPS,
      x: 'day',
      y: 'bill',
      color: 'smoker',
      categoryOrders: { smoker: ['Yes', 'No'], day: ['Thu', 'Fri', 'Sat'] },
      colorDiscreteMap: { No: '#888' },
      labels: { bill: 'Total bill' },
      stripmode: 'overlay',
    });
    expect(data.map((t) => t['name'])).toEqual(['Yes', 'No']);
    expect(data[0]).toMatchObject({
      offsetgroup: 'Yes',
      alignmentgroup: 'True',
      legendgroup: 'Yes',
      x: ['Fri', 'Thu'],
    });
    expect(data[0]?.['marker']).toBeUndefined();
    expect(data[1]?.['marker']).toEqual({ color: '#888' });
    expect(data[0]?.['hovertemplate']).toBe(
      'smoker=Yes<br>day=%{x}<br>Total bill=%{y}<extra></extra>',
    );
    expect(layout['boxmode']).toBe('overlay');
    expect(layout['xaxis']).toEqual({
      title: { text: 'day' },
      categoryorder: 'array',
      categoryarray: ['Thu', 'Fri', 'Sat'],
    });
    expect(layout['legend']).toEqual({ title: { text: 'smoker' } });
  });

  it('infers horizontal strips from a numeric x and reads columns', () => {
    const { data } = strip({
      data: { bill: [1, 2, 3], day: ['a', 'b', 'a'], who: ['p', 'q', 'r'], size: [2, 3, 4] },
      x: 'bill',
      y: 'day',
      hoverName: 'who',
      hoverData: ['size'],
    });
    expect(data[0]).toMatchObject({
      orientation: 'h',
      hovertext: ['p', 'q', 'r'],
      customdata: [[2], [3], [4]],
      hovertemplate:
        '<b>%{hovertext}</b><br><br>bill=%{x}<br>day=%{y}<br>size=%{customdata[0]}<extra></extra>',
    });
    expect(strip({ data: { v: [1, 2] }, x: 'v' }).data[0]?.['orientation']).toBe('h');
  });
});
