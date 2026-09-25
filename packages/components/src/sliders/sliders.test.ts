import { describe, expect, it } from 'vitest';
import { holochartTemplate, plotlyClassicTemplate, type Template } from '@mk7s/holochart-core';
import type { ComponentLayoutContext } from '@mk7s/holochart-runtime';
import { defaults, measure, testRegistry } from '../__testing__/fixtures.ts';
import {
  currentValueText,
  layoutSlider,
  pageSize,
  placeSlider,
  sliderBoxMarginPush,
  stepBy,
  stepPositionAt,
} from './layout.ts';
import type { FullSlider } from './schema.ts';
import { slidersComponent, slidersMarginPushes } from './sliders.ts';

const registry = () =>
  testRegistry([slidersComponent])
    .registerTemplate('holochart', holochartTemplate as Template)
    .registerTemplate('plotly-classic', plotlyClassicTemplate as Template);

function sliders(layout: Record<string, unknown>): FullSlider[] {
  const { fullLayout } = defaults(layout, [], registry());
  return fullLayout['sliders'] as FullSlider[];
}

const steps = (n: number, label = (i: number) => `s${i}`) =>
  Array.from({ length: n }, (_, i) => ({
    label: label(i),
    method: 'restyle',
    args: ['marker.size', i],
  }));

const full = (slider: Record<string, unknown>, template = 'plotly-classic'): FullSlider =>
  sliders({ template, sliders: [slider] })[0] as FullSlider;

