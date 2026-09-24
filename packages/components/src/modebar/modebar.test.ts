// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createRegistry,
  supplyDefaults,
  type FullLayout,
  type FullTrace,
} from '@mk7s/holochart-core';
import { modebarDownloadImage, type ModebarAxisLike } from './actions.ts';
import {
  createModebarView,
  modebarComponent,
  supplyModebarDefaults,
  type ModebarChartLike,
  type ModebarViewContext,
} from './modebar.ts';

function axis(name: string, range: [number, number]): ModebarAxisLike {
  return { name, full: {}, scale: { range, l2r: (l) => l } };
}

interface FakeChart extends ModebarChartLike {
  relayout: ReturnType<typeof vi.fn<(update: Record<string, unknown>) => Promise<unknown>>>;
  fullConfig: Record<string, unknown>;
  layout: Record<string, unknown>;
  downloadImage: ReturnType<typeof vi.fn<(options: Record<string, unknown>) => Promise<unknown>>>;
}

function fakeChart(config: Record<string, unknown> = {}): FakeChart {
  const element = document.createElement('div');
  document.body.appendChild(element);
  element.appendChild(document.createElement('canvas'));
  return {
    element,
    layout: { xaxis: { range: [0, 10] } },
    fullConfig: {
      displayModeBar: 'hover',
      staticPlot: false,
      modeBarButtonsToRemove: [],
      modeBarButtonsToAdd: [],
      toImageButtonOptions: { filename: 'my-plot' },
      ...config,
    },
    axes: new Map([
      ['x', axis('xaxis', [0, 10])],
      ['y', axis('yaxis', [0, 4])],
    ]),
    relayout: vi.fn(() => Promise.resolve()),
    downloadImage: vi.fn(() => Promise.resolve('my-plot.png')),
  };
}

function context(
  chart: ModebarChartLike,
  layout: Record<string, unknown> = {},
  fullData: readonly Partial<FullTrace>[] = [],
): ModebarViewContext {
  return {
    fullLayout: {
      dragmode: 'zoom',
      hovermode: 'closest',
      modebar: {
        orientation: 'h',
        bgcolor: 'rgba(255, 255, 255, 0.5)',
        color: 'rgba(68, 68, 68, 0.3)',
        activecolor: 'rgba(68, 68, 68, 0.7)',
        add: [],
        remove: [],
      },
      ...layout,
    } as unknown as FullLayout,
    fullData: fullData as readonly FullTrace[],
    axes: chart.axes as ModebarViewContext['axes'],
  };
}

const button = (bar: HTMLElement | undefined, name: string): HTMLButtonElement => {
  const el = bar?.querySelector<HTMLButtonElement>(`button[data-button="${name}"]`);
  if (!el) throw new Error(`no button ${name}`);
  return el;
};

const buttonNames = (bar: HTMLElement | undefined): string[] =>
  [...(bar?.querySelectorAll<HTMLButtonElement>('button') ?? [])].map(
    (b) => b.dataset['button'] ?? '',
  );

afterEach(() => {
  document.body.replaceChildren();
  document.getElementById('hc-modebar-style')?.remove();
  vi.restoreAllMocks();
});

