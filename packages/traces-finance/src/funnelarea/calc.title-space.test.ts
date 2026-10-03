/**
 * The room a funnel area's title takes and the font it is measured and drawn in. Expected values
 * are worked out by hand from Plotly's pie `layoutAreas` / `getTitleSpace` (which funnel areas
 * share): the title takes its block height, at most half the domain, off the top of the domain;
 * the funnel is fitted to what is left (`r = min(width / 2, height / 2 / aspectratio)`), against
 * the bottom of the domain.
 *
 * Titles are measured with the deterministic fallback measurer in unit tests: a block is
 * `lines × size × line height (1.2)` tall, and bold faces (weight ≥ 600) are 5% wider than regular
 * ones, italics as wide as upright.
 */
import type { DomainInfo } from '@mk7s/holochart-runtime';
import { describe, expect, it } from 'vitest';
import { figure } from '../__testing__/bars.ts';
import { calcFunnelarea, crossTraceLayoutFunnelarea } from './calc.ts';
import { funnelareaLabels } from './text.ts';

const AREA = { type: 'funnelarea', labels: ['a', 'b', 'c', 'd'], values: [40, 30, 20, 10] };
/** A 400 × 400 px domain at (100, 50): it ends at y = 450. */
const RECT = { x: 100, y: 50, width: 400, height: 400 };

/** Defaults, calc and the cross-trace layout of one funnel area in `rect`. */
function laidOut(trace: Record<string, unknown>, rect = RECT) {
  const { fullData, fullLayout } = figure([trace]);
  const calc = calcFunnelarea(fullData[0]!, { fullLayout });
  crossTraceLayoutFunnelarea(
    [{ trace: fullData[0]!, index: 0, calc, domain: { x: [0, 1], y: [0, 1], rect } as DomainInfo }],
    { fullLayout, width: 600, height: 500, plotArea: rect },
  );
  return { trace: fullData[0]!, fullLayout, calc };
}

describe('funnelarea title space', () => {
  it('takes one line of the title font off the top of the domain', () => {
    const { calc } = laidOut({ ...AREA, title: { text: 'Sales', font: { size: 20 } } });
    // One line of 20 px at line height 1.2.
    expect(calc.titleBox!.height).toBeCloseTo(24);
    // 376 px are left: the funnel is 376 px tall and (aspectratio 1) as wide, at the bottom.
    expect(calc.layout!.r).toBeCloseTo(188);
    expect(calc.halfHeight).toBeCloseTo(188);
    expect(calc.layout!.cx).toBeCloseTo(300);
    expect(calc.layout!.cy).toBeCloseTo(450 - 188);
    const top = calc.slices[0]!.corners!;
    const bottom = calc.slices[3]!.corners!;
    expect(top.tl[1]).toBeCloseTo(-188);
    expect(bottom.bl[1]).toBeCloseTo(188);
    expect(top.tr[0] - top.tl[0]).toBeCloseTo(376);
  });

  it('takes every line of a multi-line title', () => {
    const { calc } = laidOut({ ...AREA, title: { text: 'Sales<br>2024', font: { size: 20 } } });
    expect(calc.titleBox!.height).toBeCloseTo(48);
    // 352 px are left.
    expect(calc.layout!.r).toBeCloseTo(176);
    expect(calc.halfHeight).toBeCloseTo(176);
    expect(calc.layout!.cy).toBeCloseTo(450 - 176);
  });

  it('never takes more than half the domain', () => {
    const rect = { ...RECT, height: 60 };
    const { calc } = laidOut({ ...AREA, title: { text: 'Sales', font: { size: 40 } } }, rect);
    // The title is 48 px tall, the domain 60: the title gets 30, the funnel the other 30.
    expect(calc.titleBox!.height).toBeCloseTo(48);
    expect(calc.layout!.r).toBeCloseTo(15);
    expect(calc.halfHeight).toBeCloseTo(15);
    expect(calc.layout!.cy).toBeCloseTo(50 + 60 - 15);
  });

  it('leaves the whole domain to the funnel without a title', () => {
    const { calc } = laidOut(AREA);
    expect(calc.titleBox).toBeNull();
    expect(calc.layout!.r).toBeCloseTo(200);
    expect(calc.layout!.cy).toBeCloseTo(250);
  });
});

describe('funnelarea title font', () => {
  const titled = (font: Record<string, unknown>) =>
    laidOut({ ...AREA, textinfo: 'none', title: { text: 'Sales', font: { size: 20, ...font } } });

  it('measures bold titles (by name or by a weight of 600 and up) 5% wider', () => {
    const regular = titled({}).calc.titleBox!.width;
    expect(regular).toBeGreaterThan(0);
    expect(titled({ weight: 'bold' }).calc.titleBox!.width).toBeCloseTo(1.05 * regular, 6);
    expect(titled({ weight: 700 }).calc.titleBox!.width).toBeCloseTo(1.05 * regular, 6);
    expect(titled({ weight: 300 }).calc.titleBox!.width).toBeCloseTo(regular, 6);
    // The weight does not change the height, so the funnel keeps its size.
    expect(titled({ weight: 'bold' }).calc.layout!.r).toBeCloseTo(188);
  });

  it('draws the title in its font: family, size, weight and style', () => {
    const font = { family: 'Courier New', size: 20, weight: 'bold', style: 'italic' };
    const { trace, calc, fullLayout } = titled(font);
    const [title] = funnelareaLabels(trace, calc, fullLayout);
    expect(title).toMatchObject({ text: 'Sales', slice: -1, font });
    // A numeric weight is kept as a number; an upright title carries no style.
    const numeric = titled({ weight: 700, style: 'normal' });
    const [label] = funnelareaLabels(numeric.trace, numeric.calc, numeric.fullLayout);
    expect(label!.font.weight).toBe(700);
    expect(label!.font.style).toBeUndefined();
    // Italics are as wide as upright text.
    expect(titled({ style: 'italic' }).calc.titleBox!.width).toBeCloseTo(
      titled({}).calc.titleBox!.width,
      6,
    );
  });
});
