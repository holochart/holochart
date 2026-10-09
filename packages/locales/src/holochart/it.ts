/**
 * Holochart's own strings in Italian (not from plotly.js, whose locales don't have them): the UI
 * labels Plotly's dictionary lacks, the keyboard announcements (backlog S2.15) and the generated
 * chart summaries (plan E17.2). Each key is the runtime's English text; a translation keeps its
 * `{placeholders}`, in any order. Machine-translated: no native speaker has reviewed them.
 */
export const holochartIt: Readonly<Record<string, string>> = {
  // UI labels.
  Legend: 'Legenda',
  'Chart data: arrow keys move between points, + and - zoom':
    'Dati del grafico: tasti freccia per spostarsi tra i punti, + e - per lo zoom',
  'Draw line': 'Disegna linea',
  'Draw open freeform': 'Disegna forma libera aperta',
  'Draw closed freeform': 'Disegna forma libera chiusa',
  'Draw circle': 'Disegna cerchio',
  'Draw rectangle': 'Disegna rettangolo',
  'Erase active shape': 'Cancella forma attiva',
  // Keyboard announcements.
  '{name}: {text}, point {n} of {count}.': '{name}: {text}, punto {n} di {count}.',
  'No data points to explore.': 'Nessun punto dati da esplorare.',
  'Zoomed in.': 'Vista ingrandita.',
  'Zoomed out.': 'Vista ridotta.',
  'Panned.': 'Vista spostata.',
  'View rotated.': 'Vista ruotata.',
  'View reset.': 'Vista reimpostata.',
  '{name}: {text}, {n} of {count}.': '{name}: {text}, {n} di {count}.',
  '{name}: {position}, {text}, {n} of {count}.': '{name}: {position}, {text}, {n} di {count}.',
  '{name}: {text}, row {row} of {rows}, column {column} of {columns}.':
    '{name}: {text}, riga {row} di {rows}, colonna {column} di {columns}.',
  '{name}: {text}, level {level}, {n} of {count}, children: {children}.':
    '{name}: {text}, livello {level}, {n} di {count}, elementi figli: {children}.',
  '{name}: {dimension}, {category}, {text}, {n} of {count}.':
    '{name}: {dimension}, {category}, {text}, {n} di {count}.',
  'Dimension {n}': 'Dimensione {n}',
  'Map centered at longitude {lon}°, latitude {lat}°, scale {scale}.':
    'Mappa centrata su longitudine {lon}°, latitudine {lat}°, scala {scale}.',
  '{name}: {text}, node {n} of {count}.': '{name}: {text}, nodo {n} di {count}.',
  '{name}: {text}, link {n} of {count} of {node}.':
    '{name}: {text}, collegamento {n} di {count} del nodo {node}.',
  '{name}: {text}, rank {rank} of {ranks}, {n} of {count}.':
    '{name}: {text}, strato {rank} di {ranks}, {n} di {count}.',
  'Up: {up}.': 'Su: {up}.',
  'Down: {down}.': 'Giù: {down}.',
  'Folded.': 'Compresso.',
  // Chart summaries.
  '{y} by {x}.': '{y} per {x}.',
  '{count} more traces are not summarized.': 'Altre tracce non riepilogate: {count}.',
  '{name} has no values.': '{name} non ha valori.',
  '{name} has a single value, {value} ({x}).': '{name} ha un solo valore, {value} ({x}).',
  '{name} rises from {start} ({startX}) to {end} ({endX}).':
    '{name} sale da {start} ({startX}) a {end} ({endX}).',
  '{name} falls from {start} ({startX}) to {end} ({endX}).':
    '{name} scende da {start} ({startX}) a {end} ({endX}).',
  '{name} stays flat at about {value}.': '{name} resta stabile intorno a {value}.',
  '{name} varies between {min} ({minX}) and {max} ({maxX}) with no clear trend.':
    '{name} varia tra {min} ({minX}) e {max} ({maxX}) senza una tendenza chiara.',
  'It peaks at {max} ({maxX}).': 'Raggiunge un massimo di {max} ({maxX}).',
  'Its lowest point is {min} ({minX}).': 'Il punto più basso è {min} ({minX}).',
  '{name}: {y} rises strongly with {x} (correlation {r}).':
    '{name}: {y} aumenta fortemente con {x} (correlazione {r}).',
  '{name}: {y} tends to rise with {x} (correlation {r}).':
    '{name}: {y} tende ad aumentare con {x} (correlazione {r}).',
  '{name}: no clear relationship between {x} and {y} (correlation {r}).':
    '{name}: nessuna relazione chiara tra {x} e {y} (correlazione {r}).',
  '{name}: {y} tends to fall as {x} rises (correlation {r}).':
    '{name}: {y} tende a diminuire quando {x} aumenta (correlazione {r}).',
  '{name}: {y} falls strongly as {x} rises (correlation {r}).':
    '{name}: {y} diminuisce fortemente quando {x} aumenta (correlazione {r}).',
  'Values range from {min} to {max}.': 'I valori vanno da {min} a {max}.',
  '{label} is the largest slice of {name}: {share} ({value}).':
    '{label} è la fetta più grande di {name}: {share} ({value}).',
  '{label} is the largest stage of {name}: {share} ({value}).':
    '{label} è la fase più grande di {name}: {share} ({value}).',
  '{label} is the largest branch of {name}: {share} ({value}).':
    '{label} è il ramo più grande di {name}: {share} ({value}).',
  '{label} is the largest flow of {name}: {share} ({value}).':
    '{label} è il flusso più grande di {name}: {share} ({value}).',
  'Next: {label}, {share} ({value}).': 'Poi: {label}, {share} ({value}).',
  'Next: {label}, {share} ({value}), and {label2}, {share2} ({value2}).':
    'Poi: {label}, {share} ({value}), e {label2}, {share2} ({value2}).',
  '{name} is highest at {label} ({value}) and lowest at {lowLabel} ({lowValue}).':
    '{name} ha il valore massimo in {label} ({value}) e il minimo in {lowLabel} ({lowValue}).',
  '{name}: median {median}; half of the values lie between {q1} and {q3}; range {min} to {max}.':
    '{name}: mediana {median}; metà dei valori è compresa tra {q1} e {q3}; intervallo da {min} a {max}.',
  '{name}: medians range from {low} ({lowLabel}) to {high} ({highLabel}).':
    '{name}: mediane da {low} ({lowLabel}) a {high} ({highLabel}).',
  '{name}: the most common range is {start} to {end} ({value}).':
    "{name}: l'intervallo più frequente va da {start} a {end} ({value}).",
  'Half of the values lie between {q1} and {q3}, with a median of about {median}.':
    'Metà dei valori è compresa tra {q1} e {q3}, con una mediana di circa {median}.',
  'The distribution is skewed to the right (a long tail of high values).':
    'La distribuzione è asimmetrica a destra (una lunga coda di valori alti).',
  'The distribution is skewed to the left (a long tail of low values).':
    'La distribuzione è asimmetrica a sinistra (una lunga coda di valori bassi).',
  '{name}: values range from {min} to {max}.': '{name}: valori da {min} a {max}.',
  'The highest value, {max}, is at {x}, {y}; the lowest, {min}, at {minX}, {minY}.':
    'Il valore più alto, {max}, è in {x}, {y}; il più basso, {min}, in {minX}, {minY}.',
  'Highest average by row: {row} ({rowValue}); by column: {column} ({columnValue}).':
    'Media più alta per riga: {row} ({rowValue}); per colonna: {column} ({columnValue}).',
  '{name} rises {change} from an open of {open} ({startX}) to a close of {close} ({endX}).':
    "{name} sale del {change}, da un'apertura di {open} ({startX}) a una chiusura di {close} ({endX}).",
  '{name} falls {change} from an open of {open} ({startX}) to a close of {close} ({endX}).':
    "{name} scende del {change}, da un'apertura di {open} ({startX}) a una chiusura di {close} ({endX}).",
  '{name} closes at {close} ({endX}), where it opened ({startX}).':
    '{name} chiude a {close} ({endX}), dove aveva aperto ({startX}).',
  'Highest high {high} ({highX}); lowest low {low} ({lowX}).':
    'Massimo più alto {high} ({highX}); minimo più basso {low} ({lowX}).',
  '{name} is {value}.': '{name} è {value}.',
  '{name} is {value}, up {change} from {reference}.':
    '{name} è {value}, {change} in più rispetto a {reference}.',
  '{name} is {value}, down {change} from {reference}.':
    '{name} è {value}, {change} in meno rispetto a {reference}.',
  '{name} is {value}, unchanged from {reference}.':
    '{name} è {value}, senza variazioni rispetto a {reference}.',
};
