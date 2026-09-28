/**
 * Afrikaans (`af`), from plotly.js `lib/locales/af.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Afrikaans (`af`): formats only, UI strings stay English. */
export const af: LocaleModule = {
  moduleType: 'locale',
  name: 'af',
  dictionary: {},
  format: {
    days: ['Sondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrydag', 'Saterdag'],
    shortDays: ['Son', 'Maan', 'Dins', 'Woens', 'Don', 'Vry', 'Sat'],
    months: [
      'Januarie',
      'Februarie',
      'Maart',
      'April',
      'Mei',
      'Junie',
      'Julie',
      'Augustus',
      'September',
      'Oktober',
      'November',
      'Desember',
    ],
    shortMonths: [
      'Jan',
      'Feb',
      'Mrt',
      'Apr',
      'Mei',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Okt',
      'Nov',
      'Des',
    ],
    date: '%d/%m/%Y',
  },
};
