import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type * as Holochart from '../../packages/holochart/src/index.ts';

const ROOT = resolve(import.meta.dirname, '../..');
const ORIGIN = 'http://notebook.test';

type Model = {
  state: Record<string, unknown>;
  listeners: Map<string, Set<() => void>>;
  get(key: string): unknown;
  on(event: string, callback: () => void): void;
  off(event: string, callback: () => void): void;
  set(key: string, value: unknown): void;
};
type View = { render(context: { model: Model; el: HTMLElement }): () => void };
type NotebookState = {
  hc: typeof Holochart;
  models: Model[];
  hosts: HTMLElement[];
  dispose: (() => void)[];
};
declare global {
  interface Window {
    notebook: NotebookState;
  }
}

test.beforeAll(() => {
  execFileSync('python3', ['packages/holochart-py/build_assets.py'], { cwd: ROOT });
});

async function serve(page: Page) {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => requests.push(request.url()));
  const bundle = readFileSync(
    resolve(ROOT, 'packages/holochart-py/src/holochart/static/widget.js'),
    'utf8',
  );
  await page.route('**/*', async (route) => {
    if (route.request().url() === `${ORIGIN}/`) {
      await route.fulfill({ contentType: 'text/html', body: '<main></main>' });
    } else if (route.request().url() === `${ORIGIN}/widget.js`) {
      // Expose the module-local library only in this fixture to inspect its chart state.
      await route.fulfill({
        contentType: 'text/javascript',
        body: `${bundle}\nexport { holochart };`,
      });
    } else {
      await route.abort();
    }
  });
  await page.goto(ORIGIN);
  return { requests, errors };
}

test('bundled notebook module renders encoded 2D and 3D figures offline, updates and disposes', async ({
  page,
}) => {
  const { requests, errors } = await serve(page);
  await page.evaluate(async (url) => {
    const module = (await import(url)) as { default: View; holochart: typeof Holochart };
    const figures = [
      {
        data: [
          {
            type: 'scatter',
            x: { dtype: 'i4', bdata: 'AQAAAAIAAAADAAAA' },
            y: [3, 1, 4],
          },
        ],
        layout: { title: { text: 'Python figure' }, width: 600, height: 350 },
        frames: [{ name: 'next', data: [{ y: [4, 2, 5] }] }],
      },
      { data: [{ type: 'scatter3d', x: [1, 2], y: [2, 3], z: [3, 1] }] },
    ];
    window.notebook = { hc: module.holochart, models: [], hosts: [], dispose: [] };
    for (const figure of figures) {
      const listeners = new Map<string, Set<() => void>>();
      const model: Model = {
        state: { figure, config: { displayModeBar: false }, width: null, height: null },
        listeners,
        get(key) {
          return this.state[key];
        },
        on(event, callback) {
          if (!listeners.has(event)) listeners.set(event, new Set());
          listeners.get(event)!.add(callback);
        },
        off(event, callback) {
          listeners.get(event)?.delete(callback);
        },
        set(key, value) {
          this.state[key] = value;
          listeners.get(`change:${key}`)?.forEach((callback) => callback());
        },
      };
      const host = document.createElement('div');
      document.querySelector('main')!.append(host);
      window.notebook.models.push(model);
      window.notebook.hosts.push(host);
      window.notebook.dispose.push(module.default.render({ model, el: host }));
      const chart = module.holochart.getChart(host.firstElementChild as HTMLElement)!;
      await chart.ready;
    }
  }, `${ORIGIN}/widget.js`);

  const rendered = await page.evaluate(() => {
    const { hc, hosts } = window.notebook;
    const chart = hc.getChart(hosts[0]!.firstElementChild as HTMLElement)!;
    return {
      x: Array.from(chart.data[0]!['x'] as Int32Array),
      frames: Array.isArray(chart.frames) ? chart.frames.length : 0,
      width: (hosts[0]!.firstElementChild as HTMLElement).style.width,
      height: (hosts[0]!.firstElementChild as HTMLElement).style.height,
      global: 'Holochart' in window,
      canvases: document.querySelectorAll('canvas').length,
    };
  });
  expect(rendered).toMatchObject({
    x: [1, 2, 3],
    frames: 1,
    width: '600px',
    height: '350px',
    global: false,
  });
  expect(rendered.canvases).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole('alert')).toHaveCount(0);

  await page.evaluate(() => {
    window.notebook.models[0]!.set('figure', { data: [{ type: 'bar', y: [9, 8] }] });
    window.notebook.models[0]!.set('height', 300);
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const { hc, hosts } = window.notebook;
        const chart = hc.getChart(hosts[0]!.firstElementChild as HTMLElement)!;
        return { y: chart.data[0]!['y'], height: chart.layout['height'] };
      }),
    )
    .toEqual({ y: [9, 8], height: 300 });

  const cleaned = await page.evaluate(() => {
    const { dispose, models, hosts, hc } = window.notebook;
    const containers = hosts.map((host) => host.firstElementChild as HTMLElement);
    dispose.forEach((cleanup) => cleanup());
    return {
      charts: containers.map((container) => Boolean(hc.getChart(container))),
      listeners: models.flatMap((model) => [...model.listeners.values()].map((set) => set.size)),
      children: hosts.map((host) => host.childElementCount),
    };
  });
  expect(cleaned.charts).toEqual([false, false]);
  expect(cleaned.children).toEqual([0, 0]);
  expect(cleaned.listeners.every((size) => size === 0)).toBe(true);
  expect(requests).toEqual([`${ORIGIN}/`, `${ORIGIN}/widget.js`]);
  expect(errors).toEqual([]);
});

test('updates coalesce, errors are visible, and disposal during an asynchronous mount releases the view', async ({
  page,
}) => {
  await serve(page);
  const result = await page.evaluate(async (url) => {
    const { createWidget } = (await import(url)) as {
      createWidget(hc: unknown): View;
    };
    const listeners = new Map<string, () => void>();
    let state = { data: [{ y: [1] }] };
    const model = {
      get: (key: string) => (key === 'figure' ? state : undefined),
      on: (event: string, callback: () => void) => listeners.set(event, callback),
      off: (event: string) => listeners.delete(event),
    } as unknown as Model;
    let release = () => {};
    let purges = 0;
    const updates: number[] = [];
    const hc = {
      figureFromJSON: (figure: unknown) => structuredClone(figure),
      newPlot: () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
      react: async (_el: HTMLElement, figure: typeof state) => {
        updates.push(figure.data[0]!.y[0]!);
        if (figure.data[0]!.y[0] === 4) throw new Error('example failure');
      },
      purge: () => {
        purges++;
      },
    };
    const el = document.createElement('div');
    document.body.append(el);
    const dispose = createWidget(hc).render({ model, el });
    state = { data: [{ y: [2] }] };
    listeners.get('change:figure')!();
    state = { data: [{ y: [3] }] };
    listeners.get('change:figure')!();
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    state = { data: [{ y: [4] }] };
    listeners.get('change:figure')!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const error = el.querySelector('[role="alert"]')!.textContent;
    const visible = !(el.querySelector('[role="alert"]') as HTMLElement).hidden;
    // Mount again and remove the output before its first render finishes.
    state = { data: [{ y: [5] }] };
    listeners.get('change:figure')!();
    dispose();
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    return {
      updates,
      error,
      visible,
      purges,
      listeners: listeners.size,
      children: el.childElementCount,
    };
  }, `${ORIGIN}/widget.js`);
  expect(result).toEqual({
    updates: [3, 4],
    error: 'Holochart: example failure',
    visible: true,
    purges: 2,
    listeners: 0,
    children: 0,
  });
});
