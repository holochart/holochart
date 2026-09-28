/**
 * Translations of Holochart's generated chart summaries (plan E17.2; not from plotly.js, which has
 * none): the runtime's English sentence templates are the dictionary keys, with `{placeholders}`
 * the translation keeps (in any order). Merged into the `de`, `fr` and `es` locales; other locales
 * fall back to English per sentence. See the accessibility guide for the full list of templates.
 */

/** German summary sentences. */
export const summariesDe: Readonly<Record<string, string>> = {
  '{y} by {x}.': '{y} nach {x}.',
  '{count} more traces are not summarized.':
    '{count} weitere Datenreihen sind nicht zusammengefasst.',
  '{name} has no values.': '{name} hat keine Werte.',
  '{name} has a single value, {value} ({x}).': '{name} hat einen einzigen Wert, {value} ({x}).',
  '{name} rises from {start} ({startX}) to {end} ({endX}).':
    '{name} steigt von {start} ({startX}) auf {end} ({endX}).',
  '{name} falls from {start} ({startX}) to {end} ({endX}).':
    '{name} fällt von {start} ({startX}) auf {end} ({endX}).',
  '{name} stays flat at about {value}.': '{name} bleibt konstant bei etwa {value}.',
  '{name} varies between {min} ({minX}) and {max} ({maxX}) with no clear trend.':
    '{name} schwankt ohne klaren Trend zwischen {min} ({minX}) und {max} ({maxX}).',
  'It peaks at {max} ({maxX}).': 'Der Höchstwert ist {max} ({maxX}).',
  'Its lowest point is {min} ({minX}).': 'Der Tiefstwert ist {min} ({minX}).',
  '{name}: {y} rises strongly with {x} (correlation {r}).':
    '{name}: {y} steigt stark mit {x} (Korrelation {r}).',
  '{name}: {y} tends to rise with {x} (correlation {r}).':
    '{name}: {y} steigt tendenziell mit {x} (Korrelation {r}).',
  '{name}: no clear relationship between {x} and {y} (correlation {r}).':
    '{name}: kein klarer Zusammenhang zwischen {x} und {y} (Korrelation {r}).',
  '{name}: {y} tends to fall as {x} rises (correlation {r}).':
    '{name}: {y} fällt tendenziell, wenn {x} steigt (Korrelation {r}).',
  '{name}: {y} falls strongly as {x} rises (correlation {r}).':
    '{name}: {y} fällt stark, wenn {x} steigt (Korrelation {r}).',
  'Values range from {min} to {max}.': 'Die Werte reichen von {min} bis {max}.',
  '{label} is the largest slice of {name}: {share} ({value}).':
    '{label} ist das größte Segment von {name}: {share} ({value}).',
  '{label} is the largest stage of {name}: {share} ({value}).':
    '{label} ist die größte Stufe von {name}: {share} ({value}).',
  '{label} is the largest branch of {name}: {share} ({value}).':
    '{label} ist der größte Zweig von {name}: {share} ({value}).',
  '{label} is the largest flow of {name}: {share} ({value}).':
    '{label} ist der größte Fluss von {name}: {share} ({value}).',
  'Next: {label}, {share} ({value}).': 'Danach: {label}, {share} ({value}).',
  'Next: {label}, {share} ({value}), and {label2}, {share2} ({value2}).':
    'Danach: {label}, {share} ({value}), und {label2}, {share2} ({value2}).',
  '{name} is highest at {label} ({value}) and lowest at {lowLabel} ({lowValue}).':
    '{name} ist am höchsten bei {label} ({value}) und am niedrigsten bei {lowLabel} ({lowValue}).',
  '{name}: median {median}; half of the values lie between {q1} and {q3}; range {min} to {max}.':
    '{name}: Median {median}; die Hälfte der Werte liegt zwischen {q1} und {q3}; Spannweite {min} bis {max}.',
  '{name}: medians range from {low} ({lowLabel}) to {high} ({highLabel}).':
    '{name}: Mediane von {low} ({lowLabel}) bis {high} ({highLabel}).',
  '{name}: the most common range is {start} to {end} ({value}).':
    '{name}: der häufigste Bereich ist {start} bis {end} ({value}).',
  'Half of the values lie between {q1} and {q3}, with a median of about {median}.':
    'Die Hälfte der Werte liegt zwischen {q1} und {q3}, der Median bei etwa {median}.',
  'The distribution is skewed to the right (a long tail of high values).':
    'Die Verteilung ist rechtsschief (ein langer Ausläufer hoher Werte).',
  'The distribution is skewed to the left (a long tail of low values).':
    'Die Verteilung ist linksschief (ein langer Ausläufer niedriger Werte).',
  '{name}: values range from {min} to {max}.': '{name}: Werte von {min} bis {max}.',
  'The highest value, {max}, is at {x}, {y}; the lowest, {min}, at {minX}, {minY}.':
    'Der höchste Wert, {max}, liegt bei {x}, {y}; der niedrigste, {min}, bei {minX}, {minY}.',
  'Highest average by row: {row} ({rowValue}); by column: {column} ({columnValue}).':
    'Höchster Mittelwert je Zeile: {row} ({rowValue}); je Spalte: {column} ({columnValue}).',
  '{name} rises {change} from an open of {open} ({startX}) to a close of {close} ({endX}).':
    '{name} steigt um {change} von einem Eröffnungskurs von {open} ({startX}) auf einen Schlusskurs von {close} ({endX}).',
  '{name} falls {change} from an open of {open} ({startX}) to a close of {close} ({endX}).':
    '{name} fällt um {change} von einem Eröffnungskurs von {open} ({startX}) auf einen Schlusskurs von {close} ({endX}).',
  '{name} closes at {close} ({endX}), where it opened ({startX}).':
    '{name} schließt bei {close} ({endX}), auf dem Eröffnungsniveau ({startX}).',
  'Highest high {high} ({highX}); lowest low {low} ({lowX}).':
    'Höchstes Hoch {high} ({highX}); tiefstes Tief {low} ({lowX}).',
  '{name} is {value}.': '{name} beträgt {value}.',
  '{name} is {value}, up {change} from {reference}.':
    '{name} beträgt {value}, {change} mehr als {reference}.',
  '{name} is {value}, down {change} from {reference}.':
    '{name} beträgt {value}, {change} weniger als {reference}.',
  '{name} is {value}, unchanged from {reference}.':
    '{name} beträgt {value}, unverändert gegenüber {reference}.',
};

