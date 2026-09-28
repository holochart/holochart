/**
 * Hebrew (`he`), from plotly.js `lib/locales/he.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Hebrew (`he`): formats only, UI strings stay English. */
export const he: LocaleModule = {
  moduleType: 'locale',
  name: 'he',
  dictionary: {},
  format: {
    days: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'],
    shortDays: ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", 'שבת'],
    months: [
      'ינואר',
      'פברואר',
      'מרץ',
      'אפריל',
      'מאי',
      'יוני',
      'יולי',
      'אוגוסט',
      'ספטמבר',
      'אוקטובר',
      'נובמבר',
      'דצמבר',
    ],
    shortMonths: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    date: '%d/%m/%Y',
  },
};
