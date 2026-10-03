/**
 * Holochart's own strings in Japanese (not from plotly.js, whose locales don't have them): the UI
 * labels Plotly's dictionary lacks, the keyboard announcements (backlog S2.15) and the generated
 * chart summaries (plan E17.2). Each key is the runtime's English text; a translation keeps its
 * `{placeholders}`, in any order. Machine-translated: no native speaker has reviewed them.
 *
 * Counts come before the position ("{count}個中{n}番目"), and "{y} by {x}" names the axes instead
 * ("X軸：{x}、Y軸：{y}"), which reads naturally whatever the titles are.
 */
export const holochartJa: Readonly<Record<string, string>> = {
  // UI labels.
  Legend: '凡例',
  'Chart data: arrow keys move between points, + and - zoom':
    'グラフのデータ：矢印キーでポイント間を移動、+ と - でズーム',
  'Draw line': '線を描画',
  'Draw open freeform': '開いたフリーフォームを描画',
  'Draw closed freeform': '閉じたフリーフォームを描画',
  'Draw circle': '円を描画',
  'Draw rectangle': '矩形を描画',
  'Erase active shape': 'アクティブな図形を消去',
  // Keyboard announcements.
  '{name}: {text}, point {n} of {count}.': '{name}：{text}、{count}個中{n}番目のポイント。',
  'No data points to explore.': '確認できるデータポイントがありません。',
  'Zoomed in.': '拡大しました。',
  'Zoomed out.': '縮小しました。',
  'Panned.': '表示位置を移動しました。',
  'View rotated.': 'ビューを回転しました。',
  'View reset.': 'ビューをリセットしました。',
  '{name}: {text}, {n} of {count}.': '{name}：{text}、{count}個中{n}番目。',
  '{name}: {position}, {text}, {n} of {count}.': '{name}：{position}、{text}、{count}個中{n}番目。',
  '{name}: {text}, row {row} of {rows}, column {column} of {columns}.':
    '{name}：{text}、{rows}行中{row}行目、{columns}列中{column}列目。',
  '{name}: {text}, level {level}, {n} of {count}, children: {children}.':
    '{name}：{text}、レベル{level}、{count}個中{n}番目、子要素{children}個。',
  '{name}: {dimension}, {category}, {text}, {n} of {count}.':
    '{name}：{dimension}、{category}、{text}、{count}個中{n}番目。',
  'Dimension {n}': '次元{n}',
  // Chart summaries.
  '{y} by {x}.': 'X軸：{x}、Y軸：{y}。',
  '{count} more traces are not summarized.': '要約されていないトレースがあと{count}件あります。',
  '{name} has no values.': '{name}には値がありません。',
  '{name} has a single value, {value} ({x}).': '{name}の値は1つだけで、{value}（{x}）です。',
  '{name} rises from {start} ({startX}) to {end} ({endX}).':
    '{name}は{start}（{startX}）から{end}（{endX}）に上昇しています。',
  '{name} falls from {start} ({startX}) to {end} ({endX}).':
    '{name}は{start}（{startX}）から{end}（{endX}）に下降しています。',
  '{name} stays flat at about {value}.': '{name}は約{value}で横ばいです。',
  '{name} varies between {min} ({minX}) and {max} ({maxX}) with no clear trend.':
    '{name}は{min}（{minX}）から{max}（{maxX}）の間で変動しており、明確な傾向はありません。',
  'It peaks at {max} ({maxX}).': '最大値は{max}（{maxX}）です。',
  'Its lowest point is {min} ({minX}).': '最小値は{min}（{minX}）です。',
  '{name}: {y} rises strongly with {x} (correlation {r}).':
    '{name}：{x}が増加すると{y}も増加する強い傾向があります（相関係数{r}）。',
  '{name}: {y} tends to rise with {x} (correlation {r}).':
    '{name}：{x}が増加すると{y}も増加する傾向があります（相関係数{r}）。',
  '{name}: no clear relationship between {x} and {y} (correlation {r}).':
    '{name}：{x}と{y}の間に明確な関係はありません（相関係数{r}）。',
  '{name}: {y} tends to fall as {x} rises (correlation {r}).':
    '{name}：{x}が増加すると{y}は減少する傾向があります（相関係数{r}）。',
  '{name}: {y} falls strongly as {x} rises (correlation {r}).':
    '{name}：{x}が増加すると{y}は減少する強い傾向があります（相関係数{r}）。',
  'Values range from {min} to {max}.': '値の範囲は{min}から{max}です。',
  '{label} is the largest slice of {name}: {share} ({value}).':
    '{name}で最も大きいスライスは{label}で、{share}（{value}）です。',
  '{label} is the largest stage of {name}: {share} ({value}).':
    '{name}で最も大きいステージは{label}で、{share}（{value}）です。',
  '{label} is the largest branch of {name}: {share} ({value}).':
    '{name}で最も大きいブランチは{label}で、{share}（{value}）です。',
  '{label} is the largest flow of {name}: {share} ({value}).':
    '{name}で最も大きいフローは{label}で、{share}（{value}）です。',
  'Next: {label}, {share} ({value}).': '次は{label}、{share}（{value}）です。',
  'Next: {label}, {share} ({value}), and {label2}, {share2} ({value2}).':
    '次は{label}、{share}（{value}）と、{label2}、{share2}（{value2}）です。',
  '{name} is highest at {label} ({value}) and lowest at {lowLabel} ({lowValue}).':
    '{name}は{label}（{value}）で最大、{lowLabel}（{lowValue}）で最小です。',
  '{name}: median {median}; half of the values lie between {q1} and {q3}; range {min} to {max}.':
    '{name}：中央値は{median}、値の半分は{q1}から{q3}の間、範囲は{min}から{max}です。',
  '{name}: medians range from {low} ({lowLabel}) to {high} ({highLabel}).':
    '{name}：中央値は{low}（{lowLabel}）から{high}（{highLabel}）の範囲です。',
  '{name}: the most common range is {start} to {end} ({value}).':
    '{name}：最も多いのは{start}から{end}の範囲（{value}）です。',
  'Half of the values lie between {q1} and {q3}, with a median of about {median}.':
    '値の半分は{q1}から{q3}の間にあり、中央値は約{median}です。',
  'The distribution is skewed to the right (a long tail of high values).':
    '右に裾が長い分布です（大きい値の側に裾が伸びています）。',
  'The distribution is skewed to the left (a long tail of low values).':
    '左に裾が長い分布です（小さい値の側に裾が伸びています）。',
  '{name}: values range from {min} to {max}.': '{name}：値の範囲は{min}から{max}です。',
  'The highest value, {max}, is at {x}, {y}; the lowest, {min}, at {minX}, {minY}.':
    '最大値{max}は{x}、{y}にあり、最小値{min}は{minX}、{minY}にあります。',
  'Highest average by row: {row} ({rowValue}); by column: {column} ({columnValue}).':
    '平均が最も高い行：{row}（{rowValue}）、列：{column}（{columnValue}）。',
  '{name} rises {change} from an open of {open} ({startX}) to a close of {close} ({endX}).':
    '{name}は始値{open}（{startX}）から終値{close}（{endX}）へ{change}上昇しています。',
  '{name} falls {change} from an open of {open} ({startX}) to a close of {close} ({endX}).':
    '{name}は始値{open}（{startX}）から終値{close}（{endX}）へ{change}下落しています。',
  '{name} closes at {close} ({endX}), where it opened ({startX}).':
    '{name}の終値は{close}（{endX}）で、始値（{startX}）と同じです。',
  'Highest high {high} ({highX}); lowest low {low} ({lowX}).':
    '最高値{high}（{highX}）、最安値{low}（{lowX}）。',
  '{name} is {value}.': '{name}は{value}です。',
  '{name} is {value}, up {change} from {reference}.':
    '{name}は{value}で、{reference}から{change}増加しています。',
  '{name} is {value}, down {change} from {reference}.':
    '{name}は{value}で、{reference}から{change}減少しています。',
  '{name} is {value}, unchanged from {reference}.':
    '{name}は{value}で、{reference}から変化していません。',
};
