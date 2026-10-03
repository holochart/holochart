/**
 * Holochart's own strings in Turkish (not from plotly.js, whose locales don't have them): the UI
 * labels Plotly's dictionary lacks, the keyboard announcements (backlog S2.15) and the generated
 * chart summaries (plan E17.2). Each key is the runtime's English text; a translation keeps its
 * `{placeholders}`, in any order. Machine-translated: no native speaker has reviewed them.
 *
 * Turkish case suffixes follow vowel harmony, so a suffix cannot be attached to a placeholder
 * (its vowels depend on the value). The sentences keep placeholders bare and put the suffix on a
 * noun after them instead ("{start} değerinden … {end} değerine"), and the trace name leads,
 * followed by a colon.
 */
export const holochartTr: Readonly<Record<string, string>> = {
  // UI labels.
  Legend: 'Gösterge',
  'Chart data: arrow keys move between points, + and - zoom':
    'Grafik verileri: ok tuşlarıyla noktalar arasında gezinin, + ve - tuşlarıyla yakınlaştırıp uzaklaştırın',
  'Draw line': 'Çizgi çiz',
  'Draw open freeform': 'Açık serbest şekil çiz',
  'Draw closed freeform': 'Kapalı serbest şekil çiz',
  'Draw circle': 'Daire çiz',
  'Draw rectangle': 'Dikdörtgen çiz',
  'Erase active shape': 'Etkin şekli sil',
  // Keyboard announcements.
  '{name}: {text}, point {n} of {count}.': '{name}: {text}, {count} noktadan {n}. nokta.',
  'No data points to explore.': 'Gezinilecek veri noktası yok.',
  'Zoomed in.': 'Yakınlaştırıldı.',
  'Zoomed out.': 'Uzaklaştırıldı.',
  'Panned.': 'Kaydırıldı.',
  'View rotated.': 'Görünüm döndürüldü.',
  'View reset.': 'Görünüm sıfırlandı.',
  '{name}: {text}, {n} of {count}.': '{name}: {text}, {count} öğeden {n}. öğe.',
  '{name}: {position}, {text}, {n} of {count}.':
    '{name}: {position}, {text}, {count} öğeden {n}. öğe.',
  '{name}: {text}, row {row} of {rows}, column {column} of {columns}.':
    '{name}: {text}, {rows} satırdan {row}. satır, {columns} sütundan {column}. sütun.',
  '{name}: {text}, level {level}, {n} of {count}, children: {children}.':
    '{name}: {text}, {level}. düzey, {count} öğeden {n}. öğe, alt öğe sayısı: {children}.',
  '{name}: {dimension}, {category}, {text}, {n} of {count}.':
    '{name}: {dimension}, {category}, {text}, {count} öğeden {n}. öğe.',
  'Dimension {n}': 'Boyut {n}',
  // Chart summaries.
  '{y} by {x}.': '{x} bazında {y}.',
  '{count} more traces are not summarized.': 'Özetlenmeyen diğer iz sayısı: {count}.',
  '{name} has no values.': '{name}: değer yok.',
  '{name} has a single value, {value} ({x}).': '{name}: tek bir değer var: {value} ({x}).',
  '{name} rises from {start} ({startX}) to {end} ({endX}).':
    '{name}: {start} değerinden ({startX}) {end} değerine ({endX}) yükseliyor.',
  '{name} falls from {start} ({startX}) to {end} ({endX}).':
    '{name}: {start} değerinden ({startX}) {end} değerine ({endX}) düşüyor.',
  '{name} stays flat at about {value}.': '{name}: yaklaşık {value} düzeyinde sabit kalıyor.',
  '{name} varies between {min} ({minX}) and {max} ({maxX}) with no clear trend.':
    '{name}: belirgin bir eğilim olmadan {min} ({minX}) ile {max} ({maxX}) arasında değişiyor.',
  'It peaks at {max} ({maxX}).': 'En yüksek değer: {max} ({maxX}).',
  'Its lowest point is {min} ({minX}).': 'En düşük değer: {min} ({minX}).',
  '{name}: {y} rises strongly with {x} (correlation {r}).':
    '{name}: {x} arttıkça {y} güçlü biçimde artıyor (korelasyon {r}).',
  '{name}: {y} tends to rise with {x} (correlation {r}).':
    '{name}: {x} arttıkça {y} artma eğiliminde (korelasyon {r}).',
  '{name}: no clear relationship between {x} and {y} (correlation {r}).':
    '{name}: {x} ile {y} arasında belirgin bir ilişki yok (korelasyon {r}).',
  '{name}: {y} tends to fall as {x} rises (correlation {r}).':
    '{name}: {x} arttıkça {y} azalma eğiliminde (korelasyon {r}).',
  '{name}: {y} falls strongly as {x} rises (correlation {r}).':
    '{name}: {x} arttıkça {y} güçlü biçimde azalıyor (korelasyon {r}).',
  'Values range from {min} to {max}.': 'Değerler {min} ile {max} arasında.',
  '{label} is the largest slice of {name}: {share} ({value}).':
    '{name}: en büyük dilim {label}, {share} ({value}).',
  '{label} is the largest stage of {name}: {share} ({value}).':
    '{name}: en büyük aşama {label}, {share} ({value}).',
  '{label} is the largest branch of {name}: {share} ({value}).':
    '{name}: en büyük dal {label}, {share} ({value}).',
  '{label} is the largest flow of {name}: {share} ({value}).':
    '{name}: en büyük akış {label}, {share} ({value}).',
  'Next: {label}, {share} ({value}).': 'Ardından: {label}, {share} ({value}).',
  'Next: {label}, {share} ({value}), and {label2}, {share2} ({value2}).':
    'Ardından: {label}, {share} ({value}) ve {label2}, {share2} ({value2}).',
  '{name} is highest at {label} ({value}) and lowest at {lowLabel} ({lowValue}).':
    '{name}: en yüksek değer {label} ({value}), en düşük değer {lowLabel} ({lowValue}).',
  '{name}: median {median}; half of the values lie between {q1} and {q3}; range {min} to {max}.':
    '{name}: medyan {median}; değerlerin yarısı {q1} ile {q3} arasında; aralık {min} ile {max} arası.',
  '{name}: medians range from {low} ({lowLabel}) to {high} ({highLabel}).':
    '{name}: medyanlar {low} ({lowLabel}) ile {high} ({highLabel}) arasında.',
  '{name}: the most common range is {start} to {end} ({value}).':
    '{name}: en sık görülen aralık {start} ile {end} arası ({value}).',
  'Half of the values lie between {q1} and {q3}, with a median of about {median}.':
    'Değerlerin yarısı {q1} ile {q3} arasında, medyan yaklaşık {median}.',
  'The distribution is skewed to the right (a long tail of high values).':
    'Dağılım sağa çarpık (yüksek değerlerden oluşan uzun bir kuyruk).',
  'The distribution is skewed to the left (a long tail of low values).':
    'Dağılım sola çarpık (düşük değerlerden oluşan uzun bir kuyruk).',
  '{name}: values range from {min} to {max}.': '{name}: değerler {min} ile {max} arasında.',
  'The highest value, {max}, is at {x}, {y}; the lowest, {min}, at {minX}, {minY}.':
    'En yüksek değer {max} (konum: {x}, {y}); en düşük değer {min} (konum: {minX}, {minY}).',
  'Highest average by row: {row} ({rowValue}); by column: {column} ({columnValue}).':
    'Satırlara göre en yüksek ortalama: {row} ({rowValue}); sütunlara göre: {column} ({columnValue}).',
  '{name} rises {change} from an open of {open} ({startX}) to a close of {close} ({endX}).':
    '{name}: {change} yükseliş; açılış {open} ({startX}), kapanış {close} ({endX}).',
  '{name} falls {change} from an open of {open} ({startX}) to a close of {close} ({endX}).':
    '{name}: {change} düşüş; açılış {open} ({startX}), kapanış {close} ({endX}).',
  '{name} closes at {close} ({endX}), where it opened ({startX}).':
    '{name}: kapanış {close} ({endX}), açılışla ({startX}) aynı.',
  'Highest high {high} ({highX}); lowest low {low} ({lowX}).':
    'En yüksek değer {high} ({highX}); en düşük değer {low} ({lowX}).',
  '{name} is {value}.': '{name}: {value}.',
  '{name} is {value}, up {change} from {reference}.':
    '{name}: {value}; {reference} değerine göre {change} artış.',
  '{name} is {value}, down {change} from {reference}.':
    '{name}: {value}; {reference} değerine göre {change} azalış.',
  '{name} is {value}, unchanged from {reference}.':
    '{name}: {value}; {reference} değerine göre değişim yok.',
};
