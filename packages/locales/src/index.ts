/**
 * @mk7s/holochart-locales — locale modules for Holochart (plan E17.6): UI strings, month and day
 * names, number separators and date formats, one module per locale so apps bundle only the ones
 * they use. They are plotly.js's locales (`lib/locales`, MIT), in the same shape, so any other
 * Plotly locale registers the same way.
 *
 * @example
 * ```ts
 * import { register } from '@mk7s/holochart';
 * import { de } from '@mk7s/holochart-locales';
 *
 * register(de);
 * createChart(el, { data, layout, config: { locale: 'de' } });
 * ```
 */
import type { LocaleModule } from '@mk7s/holochart-core';
import { af } from './locales/af.ts';
import { am } from './locales/am.ts';
import { arDZ } from './locales/ar-dz.ts';
import { arEG } from './locales/ar-eg.ts';
import { ar } from './locales/ar.ts';
import { az } from './locales/az.ts';
import { bg } from './locales/bg.ts';
import { bs } from './locales/bs.ts';
import { ca } from './locales/ca.ts';
import { cs } from './locales/cs.ts';
import { cy } from './locales/cy.ts';
import { da } from './locales/da.ts';
import { deCH } from './locales/de-ch.ts';
import { de } from './locales/de.ts';
import { el } from './locales/el.ts';
import { eo } from './locales/eo.ts';
import { esAR } from './locales/es-ar.ts';
import { esPE } from './locales/es-pe.ts';
import { es } from './locales/es.ts';
import { et } from './locales/et.ts';
import { eu } from './locales/eu.ts';
import { fa } from './locales/fa.ts';
import { fi } from './locales/fi.ts';
import { fo } from './locales/fo.ts';
import { frCH } from './locales/fr-ch.ts';
import { fr } from './locales/fr.ts';
import { gl } from './locales/gl.ts';
import { gu } from './locales/gu.ts';
import { he } from './locales/he.ts';
import { hiIN } from './locales/hi-in.ts';
import { hr } from './locales/hr.ts';
import { hu } from './locales/hu.ts';
import { hy } from './locales/hy.ts';
import { id } from './locales/id.ts';
import { is } from './locales/is.ts';
import { it } from './locales/it.ts';
import { ja } from './locales/ja.ts';
import { ka } from './locales/ka.ts';
import { km } from './locales/km.ts';
import { ko } from './locales/ko.ts';
import { lt } from './locales/lt.ts';
import { lv } from './locales/lv.ts';
import { meME } from './locales/me-me.ts';
import { me } from './locales/me.ts';
import { mk } from './locales/mk.ts';
import { ml } from './locales/ml.ts';
import { ms } from './locales/ms.ts';
import { mt } from './locales/mt.ts';
import { nlBE } from './locales/nl-be.ts';
import { nl } from './locales/nl.ts';
import { no } from './locales/no.ts';
import { pa } from './locales/pa.ts';
import { pl } from './locales/pl.ts';
import { ptBR } from './locales/pt-br.ts';
import { ptPT } from './locales/pt-pt.ts';
import { rm } from './locales/rm.ts';
import { ro } from './locales/ro.ts';
import { ru } from './locales/ru.ts';
import { si } from './locales/si.ts';
import { sk } from './locales/sk.ts';
import { sl } from './locales/sl.ts';
import { sq } from './locales/sq.ts';
import { srSR } from './locales/sr-sr.ts';
import { sr } from './locales/sr.ts';
import { sv } from './locales/sv.ts';
import { sw } from './locales/sw.ts';
import { ta } from './locales/ta.ts';
import { th } from './locales/th.ts';
import { tr } from './locales/tr.ts';
import { tt } from './locales/tt.ts';
import { uk } from './locales/uk.ts';
import { ur } from './locales/ur.ts';
import { vi } from './locales/vi.ts';
import { zhCN } from './locales/zh-cn.ts';
import { zhHK } from './locales/zh-hk.ts';
import { zhTW } from './locales/zh-tw.ts';

export {
  af,
  am,
  arDZ,
  arEG,
  ar,
  az,
  bg,
  bs,
  ca,
  cs,
  cy,
  da,
  deCH,
  de,
  el,
  eo,
  esAR,
  esPE,
  es,
  et,
  eu,
  fa,
  fi,
  fo,
  frCH,
  fr,
  gl,
  gu,
  he,
  hiIN,
  hr,
  hu,
  hy,
  id,
  is,
  it,
  ja,
  ka,
  km,
  ko,
  lt,
  lv,
  meME,
  me,
  mk,
  ml,
  ms,
  mt,
  nlBE,
  nl,
  no,
  pa,
  pl,
  ptBR,
  ptPT,
  rm,
  ro,
  ru,
  si,
  sk,
  sl,
  sq,
  srSR,
  sr,
  sv,
  sw,
  ta,
  th,
  tr,
  tt,
  uk,
  ur,
  vi,
  zhCN,
  zhHK,
  zhTW,
};

/** Every locale of this package (~31 kB gzipped together; import the ones you need). */
export const allLocales: readonly LocaleModule[] = [
  af,
  am,
  arDZ,
  arEG,
  ar,
  az,
  bg,
  bs,
  ca,
  cs,
  cy,
  da,
  deCH,
  de,
  el,
  eo,
  esAR,
  esPE,
  es,
  et,
  eu,
  fa,
  fi,
  fo,
  frCH,
  fr,
  gl,
  gu,
  he,
  hiIN,
  hr,
  hu,
  hy,
  id,
  is,
  it,
  ja,
  ka,
  km,
  ko,
  lt,
  lv,
  meME,
  me,
  mk,
  ml,
  ms,
  mt,
  nlBE,
  nl,
  no,
  pa,
  pl,
  ptBR,
  ptPT,
  rm,
  ro,
  ru,
  si,
  sk,
  sl,
  sq,
  srSR,
  sr,
  sv,
  sw,
  ta,
  th,
  tr,
  tt,
  uk,
  ur,
  vi,
  zhCN,
  zhHK,
  zhTW,
];
