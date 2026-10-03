---
title: Tirzepatide and the GLP-1 class
description: A review of tirzepatide and the GLP-1 receptor agonists from the primary trial reports — SURPASS, SURMOUNT, the outcome trials and the safety record — with the key figures redrawn in Holochart.
status: complete
aside: false
pageClass: hc-demo
---

<script setup>
import {
  BODY_COMPOSITION,
  fmtHr,
  PREVENTION,
  REFS,
  STEP4,
  SUMMIT,
  SURMOUNT1,
  SURMOUNT4,
  SURPASS2,
  SURPASS_CVOT,
  ZEPBOUND_GI,
} from '@mk7s/holochart-examples/demos/tirzepatide/data.mts';
import StatTiles from './components/StatTiles.vue';

const refs = Object.values(REFS);
const papers = refs.filter((r) => r.tier !== 'label');
const fullText = papers.filter((r) => r.tier === 'full text').length;
const mace = SURPASS_CVOT[0];
const death = SURPASS_CVOT.find((h) => h.label === 'Death from any cause');
const stats = [
  {
    value: '−20.9%',
    label: 'body weight on tirzepatide 15 mg at 72 weeks',
    aside: 'SURMOUNT-1 · placebo −3.1%',
  },
  {
    value: '−2.30',
    label: 'HbA1c points on 15 mg at 40 weeks',
    aside: 'SURPASS-2 · semaglutide 1 mg −1.86',
  },
  {
    value: mace.hr.toFixed(2),
    label: 'hazard ratio for MACE against dulaglutide',
    aside: `SURPASS-CVOT · 95.3% CI ${mace.lo}–${mace.hi.toFixed(2)}`,
  },
  {
    value: '+14.0%',
    label: 'regained in a year after switching to placebo',
    aside: 'SURMOUNT-4 · continued drug −5.5%',
  },
];
</script>

<p class="hc-eyebrow">Review · tirzepatide and the GLP-1 receptor agonists · sources read October 3, 2026</p>

# Tirzepatide and the GLP-1 class

<p class="hc-verdict">
  <strong>Tirzepatide has beaten every comparator it has been tested against on both glucose and
  weight, and its limits are now as well measured as its effects.</strong> In type 2 diabetes it lowers HbA1c by
  about two points; in obesity it takes off a fifth of body weight, half as much again as
  semaglutide in a direct comparison. The weight returns when the drug is stopped, a quarter of
  what is lost is lean mass, and its one cardiovascular outcome trial showed it to be no worse than
  an established GLP-1 drug, not better.
</p>

<StatTiles :items="stats" />

