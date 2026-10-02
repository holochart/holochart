---
title: Chemistry and physics basics
description: School science in more than 50 charts, drawn with Holochart — the periodic table, what things are made of, atoms and molecules, motion, waves, fields and the planets, across 33 chart types.
status: complete
aside: false
pageClass: hc-demo
---

<script setup>
import StatTiles from './components/StatTiles.vue';

const stats = [
  { value: '118', label: 'elements in the periodic table', aside: '91 metals · 2 liquids · 12 gases' },
  { value: '109.5°', label: 'between the bonds of methane', aside: 'water: 104.5° · carbon dioxide: 180°' },
  { value: '9.81 m/s²', label: 'pull of gravity at the Earth’s surface', aside: 'Jupiter: 23.1 · Mars: 3.7' },
  { value: '52', label: 'charts on this page', aside: '33 chart types, 2D and 3D' },
];
</script>

<p class="hc-eyebrow">Chemistry · Physics · 52 charts · 33 chart types</p>

# Chemistry and physics basics

<p class="hc-verdict">
  <strong>School science, one chart at a time.</strong> What the elements are and why the table
  that lists them repeats, what a body and a planet are made of, how water melts and boils, why
  a thrown ball follows a curve, how waves add up, and what holds a planet in its orbit. Each
  idea gets the chart type that shows it best.
</p>

<StatTiles :items="stats" />

This page is a tour of Holochart's chart types more than a science course: every idea is kept
to what a school textbook covers, and every chart is a Holochart example that runs live in your
browser and doubles as a visual regression test. Drag the 3D charts to turn them, hover for the
numbers, and use the toggles above a chart to switch what it shows. Where a chart uses simulated
measurements, its title says so.

## The elements

The periodic table: 18 columns (groups), 7 rows (periods), and the lanthanides and actinides in
two rows below. Switch the coloring to see electronegativity peak at fluorine (3.98), melting
point at tungsten (3,695 K) and density at osmium (22.6 g/cm³).

<Example id="demos/science-basics/periodic-table" bare :height="520" />

### Why it is called periodic

The energy needed to pull one electron off an atom, element by element. It peaks at each noble
gas (helium, 24.6 eV) and drops at each alkali metal (caesium, 3.9 eV), and the same zigzag
repeats in every row. That repetition is the "period" in the table's name.

<Example id="demos/science-basics/periodic-trends" bare :height="460" />

### Density, across the table

The same table lying flat, with each bar as tall as the element's density. The metals in the
middle of period 6 tower over the rest, led by osmium at 22.57 g/cm³; the gases barely rise off
the floor.

<Example id="demos/science-basics/table-3d" bare :height="560" />

Density again, by family. The alkali metals have a median of about 1 g/cm³ (lithium, at 0.53,
floats on water); the transition metals about 10 g/cm³.

<Example id="demos/science-basics/density-box" bare :height="480" />

### Families

The family tree of the elements: 91 metals, 7 metalloids and 20 nonmetals, split into ten
categories. The transition metals are the biggest family, with 38 elements. Click a ring to zoom
in.

<div class="hc-demo-narrow">
  <Example id="demos/science-basics/element-families" bare :height="560" />
</div>

All 118 elements sorted by kind, category and state at room temperature: 104 are solid, 12 are
gases and only 2 are liquid, mercury and bromine.

<Example id="demos/science-basics/element-flow" bare :height="520" />

### Melting and boiling

Elements that are hard to melt are also hard to boil. Tungsten melts at 3,695 K; helium boils at
4 K. Bigger bubbles are denser elements.

<Example id="demos/science-basics/element-bubbles" bare :height="520" />

Each bar runs from the melting point to the boiling point, the temperatures at which the element
is a liquid. Only bromine (266 to 332 K) and mercury (234 to 630 K) cross the room temperature
line at 293 K.

<Example id="demos/science-basics/liquid-range" bare :height="520" />

### Four properties at once

Atomic mass, radius, electronegativity and ionization energy of 91 elements, each plotted against
each. The tightest link is between the last two: atoms that hold their own electrons tightly also
pull hard on shared ones.

<div class="hc-demo-narrow">
  <Example id="demos/science-basics/element-splom" bare :height="760" />
</div>

### When they were found

Eleven elements, such as gold, copper, iron and carbon, have been known since antiquity. The
other 107 were found after 1650, with the busiest stretches in 1800 to 1825 (18 elements) and
1875 to 1900 (19 elements).

<Example id="demos/science-basics/discovery" bare :height="460" />

## What things are made of

Oxygen is the biggest part of your body (65% by mass) and of the ground (46.1%), and a fifth of
the air (20.95% by volume). Each element keeps its color in all three donuts.

<Example id="demos/science-basics/composition-pies" bare :height="460" />

