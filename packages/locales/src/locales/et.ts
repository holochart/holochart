/**
 * Estonian (`et`), from plotly.js `lib/locales/et.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Estonian (`et`): formats only, UI strings stay English. */
export const et: LocaleModule = {
  moduleType: 'locale',
  name: 'et',
  dictionary: {},
  format: {
    days: ['Pühapäev', 'Esmaspäev', 'Teisipäev', 'Kolmapäev', 'Neljapäev', 'Reede', 'Laupäev'],
    shortDays: ['Pühap', 'Esmasp', 'Teisip', 'Kolmap', 'Neljap', 'Reede', 'Laup'],
    months: [
      'Jaanuar',
      'Veebruar',
      'Märts',
      'Aprill',
      'Mai',
      'Juuni',
      'Juuli',
      'August',
      'September',
      'Oktoober',
      'November',
      'Detsember',
    ],
    shortMonths: [
      'Jaan',
      'Veebr',
      'Märts',
      'Apr',
      'Mai',
      'Juuni',
      'Juuli',
      'Aug',
      'Sept',
      'Okt',
      'Nov',
      'Dets',
    ],
    date: '%d.%m.%Y',
  },
};
