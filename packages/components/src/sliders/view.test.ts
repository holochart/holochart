// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { plotlyClassicTemplate, type Template } from '@mk7s/holochart-core';
import { defaults, measure, testRegistry } from '../__testing__/fixtures.ts';
import type { SliderChangeEvent } from './events.ts';
import { slidersComponent } from './sliders.ts';
import {
  createSlidersView,
  cssEasing,
  type SlidersChartLike,
  type SlidersViewContext,
  type SlidersViewOptions,
} from './view.ts';

type FakeChart = SlidersChartLike & {
  restyle: ReturnType<typeof vi.fn>;
  relayout: ReturnType<typeof vi.fn>;
  updateAttributes: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
};

function fakeChart(): FakeChart {
  const element = document.createElement('div');
  document.body.appendChild(element);
  return {
    element,
    restyle: vi.fn(() => Promise.resolve()),
    relayout: vi.fn(() => Promise.resolve()),
    updateAttributes: vi.fn(() => Promise.resolve()),
    emit: vi.fn(),
    on: vi.fn(() => () => undefined),
  } as unknown as FakeChart;
}

const registry = testRegistry([slidersComponent]).registerTemplate(
  'plotly-classic',
  plotlyClassicTemplate as Template,
);

function context(layout: Record<string, unknown>): SlidersViewContext {
  const { fullLayout, fullData } = defaults(
    { template: 'plotly-classic', ...layout },
    [{}],
    registry,
  );
  return {
    fullLayout,
    fullData,
    plotArea: { x: 80, y: 100, width: 420, height: 200 },
    width: 600,
    height: 450,
  };
}

const STEPS = Array.from({ length: 5 }, (_, i) => ({
  label: `${2000 + i}`,
  method: 'restyle',
  args: ['marker.size', 4 + i],
}));

const layoutWith = (extra: Record<string, unknown> = {}) => ({
  sliders: [
    { steps: STEPS, pad: { l: 10, r: 10, t: 20 }, currentvalue: { prefix: 'Year: ' }, ...extra },
  ],
});

/** Runs scheduled step methods on demand. */
function manualFrames() {
  const queue: (() => void)[] = [];
  const schedule: SlidersViewOptions<SlidersViewContext>['schedule'] = (cb) => {
    queue.push(cb);
    return () => queue.splice(queue.indexOf(cb), 1);
  };
  return { schedule, flush: () => queue.splice(0).forEach((cb) => cb()) };
}

function pointer(type: string, clientX: number): PointerEvent {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, button: 0 });
  Object.defineProperty(e, 'pointerId', { value: 1 });
  return e as PointerEvent;
}

