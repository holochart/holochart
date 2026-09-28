/**
 * Arabic (Egypt) (`ar-EG`), from plotly.js `lib/locales/ar-eg.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Arabic (Egypt) (`ar-EG`): formats only, UI strings stay English. */
export const arEG: LocaleModule = {
  moduleType: 'locale',
  name: 'ar-EG',
  dictionary: {},
  format: {
    days: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
    shortDays: ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'],
    months: [
      'يناير',
      'فبراير',
      'مارس',
      'إبريل',
      'مايو',
      'يونية',
      'يوليو',
      'أغسطس',
      'سبتمبر',
      'أكتوبر',
      'نوفمبر',
      'ديسمبر',
    ],
    shortMonths: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    date: '%d/%m/%Y',
  },
};
