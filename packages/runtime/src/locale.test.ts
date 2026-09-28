// @vitest-environment jsdom
import { localeOf, localize, type LocaleModule } from '@mk7s/holochart-core';
import { afterEach, describe, expect, it } from 'vitest';
import { createChart } from './chart.ts';
import { createChartRegistry } from './registry.ts';
import { setup } from './__testing__/fakes.ts';

/** plotly.js locale modules (trimmed), registered as they are. */
const de: LocaleModule = {
  moduleType: 'locale',
  name: 'de',
  dictionary: { trace: 'Datenspur', 'Reset axes': 'Achsen zurücksetzen' },
  format: { decimal: ',', thousands: '.' },
};
const deCH: LocaleModule = {
  moduleType: 'locale',
  name: 'de-CH',
  dictionary: {},
  format: { date: '%d.%m.%Y' },
};
const fr: LocaleModule = {
  moduleType: 'locale',
  name: 'fr',
  dictionary: { trace: 'série' },
  format: { decimal: ',', thousands: ' ' },
};

const XY = { type: 'dots', x: [0, 1], y: [0, 1] };
const t = setup({ width: 400, height: 300 });
t.registry.register(de, deCH, fr);

afterEach(() => t.container.replaceChildren());

describe('locales (plan E17.6)', () => {
  it('registers plotly.js locale modules through register()', () => {
    const registry = createChartRegistry().register(de, deCH);
    expect(registry.list().locales).toEqual(['de', 'de-CH']);
    expect(registry.core.locales.locales.get('de')?.dictionary).toBe(de.dictionary);
  });

  it('applies config.locale, falling back from region to language', async () => {
    const c = createChart(t.container, { data: [XY], config: { locale: 'de-CH' } }, t.options);
    await c.ready;
    const locale = localeOf(c.fullLayout);
    expect(locale.name).toBe('de-CH');
    expect(locale.format.date).toBe('%d.%m.%Y');
    expect(locale.separators).toBe(',.');
    expect(localize(c.fullLayout, 'Reset axes')).toBe('Achsen zurücksetzen');
    expect(c.fullData[0]?.name).toBe('Datenspur 0');
    c.destroy();
  });

  it('switches locale on react', async () => {
    const c = createChart(t.container, { data: [XY], config: { locale: 'de' } }, t.options);
    await c.ready;
    await c.react({ data: [XY], config: { locale: 'fr' } });
    expect(localeOf(c.fullLayout).name).toBe('fr');
    expect(c.fullLayout?.['separators']).toBe(', ');
    expect(c.fullData[0]?.name).toBe('série 0');
    await c.react({ data: [XY], layout: { separators: '.,' }, config: { locale: 'fr' } });
    expect(localeOf(c.fullLayout).separators).toBe('.,');
    await c.react({ data: [XY] });
    expect(c.fullData[0]?.name).toBe('trace 0');
    expect(c.fullLayout?.['separators']).toBe('.,');
    c.destroy();
  });

  it('uses per-chart locales from config.locales', async () => {
    const c = createChart(
      t.container,
      {
        data: [XY],
        config: { locale: 'nl', locales: { nl: { dictionary: { trace: 'reeks' } } } },
      },
      t.options,
    );
    await c.ready;
    expect(c.fullData[0]?.name).toBe('reeks 0');
    c.destroy();
  });
});
