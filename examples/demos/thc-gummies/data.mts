/**
 * Study data for the THC gummies demo (`apps/docs/demos/thc-gummies.md`): how long ingested THC
 * lasts compared with smoked or vaporised THC. Every number was transcribed from a primary source
 * or, for the 1970s and 1980s papers that are not open, from the PubMed abstract or a named
 * open-access review that quotes it. `data/SOURCES.md` lists each source, what was read and the
 * caveats. Nothing was read off a figure or interpolated.
 *
 * Whole blood and plasma are not interchangeable: plasma THC runs roughly twice whole-blood THC,
 * so each constant says which matrix it holds.
 *
 * A `.mts` file, so the example registry does not treat it as an example.
 */

/** Where a value was read. */
export type Tier = 'full text' | 'abstract' | 'label' | 'secondary';

export interface Ref {
  /** Short citation, e.g. `Spindle 2021`. */
  short: string;
  /** Authors, journal, year, volume and pages. */
  cite: string;
  /** What the study was, in a phrase. */
  what: string;
  doi?: string;
  pmid?: string;
  /** The best source tier that was read for this paper. */
  tier: Tier;
}

const ref = (
  short: string,
  cite: string,
  what: string,
  tier: Tier,
  doi?: string,
  pmid?: string,
): Ref => ({ short, cite, what, tier, ...(doi ? { doi } : {}), ...(pmid ? { pmid } : {}) });

