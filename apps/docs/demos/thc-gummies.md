---
title: How long will these gummies last?
description: What controlled studies say about how long eaten THC is felt and how long it stays in the body, against smoked and vaporised THC — effect windows, absorption, half-lives and detection times, charted with Holochart.
status: complete
aside: false
pageClass: hc-demo
---

<script setup>
import {
  ABSTINENCE,
  FOOD,
  REFS,
} from '@mk7s/holochart-examples/demos/thc-gummies/data.mts';
import StatTiles from './components/StatTiles.vue';

const refs = Object.values(REFS);
const fullText = refs.filter((r) => r.tier === 'full text').length;
const day = (d) => ABSTINENCE.find((row) => row.day === d);
const stats = [
  {
    value: '1–6 h',
    label: 'when a 25 mg brownie was felt',
    aside: 'Spindle 2021 · vaporised 20 mg: 0–5 h',
  },
  {
    value: '6%',
    label: 'of an eaten dose reached the blood',
    aside: 'Ohlsson 1980 · smoked: 18%',
  },
  {
    value: '25–36 h',
    label: 'half-life, the same eaten or injected',
    aside: 'Wall 1983 · 4 days in 2-week studies',
  },
  {
    value: '2–4 days',
    label: 'urine test positive after one edible',
    aside: 'Schlienz 2018 · 10 to 50 mg',
  },
];
</script>

<p class="hc-eyebrow">THC pharmacokinetics · eaten vs smoked and vaporised · sources read October 3, 2026</p>

# How long will these gummies last?

<p class="hc-verdict">
  <strong>You feel them from about an hour in until hour four to six, depending on the
  dose.</strong> That is about as long as a comparable vaporised dose, shifted an hour later, with
  the impairment arriving later still. The THC itself outlasts the feeling by days: its half-life is about a day in studies that
  sample for three days and four days in studies that sample for two weeks, whichever way it was
  taken. A urine test can find one edible for two to four days.
</p>

<StatTiles :items="stats" />

