// @vitest-environment jsdom
/**
 * Component views loaded on first use (`lazy-view.ts`, plan E21.6): a figure that doesn't use a
 * component never loads its view; one that does gets it drawn by the time `chart.ready` resolves,
 * with its DOM where a synchronously created view would have put it. Tests share the loaders'
 * module state (vitest isolates it per file), so each lazily loaded component is checked unused
 * before it is used.
 */
import type { FrameScheduler } from '@mk7s/holochart-render';
import {
  createChart,
  createChartRegistry,
  type Chart,
  type ComponentModule,
  type ComponentView,
} from '@mk7s/holochart-runtime';
import type { Scene, WebGLRenderer } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { modebarComponent } from '../modebar/index.ts';
import { rangeselectorComponent } from '../rangeselector/component.ts';
import { rangesliderComponent } from '../rangeslider/rangeslider.ts';
import { selectionsComponent } from '../selections/selections.ts';
import { slidersComponent } from '../sliders/sliders.ts';
import { updatemenusComponent } from '../updatemenus/updatemenus.ts';
import { lazyRenderer, nonEmpty, type LazyComponentRenderer } from './lazy-view.ts';

/** The subset of `WebGLRenderer` a render root touches; no WebGL involved. */
function fakeRenderer(): WebGLRenderer {
  const noop = (): void => {};
  return {
    domElement: document.createElement('canvas'),
    autoClear: true,
    info: { autoReset: true, reset: noop },
    renderLists: { dispose: noop },
    setPixelRatio: noop,
    setSize: noop,
    setRenderTarget: noop,
    setClearColor: noop,
    clear: noop,
    setScissor: noop,
    setScissorTest: noop,
    setViewport: noop,
    render: (_scene: Scene) => {},
    dispose: noop,
    forceContextLoss: noop,
  } as unknown as WebGLRenderer;
}

/** Frames run on the microtask queue, so `await chart.ready` resolves on its own. */
const scheduler: FrameScheduler = {
  request(cb) {
    queueMicrotask(() => cb(0));
    return 1;
  },
  cancel() {},
  now: () => 0,
};

let container: HTMLElement;
let charts: Chart[] = [];

function chart(
  components: readonly ComponentModule[],
  layout: Record<string, unknown>,
  data: Record<string, unknown>[] = [],
): Chart {
  const c = createChart(
    container,
    { data, layout },
    {
      registry: createChartRegistry().register(...components),
      renderRoot: { scheduler, createRenderer: fakeRenderer },
    },
  );
  charts.push(c);
  return c;
}

const loaded = (component: ComponentModule): boolean =>
  (component.draw as LazyComponentRenderer).loaded;

beforeEach(() => {
  container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 640 });
  Object.defineProperty(container, 'clientHeight', { value: 400 });
  document.body.appendChild(container);
});

afterEach(() => {
  for (const c of charts) c.destroy();
  charts = [];
  container.remove();
  vi.restoreAllMocks();
});

/** A deferred view loader, and what the views it creates are asked to do. */
function testComponent(name: string) {
  const calls: string[] = [];
  let resolve!: () => void;
  const gate = new Promise<void>((r) => (resolve = r));
  const load = vi.fn(async () => {
    await gate;
    return (): ComponentView => {
      calls.push('create');
      return {
        update: () => void calls.push('update'),
        handlePointer: (e) => {
          calls.push(`pointer:${e.type}`);
          return true;
        },
        dispose: () => void calls.push('dispose'),
      };
    };
  });
  const module: ComponentModule = {
    name,
    draw: lazyRenderer({ name, used: (ctx) => nonEmpty(ctx.fullLayout['meta']), load }),
  };
  return { module, load, calls, release: () => resolve() };
}