export const REFS = {
  spindle2021: ref(
    'Spindle 2021',
    'Spindle TR, Martin EL, Grabenauer M, et al. J Psychopharmacol 2021;35(7):786-803.',
    'Crossover of cannabis brownies (10, 25 mg THC) and vaporised cannabis (5, 20 mg) in 20 infrequent users, assessed hourly for 8 hours',
    'full text',
    '10.1177/02698811211021583',
    '34049452',
  ),
  spindle2018: ref(
    'Spindle 2018',
    'Spindle TR, Cone EJ, Schlienz NJ, et al. JAMA Netw Open 2018;1(7):e184841.',
    'Crossover of smoked and vaporised cannabis (10, 25 mg THC) in 17 infrequent users',
    'full text',
    '10.1001/jamanetworkopen.2018.4841',
    '30646391',
  ),
  schlienz2020: ref(
    'Schlienz 2020',
    'Schlienz NJ, Spindle TR, Cone EJ, et al. Drug Alcohol Depend 2020;211:107969.',
    'Crossover of cannabis brownies (10, 25, 50 mg THC) in 17 infrequent users',
    'full text',
    '10.1016/j.drugalcdep.2020.107969',
    '32298998',
  ),
  zamarripa2023: ref(
    'Zamarripa 2023',
    'Zamarripa CA, Spindle TR, Surujunarain R, et al. JAMA Netw Open 2023;6(2):e2254752.',
    'Crossover of brownies with 20 mg THC, with and without 640 mg CBD, in 18 adults; plasma for 12 hours',
    'full text',
    '10.1001/jamanetworkopen.2022.54752',
    '36780161',
  ),
  zamarripa2026: ref(
    'Zamarripa 2026',
    'Zamarripa CA, Lin S, Klausner M, et al. JAMA Netw Open 2026;9:e269842.',
    'Crossover of brownies (10, 25 mg THC) with and without alcohol in 25 adults',
    'full text',
    '10.1001/jamanetworkopen.2026.9842',
    '42065887',
  ),
  ewell2021: ref(
    'Ewell 2021',
    'Ewell TR, Abbotts KSS, Williams NNB, et al. Pharmaceuticals (Basel) 2021;14(8):817.',
    'Crossover of five commercial 10 mg THC edibles in 7 regular users, fasted; plasma for 4 hours',
    'full text',
    '10.3390/ph14080817',
    '34451914',
  ),
  oh2017: ref(
    'Oh 2017',
    'Oh DA, Parikh N, Khurana V, Cognata Smith C, Vetticaden S. Clin Pharmacol 2017;9:9-17.',
    'Dronabinol 5 mg capsule fasted and after a high-fat meal, 54 healthy volunteers',
    'full text',
    '10.2147/CPAA.S119676',
    '28138268',
  ),
  swortwood2017: ref(
    'Swortwood 2017',
    'Swortwood MJ, Newmeyer MN, Andersson M, et al. Drug Test Anal 2017;9(6):905-915.',
    'Oral fluid after about 50.6 mg THC eaten, smoked and vaporised by the same 11 frequent and 9 occasional users',
    'full text',
    '10.1002/dta.2092',
    '27647820',
  ),
  vandrey2017: ref(
    'Vandrey 2017',
    'Vandrey R, Herrmann ES, Mitchell JM, et al. J Anal Toxicol 2017;41(2):83-99.',
    'Cannabis brownies (10, 25, 50 mg THC), 6 adults per dose; blood and oral fluid for 9 days',
    'abstract',
    '10.1093/jat/bkx012',
    '28158482',
  ),
  schlienz2018: ref(
    'Schlienz 2018',
    'Schlienz NJ, Cone EJ, Herrmann ES, et al. J Anal Toxicol 2018;42(4):232-247.',
    'Urine after the Vandrey 2017 brownies, collected for 9 days',
    'full text',
    '10.1093/jat/bkx102',
    '29300962',
  ),
  newmeyer2017: ref(
    'Newmeyer 2017',
    'Newmeyer MN, Swortwood MJ, Abulseoud OA, Huestis MA. Drug Alcohol Depend 2017;175:67-76.',
    'Subjective and physiological effects of about 50 mg THC smoked, vaporised and eaten by frequent and occasional users',
    'abstract',
    '10.1016/j.drugalcdep.2017.02.003',
    '28407543',
  ),
  conner2026: ref(
    'Conner 2026',
    'Conner BT, Smith EE, DiCecco SM, et al. Cannabis Cannabinoid Res 2026;11(5):385-395.',
    'Fast-acting (microencapsulated) edible against a standard edible in 20 participants; two authors work for edible makers',
    'abstract',
    '10.1177/25785125261441366',
    '41958200',
  ),
  mccartney2021: ref(
    'McCartney 2021',
    'McCartney D, Arkell TR, Irwin C, McGregor IS. Neurosci Biobehav Rev 2021;126:175-193.',
    'Meta-regression of 80 studies of THC and driving-related cognitive skills',
    'abstract',
    '10.1016/j.neubiorev.2021.01.003',
    '33497784',
  ),
  ohlsson1980: ref(
    'Ohlsson 1980',
    'Ohlsson A, Lindgren JE, Wahlen A, Agurell S, Hollister LE, Gillespie HK. Clin Pharmacol Ther 1980;28(3):409-16.',
    'Plasma THC after 5 mg intravenously, a 19 mg cigarette and a 20 mg cookie in 11 men',
    'abstract',
    '10.1038/clpt.1980.181',
    '6250760',
  ),
  lindgren1981: ref(
    'Lindgren 1981',
    'Lindgren JE, Ohlsson A, Agurell S, Hollister L, Gillespie H. Psychopharmacology (Berl) 1981;74(3):208-12.',
    'Intravenous and smoked THC in heavy and light users',
    'abstract',
    '10.1007/BF00427095',
    '6267648',
  ),
  ohlsson1982: ref(
    'Ohlsson 1982',
    'Ohlsson A, Lindgren JE, Wahlen A, Agurell S, Hollister LE, Gillespie HK. Biomed Mass Spectrom 1982;9(1):6-10.',
    'Deuterium-labelled THC, intravenous and smoked, in 5 heavy and 4 light users; sampled 48 to 72 hours',
    'abstract',
    '10.1002/bms.1200090103',
    '6277407',
  ),
  wall1983: ref(
    'Wall 1983',
    'Wall ME, Sadler BM, Brine D, Taylor H, Perez-Reyes M. Clin Pharmacol Ther 1983;34(3):352-63.',
    'Intravenous and oral THC in 6 men and 6 women; excretion followed for 72 hours',
    'abstract',
    '10.1038/clpt.1983.179',
    '6309462',
  ),
  lemberger1971: ref(
    'Lemberger 1971',
    'Lemberger L, Tamarkin NR, Axelrod J, Kopin IJ. Science 1971;173(3991):72-4.',
    'Intravenous radiolabelled THC in chronic smokers and non-users',
    'abstract',
    '10.1126/science.173.3991.72',
    '5087483',
  ),
  hunt1980: ref(
    'Hunt 1980',
    'Hunt CA, Jones RT. J Pharmacol Exp Ther 1980;215(1):35-44.',
    'Intravenous radiolabelled THC in 6 men before and after chronic oral dosing',
    'secondary',
    undefined,
    '6256518',
  ),
  johansson1988: ref(
    'Johansson 1988',
    'Johansson E, Agurell S, Hollister LE, Halldin MM. J Pharm Pharmacol 1988;40(5):374-5.',
    'Smoked deuterium-labelled THC in chronic users; plasma for 13 days',
    'abstract',
    '10.1111/j.2042-7158.1988.tb05272.x',
    '2899638',
  ),
  johansson1989: ref(
    'Johansson 1989',
    'Johansson E, Halldin MM, Agurell S, Hollister LE, Gillespie HK. Eur J Clin Pharmacol 1989;37(3):273-7.',
    'Smoked labelled THC in 8 heavy users; plasma for 10 to 15 days, 4 weeks in two',
    'abstract',
    '10.1007/BF00679783',
    '2558889',
  ),
  johansson1989u: ref(
    'Johansson 1989b',
    'Johansson E, Halldin MM. J Anal Toxicol 1989;13(4):218-23.',
    'Urinary THC-COOH in 13 heavy users over 4 weeks of abstinence',
    'abstract',
    '10.1093/jat/13.4.218',
    '2550702',
  ),
  johansson1990: ref(
    'Johansson 1990',
    'Johansson E, Gillespie HK, Halldin MM. J Anal Toxicol 1990;14(3):176-80.',
    'Urinary metabolites after smoked and oral radiolabelled THC; 5-day collection',
    'abstract',
    '10.1093/jat/14.3.176',
    '2165199',
  ),
  huestis1996: ref(
    'Huestis 1996',
    'Huestis MA, Mitchell JM, Cone EJ. J Anal Toxicol 1996;20(6):441-52.',
    'Urine after one 1.75% or 3.55% THC cigarette in 6 men',
    'abstract',
    '10.1093/jat/20.6.441',
    '8889681',
  ),
  huestis1998: ref(
    'Huestis 1998',
    'Huestis MA, Cone EJ. Ther Drug Monit 1998;20(5):570-6.',
    'Urinary THC-COOH excretion half-life in the same 6 men',
    'abstract',
    '10.1097/00007691-199810000-00021',
    '9780137',
  ),
  gustafson2004: ref(
    'Gustafson 2004',
    'Gustafson RA, et al. J Anal Toxicol 2004;28(3):160-7.',
    'Urinary THC-COOH after oral THC three times a day for 5 days in 7 volunteers',
    'abstract',
    '10.1093/jat/28.3.160',
    '15107145',
  ),
  smithkielland1999: ref(
    'Smith-Kielland 1999',
    'Smith-Kielland A, Skuterud B, Morland J. J Anal Toxicol 1999;23(5):323-32.',
    'Urinary cannabinoids in frequent and infrequent users after stopping',
    'abstract',
    '10.1093/jat/23.5.323',
    '10488918',
  ),
  goodwin2008: ref(
    'Goodwin 2008',
    'Goodwin RS, et al. J Anal Toxicol 2008;32(8):562-9.',
    'Urine from 60 regular smokers during up to 30 days of monitored abstinence',
    'full text',
    '10.1093/jat/32.8.562',
    '19007504',
  ),
  bergamaschi2013: ref(
    'Bergamaschi 2013',
    'Bergamaschi MM, et al. Clin Chem 2013;59(3):519-26.',
    'Daily whole blood from 30 male daily smokers during up to 33 days of monitored abstinence',
    'full text',
    '10.1373/clinchem.2012.195503',
    '23449702',
  ),
  perezreyes1990: ref(
    'Perez-Reyes 1990',
    'Perez-Reyes M. NIDA Res Monogr 1990;99:42-62.',
    'Peak plasma THC after smoking cigarettes of nine potencies',
    'full text',
    undefined,
    '2176276',
  ),
  johansson1989fat: ref(
    'Johansson 1989c',
    'Johansson E, et al. Biomed Chromatogr 1989;3(1):35-8.',
    'THC in fat biopsies from heavy users, before and 4 weeks after smoking',
    'abstract',
    '10.1002/bmc.1130030109',
    '2539872',
  ),
  syndros: ref(
    'Syndros label',
    'Syndros (dronabinol) oral solution: US prescribing information, DailyMed set ID a7801c70-995d-46a2-91ee-141ef427c6b5, version of 2026-04-27.',
    'Single 4.2 mg oral dose, fasted',
    'label',
  ),
  marinol: ref(
    'Marinol label',
    'Marinol (dronabinol) capsules: US prescribing information, DailyMed set ID d0efeeec-640d-43c3-8f0a-d31324a11c68, version of 2023-02-15.',
    'Oral dronabinol capsules',
    'label',
  ),
  poyatos2020: ref(
    'Poyatos 2020',
    'Poyatos L, et al. Medicina (Kaunas) 2020;56(6):309.',
    'Open-access review whose tables quote peak concentrations from Ohlsson 1980 and Wall 1983',
    'full text',
    '10.3390/medicina56060309',
    '32585912',
  ),
  chiang1987: ref(
    'Chiang 1987',
    'Chiang CN, Rapaka RS. NIDA Res Monogr 1987;79:173-88.',
    'Review that quotes the half-life from Hunt and Jones 1980',
    'full text',
    undefined,
    '2830536',
  ),
} as const satisfies Record<string, Ref>;

