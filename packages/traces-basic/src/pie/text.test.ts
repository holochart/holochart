import { describe, expect, it } from 'vitest';
import { build } from './__testing__/build.ts';
import { formatPiePercent, formatPieValue, numSeparate, plainText } from './helpers.ts';
import {
  fitOutsideLabels,
  layoutPieText,
  leaderLine,
  sliceText,
  textBox,
  transformInsideText,
  transformOutsideText,
  type LabelPoint,
  type PieLabel,
  type SliceShape,
} from './text.ts';

describe('pie number formatting', () => {
  it('formats percents with 3 significant digits like Plotly', () => {
    expect(formatPiePercent(1 / 3)).toBe('33.3%');
    expect(formatPiePercent(0.5)).toBe('50%');
    expect(formatPiePercent(0.0001234)).toBe('0.0123%');
    expect(formatPiePercent(1)).toBe('100%');
    expect(formatPiePercent(0.12345)).toBe('12.3%');
  });

  it('formats values with 10 significant digits and thousands past 4 digits', () => {
    expect(formatPieValue(1 / 3)).toBe('0.3333333333');
    expect(formatPieValue(1234)).toBe('1234');
    expect(formatPieValue(12345.5)).toBe('12,345.5');
    expect(formatPieValue(2)).toBe('2');
    expect(numSeparate('-123456')).toBe('-123,456');
  });

  it('simplifies pseudo-HTML for the SDF text', () => {
    expect(plainText('<b>A</b><br>50%')).toBe('A\n50%');
    expect(plainText('a &amp; b')).toBe('a & b');
  });
});

describe('pie label content', () => {
  const one = (trace: Record<string, unknown>) => {
    const b = build([trace]);
    return { trace: b.traces[0]!, calc: b.calcs[0]! };
  };

  it('joins the textinfo parts in a fixed order', () => {
    const { trace, calc } = one({
      labels: ['a', 'b'],
      values: [3, 1],
      text: ['x', 'y'],
      textinfo: 'percent+value+text+label',
    });
    expect(sliceText(trace, calc, calc.slices[0]!)).toBe('a<br>x<br>3<br>75%');
  });

  it('fills texttemplate with formatted value and percent by default', () => {
    const { trace, calc } = one({
      labels: ['a', 'b'],
      values: [3000, 1000],
      texttemplate: '%{label}: %{value} (%{percent}) %{percent:.1%} %{value:,.0f}',
    });
    expect(sliceText(trace, calc, calc.slices[0]!)).toBe('a: 3000 (75%) 75.0% 3,000');
  });

  it('gives no label with an empty template entry', () => {
    const { trace, calc } = one({ labels: ['a', 'b'], values: [3, 1], texttemplate: ['', 'B'] });
    expect(sliceText(trace, calc, calc.slices[0]!)).toBe('');
    expect(sliceText(trace, calc, calc.slices[1]!)).toBe('B');
  });
});

describe('pie inside text (transformInsideText)', () => {
  // The right half of a pie: from 12 to 6 o'clock, clockwise.
  const half: SliceShape = {
    startAngle: 0,
    stopAngle: Math.PI,
    midAngle: Math.PI / 2,
    halfAngle: Math.PI / 2,
    ring: 1,
    rInscribed: Math.min(1 / (1 + 1 / Math.sin(Math.PI / 2)), 0.5),
  };

  it('keeps small labels horizontal at full size', () => {
    const t = transformInsideText({ width: 20, height: 10 }, half, 100, 'auto');
    expect(t.scale).toBeGreaterThanOrEqual(1);
    expect(t.rotate).toBe(0);
    expect(t.rCenter).toBeCloseTo(0.5);
  });

  it('turns labels radially or tangentially', () => {
    const box = { width: 120, height: 12 };
    expect(transformInsideText(box, half, 100, 'radial').rotate).toBeCloseTo(0);
    expect(transformInsideText(box, half, 100, 'tangential').rotate).toBeCloseTo(-90);
    // Auto picks the largest placement.
    const auto = transformInsideText(box, half, 100, 'auto');
    for (const o of ['horizontal', 'radial', 'tangential'] as const) {
      expect(auto.scale).toBeGreaterThanOrEqual(transformInsideText(box, half, 100, o).scale);
    }
  });

  it('scales labels down in thin slices and hides empty ones', () => {
    const thin: SliceShape = {
      ...half,
      stopAngle: 0.1,
      midAngle: 0.05,
      halfAngle: 0.05,
      rInscribed: 0.05,
    };
    expect(
      transformInsideText({ width: 40, height: 12 }, thin, 100, 'horizontal').scale,
    ).toBeLessThan(1);
    const empty: SliceShape = { ...half, stopAngle: 0 };
    expect(transformInsideText({ width: 40, height: 12 }, empty, 100, 'auto').scale).toBe(0);
  });

  it('places outside labels diagonally past the edge', () => {
    const t = transformOutsideText({ width: 40, height: 10 }, [70.7, -70.7]);
    expect(t.outside).toBe(true);
    expect(t.x).toBeCloseTo(20 + 2.5);
    expect(t.y).toBeCloseTo(-2.5);
  });
});

