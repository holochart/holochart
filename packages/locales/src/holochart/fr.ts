/**
 * Holochart's own strings in French (not from plotly.js, whose locales don't have them): the UI
 * labels Plotly's dictionary lacks, the keyboard announcements (backlog S2.15) and the generated
 * chart summaries (plan E17.2). Each key is the runtime's English text; a translation keeps its
 * `{placeholders}`, in any order. Machine-translated: no native speaker has reviewed them.
 */
export const holochartFr: Readonly<Record<string, string>> = {
  // UI labels.
  Legend: 'Légende',
  'Chart data: arrow keys move between points, + and - zoom':
    "Données du graphique : touches fléchées pour passer d'un point à l'autre, + et - pour zoomer",
  'Draw line': 'Tracer une ligne',
  'Draw open freeform': 'Tracer une forme libre ouverte',
  'Draw closed freeform': 'Tracer une forme libre fermée',
  'Draw circle': 'Tracer un cercle',
  'Draw rectangle': 'Tracer un rectangle',
  'Erase active shape': 'Effacer la forme active',
  // Keyboard announcements.
  '{name}: {text}, point {n} of {count}.': '{name} : {text}, point {n} sur {count}.',
  'No data points to explore.': 'Aucun point de données à explorer.',
  'Zoomed in.': 'Zoom avant.',
  'Zoomed out.': 'Zoom arrière.',
  'Panned.': 'Vue déplacée.',
  'View rotated.': 'Vue pivotée.',
  'View reset.': 'Vue réinitialisée.',
  '{name}: {text}, {n} of {count}.': '{name} : {text}, {n} sur {count}.',
  '{name}: {position}, {text}, {n} of {count}.': '{name} : {position}, {text}, {n} sur {count}.',
  '{name}: {text}, row {row} of {rows}, column {column} of {columns}.':
    '{name} : {text}, ligne {row} sur {rows}, colonne {column} sur {columns}.',
  '{name}: {text}, level {level}, {n} of {count}, children: {children}.':
    '{name} : {text}, niveau {level}, {n} sur {count}, éléments enfants : {children}.',
  '{name}: {dimension}, {category}, {text}, {n} of {count}.':
    '{name} : {dimension}, {category}, {text}, {n} sur {count}.',
  'Dimension {n}': 'Dimension {n}',
  'Map centered at longitude {lon}°, latitude {lat}°, scale {scale}.':
    'Carte centrée sur la longitude {lon}°, la latitude {lat}°, échelle {scale}.',
  '{name}: {text}, node {n} of {count}.': '{name} : {text}, nœud {n} sur {count}.',
  '{name}: {text}, link {n} of {count} of {node}.':
    '{name} : {text}, lien {n} sur {count} du nœud {node}.',
  '{name}: {text}, rank {rank} of {ranks}, {n} of {count}.':
    '{name} : {text}, rang {rank} sur {ranks}, {n} sur {count}.',
  'Up: {up}.': 'Haut : {up}.',
  'Down: {down}.': 'Bas : {down}.',
  'Folded.': 'Replié.',
  // Chart summaries.
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
