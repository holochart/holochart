import {
  createRegistry,
  formatDateLabel,
  formatNumber,
  isLocaleModule,
  normalizeLocaleName,
  resolveLocale,
} from '@mk7s/holochart-core';
import { describe, expect, it } from 'vitest';
import * as exports from './index.ts';
import { allLocales, de, deCH, fr, ja, ptBR, zhCN } from './index.ts';

const JAN_31_2024 = Date.UTC(2024, 0, 31, 15, 4);

describe('@mk7s/holochart-locales', () => {
  it('ships plotly.js’s locales (at least 20), each exported under its camel-cased name', () => {
    expect(allLocales.length).toBeGreaterThanOrEqual(20);
    const names = allLocales.map((l) => normalizeLocaleName(l.name));
    expect(new Set(names).size).toBe(names.length);
    for (const locale of allLocales) {
      expect(isLocaleModule(locale)).toBe(true);
      const id = locale.name.replace(/-(\w+)/g, (_m, r: string) => r.toUpperCase());
      expect((exports as Record<string, unknown>)[id]).toBe(locale);
    }
  });

  it.each(allLocales.map((l) => [l.name, l] as const))('%s has well-formed formats', (_, l) => {
    const f = l.format ?? {};
    for (const [key, n] of [
      ['days', 7],
      ['shortDays', 7],
      ['months', 12],
      ['shortMonths', 12],
    ] as const) {
      const names = f[key];
      if (names === undefined) continue;
      expect(names).toHaveLength(n);
      for (const name of names) expect(name.trim()).not.toBe('');
    }
    if (f.months) expect(new Set(f.months).size).toBe(12);
    if (f.decimal !== undefined) {
      expect(f.decimal).toHaveLength(1);
      expect(f.thousands).not.toBe(f.decimal);
    }
    for (const text of Object.values(l.dictionary ?? {})) expect(text.trim()).not.toBe('');
  });

  it('formats dates and numbers through core once registered', () => {
    const registry = createRegistry().registerLocale(...allLocales);
    const german = resolveLocale('de', registry.locales);
    expect(formatDateLabel(JAN_31_2024, '%A %-d %B %Y', null, german)).toBe(
      'Mittwoch 31 Januar 2024',
    );
    expect(formatNumber(12345.5, { exponentformat: 'none', locale: german })).toBe('12.345,5');
    expect(german._('Reset axes')).toBe(de.dictionary?.['Reset axes']);

    const swiss = resolveLocale('de-ch', registry.locales);
    expect(swiss.format.months).toEqual(deCH.format?.months);
    expect(swiss._('Zoom in')).toBe('Hineinzoomen');

    const french = resolveLocale('fr', registry.locales);
    expect(formatDateLabel(JAN_31_2024, '', 'd', french)).toBe('31 Jan\n2024');
    expect(french._('Autoscale')).toBe(fr.dictionary?.['Autoscale']);

    const brazil = resolveLocale('pt-BR', registry.locales);
    expect(formatNumber(1234.5, { tickformat: ',.2f', locale: brazil })).toBe('1.234,50');
    expect(ptBR.format?.decimal).toBe(',');

    expect(formatDateLabel(JAN_31_2024, '%b', null, resolveLocale('ja', registry.locales))).toBe(
      ja.format?.shortMonths?.[0],
    );
    expect(resolveLocale('zh-CN', registry.locales)._('Zoom')).toBe(zhCN.dictionary?.['Zoom']);
  });
});
