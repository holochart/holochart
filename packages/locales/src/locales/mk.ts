/**
 * Macedonian (`mk`), from plotly.js `lib/locales/mk.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Macedonian (`mk`): formats only, UI strings stay English. */
export const mk: LocaleModule = {
  moduleType: 'locale',
  name: 'mk',
  dictionary: {},
  format: {
    days: ['Недела', 'Понеделник', 'Вторник', 'Среда', 'Четврток', 'Петок', 'Сабота'],
    shortDays: ['Нед', 'Пон', 'Вто', 'Сре', 'Чет', 'Пет', 'Саб'],
    months: [
      'Јануари',
      'Февруари',
      'Март',
      'Април',
      'Мај',
      'Јуни',
      'Јули',
      'Август',
      'Септември',
      'Октомври',
      'Ноември',
      'Декември',
    ],
    shortMonths: [
      'Јан',
      'Фев',
      'Мар',
      'Апр',
      'Мај',
      'Јун',
      'Јул',
      'Авг',
      'Сеп',
      'Окт',
      'Нов',
      'Дек',
    ],
    date: '%d/%m/%Y',
  },
};