describe('lazyRenderer', () => {
  it('loads nothing while the figure does not use the component', async () => {
    const t = testComponent('test-unused');
    const c = chart([t.module], {});
    await c.ready;
    await c.relayout({ title: { text: 'still unused' } });
    expect(t.load).not.toHaveBeenCalled();
    expect(loaded(t.module)).toBe(false);
  });

  it('loads once used, and chart.ready waits for the view', async () => {
    const t = testComponent('test-used');
    const c = chart([t.module], {});
    await c.ready;
    let settled = false;
    const update = c.relayout({ meta: ['used'] }).then(() => (settled = true));
    await new Promise((r) => setTimeout(r, 10));
    expect(t.load).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    t.release();
    await update;
    expect(t.calls).toEqual(['create']);
    expect(loaded(t.module)).toBe(true);
    // Every later draw and pointer event reaches the view.
    await c.relayout({ title: { text: 'again' } });
    expect(t.calls).toEqual(['create', 'update']);
    // Once loaded, views are created synchronously (no second load). The new chart replaces the
    // old one in the container, which disposes its view.
    chart([t.module], { meta: ['used'] });
    expect(t.calls).toEqual(['create', 'update', 'dispose']);
    await Promise.resolve();
    expect(t.calls).toEqual(['create', 'update', 'dispose', 'create']);
    expect(t.load).toHaveBeenCalledTimes(1);
  });

  it('creates no view for a chart destroyed while loading', async () => {
    const t = testComponent('test-destroyed');
    const c = chart([t.module], { meta: [1] });
    await new Promise((r) => setTimeout(r, 10));
    expect(t.load).toHaveBeenCalledTimes(1);
    c.destroy();
    t.release();
    await new Promise((r) => setTimeout(r, 10));
    expect(t.calls).toEqual([]);
    expect(container.childNodes).toHaveLength(0);
  });

  it('reports a failed load once, resolves ready, and retries on the next draw', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    let fail = true;
    const create = vi.fn((): ComponentView => ({ update: () => {} }));
    const load = vi.fn(() =>
      fail ? Promise.reject(new Error('offline')) : Promise.resolve(create),
    );
    const module: ComponentModule = {
      name: 'test-failing',
      draw: lazyRenderer({ name: 'test-failing', used: () => true, load }),
    };
    const c = chart([module], {});
    await c.ready;
    expect(error).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
    fail = false;
    await c.relayout({ title: { text: 'retry' } });
    expect(load).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
  });
});

describe('the lazily loaded components', () => {
  const all = [
    selectionsComponent,
    rangesliderComponent,
    updatemenusComponent,
    slidersComponent,
    modebarComponent,
    rangeselectorComponent,
  ];
  const lazy = all.filter((m) => m !== modebarComponent);

  it('load no view for a figure without them', async () => {
    const c = chart(all, { xaxis: { rangeslider: { visible: false } } });
    await c.ready;
    expect(lazy.map(loaded)).toEqual([false, false, false, false, false]);
    expect(c.element.querySelector('.hc-modebar')).not.toBeNull();
  });

  it('draw update menus and sliders by chart.ready, before the modebar in the tab order', async () => {
    const buttons = [
      { label: 'A', method: 'relayout', args: [{ title: { text: 'A' } }] },
      { label: 'B', method: 'relayout', args: [{ title: { text: 'B' } }] },
    ];
    const steps = [
      { label: 'one', method: 'skip' },
      { label: 'two', method: 'skip' },
    ];
    const c = chart(all, {
      updatemenus: [{ type: 'buttons', buttons }],
      sliders: [{ steps }],
    });
    await c.ready;
    expect(loaded(updatemenusComponent)).toBe(true);
    expect(loaded(slidersComponent)).toBe(true);
    expect(loaded(rangeselectorComponent)).toBe(false);
    expect(c.element.querySelectorAll('.hc-menus .hc-menu-btn')).toHaveLength(2);
    expect(c.element.querySelector('.hc-sliders')).not.toBeNull();
    // Same DOM order as synchronously created views: menus (90), sliders (91), modebar (100).
    const order = [...c.element.children].map((el) => el.className.split(' ')[0]);
    const menus = order.indexOf('hc-menus');
    expect(menus).toBeGreaterThanOrEqual(0);
    expect(menus).toBeLessThan(order.indexOf('hc-sliders'));
    expect(order.indexOf('hc-sliders')).toBeLessThan(order.indexOf('hc-modebar'));
    // No placeholder is left behind.
    expect([...c.element.childNodes].some((n) => n.nodeType === Node.COMMENT_NODE)).toBe(false);
  });

  it('load the selections view with the first selection', async () => {
    const c = chart(all, {});
    await c.ready;
    expect(loaded(selectionsComponent)).toBe(false);
    await c.relayout({ selections: [{ type: 'rect', x0: 1, x1: 2, y0: 1, y1: 2 }] });
    expect(loaded(selectionsComponent)).toBe(true);
  });
});
