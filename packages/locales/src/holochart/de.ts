/**
 * Holochart's own strings in German (not from plotly.js, whose locales don't have them): the UI
 * labels Plotly's dictionary lacks, the keyboard announcements (backlog S2.15) and the generated
 * chart summaries (plan E17.2). Each key is the runtime's English text; a translation keeps its
 * `{placeholders}`, in any order. Machine-translated: no native speaker has reviewed them.
 */
export const holochartDe: Readonly<Record<string, string>> = {
  // UI labels.
  Legend: 'Legende',
  'Chart data: arrow keys move between points, + and - zoom':
    'Daten des Graphen: mit den Pfeiltasten zwischen Punkten wechseln, mit + und - zoomen',
  'Draw line': 'Linie zeichnen',
  'Draw open freeform': 'Offene Freiform zeichnen',
  'Draw closed freeform': 'Geschlossene Freiform zeichnen',
  'Draw circle': 'Kreis zeichnen',
  'Draw rectangle': 'Rechteck zeichnen',
  'Erase active shape': 'Aktive Form löschen',
  // Keyboard announcements.
  '{name}: {text}, point {n} of {count}.': '{name}: {text}, Punkt {n} von {count}.',
  'No data points to explore.': 'Keine Datenpunkte zum Erkunden.',
  'Zoomed in.': 'Hineingezoomt.',
  'Zoomed out.': 'Herausgezoomt.',
  'Panned.': 'Verschoben.',
  'View rotated.': 'Ansicht gedreht.',
  'View reset.': 'Ansicht zurückgesetzt.',
  '{name}: {text}, {n} of {count}.': '{name}: {text}, {n} von {count}.',
  '{name}: {position}, {text}, {n} of {count}.': '{name}: {position}, {text}, {n} von {count}.',
  '{name}: {text}, row {row} of {rows}, column {column} of {columns}.':
    '{name}: {text}, Zeile {row} von {rows}, Spalte {column} von {columns}.',
  '{name}: {text}, level {level}, {n} of {count}, children: {children}.':
    '{name}: {text}, Ebene {level}, {n} von {count}, Unterelemente: {children}.',
  '{name}: {dimension}, {category}, {text}, {n} of {count}.':
    '{name}: {dimension}, {category}, {text}, {n} von {count}.',
  'Dimension {n}': 'Dimension {n}',
  'Map centered at longitude {lon}°, latitude {lat}°, scale {scale}.':
    'Karte zentriert auf Längengrad {lon}°, Breitengrad {lat}°, Maßstab {scale}.',
  '{name}: {text}, node {n} of {count}.': '{name}: {text}, Knoten {n} von {count}.',
  '{name}: {text}, link {n} of {count} of {node}.':
    '{name}: {text}, Verbindung {n} von {count} des Knotens {node}.',
  '{name}: {text}, rank {rank} of {ranks}, {n} of {count}.':
    '{name}: {text}, Schicht {rank} von {ranks}, {n} von {count}.',
  'Up: {up}.': 'Nach oben: {up}.',
  'Down: {down}.': 'Nach unten: {down}.',
  'Folded.': 'Eingeklappt.',
  // Chart summaries.
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
