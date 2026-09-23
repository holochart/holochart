import { describe, expect, it } from 'vitest';
import { defaults, measure, testRegistry } from '../__testing__/fixtures.ts';
import { titleComponent, titleLayout } from './title.ts';

const SIZE = { width: 600, height: 400 };
const AREA = { x: 80, y: 100, width: 440, height: 220 };
const registry = testRegistry([titleComponent]);

function layoutFor(title: Record<string, unknown>, margin = { t: 100 }) {
  const { fullLayout } = defaults({ title }, [], registry);
  return titleLayout(fullLayout, SIZE, AREA, margin, measure);
}

describe('title component schema', () => {
  it('keeps the base title attributes and adds subtitle, pad and automargin', () => {
    const { fullLayout } = defaults(
      { font: { size: 10 }, title: { text: 'T', subtitle: { text: 's' }, pad: { l: 4 } } },
      [],
      registry,
    );
    const t = fullLayout['title'] as Record<string, unknown>;
    expect(t['x']).toBe(0.5);
    expect(t['automargin']).toBe(false);
    expect(t['pad']).toEqual({ t: 0, r: 0, b: 0, l: 4 });
    // Base title font rule (1.4 × layout.font) still applies.
    expect((t['font'] as { size: number }).size).toBe(14);
    expect((t['subtitle'] as { text: string }).text).toBe('s');
  });
});

describe('titleLayout', () => {
  it('centers the title in the top margin by default', () => {
    const { labels, push } = layoutFor({ text: 'Hello' });
    expect(labels).toHaveLength(1);
    const l = labels[0];
    expect(l).toMatchObject({ text: 'Hello', x: 300, anchorX: 'center', anchorY: 'top' });
    // 17 px font (1.4 × 12, rounded) → 17 × 1.3 px block, centered at margin.t / 2.
    expect(l?.y).toBeCloseTo(50 - (17 * 1.3) / 2);
    expect(push).toBeUndefined();
  });

  it('stacks the subtitle under the title in the subtitle font', () => {
    const { labels } = layoutFor({ text: 'Main', subtitle: { text: 'sub', font: { size: 10 } } });
    expect(labels.map((l) => l.text)).toEqual(['Main', 'sub']);
    const [main, sub] = labels;
    expect(sub?.font.size).toBe(10);
    expect((sub?.y ?? 0) - (main?.y ?? 0)).toBeCloseTo(17 * 1.3 + 2);
  });

  it('picks anchors by thirds and applies pad on the anchored side', () => {
    const left = layoutFor({ text: 'L', x: 0.1, pad: { l: 7 } }).labels[0];
    expect(left).toMatchObject({ anchorX: 'left', x: 60 + 7 });
    const right = layoutFor({ text: 'R', x: 0.9, xref: 'paper', pad: { r: 5 } }).labels[0];
    expect(right).toMatchObject({ anchorX: 'right', x: 80 + 0.9 * 440 - 5 });
  });

  it('positions numeric y with yanchor in container or paper coordinates', () => {
    const top = layoutFor({ text: 'T', y: 0.95, pad: { t: 3 } }).labels[0];
    expect(top?.y).toBeCloseTo(0.05 * 400 + 3);
    const bottom = layoutFor({ text: 'B', y: 0, yref: 'paper', yanchor: 'bottom' }).labels[0];
    expect(bottom?.y).toBeCloseTo(320 - 17 * 1.3);
  });

  it('pushes the top margin with automargin and sits above the plot with yref paper', () => {
    const { labels, push } = layoutFor({
      text: 'T',
      automargin: true,
      yref: 'paper',
      pad: { b: 6 },
    });
    expect(push).toEqual({ t: Math.ceil(17 * 1.3 + 6) });
    expect(labels[0]?.y).toBeCloseTo(100 - 6 - 17 * 1.3);
  });

  it('draws nothing for an empty title', () => {
    expect(layoutFor({ text: '' })).toEqual({ labels: [], push: undefined });
  });

  it('pushMargin only with automargin', () => {
    const base = { fullData: [], width: 600, height: 400, axes: new Map() };
    const off = defaults({ title: { text: 'T' } }, [], registry).fullLayout;
    expect(titleComponent.pushMargin?.({ ...base, fullLayout: off })).toBeUndefined();
    const on = defaults({ title: { text: 'T', automargin: true } }, [], registry).fullLayout;
    expect(titleComponent.pushMargin?.({ ...base, fullLayout: on })).toEqual({ t: 23 });
  });
});
