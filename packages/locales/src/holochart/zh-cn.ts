/**
 * Holochart's own strings in Simplified Chinese (not from plotly.js, whose locales don't have
 * them): the UI labels Plotly's dictionary lacks, the keyboard announcements (backlog S2.15) and
 * the generated chart summaries (plan E17.2). Each key is the runtime's English text; a
 * translation keeps its `{placeholders}`, in any order. Machine-translated: no native speaker has
 * reviewed them.
 *
 * "{y} by {x}" names the axes instead ("X轴：{x}，Y轴：{y}"), which reads naturally whatever the
 * titles are.
 */
export const holochartZhCN: Readonly<Record<string, string>> = {
  // UI labels.
  Legend: '图例',
  'Chart data: arrow keys move between points, + and - zoom':
    '图表数据：按方向键在数据点之间移动，按 + 和 - 缩放',
  'Draw line': '绘制线条',
  'Draw open freeform': '绘制开放的自由形状',
  'Draw closed freeform': '绘制闭合的自由形状',
  'Draw circle': '绘制圆形',
  'Draw rectangle': '绘制矩形',
  'Erase active shape': '清除当前形状',
  // Keyboard announcements.
  '{name}: {text}, point {n} of {count}.': '{name}：{text}，第{n}个点，共{count}个。',
  'No data points to explore.': '没有可浏览的数据点。',
  'Zoomed in.': '已放大。',
  'Zoomed out.': '已缩小。',
  'Panned.': '已平移。',
  'View rotated.': '视图已旋转。',
  'View reset.': '视图已重置。',
  '{name}: {text}, {n} of {count}.': '{name}：{text}，第{n}项，共{count}项。',
  '{name}: {position}, {text}, {n} of {count}.':
    '{name}：{position}，{text}，第{n}项，共{count}项。',
  '{name}: {text}, row {row} of {rows}, column {column} of {columns}.':
    '{name}：{text}，第{row}行，共{rows}行，第{column}列，共{columns}列。',
  '{name}: {text}, level {level}, {n} of {count}, children: {children}.':
    '{name}：{text}，第{level}层，第{n}项，共{count}项，{children}个子项。',
  '{name}: {dimension}, {category}, {text}, {n} of {count}.':
    '{name}：{dimension}，{category}，{text}，第{n}项，共{count}项。',
  'Dimension {n}': '维度{n}',
  'Map centered at longitude {lon}°, latitude {lat}°, scale {scale}.':
    '地图中心位于经度 {lon}°、纬度 {lat}°，缩放比例 {scale}。',
  '{name}: {text}, node {n} of {count}.': '{name}：{text}，第{n}个节点，共{count}个。',
  '{name}: {text}, link {n} of {count} of {node}.':
    '{name}：{text}，节点{node}的第{n}条连接，共{count}条。',
  '{name}: {text}, rank {rank} of {ranks}, {n} of {count}.':
    '{name}：{text}，第{rank}层，共{ranks}层，第{n}项，共{count}项。',
  'Up: {up}.': '上：{up}。',
  'Down: {down}.': '下：{down}。',
  'Folded.': '已折叠。',
  // Chart summaries.
  '{y} by {x}.': 'X轴：{x}，Y轴：{y}。',
  '{count} more traces are not summarized.': '另有{count}条轨迹未纳入摘要。',
  '{name} has no values.': '{name}没有数值。',
  '{name} has a single value, {value} ({x}).': '{name}只有一个值：{value}（{x}）。',
  '{name} rises from {start} ({startX}) to {end} ({endX}).':
    '{name}从{start}（{startX}）上升到{end}（{endX}）。',
  '{name} falls from {start} ({startX}) to {end} ({endX}).':
    '{name}从{start}（{startX}）下降到{end}（{endX}）。',
  '{name} stays flat at about {value}.': '{name}基本持平，约为{value}。',
  '{name} varies between {min} ({minX}) and {max} ({maxX}) with no clear trend.':
    '{name}在{min}（{minX}）和{max}（{maxX}）之间波动，没有明显趋势。',
  'It peaks at {max} ({maxX}).': '最高点为{max}（{maxX}）。',
  'Its lowest point is {min} ({minX}).': '最低点为{min}（{minX}）。',
  '{name}: {y} rises strongly with {x} (correlation {r}).':
    '{name}：{y}随{x}明显上升（相关系数{r}）。',
  '{name}: {y} tends to rise with {x} (correlation {r}).':
    '{name}：{y}有随{x}上升的趋势（相关系数{r}）。',
  '{name}: no clear relationship between {x} and {y} (correlation {r}).':
    '{name}：{x}与{y}之间没有明显关系（相关系数{r}）。',
  '{name}: {y} tends to fall as {x} rises (correlation {r}).':
    '{name}：{y}有随{x}上升而下降的趋势（相关系数{r}）。',
  '{name}: {y} falls strongly as {x} rises (correlation {r}).':
    '{name}：{y}随{x}上升而明显下降（相关系数{r}）。',
  'Values range from {min} to {max}.': '数值范围为{min}至{max}。',
  '{label} is the largest slice of {name}: {share} ({value}).':
    '{label}是{name}中最大的扇区：{share}（{value}）。',
  '{label} is the largest stage of {name}: {share} ({value}).':
    '{label}是{name}中最大的阶段：{share}（{value}）。',
  '{label} is the largest branch of {name}: {share} ({value}).':
    '{label}是{name}中最大的分支：{share}（{value}）。',
  '{label} is the largest flow of {name}: {share} ({value}).':
    '{label}是{name}中最大的流量：{share}（{value}）。',
  'Next: {label}, {share} ({value}).': '其次：{label}，{share}（{value}）。',
  'Next: {label}, {share} ({value}), and {label2}, {share2} ({value2}).':
    '其次：{label}，{share}（{value}），以及{label2}，{share2}（{value2}）。',
  '{name} is highest at {label} ({value}) and lowest at {lowLabel} ({lowValue}).':
    '{name}的最高值在{label}（{value}），最低值在{lowLabel}（{lowValue}）。',
  '{name}: median {median}; half of the values lie between {q1} and {q3}; range {min} to {max}.':
    '{name}：中位数{median}；一半的数值在{q1}和{q3}之间；范围为{min}至{max}。',
  '{name}: medians range from {low} ({lowLabel}) to {high} ({highLabel}).':
    '{name}：中位数范围为{low}（{lowLabel}）至{high}（{highLabel}）。',
  '{name}: the most common range is {start} to {end} ({value}).':
    '{name}：最常见的区间是{start}至{end}（{value}）。',
  'Half of the values lie between {q1} and {q3}, with a median of about {median}.':
    '一半的数值在{q1}和{q3}之间，中位数约为{median}。',
  'The distribution is skewed to the right (a long tail of high values).':
    '分布右偏（高值一侧有长尾）。',
  'The distribution is skewed to the left (a long tail of low values).':
    '分布左偏（低值一侧有长尾）。',
  '{name}: values range from {min} to {max}.': '{name}：数值范围为{min}至{max}。',
  'The highest value, {max}, is at {x}, {y}; the lowest, {min}, at {minX}, {minY}.':
    '最大值{max}位于{x}，{y}；最小值{min}位于{minX}，{minY}。',
  'Highest average by row: {row} ({rowValue}); by column: {column} ({columnValue}).':
    '平均值最高的行：{row}（{rowValue}）；列：{column}（{columnValue}）。',
  '{name} rises {change} from an open of {open} ({startX}) to a close of {close} ({endX}).':
    '{name}上涨{change}，开盘价{open}（{startX}），收盘价{close}（{endX}）。',
  '{name} falls {change} from an open of {open} ({startX}) to a close of {close} ({endX}).':
    '{name}下跌{change}，开盘价{open}（{startX}），收盘价{close}（{endX}）。',
  '{name} closes at {close} ({endX}), where it opened ({startX}).':
    '{name}收于{close}（{endX}），与开盘价（{startX}）持平。',
  'Highest high {high} ({highX}); lowest low {low} ({lowX}).':
    '最高价{high}（{highX}）；最低价{low}（{lowX}）。',
  '{name} is {value}.': '{name}为{value}。',
  '{name} is {value}, up {change} from {reference}.': '{name}为{value}，比{reference}高{change}。',
  '{name} is {value}, down {change} from {reference}.':
    '{name}为{value}，比{reference}低{change}。',
  '{name} is {value}, unchanged from {reference}.': '{name}为{value}，与{reference}持平。',
};