export type Route = 'oral' | 'smoked' | 'vaporised' | 'iv';

/** One color per route across every chart. */
export const ROUTE_COLOR: Record<Route, string> = {
  oral: '#cc540a',
  smoked: '#9962c0',
  vaporised: '#5e74d5',
  iv: '#80838f',
};

export const ROUTE_NAME: Record<Route, string> = {
  oral: 'Eaten',
  smoked: 'Smoked',
  vaporised: 'Vaporised',
  iv: 'Intravenous',
};

// ------------------------------------------------------------------------------------------
// How long you feel it
// ------------------------------------------------------------------------------------------

export interface EffectWindow {
  outcome: string;
  route: Route;
  doseMg: number;
  /** First and last hourly assessment at which the outcome differed significantly from baseline. */
  hours: readonly [first: number, last: number];
}

/**
 * Spindle 2021: assessments immediately after dosing (hour 0) and at 1, 2, 3, 4, 5, 6 and 8 hours.
 * Each window is the run of assessments at which the outcome differed significantly from baseline.
 * The 10 mg brownie and the 5 mg vaporised dose did not impair performance on any task.
 */
export const EFFECT_WINDOWS: readonly EffectWindow[] = [
  { outcome: 'Feels a drug effect', route: 'oral', doseMg: 10, hours: [1, 4] },
  { outcome: 'Feels a drug effect', route: 'oral', doseMg: 25, hours: [1, 6] },
  { outcome: 'Feels a drug effect', route: 'vaporised', doseMg: 5, hours: [0, 3] },
  { outcome: 'Feels a drug effect', route: 'vaporised', doseMg: 20, hours: [0, 5] },
  { outcome: 'Impaired on the DRUID test', route: 'oral', doseMg: 25, hours: [2, 5] },
  { outcome: 'Impaired on the DRUID test', route: 'vaporised', doseMg: 20, hours: [0, 1] },
  { outcome: 'Reports trouble with memory', route: 'oral', doseMg: 25, hours: [2, 3] },
  { outcome: 'Reports trouble with memory', route: 'vaporised', doseMg: 20, hours: [0, 4] },
];
/** The hours at which Spindle 2021 assessed participants. */
export const ASSESSMENT_HOURS = [0, 1, 2, 3, 4, 5, 6, 8] as const;

