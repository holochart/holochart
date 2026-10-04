/**
 * Holochart's own strings in Brazilian Portuguese (not from plotly.js, whose locales don't have
 * them): the UI labels Plotly's dictionary lacks, the keyboard announcements (backlog S2.15) and
 * the generated chart summaries (plan E17.2). Each key is the runtime's English text; a
 * translation keeps its `{placeholders}`, in any order. Machine-translated: no native speaker has
 * reviewed them.
 */
export const holochartPtBR: Readonly<Record<string, string>> = {
  // UI labels.
  Legend: 'Legenda',
  'Chart data: arrow keys move between points, + and - zoom':
    'Dados do gráfico: teclas de seta para mover entre os pontos, + e - para ajustar o zoom',
  'Draw line': 'Desenhar linha',
  'Draw open freeform': 'Desenhar forma livre aberta',
  'Draw closed freeform': 'Desenhar forma livre fechada',
  'Draw circle': 'Desenhar círculo',
  'Draw rectangle': 'Desenhar retângulo',
  'Erase active shape': 'Apagar forma ativa',
  // Hover labels: plotly.js's pt-BR has these keys without the colon the charts look up, so its
  // translations never applied. The same words, under the keys in use.
  'open:': 'abertura:',
  'high:': 'alta:',
  'low:': 'baixa:',
  'close:': 'fechamento:',
  'max:': 'máximo:',
  'upper fence:': 'limite superior:',
  'q3:': 'q3:',
  'median:': 'mediana:',
  'mean:': 'média:',
  'mean ± σ:': 'média ± σ:',
  'q1:': 'q1:',
  'lower fence:': 'limite inferior:',
  'min:': 'mínimo:',
  'kde:': 'kde:',
  // Keyboard announcements.
  '{name}: {text}, point {n} of {count}.': '{name}: {text}, ponto {n} de {count}.',
  'No data points to explore.': 'Nenhum ponto de dados para explorar.',
  'Zoomed in.': 'Zoom ampliado.',
  'Zoomed out.': 'Zoom reduzido.',
  'Panned.': 'Visão movida.',
  'View rotated.': 'Visão girada.',
  'View reset.': 'Visão restaurada.',
  '{name}: {text}, {n} of {count}.': '{name}: {text}, {n} de {count}.',
  '{name}: {position}, {text}, {n} of {count}.': '{name}: {position}, {text}, {n} de {count}.',
  '{name}: {text}, row {row} of {rows}, column {column} of {columns}.':
    '{name}: {text}, linha {row} de {rows}, coluna {column} de {columns}.',
  '{name}: {text}, level {level}, {n} of {count}, children: {children}.':
    '{name}: {text}, nível {level}, {n} de {count}, itens filhos: {children}.',
  '{name}: {dimension}, {category}, {text}, {n} of {count}.':
    '{name}: {dimension}, {category}, {text}, {n} de {count}.',
  'Dimension {n}': 'Dimensão {n}',
  // Chart summaries.
  '{y} by {x}.': '{y} por {x}.',
  '{count} more traces are not summarized.': 'Outras séries não resumidas: {count}.',
  '{name} has no values.': '{name} não tem valores.',
  '{name} has a single value, {value} ({x}).': '{name} tem um único valor, {value} ({x}).',
  '{name} rises from {start} ({startX}) to {end} ({endX}).':
    '{name} sobe de {start} ({startX}) para {end} ({endX}).',
  '{name} falls from {start} ({startX}) to {end} ({endX}).':
    '{name} cai de {start} ({startX}) para {end} ({endX}).',
  '{name} stays flat at about {value}.': '{name} fica estável em torno de {value}.',
  '{name} varies between {min} ({minX}) and {max} ({maxX}) with no clear trend.':
    '{name} varia entre {min} ({minX}) e {max} ({maxX}) sem tendência clara.',
  'It peaks at {max} ({maxX}).': 'Atinge o pico de {max} ({maxX}).',
  'Its lowest point is {min} ({minX}).': 'O ponto mais baixo é {min} ({minX}).',
  '{name}: {y} rises strongly with {x} (correlation {r}).':
    '{name}: {y} sobe fortemente com {x} (correlação {r}).',
  '{name}: {y} tends to rise with {x} (correlation {r}).':
    '{name}: {y} tende a subir com {x} (correlação {r}).',
  '{name}: no clear relationship between {x} and {y} (correlation {r}).':
    '{name}: não há relação clara entre {x} e {y} (correlação {r}).',
  '{name}: {y} tends to fall as {x} rises (correlation {r}).':
    '{name}: {y} tende a cair quando {x} sobe (correlação {r}).',
  '{name}: {y} falls strongly as {x} rises (correlation {r}).':
    '{name}: {y} cai fortemente quando {x} sobe (correlação {r}).',
  'Values range from {min} to {max}.': 'Os valores vão de {min} a {max}.',
  '{label} is the largest slice of {name}: {share} ({value}).':
    '{label} é a maior fatia de {name}: {share} ({value}).',
  '{label} is the largest stage of {name}: {share} ({value}).':
    '{label} é a maior etapa de {name}: {share} ({value}).',
  '{label} is the largest branch of {name}: {share} ({value}).':
    '{label} é o maior ramo de {name}: {share} ({value}).',
  '{label} is the largest flow of {name}: {share} ({value}).':
    '{label} é o maior fluxo de {name}: {share} ({value}).',
  'Next: {label}, {share} ({value}).': 'Em seguida: {label}, {share} ({value}).',
  'Next: {label}, {share} ({value}), and {label2}, {share2} ({value2}).':
    'Em seguida: {label}, {share} ({value}), e {label2}, {share2} ({value2}).',
  '{name} is highest at {label} ({value}) and lowest at {lowLabel} ({lowValue}).':
    '{name} tem o valor máximo em {label} ({value}) e o mínimo em {lowLabel} ({lowValue}).',
  '{name}: median {median}; half of the values lie between {q1} and {q3}; range {min} to {max}.':
    '{name}: mediana {median}; metade dos valores está entre {q1} e {q3}; intervalo de {min} a {max}.',
  '{name}: medians range from {low} ({lowLabel}) to {high} ({highLabel}).':
    '{name}: medianas de {low} ({lowLabel}) a {high} ({highLabel}).',
  '{name}: the most common range is {start} to {end} ({value}).':
    '{name}: o intervalo mais frequente vai de {start} a {end} ({value}).',
  'Half of the values lie between {q1} and {q3}, with a median of about {median}.':
    'Metade dos valores está entre {q1} e {q3}, com mediana de cerca de {median}.',
  'The distribution is skewed to the right (a long tail of high values).':
    'A distribuição é assimétrica à direita (uma cauda longa de valores altos).',
  'The distribution is skewed to the left (a long tail of low values).':
    'A distribuição é assimétrica à esquerda (uma cauda longa de valores baixos).',
  '{name}: values range from {min} to {max}.': '{name}: valores de {min} a {max}.',
  'The highest value, {max}, is at {x}, {y}; the lowest, {min}, at {minX}, {minY}.':
    'O valor mais alto, {max}, está em {x}, {y}; o mais baixo, {min}, em {minX}, {minY}.',
  'Highest average by row: {row} ({rowValue}); by column: {column} ({columnValue}).':
    'Maior média por linha: {row} ({rowValue}); por coluna: {column} ({columnValue}).',
  '{name} rises {change} from an open of {open} ({startX}) to a close of {close} ({endX}).':
    '{name} sobe {change}, de uma abertura de {open} ({startX}) a um fechamento de {close} ({endX}).',
  '{name} falls {change} from an open of {open} ({startX}) to a close of {close} ({endX}).':
    '{name} cai {change}, de uma abertura de {open} ({startX}) a um fechamento de {close} ({endX}).',
  '{name} closes at {close} ({endX}), where it opened ({startX}).':
    '{name} fecha em {close} ({endX}), no mesmo nível da abertura ({startX}).',
  'Highest high {high} ({highX}); lowest low {low} ({lowX}).':
    'Máxima mais alta {high} ({highX}); mínima mais baixa {low} ({lowX}).',
  '{name} is {value}.': '{name} é {value}.',
  '{name} is {value}, up {change} from {reference}.':
    '{name} é {value}, {change} acima de {reference}.',
  '{name} is {value}, down {change} from {reference}.':
    '{name} é {value}, {change} abaixo de {reference}.',
  '{name} is {value}, unchanged from {reference}.':
    '{name} é {value}, sem alteração em relação a {reference}.',
};
