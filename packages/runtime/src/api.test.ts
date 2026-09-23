// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  newPlot,
  purge,
  react,
  relayout,
  restyle,
  update,
  addTraces,
  deleteTraces,
} from './api.ts';
import { getChart } from './chart.ts';
import { setup } from './__testing__/fakes.ts';

const XY = { type: 'dots', x: [0, 1], y: [0, 1] };
const t = setup({ width: 400, height: 300 });

afterEach(() => purge(t.container));

describe('functional API', () => {
  it('draws with Plotly’s (el, data, layout, config) signature', async () => {
    const chart = await newPlot(
      t.container,
      [XY],
      { width: 320 },
      { responsive: false },
      t.options,
    );
    expect(getChart(t.container)).toBe(chart);
    expect(chart.size).toEqual({ width: 320, height: 300 });
    expect(chart.config).toEqual({ responsive: false });
  });

  it('accepts a whole figure', async () => {
    const chart = await newPlot(
      t.container,
      { data: [XY, XY], layout: { height: 200 } },
      undefined,
      undefined,
      t.options,
    );
    expect(chart.data).toHaveLength(2);
    expect(chart.size.height).toBe(200);
  });

  it('routes restyle / relayout / update / addTraces / deleteTraces by element', async () => {
    const chart = await newPlot(t.container, [XY], {}, {}, t.options);
    await restyle(t.container, { color: 'red' });
    await relayout(t.container, { 'xaxis.range': [0, 2] });
    await update(t.container, { label: 'a' }, { 'yaxis.range': [0, 3] }, [0]);
    await addTraces(t.container, [XY]);
    await deleteTraces(t.container, 0);
    expect(chart.data).toEqual([XY]);
    expect(chart.layout).toMatchObject({
      xaxis: { range: [0, 2], autorange: false },
      yaxis: { range: [0, 3] },
    });
  });

  it('reacts in place, or creates the chart when there is none', async () => {
    const created = await react(t.container, [XY], {}, undefined, t.options);
    const same = await react(t.container, [XY, XY]);
    expect(same).toBe(created);
    expect(same.data).toHaveLength(2);
  });

  it('purges the chart and rejects calls on an empty element', async () => {
    const chart = await newPlot(t.container, [XY], {}, {}, t.options);
    purge(t.container);
    expect(chart.destroyed).toBe(true);
    expect(getChart(t.container)).toBeUndefined();
    await expect(restyle(t.container, { color: 'red' })).rejects.toThrow(/no chart/);
    purge(t.container);
  });
});