export interface Peak {
  ref: Ref;
  route: Route;
  doseMg: number;
  /** Mean peak THC in whole blood, ng/mL. */
  peak: number;
  /** Hours after dosing; 0 is the first sample, immediately after dosing. */
  atHours: number;
  note?: string;
}

/**
 * Peak THC in whole blood and when it occurred. Spindle 2018 sampled first at 10 minutes; Spindle
 * 2021's values are the mean at the group's peak time point (no blood at hour 0 after brownies);
 * Zamarripa 2026's are mean individual Cmax and Tmax.
 */
export const PEAKS: readonly Peak[] = [
  { ref: REFS.spindle2018, route: 'smoked', doseMg: 10, peak: 3.8, atHours: 0.17 },
  { ref: REFS.spindle2018, route: 'smoked', doseMg: 25, peak: 10.2, atHours: 0.17 },
  { ref: REFS.spindle2018, route: 'vaporised', doseMg: 10, peak: 7.5, atHours: 0.17 },
  { ref: REFS.spindle2018, route: 'vaporised', doseMg: 25, peak: 14.4, atHours: 0.17 },
  { ref: REFS.spindle2021, route: 'vaporised', doseMg: 5, peak: 9.19, atHours: 0 },
  { ref: REFS.spindle2021, route: 'vaporised', doseMg: 20, peak: 37.24, atHours: 0 },
  { ref: REFS.spindle2021, route: 'oral', doseMg: 10, peak: 1.78, atHours: 2 },
  { ref: REFS.spindle2021, route: 'oral', doseMg: 25, peak: 3.06, atHours: 2 },
  { ref: REFS.zamarripa2026, route: 'oral', doseMg: 10, peak: 0.67, atHours: 2.66 },
  { ref: REFS.zamarripa2026, route: 'oral', doseMg: 25, peak: 3.21, atHours: 2.44 },
];

export interface DoseResponse {
  ref: Ref;
  route: Route;
  /** Dose in mg THC and mean peak rating of "drug effect" on a 0 to 100 scale. */
  points: readonly (readonly [doseMg: number, rating: number])[];
}

/**
 * Peak "drug effect" ratings (0 to 100 visual analogue scale, mean change from baseline) by dose.
 * Standard deviations are large (20 to 37 points) and are left to the source notes.
 */
export const DOSE_RESPONSE: readonly DoseResponse[] = [
  {
    ref: REFS.spindle2018,
    route: 'vaporised',
    points: [
      [10, 69.5],
      [25, 77.5],
    ],
  },
  {
    ref: REFS.spindle2021,
    route: 'vaporised',
    points: [
      [5, 58.2],
      [20, 84.1],
    ],
  },
  {
    ref: REFS.spindle2018,
    route: 'smoked',
    points: [
      [10, 45.7],
      [25, 66.4],
    ],
  },
  {
    ref: REFS.spindle2021,
    route: 'oral',
    points: [
      [10, 36.9],
      [25, 59.5],
    ],
  },
  {
    ref: REFS.zamarripa2026,
    route: 'oral',
    points: [
      [10, 23.5],
      [25, 50.8],
    ],
  },
  {
    ref: REFS.schlienz2020,
    route: 'oral',
    points: [
      [10, 18.0],
      [25, 38.3],
      [50, 47.5],
    ],
  },
  { ref: REFS.zamarripa2023, route: 'oral', points: [[20, 59.2]] },
];

// ------------------------------------------------------------------------------------------
// Absorption
// ------------------------------------------------------------------------------------------

export interface Bioavailability {
  label: string;
  route: Route;
  ref: Ref;
  /** Mean, %, when one was reported. */
  mean?: number;
  /** Plus or minus, as printed in the abstract (a standard deviation). */
  sd?: number;
  /** A reported range, %, when no mean was. */
  range?: readonly [number, number];
}