function box(l: PieLabel) {
  const { width, height } = textBox(l.text, l.font);
  const x0 = l.anchorX === 'left' ? l.x : l.anchorX === 'right' ? l.x - width : l.x - width / 2;
  const y0 = l.anchorY === 'top' ? l.y : l.anchorY === 'bottom' ? l.y - height : l.y - height / 2;
  return { x0, x1: x0 + width, y0, y1: y0 + height };
}

describe('pie label layout', () => {
  it('puts labels inside when they fit and outside otherwise (auto)', () => {
    const b = build([
      {
        labels: ['big', 'tiny'],
        values: [99, 1],
        textinfo: 'label+percent',
        domain: { y: [0, 0.8] },
      },
    ]);
    const { labels } = layoutPieText(b.traces[0]!, b.calcs[0]!, b.fullLayout);
    expect(labels.map((l) => [l.text, l.outside])).toEqual([
      ['big\n99%', false],
      ['tiny\n1%', true],
    ]);
    const { cx, cy, r } = b.calcs[0]!.layout!;
    const tiny = labels[1]!;
    expect(Math.hypot(tiny.x - cx, tiny.y - cy)).toBeGreaterThan(r);
  });

  it('shrinks inside labels and honours outside', () => {
    const b = build([
      { labels: ['a', 'long label'], values: [99, 1], textposition: 'inside', textinfo: 'label' },
      { labels: ['a', 'long label'], values: [99, 1], textposition: 'outside', textinfo: 'label' },
    ]);
    const inside = layoutPieText(b.traces[0]!, b.calcs[0]!, b.fullLayout).labels;
    expect(inside.every((l) => !l.outside)).toBe(true);
    expect(inside[1]!.font.size).toBeLessThan(12);
    const outside = layoutPieText(b.traces[1]!, b.calcs[1]!, b.fullLayout).labels;
    expect(outside.every((l) => l.outside)).toBe(true);
  });

  it('keeps inside labels of donuts on the ring', () => {
    const b = build([{ labels: ['a', 'b', 'c'], values: [5, 4, 3], hole: 0.6 }]);
    const { cx, cy, r } = b.calcs[0]!.layout!;
    const { labels } = layoutPieText(b.traces[0]!, b.calcs[0]!, b.fullLayout);
    expect(labels).toHaveLength(3);
    for (const l of labels) {
      expect(l.outside).toBe(false);
      const d = Math.hypot(l.x - cx, l.y - cy);
      expect(d).toBeGreaterThan(0.6 * r);
      expect(d).toBeLessThan(r);
    }
  });

  it('uses contrasting inside colors and the outside font color', () => {
    const b = build([
      {
        labels: ['a', 'b'],
        values: [99, 1],
        marker: { colors: ['#000', '#fff'] },
        textposition: ['inside', 'outside'],
        outsidetextfont: { color: 'red' },
      },
    ]);
    const { labels } = layoutPieText(b.traces[0]!, b.calcs[0]!, b.fullLayout);
    expect(labels[0]!.color).toEqual([1, 1, 1, 1]);
    expect(labels[1]!.color).toEqual([1, 0, 0, 1]);
  });

  it('moves many small outside labels apart, inside the figure, with leader lines', () => {
    const n = 20;
    const labels = Array.from({ length: n }, (_, i) => `slice ${i}`);
    const values = [200, ...Array.from({ length: n - 1 }, (_, i) => 1 + (i % 3))];
    const b = build([
      { labels, values, textinfo: 'label', textposition: 'outside', domain: { y: [0.1, 0.9] } },
    ]);
    const text = layoutPieText(b.traces[0]!, b.calcs[0]!, b.fullLayout);
    const boxes = text.labels.filter((l) => l.outside).map(box);
    expect(boxes).toHaveLength(n);
    for (let i = 0; i < boxes.length; i++) {
      const a = boxes[i]!;
      expect(a.x0).toBeGreaterThanOrEqual(-1e-6);
      expect(a.x1).toBeLessThanOrEqual(600 + 1e-6);
      expect(a.y0).toBeGreaterThanOrEqual(-1e-6);
      expect(a.y1).toBeLessThanOrEqual(400 + 1e-6);
      for (let j = i + 1; j < boxes.length; j++) {
        const c = boxes[j]!;
        const overlap =
          Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0) > 1e-6 &&
          Math.min(a.y1, c.y1) - Math.max(a.y0, c.y0) > 1e-6;
        expect(overlap, `labels ${i} and ${j} overlap`).toBe(false);
      }
    }
    expect(text.lines.length).toBeGreaterThan(0);
    expect(text.lines[0]!.width).toBeCloseTo(1.5);
  });

  it('never overlaps outside labels, even when they cannot all fit in the figure', () => {
    const n = 40;
    const labels = Array.from({ length: n }, (_, i) => `slice ${i}`);
    const values = [300, ...Array.from({ length: n - 1 }, () => 1)];
    const b = build([{ labels, values, textinfo: 'label+percent', textposition: 'outside' }]);
    const boxes = layoutPieText(b.traces[0]!, b.calcs[0]!, b.fullLayout)
      .labels.filter((l) => l.outside)
      .map(box);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, c] = [boxes[i]!, boxes[j]!];
        const overlap =
          Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0) > 1e-6 &&
          Math.min(a.y1, c.y1) - Math.max(a.y0, c.y0) > 1e-6;
        expect(overlap, `labels ${i} and ${j} overlap`).toBe(false);
      }
    }
  });

  it('keeps labels in the figure horizontally and separates overlapping ones', () => {
    const point = (y: number, x: number): LabelPoint => ({
      index: 0,
      pts: [0],
      pull: 0,
      pxmid: [10, 0],
      px0: [10, 0],
      px1: [10, 0],
      cxFinal: 0,
      cyFinal: 0,
      yLabelMin: y - 5,
      yLabelMid: y,
      yLabelMax: y + 5,
      xLabelMin: x - 20,
      xLabelMax: x + 20,
      labelExtraX: 0,
      labelExtraY: 0,
    });
    const a = point(2, 590);
    const b = point(6, 580);
    const far = point(6, 100);
    fitOutsideLabels([a, b, far], { width: 600, height: 100 });
    expect(a.labelExtraX).toBe(-10);
    expect(a.labelExtraY).toBe(3);
    expect(b.labelExtraY).toBe(9);
    expect(far.labelExtraY).toBe(0);
    expect(leaderLine(a)).not.toBeNull();
    expect(leaderLine(far)).toBeNull();
  });

  it('places titles in the hole or outside the pie', () => {
    const b = build([
      { values: [1], hole: 0.5, title: { text: 'Inside' } },
      { values: [1], title: { text: 'Top', position: 'top left' } },
      { values: [1], title: { text: 'Bottom', position: 'bottom right' } },
    ]);
    const title = (k: number) =>
      layoutPieText(b.traces[k]!, b.calcs[k]!, b.fullLayout).labels.find((l) => l.slice === -1)!;
    const l0 = b.calcs[0]!.layout!;
    expect(title(0)).toMatchObject({ x: l0.cx, y: l0.cy, anchorX: 'center', anchorY: 'middle' });
    const l1 = b.calcs[1]!.layout!;
    expect(title(1)).toMatchObject({
      x: l1.cx - l1.r,
      y: l1.cy - l1.r,
      anchorX: 'left',
      anchorY: 'bottom',
    });
    const l2 = b.calcs[2]!.layout!;
    expect(title(2)).toMatchObject({
      x: l2.cx + l2.r,
      y: l2.cy + l2.r,
      anchorX: 'right',
      anchorY: 'top',
    });
    expect(title(1).font.size).toBe(12);
  });
});
