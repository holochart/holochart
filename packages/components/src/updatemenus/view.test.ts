// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { plotlyClassicTemplate, type FullLayout, type Template } from '@mk7s/holochart-core';
import { defaults, measure, testRegistry } from '../__testing__/fixtures.ts';
import type { ButtonClickedEvent } from './events.ts';
import { updatemenusComponent } from './updatemenus.ts';
import {
  createUpdatemenusView,
  type UpdatemenusChartLike,
  type UpdatemenusViewContext,
} from './view.ts';

type FakeChart = UpdatemenusChartLike & {
  restyle: ReturnType<typeof vi.fn>;
  relayout: ReturnType<typeof vi.fn>;
  updateAttributes: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  animate?: ReturnType<typeof vi.fn>;
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
  } as unknown as FakeChart;
}

const registry = testRegistry([updatemenusComponent]).registerTemplate(
  'plotly-classic',
  plotlyClassicTemplate as Template,
);

function context(
  layout: Record<string, unknown>,
  data: Record<string, unknown>[] = [{}, {}],
): UpdatemenusViewContext {
  const { fullLayout, fullData } = defaults(
    { template: 'plotly-classic', ...layout },
    data,
    registry,
  );
  return {
    fullLayout,
    fullData,
    plotArea: { x: 80, y: 100, width: 460, height: 220 },
    width: 700,
    height: 450,
  };
}

const VISIBILITY = [
  { label: 'All', method: 'restyle', args: ['visible', [true, true]] },
  { label: 'First', method: 'restyle', args: ['visible', [true, false]] },
  { label: 'Second', method: 'restyle', args: ['visible', [false, true]] },
];

const buttonsMenu = (extra: Record<string, unknown> = {}) => ({
  updatemenus: [{ type: 'buttons', direction: 'right', buttons: VISIBILITY, ...extra }],
});

