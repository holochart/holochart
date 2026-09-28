/**
 * Montenegrin (Cyrillic) (`me`), from plotly.js `lib/locales/me.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Montenegrin (Cyrillic) (`me`): formats only, UI strings stay English. */
export const me: LocaleModule = {
  moduleType: 'locale',
  name: 'me',
  dictionary: {},
  format: {
    days: ['Неђеља', 'Понеђељак', 'Уторак', 'Сриједа', 'Четвртак', 'Петак', 'Субота'],
    shortDays: ['Неђ', 'Пон', 'Уто', 'Сри', 'Чет', 'Пет', 'Суб'],
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