This review covers tirzepatide in depth and the other GLP-1 based drugs as context. It is built
from primary sources: the trial reports, their ClinicalTrials.gov results records and the US
prescribing information. Of the {{ papers.length }} papers cited, {{ fullText }} were read as open
full text and the rest as abstracts checked against the registry and the label; the
[reference list](#references) marks which. Every chart is a Holochart example that runs live in
your browser. Some redraw a published figure from its reported values; others put results from
several trials side by side. None of this is medical advice.

One point of method matters throughout. These trials report two estimands. The
**treatment-regimen** (or treatment-policy) estimand is the effect in everyone randomised, whether
or not they stayed on the drug. The **efficacy** (or trial-product) estimand is the effect had
everyone stayed on it, and runs one to three percentage points of body weight larger. Press
coverage usually quotes the second. This review uses the first unless it says otherwise.

## From one receptor to two

GLP-1 is a gut hormone released after meals. It raises insulin secretion when glucose is high,
suppresses glucagon, slows gastric emptying and reduces appetite through receptors in the
brainstem and hypothalamus. Native GLP-1 lasts minutes; the drug class exists because chemists
extended that to a day (liraglutide) and then a week, by attaching a fatty acid that binds albumin
(semaglutide) or fusing the peptide to an antibody fragment (dulaglutide).

Tirzepatide adds a second hormone. It is a 39-amino-acid peptide built on the sequence of GIP, the
other incretin, modified to activate the GLP-1 receptor as well, with a C20 fatty diacid that
gives 99% albumin binding and a half-life of about five days (Coskun 2018; Mounjaro label). It is
injected once a week, started at 2.5 mg and raised by 2.5 mg every four weeks to 5, 10 or 15 mg.

The two activities are not equal. In the discovery paper's assays tirzepatide bound the GIP
receptor about 30 times more tightly than the GLP-1 receptor, and at the GLP-1 receptor it was
some 16 times less potent than semaglutide.

<Example id="demos/tirzepatide/receptor-potency" bare :height="360" />

<p class="hc-demo-source">
  Mean and SEM, human receptors in HEK293 cells, albumin-free. Circles are binding affinity,
  diamonds are potency for cAMP production. Source: Coskun 2018, section 3.2.
</p>

A weak GLP-1 agonist that outperforms a strong one needs explaining. Willard and colleagues
(2020) showed that at the GLP-1 receptor tirzepatide is also a _biased_ agonist: it drives cAMP
signalling but recruits little β-arrestin (under 10% of GLP-1's maximum) and internalises the
receptor less, which may keep more receptor on the cell surface. Whether GIP receptor agonism
itself adds weight loss in humans, or mainly improves tolerability, is still argued; no trial has
separated the two components.

## Type 2 diabetes: the SURPASS trials

Five phase 3 trials tested three doses against placebo, semaglutide 1 mg and two basal insulins,
across the range from drug-naive patients to those already on insulin. The result was nearly the
same in each: HbA1c fell by about two percentage points from a baseline near 8%, more than with
any comparator. Switch the chart to body weight to see the second effect: losses of 5 to 11 kg
that rise with dose, against gains on insulin.

<Example id="demos/tirzepatide/surpass-programme" bare :height="460" />

<p class="hc-demo-source">
  Treatment-regimen estimand at week 40 or 52, as tabulated in section 14 of the Mounjaro label,
  so all five trials use one analysis. Sources: Rosenstock 2021, Frías 2021, Ludvik 2021, Del
  Prato 2021, Dahl 2022.
</p>

SURPASS-2 is the most informative of the five because its comparator was the strongest: 1,879
patients on metformin, randomised to tirzepatide or semaglutide 1 mg for 40 weeks. All three
doses were superior on HbA1c and on weight, with a clear dose response in the differences.

<Example id="demos/tirzepatide/surpass2" bare :height="460" />

<p class="hc-demo-source">
  After Figures 1A and 2A of Frías 2021, redrawn from the values in the paper's Results and
  Table 2.
</p>

Two caveats belong with this figure. Semaglutide was given at 1 mg, not the 2 mg diabetes dose
approved later, so the trial compares tirzepatide's full range with a mid-range comparator. And
the gains were not free: adverse events led {{ SURPASS2.stoppedForAe[2] }}% to stop tirzepatide
15 mg against {{ SURPASS2.stoppedForAe[3] }}% on semaglutide, although rates of nausea
({{ SURPASS2.nausea[2] }}% and {{ SURPASS2.nausea[3] }}%) and vomiting were similar.

## Obesity: the SURMOUNT trials

SURMOUNT-1 established the obesity indication: 2,539 adults without diabetes, mean weight 104.8
kg and BMI 38, treated for 72 weeks. Weight fell 15.0% on 5 mg, 19.5% on 10 mg and 20.9% on 15 mg,
against 3.1% on placebo.

<Example id="demos/tirzepatide/surmount1-weight" bare :height="440" />

<p class="hc-demo-source">
  After Figure 1A of Jastreboff 2022. Treatment-regimen estimand with 95% confidence intervals,
  from the abstract.
</p>

Means hide the spread. On 15 mg, 57% of participants lost at least a fifth of their body weight,
a range previously associated with bariatric surgery; on placebo 3% did. About one in ten did not
reach 5%.

<Example id="demos/tirzepatide/surmount1-responders" bare :height="440" />

<p class="hc-demo-source">
  After Figure 1B of Jastreboff 2022. Proportions from the Zepbound label, Study 1.
</p>

The rest of the programme varied the population. Weight loss was smaller in people with type 2
diabetes (SURMOUNT-2), as it is with every drug in the class. It added to, and did not replace,
what an intensive lifestyle programme had already achieved (SURMOUNT-3: a further 18.4% after an
initial 6.9%). It held up in older, sicker groups with sleep apnoea and heart failure.

<Example id="demos/tirzepatide/programme" bare :height="520" />

<p class="hc-demo-source">
  Highest dose or maximum tolerated dose against the comparator; hover a point for the trial's
  size, duration and estimand. SUMMIT's values are the registry's efficacy estimand. Sources:
  Jastreboff 2022, Garvey 2023, Wadden 2023, Aronne 2024, Aronne 2025, Malhotra 2024, Packer 2025.
</p>

### Against semaglutide

Comparing SURMOUNT-1 with semaglutide's STEP 1 across trials was never satisfactory. SURMOUNT-5
randomised 751 adults with obesity to the maximum tolerated dose of either drug for 72 weeks.
Tirzepatide took off 20.2% of body weight and semaglutide 13.7%, a difference of 6.5 percentage
points, with a larger fall in waist circumference and more participants at every threshold.

<Example id="demos/tirzepatide/surmount5" bare :height="460" />

<p class="hc-demo-source">
  Means with 95% CIs from the abstract of Aronne 2025. Threshold proportions are the
  ClinicalTrials.gov observed-case values (318 per arm) and may differ slightly from the paper's.
</p>

The trial was open label and funded by tirzepatide's maker, which matters more for reported
symptoms than for weight on a scale. Gastrointestinal events were about as common with either
drug; vomiting was reported by 15.0% on tirzepatide and 21.3% on semaglutide.

## Stopping

The weight loss lasts as long as the treatment does. SURMOUNT-4 gave everyone tirzepatide for 36
weeks, by which point they had lost {{ Math.abs(SURMOUNT4.leadIn) }}%, then randomised them to
continue or to switch to placebo. Over the next year those who continued lost a further 5.5% and
those switched regained 14.0%. Of those who continued, {{ SURMOUNT4.keptEightyPct.tirz }}% kept at
least four fifths of their initial loss, against {{ SURMOUNT4.keptEightyPct.placebo }}%.

Semaglutide behaves the same way. In the STEP 1 extension, participants had regained two thirds
of their loss a year after stopping, and in STEP 4 those switched to placebo after a 20-week
run-in regained {{ STEP4.change20to68.placebo[0] }}% while those who continued lost another
{{ Math.abs(STEP4.change20to68.sema[0]) }}%.

<Example id="demos/tirzepatide/withdrawal" bare :height="480" />

<p class="hc-demo-caption">
  This chart plots only the values the papers report in text: the start, the stopping point and
  the end. The published figures show smooth per-visit curves between them, which are available
  only as images and were not traced, so the straight lines here are connectors, not data.
  Sources: Aronne 2024 (Figure 2), Wilding 2022 (Figure 1).
</p>

Longer treatment does not change this. In the three-year extension of SURMOUNT-1, weight loss at
176 weeks was {{ Math.abs(PREVENTION.weight176.pct[3]) }}% on 15 mg, close to the 72-week figure,
so the effect neither grows nor fades. Among the 1,032 participants who began with prediabetes,
{{ PREVENTION.week176.tirz }}% on tirzepatide developed type 2 diabetes against
{{ PREVENTION.week176.placebo }}% on placebo (hazard ratio {{ PREVENTION.week176.hr }}). Seventeen
weeks after stopping, the figures were {{ PREVENTION.week193.tirz }}% and
{{ PREVENTION.week193.placebo }}%: the protection had begun to erode. Obesity treatment with these
drugs is, on current evidence, indefinite.

## What is lost

A DXA substudy of SURMOUNT-1 measured body composition in 160 participants. On tirzepatide, fat
mass fell {{ Math.abs(BODY_COMPOSITION.tirz[1]) }}% and lean mass
{{ Math.abs(BODY_COMPOSITION.tirz[3]) }}%. Of the weight lost, about
{{ BODY_COMPOSITION.share.tirz[0] }}% was fat and {{ BODY_COMPOSITION.share.tirz[1] }}% lean, the
same split as in the placebo group's much smaller loss, and the same across doses, sexes and age
groups.

<Example id="demos/tirzepatide/body-composition" bare :height="440" />

<p class="hc-demo-source">
  Week 72 (SURMOUNT-1) and week 68 (STEP 1). The two substudies are separate trials, and the STEP 1
  values come from a conference abstract that gives no placebo figures for these measures.
  Sources: Look 2025, Wilding 2021b.
</p>

The placebo group lost weight in the same proportions, so the drug does not appear to take lean
tissue selectively. But a quarter of 20% is a large absolute amount,
{{ Math.abs(BODY_COMPOSITION.kg.tirzLean) }} kg on average here, which matters most for older
patients. DXA lean mass includes water and organ tissue as well as muscle, and trials with direct
measures of muscle and function are still few.

Lipids and blood pressure move in the expected direction. Triglycerides fell by up to 29% and
systolic pressure by about {{ Math.abs(SURMOUNT1.sbp[3]) }} mmHg on 15 mg.

<Example id="demos/tirzepatide/surmount1-lipids" bare :height="400" />

<p class="hc-demo-source">
  Percent change from baseline at week 72, SURMOUNT-1. Source: Zepbound label, Table 3.
</p>

## Beyond weight

Three trials tested whether the weight loss translates into benefit in specific diseases of
obesity.

**Liver.** SYNERGY-NASH was a phase 2 trial in 190 people with biopsy-proven steatohepatitis and
moderate or advanced fibrosis. After 52 weeks the disease had resolved in 44 to 62% on
tirzepatide and 10% on placebo. Fibrosis improved in about half of treated participants at every
dose against 30% on placebo, with wide confidence intervals and no dose response, so the effect
on scarring is less certain than the effect on inflammation.

<Example id="demos/tirzepatide/synergy-nash" bare :height="420" />

<p class="hc-demo-source">Source: abstract of Loomba 2024.</p>

**Sleep apnoea.** In the two SURMOUNT-OSA trials, participants began with about 50 breathing
interruptions an hour. Tirzepatide reduced that by 25 to 29, placebo by about 5. This became the
first drug indication for obstructive sleep apnoea.

<Example id="demos/tirzepatide/osa-ahi" bare :height="420" />

<p class="hc-demo-source">
  Treatment-regimen estimand with 95% confidence intervals. Source: Malhotra 2024, Tables 2 and 3.
</p>

**Heart failure.** SUMMIT enrolled 731 people with obesity and heart failure with preserved
ejection fraction. Over a median of two years, cardiovascular death or worsening heart failure
occurred in 9.9% on tirzepatide and 15.3% on placebo (hazard ratio {{ fmtHr(SUMMIT.composite) }}).
The benefit came entirely from fewer heart-failure events ({{ fmtHr(SUMMIT.worseningHf) }});
cardiovascular deaths were few and numerically higher on tirzepatide, 8 against 5. Symptom scores
improved by {{ SUMMIT.kccq.diff[0] }} points more than on placebo.

## Hard outcomes

The case that GLP-1 receptor agonists prevent cardiovascular events rests on a decade of
placebo-controlled trials in type 2 diabetes, extended to obesity without diabetes by SELECT in
2023 and to kidney disease by FLOW in 2024. Tirzepatide's evidence is of a different kind.

<Example id="demos/tirzepatide/outcomes-forest" bare :height="600" />

<p class="hc-demo-source">
  Primary endpoint of each trial: three-point MACE except where labelled. Hover a square for the
  population, follow-up and event counts. This is a display of separate trials, not a
  meta-analysis.
</p>

SURPASS-CVOT randomised 13,299 people with type 2 diabetes and cardiovascular disease to
tirzepatide or to dulaglutide, a GLP-1 drug with proven benefit, in place of placebo. The hazard
ratio for MACE was {{ fmtHr(mace) }}: tirzepatide met the
test of noninferiority and narrowly missed superiority.

<Example id="demos/tirzepatide/surpass-cvot" bare :height="480" />

<p class="hc-demo-source">
  Primary endpoint from the abstract of Nicholls 2025 (a 95.3% interval); other outcomes from
  section 14.6 of the Mounjaro label and the trial's open-access secondary report. Only the primary
  endpoint was controlled for multiplicity.
</p>

Read strictly, the trial shows tirzepatide is at least as good as dulaglutide for cardiovascular
protection. Death from any cause was lower ({{ fmtHr(death) }}), as was the kidney composite, but
these were not part of the formal testing sequence and should be taken as supporting, not
confirmatory. There is still no placebo-controlled cardiovascular outcome trial of tirzepatide in
obesity without diabetes, the question SELECT answered for semaglutide.

## The rest of the class

Tirzepatide was the first of several attempts to improve on GLP-1 alone by adding a second or
third hormone. The chart ranks each agent's main obesity trial; they are separate trials with
different populations and lengths, so the ranking is indicative only.

<Example id="demos/tirzepatide/class-weight-loss" bare :height="540" />

<p class="hc-demo-source">
  Highest dose, treatment-policy estimand, adults without diabetes. Sources: Pi-Sunyer 2015 and
  the Saxenda label, Wharton 2025, le Roux 2026, Wilding 2021, Knop 2023, Garvey 2025, Jastreboff
  2022, Jastreboff 2026. All except the label were read as abstracts.
</p>

Three things stand out. Adding amylin (cagrilintide with semaglutide) or GIP (tirzepatide) to
GLP-1 gives about 20%, and adding glucagon as well (retatrutide) gives 25%, in a trial published
days before this review was written. Survodutide, which adds glucagon without GIP, came in below
semaglutide. And the oral small molecule orforglipron trades efficacy for convenience: 11% from a
daily tablet.

## Safety

The common adverse effects are gastrointestinal, dose related and concentrated in the weeks of
dose escalation. On tirzepatide 15 mg, {{ ZEPBOUND_GI.nausea[3] }}% reported nausea,
{{ ZEPBOUND_GI.diarrhoea[3] }}% diarrhoea and {{ ZEPBOUND_GI.vomiting[3] }}% vomiting, and
{{ ZEPBOUND_GI.stoppedForGi[3] }}% stopped treatment because of them, against
{{ ZEPBOUND_GI.stoppedForGi[0] }}% on placebo.

<Example id="demos/tirzepatide/gi-tolerability" bare :height="460" />

<p class="hc-demo-source">
  Pooled placebo-controlled obesity trials from each US label. The pools differ in trials, length
  and titration, so compare each drug with its own placebo (use the toggle), not with the others.
  Sources: Saxenda, Wegovy, Zepbound and Foundayo labels.
</p>

The rarer risks are less settled, and for several the evidence conflicts:

- **Gallbladder disease.** A meta-analysis of 76 randomised trials found a relative risk of 1.37
  (95% CI 1.23 to 1.52), higher in weight-loss trials (2.29), about 27 extra events per 10,000
  patients a year (He 2022). Rapid weight loss itself causes gallstones.
- **Pancreatitis.** Confirmed cases were equally rare on tirzepatide and placebo in the obesity
  trials (0.2% each), and pooled outcome trials show no excess (odds ratio 1.05, 0.78 to 1.40; Cao
  2020). One claims-database study reported a ninefold higher rate than with another weight-loss
  drug, with an interval from 1.25 to 66 (Sodhi 2023). Labels carry a warning.
- **Thyroid C-cell tumours.** All labels carry a boxed warning based on rodent studies. In humans a
  French case-control study found more thyroid cancer after one to three years of use (hazard
  ratio 1.58; Bezin 2023); a larger Scandinavian cohort did not (0.93, 0.66 to 1.31; Pasternak
  2024).
- **Optic neuropathy (NAION).** A single-centre study reported a four- to sevenfold higher rate
  with semaglutide (Hathaway 2024); national cohorts found a two- to threefold increase, roughly
  one extra case per 10,000 person-years (Simonsen 2025). The European regulator listed it as a very rare
  effect of semaglutide in 2025. No estimate specific to tirzepatide was found, and the US labels
  do not mention it.
- **Aspiration under anaesthesia.** Delayed gastric emptying can leave food in the stomach after a
  normal fast; US labels added a warning in late 2024.
- **Suicidal thoughts.** Early case reports were not borne out by cohort studies (for suicide
  death, hazard ratio 1.25, 0.83 to 1.88, against another diabetes drug class; Ueda 2024) or by
  the regulators' reviews, and in January 2026 the FDA asked for the warning to be removed from the
  obesity labels.

## What is still unknown

- Whether tirzepatide prevents cardiovascular events in people with obesity but not diabetes.
- Whether GIP agonism contributes to efficacy, or whether a biased GLP-1 agonist alone would do as
  well.
- How to stop. No trial has tested tapering, lower maintenance doses or intermittent treatment
  against continuous therapy for long-term weight.
- What the lean mass lost means for strength, fracture and frailty over decades, particularly
  through cycles of loss and regain.
- How the newer agents compare directly. Only tirzepatide and semaglutide have been tested head to
  head.

## Methods and limits of this review

Sources were gathered on October 3, 2026 from PubMed, PubMed Central and Europe PMC, journal
sites where the article is free, ClinicalTrials.gov results records and DailyMed labels. Trials
were chosen for being the registration or outcome trial of each agent, which are also the most
cited. Where the full text was not open, values come from the abstract and were checked against
the registry and the label; where sources disagreed, the difference is recorded in the
[source notes](https://github.com/holochart/holochart/blob/main/examples/demos/tirzepatide/data/SOURCES.md).

Three limits follow. First, {{ papers.length - fullText }} of the {{ papers.length }} papers were
not read in full, so secondary results, subgroup analyses and supplementary safety tables from
those papers are absent. Second, no values were read off figures, so time courses appear only as
reported landmarks. Third, comparisons across trials are descriptive: populations, durations and
analysis methods differ, and no pooled estimates were calculated. Results available only as
company press releases were left out.

## References

<ol class="hc-sources">
  <li v-for="r in refs" :key="r.short">
    <strong>{{ r.short }}.</strong> {{ r.cite }}
    <template v-if="r.doi">
      <a :href="`https://doi.org/${r.doi}`" target="_blank" rel="noopener">doi:{{ r.doi }}</a>.
    </template>
    <template v-if="r.pmid"> PMID {{ r.pmid }}.</template>
    <span class="hc-sources-unit"> Read as: {{ r.tier }}.</span>
  </li>
</ol>

<p class="hc-demo-source">
  Chart sources and data:
  <a href="https://github.com/holochart/holochart/tree/main/examples/demos/tirzepatide" target="_blank" rel="noopener">examples/demos/tirzepatide</a>.
</p>