The Earth's crust, with each tile's area the element's share by mass. Oxygen and silicon make
up three quarters; all the metals together are about a quarter.

<Example id="demos/science-basics/crust-treemap" bare :height="480" />

The Sun is 73.5% hydrogen and 24.9% helium by mass. Everything else fits in the tip.

<div class="hc-demo-narrow">
  <Example id="demos/science-basics/sun-funnelarea" bare :height="480" />
</div>

### Sorting matter

All matter is either a pure substance (an element or a compound) or a mixture (the same
throughout, or with parts you can see).

<Example id="demos/science-basics/matter-icicle" bare :height="460" />

## Atoms and molecules

The shell model of an atom: sodium has 11 electrons, 2 in the first shell, 8 in the second and 1
alone in the third. It is a way to count electrons, not a picture of where they are.

<div class="hc-demo-narrow">
  <Example id="demos/science-basics/bohr-model" bare :height="560" />
</div>

### Where the electron really is

20,000 simulated positions of hydrogen's one electron. The cloud is densest at the nucleus and
fades outward.

<div class="hc-demo-narrow">
  <Example id="demos/science-basics/electron-cloud" bare :height="600" />
</div>

An orbital is a map of where the electron is likely to be: it is inside each surface 90% of the
time. The first is a ball, the next a dumbbell, then a dumbbell with a ring.

<div class="hc-demo-narrow">
  <Example id="demos/science-basics/orbitals" bare :height="560" />
</div>

### The shapes of molecules

Water is bent (104.5° between its two bonds), carbon dioxide is a straight line, ammonia a low
pyramid (107°) and methane a tetrahedron (109.5°).

<div class="hc-demo-narrow">
  <Example id="demos/science-basics/molecules" bare :height="560" />
</div>

Methane's four hydrogens sit at the corners of a tetrahedron, which is as far apart as four
bonds can get.

<div class="hc-demo-narrow">
  <Example id="demos/science-basics/methane-shape" bare :height="560" />
</div>

### Fingerprints in light

A glowing gas gives off only certain wavelengths. Hydrogen shows four visible lines; sodium's
two yellow lines, at 589.0 and 589.6 nm, are too close to tell apart here.

<Example id="demos/science-basics/spectra" bare :height="420" />

## Heat, gases and change

Heating 1 kg of ice from −20 °C to steam at 120 °C. The temperature stands still while the ice
melts (334 kJ) and while the water boils (2,260 kJ, over five times what it takes to heat the
water from 0 to 100 °C).

<Example id="demos/science-basics/heating-curve" bare :height="460" />

Which state water is in at each temperature and pressure. At normal air pressure it melts at
0 °C and boils at 100 °C; all three states meet at the triple point.

<Example id="demos/science-basics/phase-diagram" bare :height="520" />

One temperature on three scales. Absolute zero is 0 K, −273.15 °C or −459.67 °F.

<Example id="demos/science-basics/thermometer" bare :height="420" />

### Molecules in a gas

Simulated speeds of 4,000 nitrogen molecules at each temperature, with the theoretical curve on
top. Hotter gas is faster and more spread out: the mean is 275 m/s at 100 K and 825 m/s at 900 K.

<Example id="demos/science-basics/gas-speeds" bare :height="460" />

Six gases at the same temperature. Lighter molecules move faster: hydrogen averages 1,782 m/s,
carbon dioxide 380 m/s.

<Example id="demos/science-basics/gas-violin" bare :height="460" />

The pressure of a fixed amount of gas for every volume and temperature: it rises in a straight
line as you heat it and ever more steeply as you squeeze it.

<div class="hc-demo-narrow">
  <Example id="demos/science-basics/ideal-gas-surface" bare :height="560" />
</div>

Particles taking random steps from the center. A hundred times longer spreads the cloud only ten
times wider.

<div class="hc-demo-narrow">
  <Example id="demos/science-basics/diffusion" bare :height="560" />
</div>

### Acids and bases

From battery acid (pH 1) to drain cleaner (pH 14), with pure water at 7. Each step is a factor
of ten.

<Example id="demos/science-basics/ph-scale" bare :height="520" />

Adding a base to an acid drop by drop. The pH creeps up, then jumps through 7 at exactly 25 mL,
crossing both indicators' color changes within a drop.

<Example id="demos/science-basics/titration" bare :height="460" />

### Energy in a reaction

Burning methane costs 2,648 kJ per mole to break the old bonds and gives back 3,450 kJ when the
new ones form. The difference, 802 kJ, comes out as heat.

<Example id="demos/science-basics/combustion-waterfall" bare :height="460" />

### Radioactive decay

Every 5,730 years half of the remaining carbon-14 is gone.

<Example id="demos/science-basics/half-life" bare :height="440" />

The same decay as a smooth curve. The carbon-14 that disappears turns into nitrogen-14, so the
two always add up to 100%.