/** Share of the THC dose that reaches the bloodstream, against an intravenous reference. */
export const BIOAVAILABILITY: readonly Bioavailability[] = [
  { label: 'Smoked, heavy users', route: 'smoked', ref: REFS.ohlsson1982, mean: 27, sd: 10 },
  { label: 'Smoked, heavy users', route: 'smoked', ref: REFS.lindgren1981, mean: 23, sd: 16 },
  { label: 'Smoked, mixed users', route: 'smoked', ref: REFS.ohlsson1980, mean: 18, sd: 6 },
  { label: 'Smoked, light users', route: 'smoked', ref: REFS.ohlsson1982, mean: 14, sd: 1 },
  { label: 'Smoked, light users', route: 'smoked', ref: REFS.lindgren1981, mean: 10, sd: 7 },
  { label: 'Eaten, capsule', route: 'oral', ref: REFS.wall1983, range: [10, 20] },
  { label: 'Eaten, 20 mg cookie', route: 'oral', ref: REFS.ohlsson1980, mean: 6, sd: 3 },
];

export interface MetabolitePair {
  label: string;
  route: Route;
  ref: Ref;
  matrix: 'plasma' | 'whole blood';
  /** Mean peak THC and 11-OH-THC, ng/mL. */
  thc: number;
  oh: number;
  tier: Tier;
}

/**
 * Peak THC against peak 11-OH-THC, the active metabolite the liver makes on first pass. The Wall
 * 1983 values are quoted from Poyatos 2020, which notes they are the maxima of the mean curves.
 */
export const METABOLITE: readonly MetabolitePair[] = [
  {
    label: 'Dronabinol 5 mg, fasted',
    route: 'oral',
    ref: REFS.oh2017,
    matrix: 'plasma',
    thc: 2.19,
    oh: 3.12,
    tier: 'full text',
  },
  {
    label: 'Gummy 10 mg (Wana Sour)',
    route: 'oral',
    ref: REFS.ewell2021,
    matrix: 'plasma',
    thc: 3.22,
    oh: 4.45,
    tier: 'full text',
  },
  {
    label: 'Gummy 10 mg (Ripple)',
    route: 'oral',
    ref: REFS.ewell2021,
    matrix: 'plasma',
    thc: 5.54,
    oh: 6.6,
    tier: 'full text',
  },
  {
    label: 'Brownie 20 mg',
    route: 'oral',
    ref: REFS.zamarripa2023,
    matrix: 'plasma',
    thc: 8.2,
    oh: 4.5,
    tier: 'full text',
  },
  {
    label: 'Brownie 10 mg',
    route: 'oral',
    ref: REFS.zamarripa2026,
    matrix: 'whole blood',
    thc: 0.67,
    oh: 0.86,
    tier: 'full text',
  },
  {
    label: 'Brownie 25 mg',
    route: 'oral',
    ref: REFS.zamarripa2026,
    matrix: 'whole blood',
    thc: 3.21,
    oh: 2.9,
    tier: 'full text',
  },
  {
    label: 'Capsule 20 mg, men',
    route: 'oral',
    ref: REFS.wall1983,
    matrix: 'plasma',
    thc: 14,
    oh: 6.6,
    tier: 'secondary',
  },
  {
    label: 'Capsule 15 mg, women',
    route: 'oral',
    ref: REFS.wall1983,
    matrix: 'plasma',
    thc: 9.4,
    oh: 5.9,
    tier: 'secondary',
  },
  {
    label: 'Intravenous 4 mg, men',
    route: 'iv',
    ref: REFS.wall1983,
    matrix: 'plasma',
    thc: 71,
    oh: 3.7,
    tier: 'secondary',
  },
  {
    label: 'Intravenous 2.2 mg, women',
    route: 'iv',
    ref: REFS.wall1983,
    matrix: 'plasma',
    thc: 85,
    oh: 3.8,
    tier: 'secondary',
  },
];

/**
 * Ewell 2021: five commercial 10 mg THC edibles in 7 fasted regular users, plasma sampled from 10
 * to 240 minutes. Mean and SD of the time to peak (minutes) and of peak THC (ng/mL).
 */
export const GUMMIES: readonly {
  product: string;
  kind: string;
  tmax: readonly [mean: number, sd: number];
  cmax: readonly [mean: number, sd: number];
}[] = [
  { product: 'Ripple Gummies', kind: 'gummy', tmax: [35.7, 12.1], cmax: [5.54, 3.1] },
  { product: 'Ripple Pure 10', kind: 'other edible', tmax: [40.7, 11.3], cmax: [4.31, 3.01] },
  { product: 'Wana Fast Acting', kind: 'gummy', tmax: [51.4, 31.1], cmax: [4.39, 2.91] },
  { product: 'Wana Sour Gummies', kind: 'gummy', tmax: [62.1, 53.0], cmax: [3.22, 2.04] },
  { product: 'Ripple Quick Sticks', kind: 'other edible', tmax: [90.7, 84.6], cmax: [4.56, 1.8] },
];

/**
 * Oh 2017: dronabinol 5 mg capsule fasted (n = 53) and after a high-fat, high-calorie meal
 * (n = 54), plasma THC, mean and SD.
 */
