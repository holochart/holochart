/**
 * Romansh (`rm`), from plotly.js `lib/locales/rm.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Romansh (`rm`): formats only, UI strings stay English. */
export const rm: LocaleModule = {
  moduleType: 'locale',
  name: 'rm',
  dictionary: {},
  format: {
    days: ['Dumengia', 'Glindesdi', 'Mardi', 'Mesemna', 'Gievgia', 'Venderdi', 'Sonda'],
    shortDays: ['Dum', 'Gli', 'Mar', 'Mes', 'Gie', 'Ven', 'Som'],
    months: [
      'Schaner',
      'Favrer',
      'Mars',
      'Avrigl',
      'Matg',
      'Zercladur',
      'Fanadur',
      'Avust',
      'Settember',
      'October',
      'November',
      'December',
    ],
    shortMonths: [
      'Scha',
      'Fev',
      'Mar',
      'Avr',
      'Matg',
      'Zer',
      'Fan',
      'Avu',
      'Sett',
      'Oct',
      'Nov',
      'Dec',
    ],
    date: '%d/%m/%Y',
  },
};
