/**
 * Holochart's own strings in Russian (not from plotly.js, whose locales don't have them): the UI
 * labels Plotly's dictionary lacks, the keyboard announcements (backlog S2.15) and the generated
 * chart summaries (plan E17.2). Each key is the runtime's English text; a translation keeps its
 * `{placeholders}`, in any order. Machine-translated: no native speaker has reviewed them.
 *
 * Russian declines nouns and makes verbs agree in number, and a placeholder's value can do
 * neither. So the sentences are built around the placeholders instead of through them: the trace
 * name leads, followed by a colon and a noun phrase ("{name}: рост с …" rather than a verb that
 * would have to agree with it), axis titles stand in quotes after a noun that takes the case
 * ("с ростом показателя «{x}»"), and counts follow a colon ("…: {count}") so that no noun has to
 * take a plural form that depends on the number.
 */
export const holochartRu: Readonly<Record<string, string>> = {
  // UI labels.
  Legend: 'Легенда',
  'Chart data: arrow keys move between points, + and - zoom':
    'Данные графика: для перехода между точками используйте стрелки, для изменения масштаба — клавиши + и -',
  'Draw line': 'Нарисовать линию',
  'Draw open freeform': 'Нарисовать произвольную линию',
  'Draw closed freeform': 'Нарисовать произвольную замкнутую фигуру',
  'Draw circle': 'Нарисовать окружность',
  'Draw rectangle': 'Нарисовать прямоугольник',
  'Erase active shape': 'Стереть активную фигуру',
  // Keyboard announcements.
  '{name}: {text}, point {n} of {count}.': '{name}: {text}, точка {n} из {count}.',
  'No data points to explore.': 'Нет точек данных для просмотра.',
  'Zoomed in.': 'Масштаб увеличен.',
  'Zoomed out.': 'Масштаб уменьшен.',
  'Panned.': 'Вид сдвинут.',
  'View rotated.': 'Вид повёрнут.',
  'View reset.': 'Вид сброшен.',
  '{name}: {text}, {n} of {count}.': '{name}: {text}, {n} из {count}.',
  '{name}: {position}, {text}, {n} of {count}.': '{name}: {position}, {text}, {n} из {count}.',
  '{name}: {text}, row {row} of {rows}, column {column} of {columns}.':
    '{name}: {text}, строка {row} из {rows}, столбец {column} из {columns}.',
  '{name}: {text}, level {level}, {n} of {count}, children: {children}.':
    '{name}: {text}, уровень {level}, {n} из {count}, дочерних элементов: {children}.',
  '{name}: {dimension}, {category}, {text}, {n} of {count}.':
    '{name}: {dimension}, {category}, {text}, {n} из {count}.',
  'Dimension {n}': 'Измерение {n}',
  'Map centered at longitude {lon}°, latitude {lat}°, scale {scale}.':
    'Карта с центром на долготе {lon}°, широте {lat}°, масштаб {scale}.',
  '{name}: {text}, node {n} of {count}.': '{name}: {text}, узел {n} из {count}.',
  '{name}: {text}, link {n} of {count} of {node}.':
    '{name}: {text}, связь {n} из {count} узла {node}.',
  '{name}: {text}, rank {rank} of {ranks}, {n} of {count}.':
    '{name}: {text}, слой {rank} из {ranks}, {n} из {count}.',
  'Up: {up}.': 'Вверх: {up}.',
  'Down: {down}.': 'Вниз: {down}.',
  'Folded.': 'Свёрнуто.',
  // Chart summaries.
  '{y} by {x}.': 'По оси X: {x}; по оси Y: {y}.',
  '{count} more traces are not summarized.': 'Ещё рядов данных без описания: {count}.',
  '{name} has no values.': '{name}: нет значений.',
  '{name} has a single value, {value} ({x}).': '{name}: единственное значение, {value} ({x}).',
  '{name} rises from {start} ({startX}) to {end} ({endX}).':
    '{name}: рост с {start} ({startX}) до {end} ({endX}).',
  '{name} falls from {start} ({startX}) to {end} ({endX}).':
    '{name}: снижение с {start} ({startX}) до {end} ({endX}).',
  '{name} stays flat at about {value}.': '{name}: значения стабильны, около {value}.',
  '{name} varies between {min} ({minX}) and {max} ({maxX}) with no clear trend.':
    '{name}: колебания между {min} ({minX}) и {max} ({maxX}) без явной тенденции.',
  'It peaks at {max} ({maxX}).': 'Максимум: {max} ({maxX}).',
  'Its lowest point is {min} ({minX}).': 'Минимум: {min} ({minX}).',
  '{name}: {y} rises strongly with {x} (correlation {r}).':
    '{name}: показатель «{y}» отчётливо увеличивается с ростом показателя «{x}» (корреляция {r}).',
  '{name}: {y} tends to rise with {x} (correlation {r}).':
    '{name}: показатель «{y}» в целом увеличивается с ростом показателя «{x}» (корреляция {r}).',
  '{name}: no clear relationship between {x} and {y} (correlation {r}).':
    '{name}: явной связи между показателями «{x}» и «{y}» нет (корреляция {r}).',
  '{name}: {y} tends to fall as {x} rises (correlation {r}).':
    '{name}: показатель «{y}» в целом снижается с ростом показателя «{x}» (корреляция {r}).',
  '{name}: {y} falls strongly as {x} rises (correlation {r}).':
    '{name}: показатель «{y}» отчётливо снижается с ростом показателя «{x}» (корреляция {r}).',
  'Values range from {min} to {max}.': 'Значения: от {min} до {max}.',
  '{label} is the largest slice of {name}: {share} ({value}).':
    '{name}: самый большой сектор — {label}, {share} ({value}).',
  '{label} is the largest stage of {name}: {share} ({value}).':
    '{name}: самый большой этап — {label}, {share} ({value}).',
  '{label} is the largest branch of {name}: {share} ({value}).':
    '{name}: самая большая ветвь — {label}, {share} ({value}).',
  '{label} is the largest flow of {name}: {share} ({value}).':
    '{name}: самый большой поток — {label}, {share} ({value}).',
  'Next: {label}, {share} ({value}).': 'Далее: {label}, {share} ({value}).',
  'Next: {label}, {share} ({value}), and {label2}, {share2} ({value2}).':
    'Далее: {label}, {share} ({value}), и {label2}, {share2} ({value2}).',
  '{name} is highest at {label} ({value}) and lowest at {lowLabel} ({lowValue}).':
    '{name}: максимум — {label} ({value}), минимум — {lowLabel} ({lowValue}).',
  '{name}: median {median}; half of the values lie between {q1} and {q3}; range {min} to {max}.':
    '{name}: медиана {median}; половина значений лежит между {q1} и {q3}; диапазон от {min} до {max}.',
  '{name}: medians range from {low} ({lowLabel}) to {high} ({highLabel}).':
    '{name}: медианы от {low} ({lowLabel}) до {high} ({highLabel}).',
  '{name}: the most common range is {start} to {end} ({value}).':
    '{name}: самый частый интервал — от {start} до {end} ({value}).',
  'Half of the values lie between {q1} and {q3}, with a median of about {median}.':
    'Половина значений лежит между {q1} и {q3}, медиана около {median}.',
  'The distribution is skewed to the right (a long tail of high values).':
    'Распределение скошено вправо (длинный хвост больших значений).',
  'The distribution is skewed to the left (a long tail of low values).':
    'Распределение скошено влево (длинный хвост малых значений).',
  '{name}: values range from {min} to {max}.': '{name}: значения от {min} до {max}.',
  'The highest value, {max}, is at {x}, {y}; the lowest, {min}, at {minX}, {minY}.':
    'Наибольшее значение, {max}, находится в точке {x}, {y}; наименьшее, {min}, — в точке {minX}, {minY}.',
  'Highest average by row: {row} ({rowValue}); by column: {column} ({columnValue}).':
    'Наибольшее среднее по строкам: {row} ({rowValue}); по столбцам: {column} ({columnValue}).',
  '{name} rises {change} from an open of {open} ({startX}) to a close of {close} ({endX}).':
    '{name}: рост на {change}, от цены открытия {open} ({startX}) до цены закрытия {close} ({endX}).',
  '{name} falls {change} from an open of {open} ({startX}) to a close of {close} ({endX}).':
    '{name}: снижение на {change}, от цены открытия {open} ({startX}) до цены закрытия {close} ({endX}).',
  '{name} closes at {close} ({endX}), where it opened ({startX}).':
    '{name}: закрытие на уровне {close} ({endX}), как и открытие ({startX}).',
  'Highest high {high} ({highX}); lowest low {low} ({lowX}).':
    'Самый высокий максимум: {high} ({highX}); самый низкий минимум: {low} ({lowX}).',
  '{name} is {value}.': '{name}: {value}.',
  '{name} is {value}, up {change} from {reference}.':
    '{name}: {value}, на {change} больше, чем {reference}.',
  '{name} is {value}, down {change} from {reference}.':
    '{name}: {value}, на {change} меньше, чем {reference}.',
  '{name} is {value}, unchanged from {reference}.':
    '{name}: {value}, без изменений относительно {reference}.',
};
