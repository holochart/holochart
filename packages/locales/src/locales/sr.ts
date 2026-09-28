/**
 * Serbian (Cyrillic) (`sr`), from plotly.js `lib/locales/sr.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Serbian (Cyrillic) (`sr`): formats only, UI strings stay English. */
export const sr: LocaleModule = {
  moduleType: 'locale',
  name: 'sr',
  dictionary: {},
  format: {
    days: ['Недеља', 'Понедељак', 'Уторак', 'Среда', 'Четвртак', 'Петак', 'Субота'],
    shortDays: ['Нед', 'Пон', 'Уто', 'Сре', 'Чет', 'Пет', 'Суб'],
    months: [
      'Јануар',
      'Фебруар',
      'Март',
      'Април',
      'Мај',
      'Јун',
      'Јул',
      'Август',
      'Септембар',
      'Октобар',
      'Новембар',
      'Децембар',
    ],
    shortMonths: [
      'Јан',
      'Феб',
      'Мар',
      'Апр',
      'Мај',
      'Јун',
      'Јул',
      'Авг',
      'Сеп',
      'Окт',
      'Нов',
      'Дец',
    ],
    date: '%d/%m/%Y',
  },
};
