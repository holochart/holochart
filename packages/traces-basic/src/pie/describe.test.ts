import type { FullLayout } from '@mk7s/holochart-core';
import { describe, expect, it } from 'vitest';
import { build } from './__testing__/build.ts';
import { pie } from './index.ts';

function described(data: Record<string, unknown>, layout: Record<string, unknown> = {}) {
  const { traces, calcs, fullLayout } = build([data], layout);
  return pie.describe!({
    trace: traces[0]!,
    calc: calcs[0]!,
    index: 0,
    fullLayout: fullLayout as FullLayout,
    xaxis: undefined,
    yaxis: undefined,
    maxRows: 100,
  })!;
}

describe('pie describe()', () => {
  it('gives the total and the largest slices with their shares', () => {
    const d = described({
      name: 'Browsers',
      labels: ['Chrome', 'Safari', 'Edge', 'Firefox'],
      values: [641, 187, 52, 120],
    });
    expect(d.kind).toBe('pie');
    expect(d.summary).toBe(
      'Pie "Browsers": 4 slices, total 1000. Largest: Chrome 64.1% (641), Safari 18.7% (187) and Firefox 12% (120).',
    );
    expect(d.table?.columns).toEqual(['Label', 'Value', 'Percent']);
    expect(d.table?.rows[0]).toEqual(['Chrome', '641', '64.1%']);
    expect(d.table?.total).toBe(4);
  });

  it('calls a pie with a hole a donut and reports hidden slices', () => {
    const d = described({ labels: ['a', 'b'], values: [1, 3], hole: 0.5 }, { hiddenlabels: ['a'] });
    expect(d.kind).toBe('donut');
    expect(d.summary).toBe('Donut "trace 0": 1 slice, total 3. Slice: b 100% (3). 1 slice hidden.');
    expect(d.table?.rows).toEqual([['b', '3', '100%']]);
  });
});
