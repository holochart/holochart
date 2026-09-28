/**
 * Armenian (`hy`), from plotly.js `lib/locales/hy.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Armenian (`hy`): formats only, UI strings stay English. */
export const hy: LocaleModule = {
  moduleType: 'locale',
  name: 'hy',
  dictionary: {},
  format: {
    days: ['կիրակի', 'եկուշաբթի', 'երեքշաբթի', 'չորեքշաբթի', 'հինգշաբթի', 'ուրբաթ', 'շաբաթ'],
    shortDays: ['կիր', 'երկ', 'երք', 'չրք', 'հնգ', 'ուրբ', 'շբթ'],
    months: [
      'Հունվար',
      'Փետրվար',
      'Մարտ',
      'Ապրիլ',
      'Մայիս',
      'Հունիս',
      'Հուլիս',
      'Օգոստոս',
      'Սեպտեմբեր',
      'Հոկտեմբեր',
      'Նոյեմբեր',
      'Դեկտեմբեր',
    ],
    shortMonths: [
      'Հունվ',
      'Փետր',
      'Մարտ',
      'Ապր',
      'Մայիս',
      'Հունիս',
      'Հուլ',
      'Օգս',
      'Սեպ',
      'Հոկ',
      'Նոյ',
      'Դեկ',
    ],
    date: '%d.%m.%Y',
  },
};
