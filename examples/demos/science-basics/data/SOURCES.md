# Data sources

## elements.json

Source: the PubChem periodic table, `https://pubchem.ncbi.nlm.nih.gov/rest/pug/periodictable/CSV`, retrieved on
2026-10-02 with one public GET request. PubChem is a service of the US National Library of Medicine; the table is in
the public domain. The raw CSV is kept outside the repo; only the derived JSON is committed.

One object per element, 118 in all:

- `z`, `symbol`, `name`, `mass` (u), `category` (PubChem's `GroupBlock`) and `cpk` (PubChem's CPK color) are copied.
- `period` and `group` are computed from the atomic number for the 18-column table. The 28 f-block elements drawn
  below the table (La–Yb and Ac–No) have `group: null`.
- `state` is the standard state (solid, liquid or gas at room conditions); `statePredicted` marks PubChem's
  "Expected to be a …" entries of the heaviest elements.
- `electronegativity` (Pauling scale), `radius` (PubChem's `AtomicRadius`, the van der Waals radius, in pm),
  `ionization` (first ionization energy, eV), `melting` and `boiling` (K), `density` (g/cm³; for gases at 0 °C and
  1 atm). `null` where PubChem has no value.
- `discovered` is the year of discovery; `null` for the elements PubChem lists as "Ancient".

## Everything else

The other charts use textbook values and formulas, written out in `data.mts` and in each example with their units:

- Planets: NASA Planetary Fact Sheet (mass, diameter, density, surface gravity, distance from the Sun, orbital period,
  orbital eccentricity).
- Physical constants: CODATA 2022 (exact values of c, h, k and the Avogadro constant since the 2019 SI).
- Simulated measurements (pendulum timings, spring readings, gas molecules) are generated from the formulas with a
  seeded random number generator, so every run draws the same picture. They are labelled as simulated on the page.
