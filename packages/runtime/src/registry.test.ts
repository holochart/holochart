import { attr, supplyDefaults } from '@mk7s/holochart-core';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentModule, TraceModule } from './contracts.ts';
import { createChartRegistry, defineTemplate } from './registry.ts';
import { createDotsModule, createLog } from './__testing__/fakes.ts';

const bareTrace: TraceModule = {
  type: 'bare',
  categories: [],
  schema: attr.object({ value: attr.number({ dflt: 0 }) }),
  meta: { description: 'No render parts.' },
  supplyDefaults(_in, _out, ctx) {
    ctx.coerce('value');
  },
};

const watermark: ComponentModule = {
  name: 'watermark',
  order: 5,
  layoutSchema: { watermark: attr.object({ text: attr.string({ dflt: '' }) }) },
  draw: { create: () => ({ update() {} }) },
};

const title: ComponentModule = { name: 'title', order: -1 };

describe('createChartRegistry', () => {
  it('registers traces, components and templates in any mix', () => {
    const dots = createDotsModule(createLog());
    const registry = createChartRegistry().register(
      dots,
      bareTrace,
      watermark,
      title,
      defineTemplate('dark', { layout: { paper_bgcolor: '#111' } }, { default: true }),
    );
    expect(registry.getTrace('dots')).toBe(dots);
    expect(registry.getComponent('watermark')).toBe(watermark);
    expect(registry.list()).toEqual({
      traces: [
        {
          type: 'dots',
          categories: ['cartesian', 'showLegend'],
          description: 'Test dots.',
          renders: true,
        },
        { type: 'bare', categories: [], description: 'No render parts.', renders: false },
      ],
      // Draw order: `order`, then registration.
      components: [
        { name: 'title', draws: false },
        { name: 'watermark', draws: true },
      ],
      templates: ['dark'],
      defaultTemplate: 'dark',
    });
  });

  it('feeds the core registry used by defaults and planning', () => {
    const registry = createChartRegistry().register(bareTrace, watermark);
    const { fullData, fullLayout } = supplyDefaults(
      { data: [{ type: 'bare', value: 3 }], layout: { watermark: { text: 'draft' } } },
      registry.core,
    );
    expect(fullData[0]?.['value']).toBe(3);
    expect(fullLayout['watermark']).toEqual({ text: 'draft' });
  });

  it('is idempotent for the same module and warns when a name is taken by another', () => {
    const warn = vi.fn();
    const registry = createChartRegistry({ warn });
    registry.register(bareTrace).register(bareTrace);
    expect(warn).not.toHaveBeenCalled();
    const replacement = { ...bareTrace, meta: { description: 'v2' } };
    registry.register(replacement);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/trace type 'bare' is already registered/),
    );
    expect(registry.getTrace('bare')).toBe(replacement);
    registry.register(title, { ...title });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('rejects things that are not modules', () => {
    const registry = createChartRegistry();
    expect(() => registry.register({} as ComponentModule)).toThrow(TypeError);
    expect(() => registry.register({ type: 'x' } as unknown as TraceModule)).toThrow(/schema/);
  });

  it('keeps registries isolated', () => {
    const a = createChartRegistry().register(bareTrace);
    const b = createChartRegistry();
    expect(b.getTrace('bare')).toBeUndefined();
    expect(a.core.traceTypes()).toEqual(['bare']);
  });
});
