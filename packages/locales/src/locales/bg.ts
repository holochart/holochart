/**
 * Bulgarian (`bg`), from plotly.js `lib/locales/bg.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Bulgarian (`bg`): formats only, UI strings stay English. */
export const bg: LocaleModule = {
  moduleType: 'locale',
  name: 'bg',
  dictionary: {},
  format: {
    days: ['Неделя', 'Понеделник', 'Вторник', 'Сряда', 'Четвъртък', 'Петък', 'Събота'],
    shortDays: ['Нед', 'Пон', 'Вто', 'Сря', 'Чет', 'Пет', 'Съб'],
    months: [
      'Януари',
      'Февруари',
      'Март',
      'Април',
      'Май',
      'Юни',
      'Юли',
      'Август',
      'Септември',
      'Октомври',
      'Ноември',
      'Декември',
    ],
    shortMonths: [
      'Яну',
      'Фев',
      'Мар',
      'Апр',
      'Май',
      'Юни',
      'Юли',
      'Авг',
      'Сеп',
      'Окт',
      'Нов',
      'Дек',
    ],
    date: '%d.%m.%Y',
  },
};