const key = (el: Element, k: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

afterEach(() => {
  document.body.replaceChildren();
});

describe('update menus view: buttons', () => {
  it('renders a toolbar of toggle buttons positioned from the layout', () => {
    const chart = fakeChart();
    const view = createUpdatemenusView(chart, context(buttonsMenu()), { measure });
    const bar = view.root?.querySelector('[role="toolbar"]') as HTMLElement;
    expect(bar).toBeTruthy();
    expect(bar.getAttribute('aria-orientation')).toBe('horizontal');
    expect(bar.getAttribute('aria-label')).toBe('Menu 1');
    const buttons = [...bar.querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['All', 'First', 'Second']);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    expect(buttons.map((b) => b.tabIndex)).toEqual([0, -1, -1]);
    // x = -0.05 anchored right, y = 1 anchored top.
    expect(bar.style.top).toBe('100px');
    expect(parseFloat(bar.style.left) + parseFloat(bar.style.width)).toBeCloseTo(
      80 - 0.05 * 460,
      0,
    );
    expect(chart.element.style.position).toBe('relative');
    view.dispose();
    expect(chart.element.querySelector('.hc-menus')).toBeNull();
    expect(chart.element.style.position).toBe('');
  });

  it('a click runs the method, stores active with a GUI relayout and emits buttonclicked', () => {
    const chart = fakeChart();
    const ctx = context(buttonsMenu());
    const view = createUpdatemenusView(chart, ctx, { measure });
    const second = view.root?.querySelectorAll('button')[2] as HTMLButtonElement;
    second.click();
    expect(chart.restyle).toHaveBeenCalledWith({ visible: [false, true] }, undefined);
    expect(chart.relayout).toHaveBeenCalledWith({ 'updatemenus[0].active': 2 }, { gui: true });
    expect(second.getAttribute('aria-pressed')).toBe('true');
    const [type, payload] = chart.emit.mock.calls[0] as [string, ButtonClickedEvent];
    expect(type).toBe('buttonclicked');
    expect(payload.active).toBe(2);
    expect(payload.button.label).toBe('Second');
    expect(payload.menu.active).toBe(2);
    expect(payload.event).toBeInstanceOf(MouseEvent);
  });

  it('args2 toggles: a second click on the active button runs args2 and clears active', () => {
    const chart = fakeChart();
    const menu = {
      type: 'buttons',
      active: -1,
      buttons: [
        {
          label: 'Log',
          method: 'relayout',
          args: ['yaxis.type', 'log'],
          args2: ['yaxis.type', 'linear'],
        },
      ],
    };
    const view = createUpdatemenusView(chart, context({ updatemenus: [menu] }), { measure });
    const button = view.root?.querySelector('button') as HTMLButtonElement;
    expect(button.getAttribute('aria-pressed')).toBe('false');
    button.click();
    expect(chart.relayout).toHaveBeenCalledWith({ 'yaxis.type': 'log' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    button.click();
    expect(chart.relayout).toHaveBeenCalledWith({ 'yaxis.type': 'linear' });
    expect(chart.relayout).toHaveBeenCalledWith({ 'updatemenus[0].active': -1 }, { gui: true });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect((chart.emit.mock.calls[1]?.[1] as ButtonClickedEvent).active).toBe(-1);
  });

  it('execute: false only emits', () => {
    const chart = fakeChart();
    const buttons = VISIBILITY.map((b) => ({ ...b, execute: false }));
    const view = createUpdatemenusView(chart, context(buttonsMenu({ buttons })), { measure });
    (view.root?.querySelectorAll('button')[1] as HTMLButtonElement).click();
    expect(chart.restyle).not.toHaveBeenCalled();
    expect(chart.relayout).not.toHaveBeenCalled();
    expect(chart.emit).toHaveBeenCalledWith(
      'buttonclicked',
      expect.objectContaining({ active: 0 }),
    );
  });

  it('showactive: false makes plain action buttons (no aria-pressed)', () => {
    const view = createUpdatemenusView(fakeChart(), context(buttonsMenu({ showactive: false })), {
      measure,
    });
    const buttons = [...(view.root?.querySelectorAll('button') ?? [])];
    expect(buttons.every((b) => !b.hasAttribute('aria-pressed'))).toBe(true);
    expect(buttons.some((b) => b.hasAttribute('data-active'))).toBe(false);
  });

  it('arrow keys, Home and End move the single tab stop', () => {
    const view = createUpdatemenusView(fakeChart(), context(buttonsMenu()), { measure });
    const buttons = [...(view.root?.querySelectorAll('button') ?? [])];
    buttons[0]?.focus();
    key(buttons[0] as HTMLElement, 'ArrowRight');
    expect(document.activeElement).toBe(buttons[1]);
    expect(buttons.map((b) => b.tabIndex)).toEqual([-1, 0, -1]);
    key(buttons[1] as HTMLElement, 'End');
    expect(document.activeElement).toBe(buttons[2]);
    key(buttons[2] as HTMLElement, 'ArrowRight');
    expect(document.activeElement).toBe(buttons[0]);
    key(buttons[0] as HTMLElement, 'ArrowLeft');
    expect(document.activeElement).toBe(buttons[2]);
    key(buttons[2] as HTMLElement, 'Home');
    expect(document.activeElement).toBe(buttons[0]);
    // Vertical menus use Up/Down.
    const v = createUpdatemenusView(fakeChart(), context(buttonsMenu({ direction: 'down' })), {
      measure,
    });
    const vb = [...(v.root?.querySelectorAll('button') ?? [])];
    vb[0]?.focus();
    key(vb[0] as HTMLElement, 'ArrowDown');
    expect(document.activeElement).toBe(vb[1]);
  });

  it('pointer presses do not reach the chart', () => {
    const chart = fakeChart();
    const onDown = vi.fn();
    chart.element.addEventListener('pointerdown', onDown);
    const view = createUpdatemenusView(chart, context(buttonsMenu()), { measure });
    view.root?.querySelector('button')?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(onDown).not.toHaveBeenCalled();
  });

  it('hidden and empty menus render nothing', () => {
    const view = createUpdatemenusView(
      fakeChart(),
      context({ updatemenus: [{ visible: false, buttons: VISIBILITY }] }),
      { measure },
    );
    expect(view.root).toBeUndefined();
  });
});

describe('update menus view: dropdown', () => {
  const dropdown = (extra: Record<string, unknown> = {}) => ({
    updatemenus: [{ buttons: VISIBILITY, ...extra }],
  });

  it('a header button with a listbox; click opens, choosing runs and closes', () => {
    const chart = fakeChart();
    const view = createUpdatemenusView(chart, context(dropdown({ active: 1 })), { measure });
    const header = view.root?.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement;
    const list = view.root?.querySelector('[role="listbox"]') as HTMLElement;
    expect(header.textContent).toBe('First');
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(header.getAttribute('aria-controls')).toBe(list.id);
    const options = [...list.querySelectorAll('[role="option"]')];
    expect(options.map((o) => o.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    header.click();
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(list.hasAttribute('data-open')).toBe(true);
    expect(list.getAttribute('aria-activedescendant')).toBe(options[1]?.id);
    (options[2] as HTMLElement).click();
    expect(chart.restyle).toHaveBeenCalledWith({ visible: [false, true] }, undefined);
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(header.textContent).toBe('Second');
    expect(document.activeElement).toBe(header);
  });

  it('keyboard: arrows open and move, Enter chooses, Escape closes, letters jump', () => {
    const chart = fakeChart();
    const view = createUpdatemenusView(chart, context(dropdown()), { measure });
    const header = view.root?.querySelector('button') as HTMLButtonElement;
    const list = view.root?.querySelector('[role="listbox"]') as HTMLElement;
    const ids = [...list.querySelectorAll('[role="option"]')].map((o) => o.id);
    header.focus();
    key(header, 'ArrowDown');
    expect(document.activeElement).toBe(list);
    expect(list.getAttribute('aria-activedescendant')).toBe(ids[0]);
    key(list, 'ArrowDown');
    expect(list.getAttribute('aria-activedescendant')).toBe(ids[1]);
    key(list, 'End');
    expect(list.getAttribute('aria-activedescendant')).toBe(ids[2]);
    key(list, 'f');
    expect(list.getAttribute('aria-activedescendant')).toBe(ids[1]);
    key(list, 'Escape');
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(header);
    expect(chart.restyle).not.toHaveBeenCalled();
    key(header, 'Enter');
    key(list, 'ArrowUp');
    expect(list.getAttribute('aria-activedescendant')).toBe(ids[2]);
    key(list, 'Enter');
    expect(chart.restyle).toHaveBeenCalledWith({ visible: [false, true] }, undefined);
    expect(chart.relayout).toHaveBeenCalledWith({ 'updatemenus[0].active': 2 }, { gui: true });
  });

  it('a press outside closes the list', () => {
    const view = createUpdatemenusView(fakeChart(), context(dropdown()), { measure });
    const header = view.root?.querySelector('button') as HTMLButtonElement;
    header.click();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    expect(header.getAttribute('aria-expanded')).toBe('false');
  });

  it('the header shows nothing for active -1', () => {
    const view = createUpdatemenusView(fakeChart(), context(dropdown({ active: -1 })), { measure });
    const header = view.root?.querySelector('button') as HTMLButtonElement;
    expect(header.textContent).toBe('');
    expect(header.getAttribute('aria-label')).toBe('none');
  });
});

describe('update menus view: updates', () => {
  it('follows the figure when every button sets one attribute', () => {
    const chart = fakeChart();
    const menu = {
      type: 'buttons',
      buttons: [
        { label: 'Linear', method: 'relayout', args: ['yaxis.type', 'linear'] },
        { label: 'Log', method: 'relayout', args: ['yaxis.type', 'log'] },
      ],
    };
    const view = createUpdatemenusView(
      chart,
      context({ updatemenus: [menu], yaxis: { type: 'linear' } }),
      { measure },
    );
    expect(chart.relayout).not.toHaveBeenCalled();
    view.update(context({ updatemenus: [menu], yaxis: { type: 'log' } }));
    expect(chart.relayout).toHaveBeenCalledWith({ 'updatemenus[0].active': 1 }, { gui: true });
    const buttons = [...(view.root?.querySelectorAll('button') ?? [])];
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
  });

  it('keeps DOM (and focus) across updates, rebuilds when labels change', () => {
    const chart = fakeChart();
    const view = createUpdatemenusView(chart, context(buttonsMenu()), { measure });
    const first = view.root?.querySelector('button') as HTMLButtonElement;
    first.focus();
    view.update(context(buttonsMenu({ active: 1 })));
    expect(view.root?.querySelector('button')).toBe(first);
    const relabeled = VISIBILITY.map((b, i) => ({ ...b, label: `L${i}` }));
    view.update(context(buttonsMenu({ buttons: relabeled })));
    const again = view.root?.querySelector('button') as HTMLButtonElement;
    expect(again).not.toBe(first);
    expect(again.textContent).toBe('L0');
    expect(document.activeElement).toBe(again);
  });

  it('warns once when animate is not available', () => {
    const chart = fakeChart();
    const warn = vi.fn();
    const menu = {
      type: 'buttons',
      showactive: false,
      buttons: [{ label: 'Play', method: 'animate', args: [null, { frame: { duration: 500 } }] }],
    };
    const view = createUpdatemenusView(chart, context({ updatemenus: [menu] }), { measure, warn });
    view.click(0, 0);
    view.click(0, 0);
    return Promise.resolve().then(() => {
      expect(warn).toHaveBeenCalledTimes(1);
      chart.animate = vi.fn(() => Promise.resolve());
      view.click(0, 0);
      expect(chart.animate).toHaveBeenCalledWith(null, { frame: { duration: 500 } });
    });
  });

  it('finds the chart later through locate', () => {
    const chart = fakeChart();
    const slot: { chart?: FakeChart } = {};
    const view = createUpdatemenusView(undefined, context(buttonsMenu()), {
      measure,
      locate: () => slot.chart,
    });
    expect(view.root).toBeUndefined();
    slot.chart = chart;
    view.update(context(buttonsMenu()));
    expect(chart.element.querySelector('.hc-menus')).toBeTruthy();
  });

  it('uses the layout colors', () => {
    const view = createUpdatemenusView(fakeChart(), context(buttonsMenu({ bgcolor: '#123456' })), {
      measure,
    });
    const menu = view.root?.querySelector('.hc-menu') as HTMLElement;
    expect(menu.style.getPropertyValue('--hc-menu-bg')).toBe('rgb(18, 52, 86)');
    expect(menu.style.getPropertyValue('--hc-menu-border')).toBe('#BEC8D9');
    expect((context({}).fullLayout as FullLayout)['updatemenus']).toEqual([]);
  });
});