/** French summary sentences. */
export const summariesFr: Readonly<Record<string, string>> = {
  '{y} by {x}.': '{y} par {x}.',
  '{count} more traces are not summarized.': '{count} autres séries ne sont pas résumées.',
  '{name} has no values.': "{name} n'a aucune valeur.",
  '{name} has a single value, {value} ({x}).': '{name} a une seule valeur, {value} ({x}).',
  '{name} rises from {start} ({startX}) to {end} ({endX}).':
    '{name} passe de {start} ({startX}) à {end} ({endX}), en hausse.',
  '{name} falls from {start} ({startX}) to {end} ({endX}).':
    '{name} passe de {start} ({startX}) à {end} ({endX}), en baisse.',
  '{name} stays flat at about {value}.': '{name} reste stable autour de {value}.',
  '{name} varies between {min} ({minX}) and {max} ({maxX}) with no clear trend.':
    '{name} varie entre {min} ({minX}) et {max} ({maxX}) sans tendance nette.',
  'It peaks at {max} ({maxX}).': 'Le maximum est de {max} ({maxX}).',
  'Its lowest point is {min} ({minX}).': 'Le minimum est de {min} ({minX}).',
  '{name}: {y} rises strongly with {x} (correlation {r}).':
    '{name} : {y} augmente fortement avec {x} (corrélation {r}).',
  '{name}: {y} tends to rise with {x} (correlation {r}).':
    '{name} : {y} tend à augmenter avec {x} (corrélation {r}).',
  '{name}: no clear relationship between {x} and {y} (correlation {r}).':
    '{name} : pas de relation nette entre {x} et {y} (corrélation {r}).',
  '{name}: {y} tends to fall as {x} rises (correlation {r}).':
    '{name} : {y} tend à baisser quand {x} augmente (corrélation {r}).',
  '{name}: {y} falls strongly as {x} rises (correlation {r}).':
    '{name} : {y} baisse fortement quand {x} augmente (corrélation {r}).',
  'Values range from {min} to {max}.': 'Les valeurs vont de {min} à {max}.',
  '{label} is the largest slice of {name}: {share} ({value}).':
    '{label} est la plus grande part de {name} : {share} ({value}).',
  '{label} is the largest stage of {name}: {share} ({value}).':
    '{label} est la plus grande étape de {name} : {share} ({value}).',
  '{label} is the largest branch of {name}: {share} ({value}).':
    '{label} est la plus grande branche de {name} : {share} ({value}).',
  '{label} is the largest flow of {name}: {share} ({value}).':
    '{label} est le plus grand flux de {name} : {share} ({value}).',
  'Next: {label}, {share} ({value}).': 'Ensuite : {label}, {share} ({value}).',
  'Next: {label}, {share} ({value}), and {label2}, {share2} ({value2}).':
    'Ensuite : {label}, {share} ({value}), et {label2}, {share2} ({value2}).',
  '{name} is highest at {label} ({value}) and lowest at {lowLabel} ({lowValue}).':
    '{name} est au plus haut pour {label} ({value}) et au plus bas pour {lowLabel} ({lowValue}).',
  '{name}: median {median}; half of the values lie between {q1} and {q3}; range {min} to {max}.':
    '{name} : médiane {median} ; la moitié des valeurs est entre {q1} et {q3} ; étendue de {min} à {max}.',
  '{name}: medians range from {low} ({lowLabel}) to {high} ({highLabel}).':
    '{name} : médianes de {low} ({lowLabel}) à {high} ({highLabel}).',
  '{name}: the most common range is {start} to {end} ({value}).':
    "{name} : l'intervalle le plus fréquent va de {start} à {end} ({value}).",
  'Half of the values lie between {q1} and {q3}, with a median of about {median}.':
    'La moitié des valeurs est entre {q1} et {q3}, avec une médiane autour de {median}.',
  'The distribution is skewed to the right (a long tail of high values).':
    'La distribution est asymétrique à droite (une longue traîne de valeurs élevées).',
  'The distribution is skewed to the left (a long tail of low values).':
    'La distribution est asymétrique à gauche (une longue traîne de valeurs faibles).',
  '{name}: values range from {min} to {max}.': '{name} : valeurs de {min} à {max}.',
  'The highest value, {max}, is at {x}, {y}; the lowest, {min}, at {minX}, {minY}.':
    'La valeur la plus haute, {max}, est en {x}, {y} ; la plus basse, {min}, en {minX}, {minY}.',
  'Highest average by row: {row} ({rowValue}); by column: {column} ({columnValue}).':
    'Moyenne la plus haute par ligne : {row} ({rowValue}) ; par colonne : {column} ({columnValue}).',
  '{name} rises {change} from an open of {open} ({startX}) to a close of {close} ({endX}).':
    "{name} gagne {change}, d'une ouverture à {open} ({startX}) à une clôture à {close} ({endX}).",
  '{name} falls {change} from an open of {open} ({startX}) to a close of {close} ({endX}).':
    "{name} perd {change}, d'une ouverture à {open} ({startX}) à une clôture à {close} ({endX}).",
  '{name} closes at {close} ({endX}), where it opened ({startX}).':
    "{name} clôture à {close} ({endX}), au niveau de l'ouverture ({startX}).",
  'Highest high {high} ({highX}); lowest low {low} ({lowX}).':
    'Plus haut {high} ({highX}) ; plus bas {low} ({lowX}).',
  '{name} is {value}.': '{name} vaut {value}.',
  '{name} is {value}, up {change} from {reference}.':
    '{name} vaut {value}, en hausse de {change} par rapport à {reference}.',
  '{name} is {value}, down {change} from {reference}.':
    '{name} vaut {value}, en baisse de {change} par rapport à {reference}.',
  '{name} is {value}, unchanged from {reference}.':
    '{name} vaut {value}, inchangé par rapport à {reference}.',
};

/** Spanish summary sentences. */
export const summariesEs: Readonly<Record<string, string>> = {
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
