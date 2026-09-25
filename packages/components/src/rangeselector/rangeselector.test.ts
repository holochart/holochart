// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createScale, type FullLayout, type Scale } from '@mk7s/holochart-core';
import type { ComponentLayoutContext } from '@mk7s/holochart-runtime';
import type { MeasureLine } from '../shared/text.ts';
import {
  createRangeselectorView,
  rangeselectorComponent,
  type RangeselectorChartLike,
  type RangeselectorViewAxis,
  type RangeselectorViewContext,
} from './rangeselector.ts';

const measure: MeasureLine = (line, font) => line.length * font.size * 0.5;

interface FakeChart extends RangeselectorChartLike {
  relayout: ReturnType<
    typeof vi.fn<(update: Record<string, unknown>, options?: { gui?: boolean }) => Promise<unknown>>
  >;
  fullConfig: { staticPlot?: unknown };
}

function fakeChart(config: { staticPlot?: unknown } = {}): FakeChart {
  const element = document.createElement('div');
  document.body.appendChild(element);
  element.appendChild(document.createElement('canvas'));
  return { element, fullConfig: { ...config }, relayout: vi.fn(() => Promise.resolve()) };
}

function rangeselector(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    visible: true,
    buttons: [
      { step: 'month', stepmode: 'backward', count: 1, visible: true },
      { step: 'month', stepmode: 'backward', count: 6, visible: true },
      { step: 'day', stepmode: 'backward', count: 1, visible: false },
      { step: 'year', stepmode: 'todate', count: 1, label: 'YTD', visible: true },
      { step: 'all', stepmode: 'backward', count: 1, visible: true },
    ],
    x: 0,
    y: 1.02,
    xanchor: 'left',
    yanchor: 'bottom',
    font: { family: 'Arial', size: 12, color: '#444444' },
    bgcolor: '#eeeeee',
    activecolor: '#d4d4d4',
    bordercolor: '#444444',
    borderwidth: 0,
    ...over,
  };
}

interface MutableAxis extends RangeselectorViewAxis {
  full: { autorange?: unknown; rangeselector?: unknown; title?: unknown };
  scale: Scale;
}

function dateAxis(
  id: string,
  range: [string, string],
  sel: Record<string, unknown> | null = rangeselector(),
): MutableAxis {
  const scale = createScale({ type: 'date', length: 500 });
  scale.setRange(scale.r2l(range[0]), scale.r2l(range[1]));
  const n = id.slice(1);
  return {
    id,
    name: `xaxis${n}`,
    letter: 'x',
    full: {
      autorange: false,
      rangeselector: sel ?? undefined,
      title: { text: 'Trade <b>date</b>' },
    },
    scale,
  };
}

function context(...axes: MutableAxis[]): RangeselectorViewContext {
  return {
    axes: new Map(axes.map((a) => [a.id, a])),
    plotArea: { x: 80, y: 100, width: 500, height: 300 },
  };
}

const buttonsOf = (el: HTMLElement | undefined): HTMLButtonElement[] => [
  ...(el?.querySelectorAll('button') ?? []),
];

const pressed = (el: HTMLElement | undefined): string[] =>
  buttonsOf(el).map((b) => b.getAttribute('aria-pressed') ?? '');

afterEach(() => {
  document.body.replaceChildren();
});

