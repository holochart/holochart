# Data sources

All values in `../data.mts` were transcribed on 2026-10-03 using public, unauthenticated access
only. Nothing was read off a figure, interpolated or estimated. No article PDFs or downloaded pages
are kept in the repo; only the transcribed values are. Shadow libraries were not used.

## Where values were read

Each reference in `REFS` records the best tier reached for that paper.

| Tier        | Meaning                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------- |
| `full text` | Open full text: PubMed Central XML through NCBI E-utilities, a free publisher page, or a US government archive      |
| `abstract`  | PubMed abstract. The article body was behind a paywall, or the publisher withholds its PMC text from the public API |
| `label`     | US prescribing information on DailyMed (Marinol, Syndros)                                                           |
| `secondary` | Quoted from a named open-access review, because the primary paper has no usable abstract value                      |

None of the 1970 to 1992 disposition studies is open in full text. Their values are from abstracts,
or are `secondary`:

| Value                                                      | Primary source      | Read in                                                |
| ---------------------------------------------------------- | ------------------- | ------------------------------------------------------ |
| Terminal half-life of 19 h after intravenous THC           | Hunt and Jones 1980 | Chiang and Rapaka 1987 (NIDA Res Monogr 79), full text |
| Peak THC and 11-OH-THC after intravenous and oral capsules | Wall 1983           | Poyatos 2020 (Medicina 56:309), Table 1                |

Poyatos 2020 notes that its Wall 1983 peaks are the maxima of the mean concentration curves, not
means of individual peaks.

The Huestis 2007 review (Chem Biodivers 4:1770) could not be read by any permitted route and nothing
is taken from it. Sharma 2012 was read and not used, because its reference attributions are
unreliable.

## Matrix

Plasma THC is roughly twice whole-blood THC. `PEAKS` is whole blood throughout. `METABOLITE` mixes
plasma and whole blood and marks each point; the comparison it makes is a ratio within each study,
so the matrix does not affect it. `GUMMIES`, `FOOD` and the plasma half-lives are plasma.

## Notes by dataset

- **`EFFECT_WINDOWS` (Spindle 2021).** Assessments were at hour 0 (immediately after dosing) and
  hours 1, 2, 3, 4, 5, 6 and 8. A window is the run of assessments significantly different from
  baseline, as stated in the paper's text. Nothing is known about hours 7 and 9 onward.
- **`PEAKS`.** Spindle 2018 sampled first at 10 minutes. Spindle 2021 reports the mean
  concentration at the group's peak time point, not the mean of individual peaks, and took no blood
  at hour 0 after brownies. Zamarripa 2026 reports mean individual Cmax and Tmax from its
  supplement.
- **`DOSE_RESPONSE`.** Peak change from baseline on a 0 to 100 "drug effect" scale. Schlienz 2020
  prints its dispersion as SD, but the values (0.5 to 2.7) are implausibly small for n = 17 and are
  probably standard errors; they are not charted.
- **`GUMMIES` (Ewell 2021).** Seven regular users, 12-hour fast, a 75 g glucose drink 30 minutes
  after dosing, plasma from 10 to 240 minutes. The half-lives in `HALF_LIVES` from this study rest
  on that 4-hour window and on 2 to 7 participants per product. The paper describes three of the
  products as gummies; the other two are labelled "other edible" here.
- **`HALF_LIVES`.** Days were converted to hours. Lemberger 1971 used a radiolabel method that a
  later review calls relatively nonspecific. Johansson 1988 and 1989 used deuterium-labelled THC,
  which separates the test dose from THC already in the body. The Syndros label reports 5.6 h after
  a single 4.2 mg dose and, in the same section, 25 to 36 h as the terminal half-life.
- **`ABSTINENCE` (Bergamaschi 2013, Table 2).** Median and percentage are of participants still
  resident that day. The abstract says 1 of 11 was negative at day 26; Table 2 shows 9.1% positive,
  and the table is used. Days 31 to 33 (one participant) are left out.
- **`DETECTION`.** Swortwood 2017's upper ranges of 54 and 72 hours are censored: those participants
  were still positive when collection ended. Huestis 1996 gives a mean and a plus-or-minus whose type
  is not stated in the abstract; the bar drawn is that plus-or-minus, not a range of individuals.
  Goodwin 2008's abstract gives 4.3 days for the lowest group; its Table 2 gives 4.6 ± 5.6, and the
  table is used. The Schlienz 2018 values were read from the publisher's HTML page.
- **`SMOKED_PEAKS` (Perez-Reyes 1990).** From the table printed inside Figure 1 of the chapter, read
  from the scanned monograph. One range is printed "81.0+203.0" in the scan and is taken as 81.0 to
  203.0. The type of the plus-or-minus is not stated; other tables in the chapter use standard
  errors.

## Left out

- Mean concentration-time and rating-time curves: in every study they are figures only.
- Newmeyer 2016 (Clin Chem), the one study giving blood THC by all three routes in the same people:
  not open, and its abstract has no numbers.
- The oral dose-and-time predictions of McCartney 2021's meta-regression: abstract only.
- Review-level guidance on urine detection windows (Cary 2006): not primary data.
