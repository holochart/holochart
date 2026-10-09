/**
 * Holochart's own strings in Spanish (not from plotly.js, whose locales don't have them): the UI
 * labels Plotly's dictionary lacks, the keyboard announcements (backlog S2.15) and the generated
 * chart summaries (plan E17.2). Each key is the runtime's English text; a translation keeps its
 * `{placeholders}`, in any order. Machine-translated: no native speaker has reviewed them.
 */
export const holochartEs: Readonly<Record<string, string>> = {
  // UI labels.
  Legend: 'Leyenda',
  'Chart data: arrow keys move between points, + and - zoom':
    'Datos de la gráfica: teclas de flecha para moverse entre puntos, + y - para ampliar y reducir',
  'Draw line': 'Dibujar línea',
  'Draw open freeform': 'Dibujar forma libre abierta',
  'Draw closed freeform': 'Dibujar forma libre cerrada',
  'Draw circle': 'Dibujar círculo',
  'Draw rectangle': 'Dibujar rectángulo',
  'Erase active shape': 'Borrar forma activa',
  // Keyboard announcements.
  '{name}: {text}, point {n} of {count}.': '{name}: {text}, punto {n} de {count}.',
  'No data points to explore.': 'No hay puntos de datos que explorar.',
  'Zoomed in.': 'Vista ampliada.',
  'Zoomed out.': 'Vista reducida.',
  'Panned.': 'Vista desplazada.',
  'View rotated.': 'Vista girada.',
  'View reset.': 'Vista restaurada.',
  '{name}: {text}, {n} of {count}.': '{name}: {text}, {n} de {count}.',
  '{name}: {position}, {text}, {n} of {count}.': '{name}: {position}, {text}, {n} de {count}.',
  '{name}: {text}, row {row} of {rows}, column {column} of {columns}.':
    '{name}: {text}, fila {row} de {rows}, columna {column} de {columns}.',
  '{name}: {text}, level {level}, {n} of {count}, children: {children}.':
    '{name}: {text}, nivel {level}, {n} de {count}, nodos hijos: {children}.',
  '{name}: {dimension}, {category}, {text}, {n} of {count}.':
    '{name}: {dimension}, {category}, {text}, {n} de {count}.',
  'Dimension {n}': 'Dimensión {n}',
  'Map centered at longitude {lon}°, latitude {lat}°, scale {scale}.':
    'Mapa centrado en longitud {lon}°, latitud {lat}°, escala {scale}.',
  '{name}: {text}, node {n} of {count}.': '{name}: {text}, nodo {n} de {count}.',
  '{name}: {text}, link {n} of {count} of {node}.':
    '{name}: {text}, enlace {n} de {count} del nodo {node}.',
  '{name}: {text}, rank {rank} of {ranks}, {n} of {count}.':
    '{name}: {text}, capa {rank} de {ranks}, {n} de {count}.',
  'Up: {up}.': 'Arriba: {up}.',
  'Down: {down}.': 'Abajo: {down}.',
  'Folded.': 'Contraído.',
  // Chart summaries.
  '{y} by {x}.': '{y} por {x}.',
  '{count} more traces are not summarized.': 'Otras {count} series no se resumen.',
  '{name} has no values.': '{name} no tiene valores.',
  '{name} has a single value, {value} ({x}).': '{name} tiene un único valor, {value} ({x}).',
  '{name} rises from {start} ({startX}) to {end} ({endX}).':
    '{name} sube de {start} ({startX}) a {end} ({endX}).',
  '{name} falls from {start} ({startX}) to {end} ({endX}).':
    '{name} baja de {start} ({startX}) a {end} ({endX}).',
  '{name} stays flat at about {value}.': '{name} se mantiene estable en torno a {value}.',
  '{name} varies between {min} ({minX}) and {max} ({maxX}) with no clear trend.':
    '{name} varía entre {min} ({minX}) y {max} ({maxX}) sin una tendencia clara.',
  'It peaks at {max} ({maxX}).': 'Alcanza un máximo de {max} ({maxX}).',
  'Its lowest point is {min} ({minX}).': 'Su punto más bajo es {min} ({minX}).',
  '{name}: {y} rises strongly with {x} (correlation {r}).':
    '{name}: {y} sube fuertemente con {x} (correlación {r}).',
  '{name}: {y} tends to rise with {x} (correlation {r}).':
    '{name}: {y} tiende a subir con {x} (correlación {r}).',
  '{name}: no clear relationship between {x} and {y} (correlation {r}).':
    '{name}: no hay una relación clara entre {x} y {y} (correlación {r}).',
  '{name}: {y} tends to fall as {x} rises (correlation {r}).':
    '{name}: {y} tiende a bajar cuando {x} sube (correlación {r}).',
  '{name}: {y} falls strongly as {x} rises (correlation {r}).':
    '{name}: {y} baja fuertemente cuando {x} sube (correlación {r}).',
  'Values range from {min} to {max}.': 'Los valores van de {min} a {max}.',
  '{label} is the largest slice of {name}: {share} ({value}).':
    '{label} es el mayor sector de {name}: {share} ({value}).',
  '{label} is the largest stage of {name}: {share} ({value}).':
    '{label} es la mayor etapa de {name}: {share} ({value}).',
  '{label} is the largest branch of {name}: {share} ({value}).':
    '{label} es la mayor rama de {name}: {share} ({value}).',
  '{label} is the largest flow of {name}: {share} ({value}).':
    '{label} es el mayor flujo de {name}: {share} ({value}).',
  'Next: {label}, {share} ({value}).': 'Después: {label}, {share} ({value}).',
  'Next: {label}, {share} ({value}), and {label2}, {share2} ({value2}).':
    'Después: {label}, {share} ({value}), y {label2}, {share2} ({value2}).',
  '{name} is highest at {label} ({value}) and lowest at {lowLabel} ({lowValue}).':
    '{name} es máximo en {label} ({value}) y mínimo en {lowLabel} ({lowValue}).',
  '{name}: median {median}; half of the values lie between {q1} and {q3}; range {min} to {max}.':
    '{name}: mediana {median}; la mitad de los valores está entre {q1} y {q3}; rango de {min} a {max}.',
  '{name}: medians range from {low} ({lowLabel}) to {high} ({highLabel}).':
    '{name}: medianas de {low} ({lowLabel}) a {high} ({highLabel}).',
  '{name}: the most common range is {start} to {end} ({value}).':
    '{name}: el intervalo más frecuente va de {start} a {end} ({value}).',
  'Half of the values lie between {q1} and {q3}, with a median of about {median}.':
    'La mitad de los valores está entre {q1} y {q3}, con una mediana de aproximadamente {median}.',
  'The distribution is skewed to the right (a long tail of high values).':
    'La distribución tiene asimetría positiva (una cola larga de valores altos).',
  'The distribution is skewed to the left (a long tail of low values).':
    'La distribución tiene asimetría negativa (una cola larga de valores bajos).',
  '{name}: values range from {min} to {max}.': '{name}: valores de {min} a {max}.',
  'The highest value, {max}, is at {x}, {y}; the lowest, {min}, at {minX}, {minY}.':
    'El valor más alto, {max}, está en {x}, {y}; el más bajo, {min}, en {minX}, {minY}.',
  'Highest average by row: {row} ({rowValue}); by column: {column} ({columnValue}).':
    'Promedio más alto por fila: {row} ({rowValue}); por columna: {column} ({columnValue}).',
  '{name} rises {change} from an open of {open} ({startX}) to a close of {close} ({endX}).':
    '{name} sube un {change} desde una apertura de {open} ({startX}) hasta un cierre de {close} ({endX}).',
  '{name} falls {change} from an open of {open} ({startX}) to a close of {close} ({endX}).':
    '{name} baja un {change} desde una apertura de {open} ({startX}) hasta un cierre de {close} ({endX}).',
  '{name} closes at {close} ({endX}), where it opened ({startX}).':
    '{name} cierra en {close} ({endX}), donde abrió ({startX}).',
  'Highest high {high} ({highX}); lowest low {low} ({lowX}).':
    'Máximo más alto {high} ({highX}); mínimo más bajo {low} ({lowX}).',
  '{name} is {value}.': '{name} es {value}.',
  '{name} is {value}, up {change} from {reference}.':
    '{name} es {value}, {change} más que {reference}.',
  '{name} is {value}, down {change} from {reference}.':
    '{name} es {value}, {change} menos que {reference}.',
  '{name} is {value}, unchanged from {reference}.':
    '{name} es {value}, sin cambios respecto a {reference}.',
};