describe('range selector view', () => {
  it('draws a labelled group of buttons in order, skipping hidden ones', () => {
    const chart = fakeChart();
    const x = dateAxis('x', ['2023-10-01 12:34:56.789', '2024-03-31 12:34:56.789']);
    const view = createRangeselectorView(chart, context(x), { measure });
    const group = view.groups.get('x');
    expect(group?.parentElement).toBe(chart.element);
    expect(group?.getAttribute('role')).toBe('group');
    expect(group?.getAttribute('aria-label')).toBe('Range selector: Trade date');
    expect(group?.style.left).toBe('80px');
    expect(group?.style.top).toBe('75px');
    const buttons = buttonsOf(group);
    expect(buttons.map((b) => b.textContent)).toEqual(['1m', '6m', 'YTD', 'all']);
    expect(buttons.every((b) => b.type === 'button' && !b.disabled)).toBe(true);
    expect(buttons.map((b) => b.title)).toEqual([
      'Last 1 month',
      'Last 6 months',
      'Year to date',
      'All',
    ]);
    expect(buttons[1]?.getAttribute('aria-label')).toBe('6m (Last 6 months)');
    expect(buttons[3]?.getAttribute('aria-label')).toBe('All');
    expect(buttons.map((b) => b.style.left)).toEqual(['0px', '35px', '70px', '105px']);
    expect(chart.element.style.position).toBe('relative');
    expect(document.getElementById('hc-rangeselector-style')).not.toBeNull();
    // The range in view is the last 6 months.
    expect(pressed(group)).toEqual(['false', 'true', 'false', 'false']);
    expect(buttons[1]?.classList.contains('hc-rangeselector-btn--active')).toBe(true);
    view.dispose();
  });

  it('relayouts on click with a GUI edit, and follows the new range', () => {
    const chart = fakeChart();
    const x = dateAxis('x', ['2023-01-01', '2024-03-31 12:34:56.789']);
    const ctx = context(x);
    const view = createRangeselectorView(chart, ctx, { measure });
    const group = view.groups.get('x');
    expect(pressed(group)).toEqual(['false', 'false', 'false', 'false']);

    buttonsOf(group)[0]?.click();
    expect(chart.relayout).toHaveBeenCalledWith(
      { 'xaxis.range[0]': '2024-03-02 12:34:56.789', 'xaxis.range[1]': '2024-03-31 12:34:56.789' },
      { gui: true },
    );
    // The runtime applies it and updates the view (a preview update only has `ticks`).
    x.scale.setRange(x.scale.r2l('2024-03-02 12:34:56.789'), x.scale.range[1]);
    view.update(ctx, { stages: new Set(['ticks']), layout: true });
    expect(pressed(group)).toEqual(['true', 'false', 'false', 'false']);

    buttonsOf(group)[2]?.click();
    expect(chart.relayout).toHaveBeenLastCalledWith(
      { 'xaxis.range[0]': '2024-01-01', 'xaxis.range[1]': '2024-03-31 12:34:56.789' },
      { gui: true },
    );

    buttonsOf(group)[3]?.click();
    expect(chart.relayout).toHaveBeenLastCalledWith({ 'xaxis.autorange': true }, { gui: true });
    x.full.autorange = true;
    x.scale.setRange(x.scale.r2l('2020-01-01'), x.scale.range[1]);
    view.update(ctx);
    expect(pressed(group)).toEqual(['false', 'false', 'false', 'true']);
    view.dispose();
  });

  it('reads the axis at click time', () => {
    const chart = fakeChart();
    const view = createRangeselectorView(
      chart,
      context(dateAxis('x', ['2023-01-01', '2024-03-31'])),
      { measure },
    );
    const later = dateAxis('x', ['2023-01-01', '2024-06-15']);
    view.update(context(later));
    buttonsOf(view.groups.get('x'))[0]?.click();
    expect(chart.relayout).toHaveBeenCalledWith(
      { 'xaxis.range[0]': '2024-05-15', 'xaxis.range[1]': '2024-06-15' },
      { gui: true },
    );
    view.dispose();
  });

  it('swallows a rejected relayout', async () => {
    const chart = fakeChart();
    chart.relayout.mockImplementation(() => Promise.reject(new Error('nope')));
    const view = createRangeselectorView(
      chart,
      context(dateAxis('x', ['2023-01-01', '2024-03-31'])),
      {
        measure,
      },
    );
    buttonsOf(view.groups.get('x'))[0]?.click();
    await Promise.resolve();
    expect(chart.relayout).toHaveBeenCalledTimes(1);
    view.dispose();
  });

  it('keeps pointer presses from reaching the chart', () => {
    const chart = fakeChart();
    const onHost = vi.fn();
    for (const type of ['pointerdown', 'mousedown', 'dblclick']) {
      chart.element.addEventListener(type, onHost);
    }
    const view = createRangeselectorView(
      chart,
      context(dateAxis('x', ['2023-01-01', '2024-03-31'])),
      {
        measure,
      },
    );
    const b = buttonsOf(view.groups.get('x'))[0];
    b?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    b?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    b?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(onHost).not.toHaveBeenCalled();
    view.dispose();
  });

  it('rebuilds buttons only when what they show changes', () => {
    const chart = fakeChart();
    const x = dateAxis('x', ['2023-01-01', '2024-03-31']);
    const view = createRangeselectorView(chart, context(x), { measure });
    const before = buttonsOf(view.groups.get('x'));
    x.scale.setRange(x.scale.r2l('2024-01-01'), x.scale.range[1]);
    view.update(context(x));
    expect(buttonsOf(view.groups.get('x'))).toEqual(before);
    expect(buttonsOf(view.groups.get('x'))[0]).toBe(before[0]);
    // A moved plot area moves the group, without a rebuild.
    view.update({ ...context(x), plotArea: { x: 100, y: 100, width: 500, height: 300 } });
    expect(view.groups.get('x')?.style.left).toBe('100px');
    expect(buttonsOf(view.groups.get('x'))[0]).toBe(before[0]);

    const next = rangeselector({ bgcolor: '#ffcc00' });
    x.full.rangeselector = next;
    view.update(context(x));
    const after = buttonsOf(view.groups.get('x'));
    expect(after[0]).not.toBe(before[0]);
    expect(view.groups.get('x')?.style.getPropertyValue('--hc-rs-bg')).toBe('#ffcc00');
    view.dispose();
  });

  it('keeps keyboard focus on the same button across a rebuild', () => {
    const chart = fakeChart();
    const x = dateAxis('x', ['2023-01-01', '2024-03-31']);
    const view = createRangeselectorView(chart, context(x), { measure });
    buttonsOf(view.groups.get('x'))[2]?.focus();
    x.full.rangeselector = rangeselector({ borderwidth: 2 });
    view.update(context(x));
    const buttons = buttonsOf(view.groups.get('x'));
    expect(document.activeElement).toBe(buttons[2]);
    expect(view.groups.get('x')?.style.getPropertyValue('--hc-rs-border')).toBe(
      '2px solid #444444',
    );
    // The border straddles the box edge.
    expect(buttons[0]?.style.left).toBe('1px');
    expect(buttons[0]?.style.width).toBe('32px');
    view.dispose();
  });

  it('draws one group per x axis with a visible selector', () => {
    const chart = fakeChart();
    const x = dateAxis('x', ['2023-01-01', '2024-03-31'], null);
    const x2 = dateAxis('x2', ['2023-01-01', '2024-03-31']);
    x2.full.title = undefined;
    const y: MutableAxis = { ...dateAxis('y', ['2023-01-01', '2024-03-31']), letter: 'y' };
    const view = createRangeselectorView(chart, context(x, x2, y), { measure });
    expect([...view.groups.keys()]).toEqual(['x2']);
    expect(view.groups.get('x2')?.getAttribute('aria-label')).toBe('Range selector (x2)');
    buttonsOf(view.groups.get('x2'))[3]?.click();
    expect(chart.relayout).toHaveBeenCalledWith({ 'xaxis2.autorange': true }, { gui: true });
    view.dispose();
  });

  it('removes the DOM and releases the host when no selector is left', () => {
    const chart = fakeChart();
    const x = dateAxis('x', ['2023-01-01', '2024-03-31']);
    const view = createRangeselectorView(chart, context(x), { measure });
    expect(chart.element.querySelector('.hc-rangeselector')).not.toBeNull();
    x.full.rangeselector = undefined;
    view.update(context(x));
    expect(chart.element.querySelector('.hc-rangeselector')).toBeNull();
    expect(chart.element.style.position).toBe('');
    x.full.rangeselector = rangeselector();
    view.update(context(x));
    expect(chart.element.querySelectorAll('button')).toHaveLength(4);
    view.dispose();
  });

  it('disposes: removes DOM and restores the host position', () => {
    const chart = fakeChart();
    chart.element.style.position = '';
    const view = createRangeselectorView(
      chart,
      context(dateAxis('x', ['2023-01-01', '2024-03-31'])),
      {
        measure,
      },
    );
    expect(chart.element.style.position).toBe('relative');
    view.dispose();
    expect(chart.element.querySelector('.hc-rangeselector')).toBeNull();
    expect(chart.element.style.position).toBe('');
    expect(view.groups.size).toBe(0);
    // Updates after dispose do nothing.
    view.update(context(dateAxis('x', ['2023-01-01', '2024-03-31'])));
    expect(chart.element.querySelector('.hc-rangeselector')).toBeNull();
  });

  it('draws disabled buttons in a static plot', () => {
    const chart = fakeChart({ staticPlot: true });
    const view = createRangeselectorView(
      chart,
      context(dateAxis('x', ['2023-01-01', '2024-03-31'])),
      {
        measure,
      },
    );
    const buttons = buttonsOf(view.groups.get('x'));
    expect(buttons).toHaveLength(4);
    expect(buttons.every((b) => b.disabled)).toBe(true);
    buttons[0]?.click();
    expect(chart.relayout).not.toHaveBeenCalled();
    view.dispose();
  });

  it('does nothing without a chart until one is located', () => {
    const found: { chart?: RangeselectorChartLike } = {};
    const ctx = context(dateAxis('x', ['2023-01-01', '2024-03-31']));
    const view = createRangeselectorView(undefined, ctx, { measure, locate: () => found.chart });
    expect(view.groups.size).toBe(0);
    const chart = fakeChart();
    found.chart = chart;
    view.update(ctx);
    expect(chart.element.querySelectorAll('button')).toHaveLength(4);
    view.dispose();
  });
});