export const FOOD = {
  measures: [
    { name: 'Lag before THC appears', unit: 'hours', fasted: [0.52, 0.55], fed: [2.02, 1.42] },
    { name: 'Time to peak', unit: 'hours', fasted: [1.73, 1.74], fed: [5.59, 3.24] },
    { name: 'Peak THC', unit: 'ng/mL', fasted: [2.19, 1.06], fed: [2.6, 1.74] },
    { name: 'Total exposure (AUC)', unit: 'h·ng/mL', fasted: [4.44, 2.67], fed: [10.47, 4.85] },
  ],
} as const;

// ------------------------------------------------------------------------------------------
// Elimination
// ------------------------------------------------------------------------------------------

export interface HalfLife {
  label: string;
  group: 'THC in plasma' | 'THC-COOH in urine';
  route: Route | 'mixed';
  ref: Ref;
  /** Half-life in hours: a mean or single reported value. */
  hours?: number;
  /** A reported range in hours (of individuals or of group means). */
  range?: readonly [number, number];
  /** How long the study kept sampling. */
  sampling: string;
  tier: Tier;
  note?: string;
}

/**
 * Reported elimination half-lives, converted to hours. The estimate depends on how long the study
 * sampled: THC is released slowly from fat, and that slowest phase only shows once plasma has been
 * followed for days with an assay sensitive enough to see it.
 */
export const HALF_LIVES: readonly HalfLife[] = [
  {
    label: 'Gummies 10 mg',
    group: 'THC in plasma',
    route: 'oral',
    ref: REFS.ewell2021,
    range: [2.54, 4.47],
    sampling: '4 hours',
    tier: 'full text',
    note: 'range of five product means, 152 to 268 minutes',
  },
  {
    label: 'Dronabinol capsule 5 mg, fasted',
    group: 'THC in plasma',
    route: 'oral',
    ref: REFS.oh2017,
    hours: 4.82,
    sampling: 'not stated',
    tier: 'full text',
    note: 'SD 5.85 h',
  },
  {
    label: 'Dronabinol solution 4.2 mg',
    group: 'THC in plasma',
    route: 'oral',
    ref: REFS.syndros,
    hours: 5.6,
    sampling: 'not stated',
    tier: 'label',
    note: 'SD 2.7 h; the same label gives 25 to 36 h as the terminal half-life',
  },
  {
    label: 'Dronabinol capsule 5 mg, after a meal',
    group: 'THC in plasma',
    route: 'oral',
    ref: REFS.oh2017,
    hours: 10.41,
    sampling: 'not stated',
    tier: 'full text',
    note: 'SD 9.24 h',
  },
  {
    label: 'Intravenous',
    group: 'THC in plasma',
    route: 'iv',
    ref: REFS.hunt1980,
    hours: 19,
    sampling: 'not stated',
    tier: 'secondary',
    note: 'quoted by Chiang and Rapaka 1987',
  },
  {
    label: 'Intravenous, chronic smokers',
    group: 'THC in plasma',
    route: 'iv',
    ref: REFS.lemberger1971,
    hours: 28,
    sampling: 'excreta for over a week',
    tier: 'abstract',
    note: 'radiolabel assay',
  },
  {
    label: 'Intravenous and oral',
    group: 'THC in plasma',
    route: 'mixed',
    ref: REFS.wall1983,
    range: [25, 36],
    sampling: '72 hours',
    tier: 'abstract',
    note: 'the same range after either route',
  },
  {
    label: 'Intravenous, non-users',
    group: 'THC in plasma',
    route: 'iv',
    ref: REFS.lemberger1971,
    hours: 57,
    sampling: 'excreta for over a week',
    tier: 'abstract',
    note: 'radiolabel assay',
  },
  {
    label: 'Smoked, chronic users',
    group: 'THC in plasma',
    route: 'smoked',
    ref: REFS.johansson1988,
    hours: 98.4,
    range: [69.6, 120],
    sampling: '13 days',
    tier: 'abstract',
    note: '4.1 days, range 2.9 to 5.0',
  },
  {
    label: 'Smoked, heavy users',
    group: 'THC in plasma',
    route: 'smoked',
    ref: REFS.johansson1989,
    hours: 103.2,
    sampling: '10 to 15 days',
    tier: 'abstract',
    note: '4.3 days',
  },
  {
    label: 'Smoked, two heavy users',
    group: 'THC in plasma',
    route: 'smoked',
    ref: REFS.johansson1989,
    range: [230.4, 302.4],
    sampling: '4 weeks',
    tier: 'abstract',
    note: '9.6 and 12.6 days',
  },
  {
    label: 'Smoked and oral, labelled metabolites',
    group: 'THC-COOH in urine',
    route: 'mixed',
    ref: REFS.johansson1990,
    hours: 18.2,
    sampling: '5 days',
    tier: 'abstract',
    note: 'SD 4.9 h',
  },
  {
    label: 'One cigarette',
    group: 'THC-COOH in urine',
    route: 'smoked',
    ref: REFS.huestis1998,
    range: [28.6, 31.5],
    sampling: '7 days',
    tier: 'abstract',
    note: 'means for the 3.55% and 1.75% cigarettes',
  },
  {
    label: 'One cigarette',
    group: 'THC-COOH in urine',
    route: 'smoked',
    ref: REFS.huestis1998,
    range: [44.3, 59.9],
    sampling: '14 days',
    tier: 'abstract',
  },
  {
    label: 'Oral THC for 5 days',
    group: 'THC-COOH in urine',
    route: 'oral',
    ref: REFS.gustafson2004,
    range: [44.2, 64.0],
    sampling: 'not stated',
    tier: 'abstract',
    note: 'range of four dose means',
  },
  {
    label: 'Heavy users, after stopping',
    group: 'THC-COOH in urine',
    route: 'smoked',
    ref: REFS.johansson1989u,
    hours: 72,
    range: [19.2, 235.2],
    sampling: 'up to 25 days',
    tier: 'abstract',
    note: '3.0 days, range 0.8 to 9.8',
  },
];

