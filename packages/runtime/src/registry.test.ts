import {
  attr,
  holochartTemplate,
  plotlyClassicTemplate,
  supplyDefaults,
} from '@mk7s/holochart-core';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentModule, TraceModule } from './contracts.ts';
import { createChartRegistry, defineTemplate, registry as sharedRegistry } from './registry.ts';
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

describe('default template (ADR-021)', () => {
  it('the shared registry starts with the built-in templates and applies holochart', () => {
    expect(sharedRegistry.list()).toMatchObject({
      templates: ['holochart', 'plotly-classic', 'none'],
      defaultTemplate: 'holochart',
    });
    expect(sharedRegistry.core.getTemplate('holochart')).toBe(holochartTemplate);
    expect(sharedRegistry.core.getTemplate('plotly-classic')).toBe(plotlyClassicTemplate);
    const { fullLayout } = supplyDefaults({ layout: {} }, sharedRegistry.core);
    expect(fullLayout.template).toBe(holochartTemplate);
  });

  it('fresh registries have no templates and apply none', () => {
    const registry = createChartRegistry();
    expect(registry.list()).toMatchObject({ templates: [], defaultTemplate: undefined });
    expect(supplyDefaults({ layout: {} }, registry.core).fullLayout.template).toBeNull();
  });

  it('setDefaultTemplate sets, clears and warns about unregistered names', () => {
    const warn = vi.fn();
    const registry = createChartRegistry({ warn }).register(
      defineTemplate('dark', { layout: { paper_bgcolor: '#111' } }),
    );
    expect(registry.setDefaultTemplate('dark')).toBe(registry);
    expect(registry.list().defaultTemplate).toBe('dark');
    expect(supplyDefaults({ layout: {} }, registry.core).fullLayout.paper_bgcolor).toBe(
      'rgb(17, 17, 17)',
    );
    registry.setDefaultTemplate(undefined);
    expect(registry.core.defaultTemplate).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
    registry.setDefaultTemplate('drak');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/no template 'drak' is registered/));
    expect(registry.core.defaultTemplate).toBe('drak');
  });

  it('a module wrapping the same template object is the same registration', () => {
    const warn = vi.fn();
    const template = { layout: { paper_bgcolor: '#111' } };
    const registry = createChartRegistry({ warn }).register(
      defineTemplate('dark', template, { default: true }),
    );
    registry.register(defineTemplate('dark', template));
    expect(warn).not.toHaveBeenCalled();
    expect(registry.list().defaultTemplate).toBe('dark');
    registry.register(defineTemplate('dark', { layout: {} }));
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/template 'dark' is already registered/),
    );
  });
});
