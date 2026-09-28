/**
 * Albanian (`sq`), from plotly.js `lib/locales/sq.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Albanian (`sq`): formats only, UI strings stay English. */
export const sq: LocaleModule = {
  moduleType: 'locale',
  name: 'sq',
  dictionary: {},
  format: {
    days: ['E Diel', 'E Hënë', 'E Martë', 'E Mërkurë', 'E Enjte', 'E Premte', 'E Shtune'],
    shortDays: ['Di', 'Hë', 'Ma', 'Më', 'En', 'Pr', 'Sh'],
    months: [
      'Janar',
      'Shkurt',
      'Mars',
      'Prill',
      'Maj',
      'Qershor',
      'Korrik',
      'Gusht',
      'Shtator',
      'Tetor',
      'Nëntor',
      'Dhjetor',
    ],
    shortMonths: [
      'Jan',
      'Shk',
      'Mar',
      'Pri',
      'Maj',
      'Qer',
      'Kor',
      'Gus',
      'Sht',
      'Tet',
      'Nën',
      'Dhj',
    ],
    date: '%d.%m.%Y',
  },
};
