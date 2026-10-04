/**
 * Holochart's own strings in Korean (not from plotly.js, whose locales don't have them): the UI
 * labels Plotly's dictionary lacks, the keyboard announcements (backlog S2.15) and the generated
 * chart summaries (plan E17.2). Each key is the runtime's English text; a translation keeps its
 * `{placeholders}`, in any order. Machine-translated: no native speaker has reviewed them.
 *
 * Korean particles such as 은/는, 이/가 and 을/를 depend on whether the word before them ends in
 * a consonant, which a placeholder's value decides. So no such particle follows a placeholder:
 * the trace name leads, followed by a colon, and placeholders take only the particles that never
 * change (에서, 까지, 의) or are followed by a noun that carries the particle ("{x} 값이").
 */
export const holochartKo: Readonly<Record<string, string>> = {
  // UI labels.
  Legend: '범례',
  'Chart data: arrow keys move between points, + and - zoom':
    '차트 데이터: 화살표 키로 점 사이를 이동하고 +와 -로 확대/축소합니다',
  'Draw line': '선 그리기',
  'Draw open freeform': '열린 자유형 그리기',
  'Draw closed freeform': '닫힌 자유형 그리기',
  'Draw circle': '원 그리기',
  'Draw rectangle': '사각형 그리기',
  'Erase active shape': '활성 도형 지우기',
  // The default trace name and the hover labels: plotly.js's ko has no `trace`, and has the hover
  // keys without the colon the charts look up, so its translations never applied. The price
  // labels use the terms of the trade (시가, 고가, 저가, 종가) where plotly.js had the everyday
  // words for opening and closing (열기, 닫기).
  trace: '트레이스',
  'open:': '시가:',
  'high:': '고가:',
  'low:': '저가:',
  'close:': '종가:',
  'max:': '최댓값:',
  'upper fence:': '상한:',
  'q3:': '3사분위수:',
  'median:': '중앙값:',
  'mean:': '평균:',
  'mean ± σ:': '평균 ± σ:',
  'q1:': '1사분위수:',
  'lower fence:': '하한:',
  'min:': '최솟값:',
  'kde:': 'kde:',
  // Keyboard announcements.
  '{name}: {text}, point {n} of {count}.': '{name}: {text}, 점 {count}개 중 {n}번째.',
  'No data points to explore.': '탐색할 데이터 점이 없습니다.',
  'Zoomed in.': '확대했습니다.',
  'Zoomed out.': '축소했습니다.',
  'Panned.': '이동했습니다.',
  'View rotated.': '뷰를 회전했습니다.',
  'View reset.': '뷰를 초기화했습니다.',
  '{name}: {text}, {n} of {count}.': '{name}: {text}, {count}개 중 {n}번째.',
  '{name}: {position}, {text}, {n} of {count}.':
    '{name}: {position}, {text}, {count}개 중 {n}번째.',
  '{name}: {text}, row {row} of {rows}, column {column} of {columns}.':
    '{name}: {text}, {rows}행 중 {row}행, {columns}열 중 {column}열.',
  '{name}: {text}, level {level}, {n} of {count}, children: {children}.':
    '{name}: {text}, 레벨 {level}, {count}개 중 {n}번째, 하위 항목: {children}개.',
  '{name}: {dimension}, {category}, {text}, {n} of {count}.':
    '{name}: {dimension}, {category}, {text}, {count}개 중 {n}번째.',
  'Dimension {n}': '차원 {n}',
  // Chart summaries.
  '{y} by {x}.': 'X축: {x}, Y축: {y}.',
  '{count} more traces are not summarized.': '요약되지 않은 트레이스가 {count}개 더 있습니다.',
  '{name} has no values.': '{name}: 값이 없습니다.',
  '{name} has a single value, {value} ({x}).': '{name}: 값이 {value} ({x}) 하나뿐입니다.',
  '{name} rises from {start} ({startX}) to {end} ({endX}).':
    '{name}: {start} ({startX})에서 {end} ({endX})까지 상승합니다.',
  '{name} falls from {start} ({startX}) to {end} ({endX}).':
    '{name}: {start} ({startX})에서 {end} ({endX})까지 하락합니다.',
  '{name} stays flat at about {value}.': '{name}: 약 {value} 수준을 유지합니다.',
  '{name} varies between {min} ({minX}) and {max} ({maxX}) with no clear trend.':
    '{name}: 뚜렷한 추세 없이 {min} ({minX})에서 {max} ({maxX}) 사이를 오르내립니다.',
  'It peaks at {max} ({maxX}).': '최고점은 {max} ({maxX})입니다.',
  'Its lowest point is {min} ({minX}).': '최저점은 {min} ({minX})입니다.',
  '{name}: {y} rises strongly with {x} (correlation {r}).':
    '{name}: {x} 값이 커질수록 {y} 값이 뚜렷하게 증가합니다 (상관계수 {r}).',
  '{name}: {y} tends to rise with {x} (correlation {r}).':
    '{name}: {x} 값이 커질수록 {y} 값이 증가하는 경향이 있습니다 (상관계수 {r}).',
  '{name}: no clear relationship between {x} and {y} (correlation {r}).':
    '{name}: {x} 값과 {y} 값 사이에 뚜렷한 관계가 없습니다 (상관계수 {r}).',
  '{name}: {y} tends to fall as {x} rises (correlation {r}).':
    '{name}: {x} 값이 커질수록 {y} 값이 감소하는 경향이 있습니다 (상관계수 {r}).',
  '{name}: {y} falls strongly as {x} rises (correlation {r}).':
    '{name}: {x} 값이 커질수록 {y} 값이 뚜렷하게 감소합니다 (상관계수 {r}).',
  'Values range from {min} to {max}.': '값의 범위는 {min}에서 {max}까지입니다.',
  '{label} is the largest slice of {name}: {share} ({value}).':
    '{name}에서 가장 큰 조각: {label}, {share} ({value}).',
  '{label} is the largest stage of {name}: {share} ({value}).':
    '{name}에서 가장 큰 단계: {label}, {share} ({value}).',
  '{label} is the largest branch of {name}: {share} ({value}).':
    '{name}에서 가장 큰 가지: {label}, {share} ({value}).',
  '{label} is the largest flow of {name}: {share} ({value}).':
    '{name}에서 가장 큰 흐름: {label}, {share} ({value}).',
  'Next: {label}, {share} ({value}).': '다음: {label}, {share} ({value}).',
  'Next: {label}, {share} ({value}), and {label2}, {share2} ({value2}).':
    '다음: {label}, {share} ({value}), 그리고 {label2}, {share2} ({value2}).',
  '{name} is highest at {label} ({value}) and lowest at {lowLabel} ({lowValue}).':
    '{name}: {label}에서 가장 높고 ({value}), {lowLabel}에서 가장 낮습니다 ({lowValue}).',
  '{name}: median {median}; half of the values lie between {q1} and {q3}; range {min} to {max}.':
    '{name}: 중앙값은 {median}입니다. 값의 절반이 {q1}에서 {q3} 사이에 있고, 범위는 {min}에서 {max}까지입니다.',
  '{name}: medians range from {low} ({lowLabel}) to {high} ({highLabel}).':
    '{name}: 중앙값의 범위는 {low} ({lowLabel})에서 {high} ({highLabel})까지입니다.',
  '{name}: the most common range is {start} to {end} ({value}).':
    '{name}: 가장 빈도가 높은 구간은 {start}에서 {end}까지입니다 ({value}).',
  'Half of the values lie between {q1} and {q3}, with a median of about {median}.':
    '값의 절반이 {q1}에서 {q3} 사이에 있으며, 중앙값은 약 {median}입니다.',
  'The distribution is skewed to the right (a long tail of high values).':
    '분포의 꼬리가 오른쪽으로 깁니다 (큰 값 쪽으로 긴 꼬리).',
  'The distribution is skewed to the left (a long tail of low values).':
    '분포의 꼬리가 왼쪽으로 깁니다 (작은 값 쪽으로 긴 꼬리).',
  '{name}: values range from {min} to {max}.': '{name}: 값의 범위는 {min}에서 {max}까지입니다.',
  'The highest value, {max}, is at {x}, {y}; the lowest, {min}, at {minX}, {minY}.':
    '최댓값은 {max}입니다 (위치: {x}, {y}). 최솟값은 {min}입니다 (위치: {minX}, {minY}).',
  'Highest average by row: {row} ({rowValue}); by column: {column} ({columnValue}).':
    '평균이 가장 높은 행: {row} ({rowValue}), 평균이 가장 높은 열: {column} ({columnValue}).',
  '{name} rises {change} from an open of {open} ({startX}) to a close of {close} ({endX}).':
    '{name}: 시가 {open} ({startX})에서 종가 {close} ({endX})까지 {change} 상승했습니다.',
  '{name} falls {change} from an open of {open} ({startX}) to a close of {close} ({endX}).':
    '{name}: 시가 {open} ({startX})에서 종가 {close} ({endX})까지 {change} 하락했습니다.',
  '{name} closes at {close} ({endX}), where it opened ({startX}).':
    '{name}: 종가는 {close} ({endX})입니다. 시가 ({startX}) 대비 변동이 없습니다.',
  'Highest high {high} ({highX}); lowest low {low} ({lowX}).':
    '최고가 {high} ({highX}), 최저가 {low} ({lowX}).',
  '{name} is {value}.': '{name}: {value}입니다.',
  '{name} is {value}, up {change} from {reference}.':
    '{name}: {value}, {reference} 대비 {change} 증가했습니다.',
  '{name} is {value}, down {change} from {reference}.':
    '{name}: {value}, {reference} 대비 {change} 감소했습니다.',
  '{name} is {value}, unchanged from {reference}.':
    '{name}: {value}, {reference} 대비 변동이 없습니다.',
};