const key = (el: Element, k: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

afterEach(() => document.body.replaceChildren());

describe('sliders view', () => {
  it('renders an accessible slider handle with ticks, labels and the current value', () => {
    const chart = fakeChart();
    const view = createSlidersView(chart, context(layoutWith({ active: 2 })), { measure });
    const grip = view.root?.querySelector('[role="slider"]') as HTMLElement;
    expect(grip.tabIndex).toBe(0);
    expect(grip.getAttribute('aria-valuemin')).toBe('0');
    expect(grip.getAttribute('aria-valuemax')).toBe('4');
    expect(grip.getAttribute('aria-valuenow')).toBe('2');
    expect(grip.getAttribute('aria-valuetext')).toBe('Year: 2002');
    expect(grip.getAttribute('aria-label')).toBe('Year');
    const value = view.root?.querySelector('.hc-slider-value') as HTMLElement;
    expect(value.textContent).toBe('Year: 2002');
    expect(value.getAttribute('aria-hidden')).toBe('true');
    expect(view.root?.querySelectorAll('.hc-slider-tick')).toHaveLength(5);
    expect(
      [...(view.root?.querySelectorAll('.hc-slider-label') ?? [])].map((l) => l.textContent),
    ).toEqual(['2000', '2001', '2002', '2003', '2004']);
    // Below the plot area (y = 0, anchored top), full plot width.
    const box = view.root?.querySelector('.hc-slider') as HTMLElement;
    expect(box.style.left).toBe('80px');
    expect(box.style.top).toBe('300px');
    expect(box.style.width).toBe('420px');
    view.dispose();
    expect(chart.element.querySelector('.hc-sliders')).toBeNull();
  });

  it('keys step, page and jump; each runs the step method on the next frame', () => {
    const chart = fakeChart();
    const frames = manualFrames();
    const view = createSlidersView(chart, context(layoutWith()), {
      measure,
      schedule: frames.schedule,
    });
    const grip = view.root?.querySelector('[role="slider"]') as HTMLElement;
    key(grip, 'ArrowRight');
    expect(grip.getAttribute('aria-valuenow')).toBe('1');
    expect(chart.relayout).toHaveBeenCalledWith({ 'sliders[0].active': 1 }, { gui: true });
    const change = chart.emit.mock.calls[0] as [string, SliderChangeEvent];
    expect(change[0]).toBe('sliderchange');
    expect(change[1]).toMatchObject({ interaction: true, previousActive: 0 });
    expect(change[1].step?.label).toBe('2001');
    expect(chart.restyle).not.toHaveBeenCalled();
    key(grip, 'End');
    key(grip, 'ArrowLeft');
    frames.flush();
    // Coalesced: only the latest step runs (Plotly's `_nextMethod`).
    expect(chart.restyle).toHaveBeenCalledTimes(1);
    expect(chart.restyle).toHaveBeenCalledWith({ 'marker.size': 7 }, undefined);
    key(grip, 'Home');
    expect(grip.getAttribute('aria-valuenow')).toBe('0');
    key(grip, 'PageUp');
    expect(grip.getAttribute('aria-valuenow')).toBe('1');
    key(grip, 'ArrowDown');
    expect(grip.getAttribute('aria-valuenow')).toBe('0');
    key(grip, 'ArrowDown'); // at the start: nothing
    expect(chart.emit.mock.calls.filter((c) => c[0] === 'sliderchange')).toHaveLength(6);
  });

  it('pointer: press picks the nearest step, drag snaps, release ends', () => {
    const chart = fakeChart();
    const frames = manualFrames();
    const view = createSlidersView(chart, context(layoutWith()), {
      measure,
      schedule: frames.schedule,
    });
    const track = view.root?.querySelector('.hc-slider-track') as HTMLElement;
    const box = view.root?.querySelector('.hc-slider') as HTMLElement;
    box.getBoundingClientRect = () => ({ left: 100 }) as DOMRect;
    // Steps at 20, 115, 210, 305, 400 (box px).
    track.dispatchEvent(pointer('pointerdown', 100 + 210));
    const names = () => chart.emit.mock.calls.map((c) => c[0]);
    expect(names()).toEqual(['sliderstart', 'sliderchange']);
    const grip = view.root?.querySelector('[role="slider"]') as HTMLElement;
    expect(grip.hasAttribute('data-dragging')).toBe(true);
    expect(grip.style.transition).toMatch(/^left 150ms cubic-bezier/);
    track.dispatchEvent(pointer('pointermove', 100 + 300));
    expect(grip.getAttribute('aria-valuenow')).toBe('3');
    expect(grip.style.transition).toBe('none');
    track.dispatchEvent(pointer('pointermove', 100 + 310)); // same step: no event
    track.dispatchEvent(pointer('pointerup', 100 + 310));
    expect(names()).toEqual(['sliderstart', 'sliderchange', 'sliderchange', 'sliderend']);
    expect(chart.emit.mock.calls.at(-1)?.[1]).toMatchObject({ step: { label: '2003' } });
    frames.flush();
    expect(chart.restyle).toHaveBeenCalledTimes(1);
  });

  it('execute: false moves the slider without running the method', () => {
    const chart = fakeChart();
    const frames = manualFrames();
    const steps = STEPS.map((s) => ({ ...s, execute: false }));
    const view = createSlidersView(chart, context(layoutWith({ steps })), {
      measure,
      schedule: frames.schedule,
    });
    key(view.root?.querySelector('[role="slider"]') as HTMLElement, 'ArrowRight');
    frames.flush();
    expect(chart.restyle).not.toHaveBeenCalled();
    expect(chart.emit).toHaveBeenCalledWith('sliderchange', expect.anything());
  });

  it('follows the figure (simple binding) without running methods', () => {
    const chart = fakeChart();
    const frames = manualFrames();
    const steps = ['linear', 'log'].map((t) => ({
      label: t,
      method: 'relayout',
      args: ['yaxis.type', t],
    }));
    const view = createSlidersView(
      chart,
      context({ sliders: [{ steps }], yaxis: { type: 'linear' } }),
      {
        measure,
        schedule: frames.schedule,
      },
    );
    view.update(context({ sliders: [{ steps }], yaxis: { type: 'log' } }));
    const grip = view.root?.querySelector('[role="slider"]') as HTMLElement;
    expect(grip.getAttribute('aria-valuenow')).toBe('1');
    expect(chart.emit).toHaveBeenCalledWith(
      'sliderchange',
      expect.objectContaining({ interaction: false, previousActive: 0 }),
    );
    frames.flush();
    expect(chart.relayout).not.toHaveBeenCalledWith({ 'yaxis.type': 'log' });
  });

  it('animation hook: animatingframe moves sliders that animate single frames', () => {
    const chart = fakeChart();
    const steps = ['a', 'b', 'c'].map((f) => ({ label: f, method: 'animate', args: [[f]] }));
    const view = createSlidersView(chart, context({ sliders: [{ steps }] }), { measure });
    expect(chart.on).toHaveBeenCalledWith('animatingframe', expect.any(Function));
    view.frame('c');
    const grip = view.root?.querySelector('[role="slider"]') as HTMLElement;
    expect(grip.getAttribute('aria-valuenow')).toBe('2');
    const listener = chart.on.mock.calls[0]?.[1] as (p: unknown) => void;
    listener({ name: 'b' });
    expect(grip.getAttribute('aria-valuenow')).toBe('1');
  });

  it('keeps DOM across updates and hides with fewer than two steps', () => {
    const chart = fakeChart();
    const view = createSlidersView(chart, context(layoutWith()), { measure });
    const grip = view.root?.querySelector('[role="slider"]') as HTMLElement;
    grip.focus();
    view.update(context(layoutWith({ active: 3 })));
    expect(view.root?.querySelector('[role="slider"]')).toBe(grip);
    expect(document.activeElement).toBe(grip);
    expect(grip.getAttribute('aria-valuenow')).toBe('3');
    view.update(context({ sliders: [{ steps: STEPS.slice(0, 1) }] }));
    expect(view.root).toBeUndefined();
  });
});

describe('cssEasing', () => {
  it("maps Plotly's (d3 v3) easings to CSS", () => {
    expect(cssEasing('linear')).toBe('linear');
    expect(cssEasing('cubic-in-out')).toBe('cubic-bezier(0.65,0,0.35,1)');
    // A bare name is `-in` in d3 v3.
    expect(cssEasing('cubic')).toBe('cubic-bezier(0.32,0,0.67,0)');
    expect(cssEasing('quad-in')).toBe('cubic-bezier(0.11,0,0.5,0)');
    // d3 v3's elastic and bounce bases are out-shaped: `-in` overshoots / bounces at the end.
    expect(cssEasing('elastic-in')).toBe(cssEasing('back-out'));
    expect(cssEasing('elastic-out')).toBe(cssEasing('back-in'));
    expect(cssEasing('bounce-in')).toBe(cssEasing('cubic-out'));
    expect(cssEasing('bounce-in-out')).toBe(cssEasing('cubic-in-out'));
  });
});