describe('modebar view', () => {
  it('renders an accessible toolbar with the default cartesian buttons', () => {
    const chart = fakeChart();
    const view = createModebarView(chart, context(chart));
    const bar = view.toolbar;
    expect(bar?.parentElement).toBe(chart.element);
    expect(bar?.getAttribute('role')).toBe('toolbar');
    expect(bar?.getAttribute('aria-label')).toBe('Chart toolbar');
    expect(bar?.getAttribute('aria-orientation')).toBe('horizontal');
    expect(bar?.querySelectorAll('.hc-modebar-group')).toHaveLength(3);
    expect(buttonNames(bar)).toEqual([
      'toImage',
      'zoom2d',
      'pan2d',
      'zoomIn2d',
      'zoomOut2d',
      'autoScale2d',
      'resetScale2d',
    ]);

    const zoom = button(bar, 'zoom2d');
    expect(zoom.type).toBe('button');
    expect(zoom.getAttribute('aria-label')).toBe('Zoom');
    expect(zoom.title).toBe('Zoom');
    expect(zoom.getAttribute('aria-pressed')).toBe('true');
    expect(button(bar, 'pan2d').getAttribute('aria-pressed')).toBe('false');
    expect(button(bar, 'toImage').hasAttribute('aria-pressed')).toBe(false);
    expect(button(bar, 'toImage').title).toBe('Download plot as a PNG');
    expect(button(bar, 'resetScale2d').title).toBe('Reset axes');

    const svg = zoom.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('focusable')).toBe('false');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg?.getAttribute('fill')).toBe('currentColor');

    expect(bar?.style.getPropertyValue('--hc-modebar-active')).toBe('rgba(68, 68, 68, 0.7)');
    expect(chart.element.classList.contains('hc-modebar-host--hover')).toBe(true);
    expect(chart.element.style.position).toBe('relative');
    expect(document.head.querySelectorAll('#hc-modebar-style')).toHaveLength(1);
    // A second modebar reuses the shared stylesheet.
    const other = fakeChart();
    createModebarView(other, context(other));
    expect(document.head.querySelectorAll('#hc-modebar-style')).toHaveLength(1);
  });

  it('switches dragmode and hovermode through relayout', () => {
    const chart = fakeChart({ modeBarButtonsToAdd: ['hovercompare'] });
    const view = createModebarView(chart, context(chart));
    button(view.toolbar, 'zoom2d').click();
    expect(chart.relayout).not.toHaveBeenCalled();
    button(view.toolbar, 'pan2d').click();
    expect(chart.relayout).toHaveBeenLastCalledWith({ dragmode: 'pan' });
    button(view.toolbar, 'hoverCompareCartesian').click();
    expect(chart.relayout).toHaveBeenLastCalledWith({ hovermode: 'x' });
  });

  it('zooms, autoscales and resets all axes in one relayout each', () => {
    const chart = fakeChart();
    const view = createModebarView(chart, context(chart));
    // The input changes after the modebar recorded it (e.g. a zoom): reset uses the recording.
    chart.layout = { xaxis: { range: [2, 3] }, yaxis: { range: [1, 2] } };
    button(view.toolbar, 'zoomIn2d').click();
    expect(chart.relayout).toHaveBeenLastCalledWith({
      'xaxis.range': [2.5, 7.5],
      'yaxis.range': [1, 3],
    });
    button(view.toolbar, 'zoomOut2d').click();
    expect(chart.relayout).toHaveBeenLastCalledWith({
      'xaxis.range': [-5, 15],
      'yaxis.range': [-2, 6],
    });
    button(view.toolbar, 'autoScale2d').click();
    expect(chart.relayout).toHaveBeenLastCalledWith({
      'xaxis.autorange': true,
      'yaxis.autorange': true,
    });
    button(view.toolbar, 'resetScale2d').click();
    expect(chart.relayout).toHaveBeenLastCalledWith({
      'xaxis.range': [0, 10],
      'yaxis.autorange': true,
      'yaxis.range': null,
    });
    expect(chart.relayout).toHaveBeenCalledTimes(4);
  });

  it('exports with chart.downloadImage and config.toImageButtonOptions', () => {
    const chart = fakeChart();
    const view = createModebarView(chart, context(chart));
    button(view.toolbar, 'toImage').click();
    expect(chart.downloadImage).toHaveBeenCalledTimes(1);
    expect(chart.downloadImage).toHaveBeenCalledWith({ filename: 'my-plot' });
  });

  it('passes format, size and scale from toImageButtonOptions, dropping invalid values', () => {
    const chart = fakeChart({
      toImageButtonOptions: {
        format: 'webp',
        filename: '',
        width: 800,
        height: -1,
        scale: 2,
      },
    });
    const view = createModebarView(chart, context(chart));
    button(view.toolbar, 'toImage').click();
    expect(chart.downloadImage).toHaveBeenCalledWith({ format: 'webp', width: 800, scale: 2 });
  });

  it('logs a failed export instead of throwing', async () => {
    const chart = fakeChart();
    const error = new Error('no GPU');
    chart.downloadImage.mockImplementation(() => Promise.reject(error));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await modebarDownloadImage(chart);
    expect(log).toHaveBeenCalledWith('holochart: image export failed', error);
    log.mockRestore();
  });

  it('calls custom buttons with the chart and the event', () => {
    const click = vi.fn();
    const chart = fakeChart({
      modeBarButtonsToAdd: [{ name: 'mine', title: 'My action', click }],
    });
    const view = createModebarView(chart, context(chart));
    const el = button(view.toolbar, 'mine');
    expect(el.getAttribute('aria-label')).toBe('My action');
    el.click();
    expect(click).toHaveBeenCalledTimes(1);
    expect(click.mock.calls[0]?.[0]).toBe(chart);
    expect(click.mock.calls[0]?.[1]).toBeInstanceOf(MouseEvent);
  });

  it('refreshes pressed states without rebuilding, and rebuilds when the set changes', () => {
    const chart = fakeChart();
    const view = createModebarView(chart, context(chart));
    const pan = button(view.toolbar, 'pan2d');
    view.update(context(chart, { dragmode: 'pan' }));
    expect(button(view.toolbar, 'pan2d')).toBe(pan);
    expect(pan.getAttribute('aria-pressed')).toBe('true');
    expect(button(view.toolbar, 'zoom2d').getAttribute('aria-pressed')).toBe('false');

    const selectable = { visible: true, _module: { selectPoints: () => [] } } as never;
    view.update(context(chart, {}, [selectable]));
    expect(buttonNames(view.toolbar)).toContain('lasso2d');
    expect(button(view.toolbar, 'pan2d')).not.toBe(pan);
  });

  it('follows orientation and colors from layout.modebar', () => {
    const chart = fakeChart();
    const view = createModebarView(chart, context(chart));
    view.update(
      context(chart, {
        modebar: { orientation: 'v', bgcolor: 'red', color: 'blue', activecolor: 'green' },
      }),
    );
    const bar = view.toolbar;
    expect(bar?.getAttribute('aria-orientation')).toBe('vertical');
    expect(bar?.style.getPropertyValue('--hc-modebar-bg')).toBe('red');
    expect(bar?.style.getPropertyValue('--hc-modebar-color')).toBe('blue');
    expect(bar?.style.getPropertyValue('--hc-modebar-active')).toBe('green');
  });

  it('moves focus with arrow keys (roving tabindex)', () => {
    const chart = fakeChart();
    const view = createModebarView(chart, context(chart));
    const bar = view.toolbar as HTMLElement;
    const all = [...bar.querySelectorAll('button')];
    expect(all.map((b) => b.tabIndex)).toEqual([0, -1, -1, -1, -1, -1, -1]);
    all[0]?.focus();
    all[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(all[1]);
    expect(all[1]?.tabIndex).toBe(0);
    expect(all[0]?.tabIndex).toBe(-1);
    all[1]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(all[6]);
    all[6]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(all[0]);

    view.update(context(chart, { modebar: { orientation: 'v' } }));
    all[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(all[1]);
  });

  it('shows always with displayModeBar true, and no DOM with false or staticPlot', () => {
    const always = fakeChart({ displayModeBar: true });
    const view = createModebarView(always, context(always));
    expect(view.toolbar).toBeDefined();
    expect(always.element.classList.contains('hc-modebar-host--hover')).toBe(false);

    always.fullConfig = { ...always.fullConfig, displayModeBar: false };
    view.update(context(always));
    expect(view.toolbar).toBeUndefined();
    expect(always.element.querySelector('.hc-modebar')).toBeNull();
    expect(always.element.classList.contains('hc-modebar-host')).toBe(false);

    const frozen = fakeChart({ staticPlot: true });
    expect(createModebarView(frozen, context(frozen)).toolbar).toBeUndefined();
    expect(frozen.element.children).toHaveLength(1);
  });

  it('selects draw dragmodes and erases the active shape', async () => {
    const { setShapeEraser } = await import('../shapes/draw.ts');
    const chart = fakeChart({ modeBarButtonsToAdd: ['drawrect', 'eraseshape'] });
    const view = createModebarView(chart, context(chart));
    button(view.toolbar, 'drawrect').click();
    expect(chart.relayout).toHaveBeenLastCalledWith({ dragmode: 'drawrect' });
    view.update(context(chart, { dragmode: 'drawrect' }));
    expect(button(view.toolbar, 'drawrect').getAttribute('aria-pressed')).toBe('true');
    expect(button(view.toolbar, 'zoom2d').getAttribute('aria-pressed')).toBe('false');
    const erase = vi.fn(() => true);
    setShapeEraser(chart, erase);
    button(view.toolbar, 'eraseshape').click();
    expect(erase).toHaveBeenCalledOnce();
    expect(button(view.toolbar, 'eraseshape').hasAttribute('aria-pressed')).toBe(false);
  });

  it('on touch, shows after a tap on the chart and hides after a tap elsewhere', () => {
    const chart = fakeChart();
    createModebarView(chart, context(chart));
    const host = chart.element;
    const tap = (target: Element, pointerType = 'touch'): void => {
      target.dispatchEvent(new PointerEvent('pointerdown', { pointerType, bubbles: true }));
    };
    const css = document.getElementById('hc-modebar-style')?.textContent ?? '';
    // No always-shown rule for hover-less devices any more.
    expect(css).not.toContain('hover:none');
    expect(css).toContain('.hc-modebar-host--hover.hc-modebar-host--touched .hc-modebar');
    tap(host.querySelector('canvas') as Element, 'mouse');
    expect(host.classList.contains('hc-modebar-host--touched')).toBe(false);
    tap(host.querySelector('canvas') as Element);
    expect(host.classList.contains('hc-modebar-host--touched')).toBe(true);
    // Taps inside the chart (the toolbar included) keep it shown.
    tap(host.querySelector('.hc-modebar') as Element);
    expect(host.classList.contains('hc-modebar-host--touched')).toBe(true);
    tap(document.body);
    expect(host.classList.contains('hc-modebar-host--touched')).toBe(false);
  });

  it('does nothing without a chart until one is located', () => {
    const chart = fakeChart();
    const found: { chart?: ModebarChartLike } = {};
    const view = createModebarView(undefined, context(chart), { locate: () => found.chart });
    expect(view.toolbar).toBeUndefined();
    found.chart = chart;
    view.update(context(chart));
    expect(view.toolbar?.parentElement).toBe(chart.element);
  });

  it('cleans up everything on dispose', () => {
    const chart = fakeChart();
    chart.element.style.position = '';
    const view = createModebarView(chart, context(chart));
    const bar = view.toolbar;
    chart.element.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch' }));
    view.dispose();
    expect(bar?.isConnected).toBe(false);
    expect(chart.element.className).toBe('');
    // Touch listeners are gone too.
    chart.element.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch' }));
    expect(chart.element.className).toBe('');
    expect(chart.element.style.position).toBe('');
    view.update(context(chart));
    expect(chart.element.querySelector('.hc-modebar')).toBeNull();
  });

  it('keeps a non-static host position untouched', () => {
    const chart = fakeChart();
    chart.element.style.position = 'absolute';
    const view = createModebarView(chart, context(chart));
    view.dispose();
    expect(chart.element.style.position).toBe('absolute');
  });
});