describe('rangeselectorComponent', () => {
  it('declares itself after the modebar, without a layout schema', () => {
    expect(rangeselectorComponent.name).toBe('rangeselector');
    expect(rangeselectorComponent.order).toBe(105);
    expect(rangeselectorComponent.layoutSchema).toBeUndefined();
  });

  it('pushes a margin per x axis with a visible selector', () => {
    const ctx = {
      fullLayout: { margin: { l: 80, r: 80, t: 100, b: 80 } } as unknown as FullLayout,
      fullData: [],
      width: 700,
      height: 500,
      axes: context(
        dateAxis('x', ['2023-01-01', '2024-03-31']),
        dateAxis('x2', ['2023-01-01', '2024-03-31'], null),
      ).axes,
    } as unknown as ComponentLayoutContext;
    const pushes = rangeselectorComponent.pushMargin?.(ctx);
    expect(Array.isArray(pushes)).toBe(true);
    expect(pushes).toHaveLength(1);
    const [push] = pushes as { t?: number }[];
    expect(push?.t).toBeGreaterThan(0);
  });

  it('creates no DOM for a hand-built context without a chart', () => {
    const view = rangeselectorComponent.draw?.create({
      ...context(dateAxis('x', ['2023-01-01', '2024-03-31'])),
    } as unknown as Parameters<NonNullable<typeof rangeselectorComponent.draw>['create']>[0]);
    expect(document.querySelector('.hc-rangeselector')).toBeNull();
    view?.dispose?.();
  });
});