/**
 * Bergamaschi 2013, Table 2: whole blood from 30 male daily cannabis smokers on each day of
 * monitored abstinence. Day 0 is admission. `n` is how many were still resident; `thcPct` and
 * `coohPct` are the share of them with THC and THC-COOH at or above the quantification limit
 * (0.25 µg/L); `thcMedian` is the median THC of the positives, µg/L.
 */
export const ABSTINENCE: readonly {
  day: number;
  n: number;
  thcPct: number;
  thcMedian: number | null;
  coohPct: number;
}[] = [
  [0, 30, 90.0, 1.4, 96.7],
  [1, 22, 68.2, 1.8, 100.0],
  [2, 30, 80.0, 1.2, 100.0],
  [3, 28, 78.6, 1.3, 100.0],
  [4, 28, 78.6, 1.1, 100.0],
  [5, 26, 76.9, 1.0, 100.0],
  [6, 25, 72.0, 1.0, 100.0],
  [7, 24, 79.2, 0.9, 100.0],
  [8, 23, 65.2, 0.8, 95.7],
  [9, 21, 61.9, 0.7, 95.2],
  [10, 21, 61.9, 0.5, 95.2],
  [11, 21, 71.4, 0.5, 95.2],
  [12, 20, 65.0, 0.5, 95.0],
  [13, 20, 55.0, 0.4, 90.0],
  [14, 20, 60.0, 0.4, 85.0],
  [15, 18, 72.2, 0.4, 94.4],
  [16, 18, 44.4, 0.3, 94.4],
  [17, 17, 47.1, 0.5, 94.1],
  [18, 16, 43.8, 0.4, 87.5],
  [19, 14, 42.9, 0.4, 85.7],
  [20, 15, 40.0, 0.3, 86.7],
  [21, 14, 42.9, 0.4, 85.7],
  [22, 14, 21.4, 0.4, 85.7],
  [23, 13, 23.1, 0.4, 84.6],
  [24, 12, 25.0, 0.4, 83.3],
  [25, 12, 8.3, 0.3, 91.7],
  [26, 11, 9.1, 0.4, 81.8],
  [27, 10, 0.0, null, 70.0],
  [28, 11, 0.0, null, 90.9],
  [29, 8, 0.0, null, 75.0],
  [30, 5, 40.0, 0.3, 80.0],
].map(([day, n, thcPct, thcMedian, coohPct]) => ({
  day: day as number,
  n: n as number,
  thcPct: thcPct as number,
  thcMedian: thcMedian as number | null,
  coohPct: coohPct as number,
}));

export interface Detection {
  label: string;
  who: string;
  matrix: 'Urine' | 'Oral fluid' | 'Blood';
  route: Route | 'prior use';
  ref: Ref;
  /** Mean time of the last positive result, hours. */
  mean?: number;
  /** Range of individual last-positive times, hours. */
  range?: readonly [number, number];
  /** The longest time observed, hours, when no mean was reported. */
  longest?: number;
  cutoff: string;
  note?: string;
}

/**
 * How long a test stays positive. Times are hours after the dose, or after admission for people
 * who stopped regular use. Ranges ending at 54 or 72 hours were still positive when collection
 * stopped.
 */
