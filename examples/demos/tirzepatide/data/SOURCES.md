# Data sources

All values in `../data.mts` were transcribed on 2026-10-03 from primary sources, using public,
unauthenticated access only. Nothing was read off a figure, interpolated or estimated. No article
PDFs or downloaded pages are kept in the repo; only the transcribed values are.

## Where values were read

Four tiers, in order of preference. Each reference in `REFS` records the best tier reached for that
paper.

| Tier        | Meaning                                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------------------------- |
| `full text` | Open full text: PubMed Central or Europe PMC, or free on the publisher's site (NEJM, JAMA, Nat Med, JCI Insight) |
| `abstract`  | PubMed abstract. The article body was behind a paywall and was not obtained                                      |
| `registry`  | The trial's ClinicalTrials.gov results record (API v2)                                                           |
| `label`     | US prescribing information on DailyMed: Mounjaro, Zepbound, Wegovy, Saxenda, Foundayo                            |

Papers read as `abstract` were cross-checked against the registry record and the label, which
between them tabulate most primary and key secondary results. Shadow libraries were not used.

| Read as full text                                                                                                                                | Read as abstract, registry and label                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coskun 2018, Willard 2020, SURPASS-2, SURPASS-5, SURMOUNT-3, SURMOUNT-4, SURMOUNT-OSA, SURMOUNT-1 DXA substudy, STEP 1 extension, LEADER, EXSCEL | SURPASS-1, -3, -4, SURPASS-CVOT, SURMOUNT-1 and its extension, SURMOUNT-2, SURMOUNT-5, SUMMIT, SYNERGY-NASH, STEP 1, STEP 4, SCALE, OASIS 1, ATTAIN-1, REDEFINE 1, SYNCHRONIZE-1, TRIUMPH-1, SUSTAIN-6, REWIND, Harmony Outcomes, PIONEER 6, AMPLITUDE-O, SELECT, SOUL, FLOW |

## Estimands

Lilly's trials report a **treatment-regimen** estimand (everyone randomised, regardless of
adherence or rescue therapy) and an **efficacy** estimand (had everyone stayed on the drug). Novo
Nordisk's call the same pair **treatment-policy** and **trial-product**. The second is 1 to 3
percentage points of body weight larger. `data.mts` uses the first throughout, with two exceptions
that are labelled where they occur:

- **SUMMIT** weight change (−13.9% vs −2.2%): only the registry's efficacy-estimand values were
  open.
- **SURMOUNT-5** responder proportions: the registry's observed-case values (318 per arm). The
  paper's own proportions were not open and may differ.

The Lancet abstracts for SURPASS-1, -3 and -4 report the efficacy estimand, so the SURPASS
programme chart takes all five trials from section 14 of the Mounjaro label, which tabulates the
treatment-regimen estimand for each.

## Time courses

Per-visit weight and HbA1c curves were not recoverable for any trial: they exist only as figure
images, and the registry posts endpoints, not visits. The withdrawal chart therefore plots only
the landmark values printed in text (week 0, the stopping point, the end) and says so in its
caption.

## Known disagreements between sources

These are recorded so a later reader does not mistake them for transcription errors.

| Trial                | Disagreement                                                                                                                                            | Value used                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| SURPASS-CVOT         | Noninferiority P = 0.003 (NEJM abstract) vs 0.007 (label). Events 801 vs 862 (abstract, modified ITT) vs 803 vs 863 (label, treated). Same hazard ratio | Abstract                                  |
| SURPASS-CVOT         | Myocardial infarction HR 0.86 (0.74–1.00) in the secondary report vs 0.87 (0.74–1.01) in the label                                                      | Secondary report                          |
| SURMOUNT-1           | Efficacy estimand −16.0 / −21.4 / −22.5% (registry) vs treatment-regimen −15.0 / −19.5 / −20.9% (abstract, label)                                       | Treatment-regimen                         |
| SURMOUNT-1 extension | Diabetes by week 176: 1.3% vs 13.3%, HR 0.07 (abstract) vs 1.2% vs 12.6%, HR 0.06 (registry)                                                            | Abstract                                  |
| SURMOUNT-4           | Week 0 to 88 change −25.3% vs −9.9% (abstract; estimand not named) vs −26.0% vs −9.5% (registry, efficacy)                                              | Abstract                                  |
| SYNERGY-NASH         | MASH resolution 10 / 44 / 56 / 62% (abstract, imputed) vs 12.6 / 51.8 / 63.1 / 73.9% (registry, on treatment)                                           | Abstract                                  |
| STEP 1               | Responders 86.4 / 69.1 / 50.5% (abstract, observed) vs 83.5 / 66.1 / 47.9% (label, imputed)                                                             | Not charted                               |
| STEP 4               | Any GI event on continued semaglutide: 49.1% (PubMed abstract) vs 41.9% (JAMA page). Unresolved                                                         | Not used                                  |
| SCALE                | −8.0% vs −2.6% (registry, last observation carried forward) vs −7.4% vs −3.0% (label, multiple imputation)                                              | Label, as the treatment-policy equivalent |
| ATTAIN-1             | −11.2% (abstract) vs −11.1% (label) vs −12.35% (registry, on treatment) at the top dose                                                                 | Abstract                                  |
| REDEFINE 1           | −20.4% is both the treatment-policy mean on CagriSema and the trial-product difference from placebo                                                     | The treatment-policy mean                 |
| SELECT               | Median follow-up 41.8 months (label); the abstract gives a mean of 39.8 months                                                                          | Label                                     |

## Left out

- **Press-release-only results** (TRIUMPH-3 and -4, the monotherapy arms of REDEFINE 1, the
  efficacy-estimand headline figures for retatrutide and survodutide).
- **Adverse-event rates from the registry** for cross-drug comparison: ClinicalTrials.gov counts
  non-serious events over each record's whole reporting window, which differs from the papers'
  tables. The tolerability chart uses the labels' pooled tables instead. The registry counts are
  used only within SURMOUNT-5, where both arms share one window.
- **STEP-HFpEF**, which has no hazard ratio as a primary result.

## Label versions

| Label    | DailyMed set ID                        | Version read          |
| -------- | -------------------------------------- | --------------------- |
| Mounjaro | `d2d7da5d-ad07-4228-955f-cf7e355c8cc0` | effective 2026-08-27  |
| Zepbound | `487cd7e7-434c-4925-99fa-aa80b1cc776b` | revised 08/2026       |
| Wegovy   | `ee06186f-2aa3-4990-a760-757579d8f77b` | revised 06/2026       |
| Saxenda  | `3946d389-0926-4f77-a708-0acb8153b143` | revised 02/2026       |
| Foundayo | `8ac446c5-feba-474f-a103-23facb9b5c62` | current on 2026-10-03 |

The Foundayo label reports doses of 5.5, 9 and 17.2 mg, described as equivalent to the 6, 12 and
36 mg of the investigational formulation used in ATTAIN-1. Its adverse-reaction table pools
ATTAIN-1 and ATTAIN-2.
