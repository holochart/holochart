/**
 * Arabic (`ar`), from plotly.js `lib/locales/ar.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 *
 * Fixed: May (`months[4]`) is أيار; plotly.js repeats آذار (March).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Arabic (`ar`): formats only, UI strings stay English. */
export const ar: LocaleModule = {
  moduleType: 'locale',
  name: 'ar',
  dictionary: {},
  format: {
    days: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
    shortDays: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
    months: [
      'كانون الثاني',
      'شباط',
      'آذار',
      'نيسان',
      'أيار',
      'حزيران',
      'تموز',
      'آب',
      'أيلول',
      'تشرين الأول',
      'تشرين الثاني',
      'كانون الأول',
    ],
    shortMonths: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    date: '%d/%m/%Y',
  },
};