export const DETECTION: readonly Detection[] = [
  {
    label: 'Blood THC, one edible',
    who: '10 to 50 mg, infrequent users',
    matrix: 'Blood',
    route: 'oral',
    ref: REFS.vandrey2017,
    longest: 22,
    cutoff: '0.5 ng/mL',
  },
  {
    label: 'Oral fluid, one edible',
    who: '50.6 mg, occasional users',
    matrix: 'Oral fluid',
    route: 'oral',
    ref: REFS.swortwood2017,
    mean: 24.7,
    range: [10, 54],
    cutoff: '0.2 µg/L',
    note: 'upper end censored at 54 h',
  },
  {
    label: 'Oral fluid, one cigarette',
    who: '50.6 mg, occasional users',
    matrix: 'Oral fluid',
    route: 'smoked',
    ref: REFS.swortwood2017,
    mean: 24.7,
    range: [8, 50],
    cutoff: '0.2 µg/L',
  },
  {
    label: 'Oral fluid, one edible',
    who: '50.6 mg, frequent users',
    matrix: 'Oral fluid',
    route: 'oral',
    ref: REFS.swortwood2017,
    mean: 55.0,
    range: [20, 72],
    cutoff: '0.2 µg/L',
    note: 'upper end censored at 72 h',
  },
  {
    label: 'Oral fluid, one cigarette',
    who: '50.6 mg, frequent users',
    matrix: 'Oral fluid',
    route: 'smoked',
    ref: REFS.swortwood2017,
    mean: 61.0,
    range: [32, 72],
    cutoff: '0.2 µg/L',
    note: 'upper end censored at 72 h',
  },
  {
    label: 'Urine, one cigarette',
    who: 'about 16 mg',
    matrix: 'Urine',
    route: 'smoked',
    ref: REFS.huestis1996,
    mean: 33.7,
    range: [24.5, 42.9],
    cutoff: '15 ng/mL THC-COOH',
    note: 'bar is the printed ± 9.2 h',
  },
  {
    label: 'Urine, one edible',
    who: '10 mg, no recent use',
    matrix: 'Urine',
    route: 'oral',
    ref: REFS.schlienz2018,
    mean: 44.7,
    range: [28, 72],
    cutoff: '15 ng/mL THC-COOH',
  },
  {
    label: 'Urine, one edible',
    who: '25 mg, no recent use',
    matrix: 'Urine',
    route: 'oral',
    ref: REFS.schlienz2018,
    mean: 52.0,
    range: [40, 64],
    cutoff: '15 ng/mL THC-COOH',
  },
  {
    label: 'Urine, one cigarette',
    who: 'about 34 mg',
    matrix: 'Urine',
    route: 'smoked',
    ref: REFS.huestis1996,
    mean: 88.6,
    range: [79.1, 98.1],
    cutoff: '15 ng/mL THC-COOH',
    note: 'bar is the printed ± 9.5 h',
  },
  {
    label: 'Urine, one edible',
    who: '50 mg, no recent use',
    matrix: 'Urine',
    route: 'oral',
    ref: REFS.schlienz2018,
    mean: 93.3,
    range: [24, 146],
    cutoff: '15 ng/mL THC-COOH',
    note: '2 of 6 still positive on day 7',
  },
  {
    label: 'Urine, regular smokers stopping',
    who: 'lowest starting level',
    matrix: 'Urine',
    route: 'prior use',
    ref: REFS.goodwin2008,
    mean: 110.4,
    longest: 523.2,
    cutoff: '50 ng/mL immunoassay',
    note: 'mean 4.6 days, longest 21.8 days',
  },
  {
    label: 'Urine, regular smokers stopping',
    who: 'middle starting level',
    matrix: 'Urine',
    route: 'prior use',
    ref: REFS.goodwin2008,
    mean: 232.8,
    longest: 607.2,
    cutoff: '50 ng/mL immunoassay',
    note: 'mean 9.7 days, longest 25.3 days',
  },
  {
    label: 'Urine, regular smokers stopping',
    who: 'highest starting level',
    matrix: 'Urine',
    route: 'prior use',
    ref: REFS.goodwin2008,
    mean: 369.6,
    longest: 715.2,
    cutoff: '50 ng/mL immunoassay',
    note: 'mean 15.4 days, longest 29.8 days (the end of observation)',
  },
  {
    label: 'Blood THC, daily smokers stopping',
    who: '2 of 5 still positive',
    matrix: 'Blood',
    route: 'prior use',
    ref: REFS.bergamaschi2013,
    longest: 720,
    cutoff: '0.25 µg/L',
    note: 'day 30',
  },
];

/**
 * Perez-Reyes 1990: peak plasma THC after smoking one cigarette, by potency, from the table
 * printed with the chapter's Figure 1. Each row is a separate group of occasional users.
 * `pm` is the plus-or-minus printed with the mean (its type is not stated; other tables in the
 * chapter use standard errors).
 */
export const SMOKED_PEAKS: readonly {
  potencyPct: number;
  n: number;
  peak: number;
  pm: number;
  range: readonly [number, number];
}[] = [
  { potencyPct: 1.0, n: 6, peak: 90.4, pm: 20.2, range: [45.6, 187.8] },
  { potencyPct: 1.3, n: 4, peak: 71.3, pm: 18.4, range: [18.7, 99.6] },
  { potencyPct: 1.32, n: 6, peak: 100.0, pm: 10.1, range: [62.8, 125.3] },
  { potencyPct: 1.97, n: 6, peak: 119.8, pm: 10.6, range: [44.5, 180.9] },
  { potencyPct: 2.4, n: 18, peak: 63.0, pm: 8.6, range: [11.7, 137.0] },
  { potencyPct: 2.4, n: 6, peak: 119.0, pm: 23.0, range: [81.0, 203.0] },
  { potencyPct: 2.54, n: 6, peak: 162.6, pm: 18.7, range: [107.4, 204.7] },
  { potencyPct: 4.6, n: 4, peak: 146.3, pm: 33.1, range: [65.7, 227.6] },
  { potencyPct: 4.84, n: 12, peak: 124.2, pm: 16.2, range: [44.8, 218.0] },
];

/** `36 h` below two days, `4.1 d` above. */
export const fmtDuration = (hours: number): string =>
  hours < 48 ? `${Number(hours.toFixed(1))} h` : `${Number((hours / 24).toFixed(1))} d`;
