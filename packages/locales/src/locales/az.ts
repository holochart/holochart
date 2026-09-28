/**
 * Azerbaijani (`az`), from plotly.js `lib/locales/az.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Azerbaijani (`az`): formats only, UI strings stay English. */
export const az: LocaleModule = {
  moduleType: 'locale',
  name: 'az',
  dictionary: {},
  format: {
    days: ['Bazar', 'Bazar ertəsi', 'Çərşənbə axşamı', 'Çərşənbə', 'Cümə axşamı', 'Cümə', 'Şənbə'],
    shortDays: ['B', 'Be', 'Ça', 'Ç', 'Ca', 'C', 'Ş'],
    months: [
      'Yanvar',
      'Fevral',
      'Mart',
      'Aprel',
      'May',
      'İyun',
      'İyul',
      'Avqust',
      'Sentyabr',
      'Oktyabr',
      'Noyabr',
      'Dekabr',
    ],
    shortMonths: [
      'Yan',
      'Fev',
      'Mar',
      'Apr',
      'May',
      'İyun',
      'İyul',
      'Avq',
      'Sen',
      'Okt',
      'Noy',
      'Dek',
    ],
    date: '%d.%m.%Y',
  },
};