describe('modebar layout defaults', () => {
  it('derives colors from paper_bgcolor and font.color, only when unset', () => {
    const layout = {
      paper_bgcolor: '#000',
      font: { color: 'rgb(10, 20, 30)' },
      modebar: { orientation: 'h', color: 'red' },
    } as unknown as FullLayout;
    supplyModebarDefaults({}, layout);
    const once = { ...(layout['modebar'] as object) };
    expect(once).toEqual({
      orientation: 'h',
      bgcolor: 'rgba(0, 0, 0, 0.5)',
      color: 'red',
      activecolor: 'rgba(10, 20, 30, 0.7)',
    });
    supplyModebarDefaults({}, layout);
    expect(layout['modebar']).toEqual(once);
  });

  it('coerces layout.modebar through the registry', () => {
    const registry = createRegistry().registerComponent(modebarComponent);
    const { fullLayout } = supplyDefaults(
      { layout: { modebar: { orientation: 'v', remove: ['zoom', 'pan'] } } },
      registry,
    );
    expect(fullLayout['modebar']).toMatchObject({
      orientation: 'v',
      remove: ['zoom', 'pan'],
      add: [],
      bgcolor: 'rgba(255, 255, 255, 0.5)',
      color: 'rgba(68, 68, 68, 0.3)',
      activecolor: 'rgba(68, 68, 68, 0.7)',
    });
    const dflt = supplyDefaults({}, registry).fullLayout['modebar'];
    expect(dflt).toMatchObject({ orientation: 'h' });
  });

  it('is registered as a component named modebar, drawn last', () => {
    expect(modebarComponent.name).toBe('modebar');
    expect(modebarComponent.order).toBe(100);
    expect(typeof modebarComponent.draw?.create).toBe('function');
  });
});
