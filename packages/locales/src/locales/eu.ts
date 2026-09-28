/**
 * Basque (`eu`), from plotly.js `lib/locales/eu.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Basque (`eu`): formats only, UI strings stay English. */
export const eu: LocaleModule = {
  moduleType: 'locale',
  name: 'eu',
  dictionary: {},
  format: {
    days: ['Igandea', 'Astelehena', 'Asteartea', 'Asteazkena', 'Osteguna', 'Ostirala', 'Larunbata'],
    shortDays: ['Iga', 'Ast', 'Ast', 'Ast', 'Ost', 'Ost', 'Lar'],
    months: [
      'Urtarrila',
      'Otsaila',
      'Martxoa',
      'Apirila',
      'Maiatza',
      'Ekaina',
      'Uztaila',
      'Abuztua',
      'Iraila',
      'Urria',
      'Azaroa',
      'Abendua',
    ],
    shortMonths: [
      'Urt',
      'Ots',
      'Mar',
      'Api',
      'Mai',
      'Eka',
      'Uzt',
      'Abu',
      'Ira',
      'Urr',
      'Aza',
      'Abe',
    ],
    date: '%Y/%m/%d',
  },
};
