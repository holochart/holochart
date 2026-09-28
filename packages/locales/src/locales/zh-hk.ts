/**
 * Chinese (Hong Kong) (`zh-HK`), from plotly.js `lib/locales/zh-hk.js` (MIT License, Copyright (c)
 * 2016-2024 Plotly Technologies Inc.; see this package's THIRD_PARTY_NOTICES.md).
 */
import type { LocaleModule } from '@mk7s/holochart-core';

/** Chinese (Hong Kong) (`zh-HK`): formats only, UI strings stay English. */
export const zhHK: LocaleModule = {
  moduleType: 'locale',
  name: 'zh-HK',
  dictionary: {},
  format: {
    days: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'],
    shortDays: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
    months: [
      '一月',
      '二月',
      '三月',
      '四月',
      '五月',
      '六月',
      '七月',
      '八月',
      '九月',
      '十月',
      '十一月',
      '十二月',
    ],
    shortMonths: ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'],
    date: '%d-%m-%Y',
  },
};