The question has two answers because "last" means two things: how long the effect is felt, and
how long THC stays in the body. The route changes the first a great deal and the second hardly at
all. This page collects what controlled human studies report for each, for eaten THC against
smoked and vaporised THC. Of the {{ refs.length }} sources, {{ fullText }} were read as open full
text; the older ones are behind paywalls and were read as abstracts, or quoted from open reviews
that are named where they are used. The [reference list](#references) marks which. Every chart is
a Holochart example running live in your browser. None of this is medical or legal advice, and the
studies used doses of 5 to 50 mg in small groups of healthy adults.

## How long you feel it

The cleanest comparison is a 2021 crossover in which the same 20 infrequent users ate cannabis
brownies and, on other days, inhaled vaporised cannabis, and were assessed every hour. A dot
below is an assessment at which the measure differed significantly from baseline.

<Example id="demos/thc-gummies/effect-windows" bare :height="480" />

<p class="hc-demo-source">
  Brownies with 10 and 25 mg THC; vaporised cannabis with 5 and 20 mg. Nothing was assessed
  between hours 6 and 8. The 10 mg brownie and the 5 mg vaporised dose did not impair performance
  on any task. Source: Spindle 2021.
</p>

The windows are the same length and offset by an hour: the 25 mg brownie was felt from hour 1 to
hour 6, the 20 mg vaporised dose from the first minutes to hour 5. The difference that matters is
in the impairment rows. After vaporising, measured impairment was over within an hour or two
on the performance tests, while people still felt the drug. After the brownie it did not begin until hour 2 and ran to
hour 5. An edible is at its most impairing at about the time an inhaled dose would be wearing off.

Other studies from the same group agree on the shape. After brownies of 10 to 50 mg, effects were
not apparent for 30 to 60 minutes, subjective effects peaked at 1.5 to 3 hours and cognitive
impairment at 2 to 5 hours (Schlienz 2020); an earlier study describes effects lasting 6 to 8
hours (Vandrey 2017). After smoking or vaporising, effects peaked within half an hour (Spindle
2018). A meta-regression of 80 studies estimated that most driving-related skills recover within
about 5 hours of inhaling 20 mg, and noted that recovery after oral doses may take longer
(McCartney 2021).

## Why eating is slower and weaker

Inhaled THC reaches the blood through the lungs within minutes. Eaten THC has to be absorbed from
the gut and pass through the liver first. The blood shows it: inhaled doses peak in the first
sample, eaten doses two to three hours later and far lower.

<Example id="demos/thc-gummies/blood-peaks" bare :height="460" />

<p class="hc-demo-source">
  Whole blood, group means. After vaporising 20 mg, blood THC peaked at 37 ng/mL; after eating
  25 mg, at 3 ng/mL. Sources: Spindle 2018, Spindle 2021, Zamarripa 2026.
</p>

The low peak is a matter of how much gets in. In the one study that gave the same people THC by
vein, by cigarette and in a cookie, 18% of the smoked dose reached the circulation and 6% of the
eaten dose. Heavy smokers got more from a cigarette than light smokers, which is usually put
down to how they inhale.

<Example id="demos/thc-gummies/bioavailability" bare :height="420" />

<p class="hc-demo-source">
  Mean with the standard deviation printed in each abstract. Sources: Ohlsson 1980, Lindgren 1981,
  Ohlsson 1982, Wall 1983.
</p>

The dronabinol label explains the gap: 90 to 95% of an oral dose is absorbed from the gut, but
only 10 to 20% survives the first pass through the liver. So milligrams are not comparable across
routes, and the ratings bear that out. At every dose tested, people rated the effect of inhaled
THC higher than the effect of the same amount eaten.

<Example id="demos/thc-gummies/effect-by-dose" bare :height="440" />

<p class="hc-demo-source">
  Mean peak rating on a 0 to 100 scale; each line is one study. Standard deviations are 20 to 37
  points. Sources: Spindle 2018, Spindle 2021, Schlienz 2020, Zamarripa 2023, Zamarripa 2026.
</p>

### The second drug

What the liver does to THC on first pass is turn much of it into 11-OH-THC, which is also
psychoactive. After an intravenous dose there is one part of it to every ten or twenty of THC.
After an oral dose there is about as much metabolite as THC (Wall 1983; the Marinol label says
"approximately equal").

<Example id="demos/thc-gummies/metabolite" bare :height="480" />

<p class="hc-demo-source">
  Circles are plasma, diamonds whole blood. The four Wall 1983 points are quoted from an
  open-access review (Poyatos 2020). Sources: Oh 2017, Ewell 2021, Zamarripa 2023, Zamarripa 2026.
</p>

This is the usual explanation for edibles feeling different and for blood THC understating their
effect: after eating, about half of the active drug in circulation is not THC.

## Gummies specifically

Most controlled work uses brownies or capsules. One study tested products off the shelf: five
commercial 10 mg edibles, three of them gummies, in seven regular users who had fasted overnight.

<Example id="demos/thc-gummies/gummies" bare :height="400" />

<p class="hc-demo-source">
  Circles are gummies, diamonds other edibles. Plasma was sampled for 4 hours only. Source: Ewell
  2021.
</p>

On an empty stomach, plasma THC peaked 36 to 62 minutes after the gummies, sooner than the two to
three hours seen with brownies eaten after breakfast. The product sold as fast-acting was not the
fastest, and the spread between people on the same product was larger than the gap between
products. With seven participants, none of those differences should be read as established.

Food is the larger variable. In a study of 5 mg dronabinol capsules, a high-fat meal delayed the
first appearance of THC in the blood from half an hour to two hours and the peak from
{{ FOOD.measures[1].fasted[0] }} to {{ FOOD.measures[1].fed[0] }} hours, and more than doubled
total exposure, while leaving the peak height about the same.

<Example id="demos/thc-gummies/food-effect" bare :height="420" />

<p class="hc-demo-source">
  Mean and standard deviation, plasma THC, 53 or 54 participants per arm. Source: Oh 2017.
</p>

A gummy after a large dinner is, on this evidence, a slower and longer dose than the same gummy
before it. That is also the mechanism behind the familiar mistake of taking a second one because
the first has not worked yet.

## How long THC stays

Now the second meaning of "last". The terminal half-life is the time for the amount of THC in the
body to halve once absorption and distribution are finished. It is a property of how the body
clears THC, and it should not depend on how the THC got in. The studies agree: the one that
measured it after both intravenous and oral doses found the same 25 to 36 hours for each.

What the half-life does depend on is how long the study kept looking.

<Example id="demos/thc-gummies/half-lives" bare :height="680" />

<p class="hc-demo-source">
  Dots are reported means, bars reported ranges. Hover a row for the note on each value. The Hunt
  1980 value is quoted from a review (Chiang 1987). Sources: Ewell 2021, Oh 2017, Syndros label,
  Lemberger 1971, Wall 1983, Johansson 1988, Johansson 1989, Johansson 1990, Huestis 1998,
  Gustafson 2004, Johansson 1989b.
</p>

Studies that sample for a few hours after an oral dose report half-lives of 2.5 to 10 hours.
Studies that sample for three days report about a day. Studies that followed chronic users for
two weeks, with labelled THC and a sensitive assay, report four days, and in two people followed
for four weeks, ten and thirteen days.

These are not disagreements. THC is fat-soluble and leaves the blood quickly for fatty tissue,
then returns from it slowly; it was still measurable in fat biopsies from heavy users four weeks
after their last use (Johansson 1989c). Early on, the fall in blood THC is mostly distribution.
The slow final phase only appears once the concentration is low, and a short study or an
insensitive assay never sees it. The short oral half-lives at the top of the chart describe the
first hours after a gummy, not how long THC stays.

The practical reading is that a single edible in an occasional user is mostly governed by the
first day, and that with regular use the slow pool in fat fills up and the long half-life takes
over.

### In daily users

That long tail has been measured directly. Thirty men who smoked cannabis daily lived on a closed
research unit for up to 33 days, with blood taken every day.

<Example id="demos/thc-gummies/abstinence" bare :height="520" />

<p class="hc-demo-source">
  Redrawn from Table 2 of Bergamaschi 2013. Quantification limit 0.25 µg/L. Participants left at
  different times, so the percentage on later days is of fewer people.
</p>

On admission {{ day(0).thcPct }}% had measurable THC. After a week {{ day(7).thcPct }}% of the
{{ day(7).n }} still resident did, after two weeks {{ day(14).thcPct }}% of {{ day(14).n }}, and
on day 30 two of the five who remained. The concentrations were low, a median of
{{ day(14).thcMedian }} µg/L at two weeks, and only 5% were above 1 µg/L by day 12. The inactive
metabolite THC-COOH was present in most participants throughout. None of this reflects
intoxication; it is THC leaving storage.

## Testing positive

Drug tests mostly look for THC-COOH in urine, or THC in oral fluid or blood, and each has its own
window.

<Example id="demos/thc-gummies/detection-windows" bare :height="640" />

<p class="hc-demo-source">
  Hover a row for the cutoff used, which changes the answer. Sources: Vandrey 2017, Swortwood
  2017, Huestis 1996, Schlienz 2018, Goodwin 2008, Bergamaschi 2013.
</p>

After a single brownie in people with no recent use, urine stayed positive at the 15 ng/mL
confirmation cutoff for a mean of 45 hours after 10 mg, 52 hours after 25 mg and 93 hours after
50 mg, and two of the six who ate 50 mg were still positive on day 7. A single cigarette gives a
similar window for a similar dose. Route matters much less here than dose and history: among 60
regular smokers who stopped, the last positive urine test at the common 50 ng/mL screening cutoff
came after a mean of 5 to 15 days depending on how high they started, and for some at the end of
the 30-day study.

Oral fluid tests mostly detect THC left in the mouth, not THC from the blood, and stayed positive
for about a day in occasional users whether the dose was eaten or smoked.

## How much people differ

Every number above is an average over a small group, and individuals vary more than the routes
do. Smoking shows it most plainly, because the dose a person takes in depends on how they inhale.

<Example id="demos/thc-gummies/smoked-peaks" bare :height="440" />

<p class="hc-demo-source">
  Redrawn from the table printed with Figure 1 of Perez-Reyes 1990. The type of the printed
  plus-or-minus is not stated.
</p>

Within one group smoking the same 2.4% cigarette, peak plasma THC ran from 12 to 137 ng/mL.
Edibles vary as much: the dronabinol label gives between-person variation of about 66% for peak
concentration, and in the brownie studies the standard deviation of peak blood THC is about as
large as the mean.

## What this does not tell you

- **Higher doses.** The controlled studies stop at 50 mg. Many retail products and most accidental
  overconsumption are above that.
- **Regular users.** Most of the effect data comes from people who had not used cannabis for a
  month or more. In one study frequent users did not rate a 50 mg oral dose above placebo, while
  occasional users did (Newmeyer 2017). Regular use does not shorten how long THC is detectable;
  it lengthens it.
- **Newer formulations.** No open controlled study of THC drinks or nano-emulsion edibles in
  humans was found. One abstract reports a microencapsulated edible reaching its peak about 30
  minutes sooner than a standard one, with no difference in peak height (Conner 2026).
- **Whether you are fit to drive.** Blood THC does not track impairment after eating: the peak is
  low and late, and half the active drug is a metabolite.

## Methods and limits

Sources were gathered on October 3, 2026 from PubMed, PubMed Central, Europe PMC, journal sites
where the article is free, DailyMed and US government archives of the NIDA research monographs.
Studies were chosen for being controlled administrations in humans that report pharmacokinetic
values or timed effects, favouring the most cited.

The main limit is access. None of the 1970 to 1992 disposition studies is open in full, so their
values come from PubMed abstracts or from open reviews that tabulate them; the widely cited
Huestis 2007 review could not be read at all and nothing is taken from it. Whole blood and plasma
are different matrices (plasma THC is roughly twice whole-blood THC) and are not mixed within any
chart except where marked. No values were read off figures, so there are no concentration-time
curves here apart from the tabulated abstinence data. Details and the known disagreements between
sources are in the
[source notes](https://github.com/holochart/holochart/blob/main/examples/demos/thc-gummies/data/SOURCES.md).

## References

<ol class="hc-sources">
  <li v-for="r in refs" :key="r.short">
    <strong>{{ r.short }}.</strong> {{ r.cite }} {{ r.what }}.
    <template v-if="r.doi">
      <a :href="`https://doi.org/${r.doi}`" target="_blank" rel="noopener">doi:{{ r.doi }}</a>.
    </template>
    <template v-if="r.pmid"> PMID {{ r.pmid }}.</template>
    <span class="hc-sources-unit"> Read as: {{ r.tier }}.</span>
  </li>
</ol>

<p class="hc-demo-source">
  Chart sources and data:
  <a href="https://github.com/holochart/holochart/tree/main/examples/demos/thc-gummies" target="_blank" rel="noopener">examples/demos/thc-gummies</a>.
</p>