describe('slider defaults', () => {
  it("follows Plotly's schema defaults", () => {
    const s = full({ steps: steps(3) });
    expect(s).toMatchObject({
      visible: true,
      active: 0,
      lenmode: 'fraction',
      len: 1,
      x: 0,
      xanchor: 'left',
      y: 0,
      yanchor: 'top',
      pad: { t: 20, r: 0, b: 0, l: 0 },
      transition: { duration: 150, easing: 'cubic-in-out' },
      currentvalue: { visible: true, xanchor: 'left', offset: 10 },
      borderwidth: 1,
      ticklen: 7,
      tickwidth: 1,
      minorticklen: 4,
      bgcolor: '#f8fafc',
      activebgcolor: '#dbdde0',
      bordercolor: '#bec8d9',
      tickcolor: '#333',
    });
    expect(s.currentvalue.font.size).toBe(12);
  });

  it('labels default to step-<i>, values to labels; steps without args are hidden', () => {
    const s = full({
      steps: [
        { method: 'restyle', args: ['a', 1] },
        { label: 'x' },
        { method: 'skip', value: 'v' },
      ],
    });
    expect(s.steps.map((st) => [st.visible, st.label, st.value])).toEqual([
      [true, 'step-0', 'step-0'],
      [false, 'x', 'x'],
      [true, 'step-2', 'v'],
    ]);
  });

  it('hides sliders with fewer than two visible steps; moves a hidden active step', () => {
    expect(full({ steps: steps(1) }).visible).toBe(false);
    const s = full({ active: 0, steps: [{ label: 'hidden' }, ...steps(2)] });
    expect(s.active).toBe(1);
  });

  it('dark papers get tinted colors; figure and template values win', () => {
    const dark = full({ steps: steps(2) }, 'holochart');
    expect(dark.bgcolor).toMatch(/^rgb\(/);
    expect(dark.tickcolor).not.toBe('#333');
    expect(dark.font.size).toBe(9);
    const template: Template = {
      layout: {
        sliderdefaults: { bgcolor: '#C8D4E3', tickwidth: 0, stepdefaults: { execute: false } },
      },
    };
    const [t] = sliders({ template, sliders: [{ steps: steps(2), tickcolor: 'red' }] });
    expect(t).toMatchObject({
      bgcolor: 'rgb(200, 212, 227)',
      tickwidth: 0,
      tickcolor: 'rgb(255, 0, 0)',
    });
    expect(t?.steps[0]?.execute).toBe(false);
  });
});

describe('slider layout and step math', () => {
  it('spaces steps evenly inside the step inset (12 px constants)', () => {
    const s = full({ steps: steps(5), pad: { l: 10, r: 10, t: 20 } });
    const l = layoutSlider(s, measure, 420);
    expect(l.width).toBe(420);
    expect(l.inputStart).toBe(10);
    expect(l.inputLength).toBe(400);
    expect(l.positions).toEqual([20, 115, 210, 305, 400]);
    expect(l.steps).toEqual([0, 1, 2, 3, 4]);
    expect(l.rail).toMatchObject({ x: 18, width: 384, height: 5 });
    // height = cv (12·1.3 + 10) + tickOffset 25 + ticklen 7 + labels 12·1.3 + pad 20.
    expect(l.height).toBe(Math.ceil(15.6 + 10 + 25 + 7 + 15.6 + 20));
    expect(l.currentValue).toMatchObject({ x: 10, y: 20 });
    expect(l.currentValue?.height).toBeCloseTo(15.6);
  });

  it('thins labels that would overlap (labelStride) and uses minor ticks between', () => {
    const s = full({ steps: steps(21, (i) => `label-${i}`), lenmode: 'pixels', len: 200 });
    const l = layoutSlider(s, measure, 999);
    expect(l.width).toBe(200);
    expect(l.labelStride).toBeGreaterThan(1);
    const labeled = l.ticks.filter((t) => t.label !== undefined);
    expect(labeled[1]?.position).toBe(l.labelStride);
    expect(l.ticks[1]?.length).toBe(4);
    expect(l.ticks[0]?.length).toBe(7);
  });

  it('hidden steps take no position', () => {
    const s = full({ steps: [...steps(2), { label: 'no args' }, ...steps(1)] });
    const l = layoutSlider(s, measure, 300);
    expect(l.steps).toEqual([0, 1, 3]);
  });

  it('pointer position → nearest visible step, clamped', () => {
    const s = full({ steps: steps(5), pad: { l: 10, r: 10, t: 20 } });
    const l = layoutSlider(s, measure, 420);
    expect(stepPositionAt(l, 0)).toBe(0);
    expect(stepPositionAt(l, 160)).toBe(1); // (160 − 20) / 380 · 4 = 1.47
    expect(stepPositionAt(l, 210)).toBe(2);
    expect(stepPositionAt(l, 999)).toBe(4);
  });

  it('keyboard steps and pages', () => {
    const s = full({ steps: steps(25) });
    const l = layoutSlider(s, measure, 600);
    expect(stepBy(l, 0, 1)).toBe(1);
    expect(stepBy(l, 0, -1)).toBe(0);
    expect(stepBy(l, 23, 5)).toBe(24);
    expect(pageSize(l)).toBe(3);
  });

  it('current value text: prefix + label + suffix, tags removed', () => {
    const s = full({ steps: steps(2), currentvalue: { prefix: 'Year: ', suffix: ' AD' } });
    expect(currentValueText(s, { ...s.steps[0]!, label: '<b>1990</b>' })).toBe('Year: 1990 AD');
    expect(currentValueText(s, undefined)).toBe('Year:  AD');
  });

  it('scales with the font (dense default look)', () => {
    const l = layoutSlider(full({ steps: steps(3) }, 'holochart'), measure, 400);
    expect(l.scale).toBe(0.75);
    expect(l.grip.height).toBe(15);
  });

  it('places the box and pushes the bottom margin below the plot', () => {
    const s = full({ steps: steps(3) });
    const l = layoutSlider(s, measure, 400);
    const area = { x: 80, y: 100, width: 400, height: 200 };
    expect(placeSlider(s, l, { width: 560, height: 400 }, area)).toEqual({ left: 80, top: 300 });
    const push = sliderBoxMarginPush(
      s,
      l,
      { width: 560, height: 400 },
      { l: 80, r: 80, t: 100, b: 80 },
    );
    expect(push).toEqual({ b: l.height });
    // Pixel-length sliders push sideways when they stick out.
    const px = full({ steps: steps(3), lenmode: 'pixels', len: 300, x: 1, xanchor: 'left' });
    const pl = layoutSlider(px, measure, 400);
    expect(
      sliderBoxMarginPush(px, pl, { width: 560, height: 400 }, { l: 80, r: 80, t: 100, b: 80 })?.r,
    ).toBe(300);
  });

  it('the component pushes per visible slider', () => {
    const { fullLayout } = defaults(
      { template: 'plotly-classic', sliders: [{ steps: steps(3) }, { steps: steps(1) }] },
      [],
      registry(),
    );
    const ctx = { fullLayout, fullData: [], width: 600, height: 400, axes: new Map() };
    const pushes = slidersMarginPushes(ctx as unknown as ComponentLayoutContext);
    expect(pushes).toHaveLength(1);
    expect(pushes[0]?.b).toBeGreaterThan(40);
  });
});
