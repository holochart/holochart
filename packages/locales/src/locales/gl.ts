/**
 * Galician (`gl`), from plotly.js `lib/locales/gl.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Galician (`gl`): formats only, UI strings stay English. */
export const gl: LocaleModule = {
  moduleType: 'locale',
  name: 'gl',
  dictionary: {},
  format: {
    days: ['Domingo', 'Luns', 'Martes', 'Mércores', 'Xoves', 'Venres', 'Sábado'],
    shortDays: ['Dom', 'Lun', 'Mar', 'Mér', 'Xov', 'Ven', 'Sáb'],
    months: [
      'Xaneiro',
      'Febreiro',
      'Marzo',
      'Abril',
      'Maio',
      'Xuño',
      'Xullo',
      'Agosto',
      'Setembro',
      'Outubro',
      'Novembro',
      'Decembro',
    ],
    shortMonths: [
      'Xan',
      'Feb',
      'Mar',
      'Abr',
      'Mai',
      'Xuñ',
      'Xul',
      'Ago',
      'Set',
      'Out',
      'Nov',
      'Dec',
    ],
    date: '%d/%m/%Y',
  },
};