<Example id="demos/science-basics/decay-area" bare :height="440" />

## Motion and energy

A ball thrown at 20 m/s with no air resistance. 45° goes farthest (40.8 m); 30° and 60° land on
the same spot.

<Example id="demos/science-basics/projectile" bare :height="520" />

A ball thrown straight up at 15 m/s. Its velocity falls steadily through zero at the top; the
acceleration is the same −9.81 m/s² all the way.

<Example id="demos/science-basics/motion-graphs" bare :height="560" />

### Two school experiments

Simulated readings of a spring loaded with 50 to 500 g: the stretch is proportional to the force,
and the slope of the line gives the spring constant.

<Example id="demos/science-basics/hooke" bare :height="480" />

Twelve simulated stopwatch readings at each of five pendulum lengths. Four times the length
gives twice the period.

<Example id="demos/science-basics/pendulum-box" bare :height="520" />

### Energy changes form

Press Play: as the pendulum swings, its energy moves between height and motion while the total
stays the same.

<Example id="demos/science-basics/pendulum-energy" bare :height="520" />

Of every 100 units of energy in a car's fuel, about 62 leave as engine heat and only 18 reach
the wheels (typical, rounded values).

<Example id="demos/science-basics/energy-sankey" bare :height="480" />

## Waves and light

Where two waves meet, their heights add. In step they make a wave twice as tall; half a
wavelength out of step they cancel.

<Example id="demos/science-basics/superposition" bare :height="440" />

Ripples from two sources. Where crests meet the water rises twice as high; along the dark bands
a crest always meets a trough and the water stays flat.

<Example id="demos/science-basics/interference" bare :height="560" />

Radio waves, microwaves, infrared, light, ultraviolet, X-rays and gamma rays are the same kind
of wave at different wavelengths. Everything we can see fits between 380 and 750 nm.

<Example id="demos/science-basics/em-spectrum" bare :height="460" />

Light spreads over a bigger sphere the farther it travels, so twice as far from a lamp it is a
quarter as bright.

<div class="hc-demo-narrow">
  <Example id="demos/science-basics/inverse-square" bare :height="560" />
</div>

Two polarizing filters, like two pairs of sunglasses: lined up they let the light through,
crossed at 90° they block it.

<div class="hc-demo-narrow">
  <Example id="demos/science-basics/polarizer" bare :height="560" />
</div>

## Electricity and magnetism

For a resistor, doubling the voltage doubles the current. A filament lamp bends away from the
straight line because its resistance grows as it heats up.

<Example id="demos/science-basics/ohm" bare :height="460" />

The electric potential around a positive and a negative charge: high near the plus, low near
the minus, and exactly zero halfway between.

<Example id="demos/science-basics/dipole-contour" bare :height="560" />

The field around the same two charges in 3D. Each cone points the way a small positive charge
would be pushed.

<div class="hc-demo-narrow">
  <Example id="demos/science-basics/field-cones" bare :height="560" />
</div>

Field lines of a bar magnet leave the north pole, loop round and come back in at the south pole.

<div class="hc-demo-narrow">
  <Example id="demos/science-basics/magnet-streamtube" bare :height="560" />
</div>

## The planets

The eight planets from the Sun outwards.

<Example id="demos/science-basics/planets-table" bare :height="420" />

Each line is a planet. The four rocky planets run together (small, dense, close to the Sun), and
so do the four giants (large, light, far and cold).

<Example id="demos/science-basics/planets-parcoords" bare :height="460" />

### Orbits

Orbits are ellipses with the Sun off-center. Venus and the Earth are almost circles; Mercury and
Mars are visibly lopsided.

<div class="hc-demo-narrow">
  <Example id="demos/science-basics/orbits" bare :height="560" />
</div>

The farther a planet is from the Sun, the longer its year, and the rule is exact: four times as
far means eight times as long.

<Example id="demos/science-basics/kepler" bare :height="480" />

### Gravity

Your mass is the same everywhere, but your weight is mass times gravity. A 50 kg person weighs
490 N on Earth, 185 N on Mars and 1,155 N on Jupiter.

<Example id="demos/science-basics/gravity-bars" bare :height="440" />

## Sources

<p class="hc-demo-source">
  Element data: the PubChem periodic table (US National Library of Medicine, public domain), with
  three discovery years corrected. Planets: NASA Planetary Fact Sheet. Everything else is
  computed from textbook formulas and constants; measurements described as simulated are
  generated with a fixed random seed. Details:
  <a href="https://github.com/holochart/holochart/blob/main/examples/demos/science-basics/data/SOURCES.md" target="_blank" rel="noopener">SOURCES.md</a>.
  Chart sources: <a href="https://github.com/holochart/holochart/tree/main/examples/demos/science-basics" target="_blank" rel="noopener">examples/demos/science-basics</a>.
</p>
