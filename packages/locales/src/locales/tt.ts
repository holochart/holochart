/**
 * Tatar (`tt`), from plotly.js `lib/locales/tt.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Tatar (`tt`): formats only, UI strings stay English. */
export const tt: LocaleModule = {
  moduleType: 'locale',
  name: 'tt',
  dictionary: {},
  format: {
    days: ['якшәмбе', 'дүшәмбе', 'сишәмбе', 'чәршәмбе', 'пәнҗешәмбе', 'җомга', 'шимбә'],
    shortDays: ['якш', 'дүш', 'сиш', 'чәр', 'пән', 'җом', 'шим'],
    months: [
      'Гынвар',
      'Февраль',
      'Март',
      'Апрель',
      'Май',
      'Июнь',
      'Июль',
      'Август',
      'Сентябрь',
      'Октябрь',
      'Ноябрь',
      'Декабрь',
    ],
    shortMonths: [
      'Гыйн',
      'Фев',
      'Мар',
      'Апр',
      'Май',
      'Июн',
      'Июл',
      'Авг',
      'Сен',
      'Окт',
      'Ноя',
      'Дек',
    ],
    date: '%d.%m.%Y',
  },
};
