// @vitest-environment jsdom
/**
 * Non-cartesian subplots' own 3D viewports (M6, `subplotViewport`): shared by traces and
 * components per key, updated on every call, drawn before the overlay, and removed after a pass in
 * which nothing asked for them.
 */
import { attr, type FullTrace, type FigureInput } from '@mk7s/holochart-core';
import type { Viewport } from '@mk7s/holochart-render';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChart, type Chart } from './chart.ts';
import type { ComponentModule, TraceModule } from './contracts.ts';
import { setup, type TestSetup } from './__testing__/fakes.ts';

let t: TestSetup;
let charts: Chart[] = [];
let traceViewports: Viewport[];
let componentViewports: Viewport[];

/** A trace placed like a scene trace: its layout container names its viewport. */
const blob: TraceModule = {
  type: 'blob',
  categories: [],
  schema: attr.object({ scene: attr.string({ dflt: 'scene', editType: 'calc' }) }),
  meta: { description: 'Test trace drawing into a subplot viewport.' },
  supplyDefaults(_in, _out: FullTrace, ctx) {
    ctx.coerce('scene');
  },
  subplotDomain: () => ({ x: [0, 0.5], y: [0, 1] }),
  calc: () => ({}),
  plot: {
    create(ctx) {
      const vp = ctx.subplotViewport?.(String(ctx.trace['scene']), {
        rect: ctx.domain?.rect ?? { x: 0, y: 0, width: 1, height: 1 },
      });
      if (vp) traceViewports.push(vp);
      return { update: () => undefined };
    },
  },
};

/** A component asking for the viewport of every scene named in `layout.meta`. */
const sceneComponent: ComponentModule = {
  name: 'scenes',
  draw: {
    create(ctx) {
      const draw = (c: typeof ctx): void => {
        const names = c.fullLayout['meta'];
        if (!Array.isArray(names)) return;
        for (const name of names as string[]) {
          const vp = c.subplotViewport?.(name, {
            rect: { x: 10, y: 20, width: 100, height: 50 },
            projection: name === 'ortho' ? 'orthographic' : 'perspective',
            background: [1, 0, 0, 1],
          });
          if (vp) componentViewports.push(vp);
        }
      };
      draw(ctx);
      return { update: (c) => draw(c) };
    },
  },
};

beforeEach(() => {
  t = setup({ width: 640, height: 400 });
  t.registry.register(blob, sceneComponent);
  traceViewports = [];
  componentViewports = [];
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  for (const c of charts) c.destroy();
  charts = [];
  vi.restoreAllMocks();
});

async function chart(data: unknown[], layout: Record<string, unknown> = {}): Promise<Chart> {
  const c = createChart(t.container, { data, layout } as FigureInput, t.options);
  charts.push(c);
  await c.ready;
  return c;
}

const named = (c: Chart, name: string): Viewport | undefined =>
  c.three.viewports.find((vp) => vp.name === name);

describe('subplotViewport', () => {
  it('shares one 3D viewport per key between traces and components', async () => {
    const c = await chart([{ type: 'blob' }], { meta: ['scene'] });
    const vp = named(c, 'subplot-scene');
    expect(vp?.kind).toBe('3d');
    expect(traceViewports).toEqual([vp]);
    // The component asked after the trace: same viewport, now with its rect and background.
    expect(componentViewports).toEqual([vp]);
    expect(vp?.rect).toEqual({ x: 10, y: 20, width: 100, height: 50 });
    expect(vp?.background).toEqual([1, 0, 0, 1]);
    expect(vp?.clearDepth).toBe(true);
    // Drawn after the cartesian subplots, before the overlay.
    const list = c.three.viewports;
    expect(list.indexOf(vp as Viewport)).toBe(list.length - 2);
    expect(list[list.length - 1]).toBe(c.three.overlay);
  });

  it('switches the projection in place and removes viewports nobody asks for', async () => {
    const c = await chart([], { meta: ['a', 'ortho'] });
    const a = named(c, 'subplot-a');
    const ortho = named(c, 'subplot-ortho');
    expect(ortho?.camera.type).toBe('OrthographicCamera');
    expect(a?.camera.type).toBe('PerspectiveCamera');
    await c.relayout({ meta: ['a'] });
    expect(named(c, 'subplot-ortho')).toBeUndefined();
    expect(ortho?.disposed).toBe(true);
    expect(named(c, 'subplot-a')).toBe(a);
    await c.relayout({ meta: [] });
    expect(named(c, 'subplot-a')).toBeUndefined();
  });
});
