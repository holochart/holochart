/**
 * Lithuanian (`lt`), from plotly.js `lib/locales/lt.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Lithuanian (`lt`): formats only, UI strings stay English. */
export const lt: LocaleModule = {
  moduleType: 'locale',
  name: 'lt',
  dictionary: {},
  format: {
    days: [
      'sekmadienis',
      'pirmadienis',
      'antradienis',
      'trečiadienis',
      'ketvirtadienis',
      'penktadienis',
      'šeštadienis',
    ],
    shortDays: ['sek', 'pir', 'ant', 'tre', 'ket', 'pen', 'šeš'],
    months: [
      'Sausis',
      'Vasaris',
      'Kovas',
      'Balandis',
      'Gegužė',
      'Birželis',
      'Liepa',
      'Rugpjūtis',
      'Rugsėjis',
      'Spalis',
      'Lapkritis',
      'Gruodis',
    ],
    shortMonths: [
      'Sau',
      'Vas',
      'Kov',
      'Bal',
      'Geg',
      'Bir',
      'Lie',
      'Rugp',
      'Rugs',
      'Spa',
      'Lap',
      'Gru',
    ],
    date: '%Y-%m-%d',
  },
};
