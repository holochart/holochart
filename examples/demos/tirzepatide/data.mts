/**
 * Trial data for the tirzepatide review demo (`apps/docs/demos/tirzepatide.md`). Every number was
 * transcribed from a primary source: the paper's full text or abstract, the trial's
 * ClinicalTrials.gov results record, or the product's US prescribing information. `data/SOURCES.md`
 * lists each source, what was read (full text, abstract, registry, label) and the known
 * disagreements between them. Nothing here was read off a figure or interpolated.
 *
 * Two estimands appear in these trials. The treatment-regimen (treatment-policy) estimand is the
 * effect in everyone randomised, whether or not they stayed on the drug; the efficacy
 * (trial-product) estimand is the effect had everyone stayed on it. They differ by 1 to 3
 * percentage points of body weight. Each constant says which one it holds.
 *
 * A `.mts` file, so the example registry does not treat it as an example.
 */
import { LOOK } from './ui.mts';

/** Where a value was read. */
export type Tier = 'full text' | 'abstract' | 'registry' | 'label' | 'press release';

export interface Ref {
  /** Short citation, e.g. `Jastreboff 2022`. */
  short: string;
  cite: string;
  doi?: string;
  pmid?: string;
  /** The best source tier that was read for this paper. */
  tier: Tier;
}

const ref = (short: string, cite: string, tier: Tier, doi?: string, pmid?: string): Ref => ({
  short,
  cite,
  tier,
  ...(doi ? { doi } : {}),
  ...(pmid ? { pmid } : {}),
});

/** References, keyed by trial or topic. */
export const REFS = {
  coskun: ref(
    'Coskun 2018',
    'Coskun T, Sloop KW, Loghin C, et al. LY3298176, a novel dual GIP and GLP-1 receptor agonist for the treatment of type 2 diabetes mellitus: from discovery to clinical proof of concept. Mol Metab 2018;18:3-14.',
    'full text',
    '10.1016/j.molmet.2018.09.009',
    '30473097',
  ),
  willard: ref(
    'Willard 2020',
    'Willard FS, Douros JD, Gabe MB, et al. Tirzepatide is an imbalanced and biased dual GIP and GLP-1 receptor agonist. JCI Insight 2020;5(17):e140532.',
    'full text',
    '10.1172/jci.insight.140532',
    '32730231',
  ),
  surpass1: ref(
    'Rosenstock 2021',
    'Rosenstock J, Wysham C, Frías JP, et al. Efficacy and safety of a novel dual GIP and GLP-1 receptor agonist tirzepatide in patients with type 2 diabetes (SURPASS-1). Lancet 2021;398:143-155.',
    'abstract',
    '10.1016/S0140-6736(21)01324-6',
    '34186022',
  ),
  surpass2: ref(
    'Frías 2021',
    'Frías JP, Davies MJ, Rosenstock J, et al. Tirzepatide versus semaglutide once weekly in patients with type 2 diabetes (SURPASS-2). N Engl J Med 2021;385:503-515.',
    'full text',
    '10.1056/NEJMoa2107519',
    '34170647',
  ),
  surpass3: ref(
    'Ludvik 2021',
    'Ludvik B, Giorgino F, Jódar E, et al. Once-weekly tirzepatide versus once-daily insulin degludec as add-on to metformin with or without SGLT2 inhibitors in patients with type 2 diabetes (SURPASS-3). Lancet 2021;398:583-598.',
    'abstract',
    '10.1016/S0140-6736(21)01443-4',
    '34370970',
  ),
  surpass4: ref(
    'Del Prato 2021',
    'Del Prato S, Kahn SE, Pavo I, et al. Tirzepatide versus insulin glargine in type 2 diabetes and increased cardiovascular risk (SURPASS-4). Lancet 2021;398:1811-1824.',
    'abstract',
    '10.1016/S0140-6736(21)02188-7',
    '34672967',
  ),
  surpass5: ref(
    'Dahl 2022',
    'Dahl D, Onishi Y, Norwood P, et al. Effect of subcutaneous tirzepatide vs placebo added to titrated insulin glargine on glycemic control in patients with type 2 diabetes (SURPASS-5). JAMA 2022;327:534-545.',
    'full text',
    '10.1001/jama.2022.0078',
    '35133415',
  ),
  surpassCvot: ref(
    'Nicholls 2025',
    'Nicholls SJ, Pavo I, Bhatt DL, et al. Cardiovascular outcomes with tirzepatide versus dulaglutide in type 2 diabetes (SURPASS-CVOT). N Engl J Med 2025;393:2409-2420.',
    'abstract',
    '10.1056/NEJMoa2505928',
    '41406444',
  ),
  surmount1: ref(
    'Jastreboff 2022',
    'Jastreboff AM, Aronne LJ, Ahmad NN, et al. Tirzepatide once weekly for the treatment of obesity (SURMOUNT-1). N Engl J Med 2022;387:205-216.',
    'abstract',
    '10.1056/NEJMoa2206038',
    '35658024',
  ),
  surmount1Ext: ref(
    'Jastreboff 2025',
    'Jastreboff AM, le Roux CW, Stefanski A, et al. Tirzepatide for obesity treatment and diabetes prevention (SURMOUNT-1, 176 weeks). N Engl J Med 2025;392:958-971.',
    'abstract',
    '10.1056/NEJMoa2410819',
    '39536238',
  ),
  surmount1Dxa: ref(
    'Look 2025',
    'Look M, Dunn JP, Kushner RF, et al. Body composition changes during weight reduction with tirzepatide in the SURMOUNT-1 study of adults with obesity or overweight. Diabetes Obes Metab 2025;27:2720-2729.',
    'full text',
    '10.1111/dom.16275',
    '39996356',
  ),
  surmount2: ref(
    'Garvey 2023',
    'Garvey WT, Frias JP, Jastreboff AM, et al. Tirzepatide once weekly for the treatment of obesity in people with type 2 diabetes (SURMOUNT-2). Lancet 2023;402:613-626.',
    'abstract',
    '10.1016/S0140-6736(23)01200-X',
    '37385275',
  ),
  surmount3: ref(
    'Wadden 2023',
    'Wadden TA, Chao AM, Machineni S, et al. Tirzepatide after intensive lifestyle intervention in adults with overweight or obesity (SURMOUNT-3). Nat Med 2023;29:2909-2918.',
    'full text',
    '10.1038/s41591-023-02597-w',
    '37840095',
  ),
  surmount4: ref(
    'Aronne 2024',
    'Aronne LJ, Sattar N, Horn DB, et al. Continued treatment with tirzepatide for maintenance of weight reduction in adults with obesity (SURMOUNT-4). JAMA 2024;331:38-48.',
    'full text',
    '10.1001/jama.2023.24945',
    '38078870',
  ),
  surmount5: ref(
    'Aronne 2025',
    'Aronne LJ, Horn DB, le Roux CW, et al. Tirzepatide as compared with semaglutide for the treatment of obesity (SURMOUNT-5). N Engl J Med 2025;393:26-36.',
    'abstract',
    '10.1056/NEJMoa2416394',
    '40353578',
  ),
  surmountOsa: ref(
    'Malhotra 2024',
    'Malhotra A, Grunstein RR, Fietze I, et al. Tirzepatide for the treatment of obstructive sleep apnea and obesity (SURMOUNT-OSA). N Engl J Med 2024;391:1193-1205.',
    'full text',
    '10.1056/NEJMoa2404881',
    '38912654',
  ),
  summit: ref(
    'Packer 2025',
    'Packer M, Zile MR, Kramer CM, et al. Tirzepatide for heart failure with preserved ejection fraction and obesity (SUMMIT). N Engl J Med 2025;392:427-437.',
    'abstract',
    '10.1056/NEJMoa2410027',
    '39555826',
  ),
  synergyNash: ref(
    'Loomba 2024',
    'Loomba R, Hartman ML, Lawitz EJ, et al. Tirzepatide for metabolic dysfunction-associated steatohepatitis with liver fibrosis (SYNERGY-NASH). N Engl J Med 2024;391:299-310.',
    'abstract',
    '10.1056/NEJMoa2401943',
    '38856224',
  ),
  scale: ref(
    'Pi-Sunyer 2015',
    'Pi-Sunyer X, Astrup A, Fujioka K, et al. A randomized, controlled trial of 3.0 mg of liraglutide in weight management (SCALE). N Engl J Med 2015;373:11-22.',
    'abstract',
    '10.1056/NEJMoa1411892',
    '26132939',
  ),
  step1: ref(
    'Wilding 2021',
    'Wilding JPH, Batterham RL, Calanna S, et al. Once-weekly semaglutide in adults with overweight or obesity (STEP 1). N Engl J Med 2021;384:989-1002.',
    'abstract',
    '10.1056/NEJMoa2032183',
    '33567185',
  ),
  step1Ext: ref(
    'Wilding 2022',
    'Wilding JPH, Batterham RL, Davies M, et al. Weight regain and cardiometabolic effects after withdrawal of semaglutide: the STEP 1 trial extension. Diabetes Obes Metab 2022;24:1553-1564.',
    'full text',
    '10.1111/dom.14725',
    '35441470',
  ),
  step1Dxa: ref(
    'Wilding 2021b',
    'Wilding J, Batterham R, Calanna S, et al. Impact of semaglutide on body composition in adults with overweight or obesity: exploratory analysis of the STEP 1 study. J Endocr Soc 2021;5(Suppl 1):A16-A17.',
    'abstract',
    '10.1210/jendso/bvab048.030',
  ),
  step4: ref(
    'Rubino 2021',
    'Rubino D, Abrahamsson N, Davies M, et al. Effect of continued weekly subcutaneous semaglutide vs placebo on weight loss maintenance in adults with overweight or obesity (STEP 4). JAMA 2021;325:1414-1425.',
    'abstract',
    '10.1001/jama.2021.3224',
    '33755728',
  ),
  oasis1: ref(
    'Knop 2023',
    'Knop FK, Aroda VR, do Vale RD, et al. Oral semaglutide 50 mg taken once per day in adults with overweight or obesity (OASIS 1). Lancet 2023;402:705-719.',
    'abstract',
    '10.1016/S0140-6736(23)01185-6',
    '37385278',
  ),
  attain1: ref(
    'Wharton 2025',
    'Wharton S, Aronne LJ, Stefanski A, et al. Orforglipron, an oral small-molecule GLP-1 receptor agonist for obesity treatment (ATTAIN-1). N Engl J Med 2025;393:1796-1806.',
    'abstract',
    '10.1056/NEJMoa2511774',
    '40960239',
  ),
  redefine1: ref(
    'Garvey 2025',
    'Garvey WT, Blüher M, Osorto Contreras CK, et al. Coadministered cagrilintide and semaglutide in adults with overweight or obesity (REDEFINE 1). N Engl J Med 2025;393:635-647.',
    'abstract',
    '10.1056/NEJMoa2502081',
    '40544433',
  ),
  synchronize1: ref(
    'le Roux 2026',
    'le Roux CW, Wharton S, Startseva E, et al. Survodutide once weekly for the treatment of adults with obesity (SYNCHRONIZE-1). N Engl J Med 2026;395:776-787.',
    'abstract',
    '10.1056/NEJMoa2600751',
    '42253238',
  ),
  triumph1: ref(
    'Jastreboff 2026',
    'Jastreboff AM, Kaplan LM, Davies MJ, et al. Retatrutide, a triple hormone receptor agonist, for treatment of obesity (TRIUMPH-1). N Engl J Med 2026; published online 29 September.',
    'abstract',
    '10.1056/NEJMoa2604169',
    '42814954',
  ),
  leader: ref(
    'Marso 2016a',
    'Marso SP, Daniels GH, Brown-Frandsen K, et al. Liraglutide and cardiovascular outcomes in type 2 diabetes (LEADER). N Engl J Med 2016;375:311-322.',
    'full text',
    '10.1056/NEJMoa1603827',
    '27295427',
  ),
  sustain6: ref(
    'Marso 2016b',
    'Marso SP, Bain SC, Consoli A, et al. Semaglutide and cardiovascular outcomes in patients with type 2 diabetes (SUSTAIN-6). N Engl J Med 2016;375:1834-1844.',
    'abstract',
    '10.1056/NEJMoa1607141',
    '27633186',
  ),
  exscel: ref(
    'Holman 2017',
    'Holman RR, Bethel MA, Mentz RJ, et al. Effects of once-weekly exenatide on cardiovascular outcomes in type 2 diabetes (EXSCEL). N Engl J Med 2017;377:1228-1239.',
    'full text',
    '10.1056/NEJMoa1612917',
    '28910237',
  ),
  harmony: ref(
    'Hernandez 2018',
    'Hernandez AF, Green JB, Janmohamed S, et al. Albiglutide and cardiovascular outcomes in patients with type 2 diabetes and cardiovascular disease (Harmony Outcomes). Lancet 2018;392:1519-1529.',
    'abstract',
    '10.1016/S0140-6736(18)32261-X',
    '30291013',
  ),
  rewind: ref(
    'Gerstein 2019',
    'Gerstein HC, Colhoun HM, Dagenais GR, et al. Dulaglutide and cardiovascular outcomes in type 2 diabetes (REWIND). Lancet 2019;394:121-130.',
    'abstract',
    '10.1016/S0140-6736(19)31149-3',
    '31189511',
  ),
  pioneer6: ref(
    'Husain 2019',
    'Husain M, Birkenfeld AL, Donsmark M, et al. Oral semaglutide and cardiovascular outcomes in patients with type 2 diabetes (PIONEER 6). N Engl J Med 2019;381:841-851.',
    'abstract',
    '10.1056/NEJMoa1901118',
    '31185157',
  ),
  amplitudeO: ref(
    'Gerstein 2021',
    'Gerstein HC, Sattar N, Rosenstock J, et al. Cardiovascular and renal outcomes with efpeglenatide in type 2 diabetes (AMPLITUDE-O). N Engl J Med 2021;385:896-907.',
    'abstract',
    '10.1056/NEJMoa2108269',
    '34215025',
  ),
  select: ref(
    'Lincoff 2023',
    'Lincoff AM, Brown-Frandsen K, Colhoun HM, et al. Semaglutide and cardiovascular outcomes in obesity without diabetes (SELECT). N Engl J Med 2023;389:2221-2232.',
    'abstract',
    '10.1056/NEJMoa2307563',
    '37952131',
  ),
  soul: ref(
    'McGuire 2025',
    'McGuire DK, Marx N, Mulvagh SL, et al. Oral semaglutide and cardiovascular outcomes in high-risk type 2 diabetes (SOUL). N Engl J Med 2025;392:2001-2012.',
    'abstract',
    '10.1056/NEJMoa2501006',
    '40162642',
  ),
  flow: ref(
    'Perkovic 2024',
    'Perkovic V, Tuttle KR, Rossing P, et al. Effects of semaglutide on chronic kidney disease in patients with type 2 diabetes (FLOW). N Engl J Med 2024;391:109-121.',
    'abstract',
    '10.1056/NEJMoa2403347',
    '38785209',
  ),
  cao: ref(
    'Cao 2020',
    'Cao C, Yang S, Zhou Z. GLP-1 receptor agonists and pancreatic safety concerns in type 2 diabetic patients: data from cardiovascular outcome trials. Endocrine 2020;68:518-525.',
    'abstract',
    '10.1007/s12020-020-02223-6',
    '32103407',
  ),
  he: ref(
    'He 2022',
    'He L, Wang J, Ping F, et al. Association of glucagon-like peptide-1 receptor agonist use with risk of gallbladder and biliary diseases: a systematic review and meta-analysis of randomized clinical trials. JAMA Intern Med 2022;182:513-519.',
    'abstract',
    '10.1001/jamainternmed.2022.0338',
    '35344001',
  ),
  sodhi: ref(
    'Sodhi 2023',
    'Sodhi M, Rezaeianzadeh R, Kezouh A, Etminan M. Risk of gastrointestinal adverse events associated with glucagon-like peptide-1 receptor agonists for weight loss. JAMA 2023;330:1795-1797.',
    'full text',
    '10.1001/jama.2023.19574',
    '37796527',
  ),
  bezin: ref(
    'Bezin 2023',
    'Bezin J, Gouverneur A, Pénichon M, et al. GLP-1 receptor agonists and the risk of thyroid cancer. Diabetes Care 2023;46:384-390.',
    'abstract',
    '10.2337/dc22-1148',
    '36356111',
  ),
  pasternak: ref(
    'Pasternak 2024',
    'Pasternak B, Wintzell V, Hviid A, et al. Glucagon-like peptide 1 receptor agonist use and risk of thyroid cancer: Scandinavian cohort study. BMJ 2024;385:e078225.',
    'full text',
    '10.1136/bmj-2023-078225',
    '38683947',
  ),
  hathaway: ref(
    'Hathaway 2024',
    'Hathaway JT, Shah MP, Hathaway DB, et al. Risk of nonarteritic anterior ischemic optic neuropathy in patients prescribed semaglutide. JAMA Ophthalmol 2024;142:732-739.',
    'abstract',
    '10.1001/jamaophthalmol.2024.2296',
    '38958939',
  ),
  simonsen: ref(
    'Simonsen 2025',
    'Simonsen E, Lund LC, Ernst MT, et al. Use of semaglutide and risk of non-arteritic anterior ischemic optic neuropathy: a Danish-Norwegian cohort study. Diabetes Obes Metab 2025.',
    'abstract',
    '10.1111/dom.16316',
    '40098249',
  ),
  ueda: ref(
    'Ueda 2024',
    'Ueda P, Söderling J, Wintzell V, et al. GLP-1 receptor agonist use and risk of suicide death. JAMA Intern Med 2024.',
    'abstract',
    '10.1001/jamainternmed.2024.4369',
    '39226030',
  ),
  zepbound: ref(
    'Zepbound label',
    'Zepbound (tirzepatide) injection: US prescribing information, revised 08/2026. DailyMed set ID 487cd7e7-434c-4925-99fa-aa80b1cc776b.',
    'label',
  ),
  mounjaro: ref(
    'Mounjaro label',
    'Mounjaro (tirzepatide) injection: US prescribing information, effective 2026-08-27. DailyMed set ID d2d7da5d-ad07-4228-955f-cf7e355c8cc0.',
    'label',
  ),
  wegovy: ref(
    'Wegovy label',
    'Wegovy (semaglutide): US prescribing information, revised 06/2026. DailyMed set ID ee06186f-2aa3-4990-a760-757579d8f77b.',
    'label',
  ),
  saxenda: ref(
    'Saxenda label',
    'Saxenda (liraglutide) injection: US prescribing information, revised 02/2026. DailyMed set ID 3946d389-0926-4f77-a708-0acb8153b143.',
    'label',
  ),
  foundayo: ref(
    'Foundayo label',
    'Foundayo (orforglipron) tablets: US prescribing information. DailyMed set ID 8ac446c5-feba-474f-a103-23facb9b5c62.',
    'label',
  ),
} as const satisfies Record<string, Ref>;

/** One color per drug across every chart; tirzepatide doses step from dim to bright. */
export const COLOR = {
  tirz5: '#3f4e96',
  tirz10: '#5e74d5',
  tirz15: '#a9b6f2',
  /** Tirzepatide at the maximum tolerated dose, or pooled doses. */
  tirz: '#5e74d5',
  sema: '#cc540a',
  placebo: '#80838f',
  insulin: '#997600',
  dula: '#128b8b',
  lira: '#9962c0',
  reta: '#ea2a37',
  orfo: '#118e36',
  cagri: '#b8267e',
  survo: '#128b8b',
  muted: LOOK.zero,
} as const;

// ------------------------------------------------------------------------------------------
// Pharmacology
// ------------------------------------------------------------------------------------------

/**
 * In-vitro receptor pharmacology, Coskun 2018 section 3.2 (full text): mean and SEM, nM, HEK293
 * cells with recombinant human receptors, albumin-free.
 */
export const RECEPTOR: readonly {
  label: string;
  drug: 'tirzepatide' | 'semaglutide';
  receptor: 'GIPR' | 'GLP-1R';
  /** Binding affinity, Ki. */
  ki?: readonly [mean: number, sem: number];
  /** cAMP potency, EC50. */
  ec50: readonly [mean: number, sem: number];
}[] = [
  {
    label: 'Tirzepatide at GIP receptor',
    drug: 'tirzepatide',
    receptor: 'GIPR',
    ki: [0.135, 0.02],
    ec50: [0.0224, 0.0053],
  },
  {
    label: 'Tirzepatide at GLP-1 receptor',
    drug: 'tirzepatide',
    receptor: 'GLP-1R',
    ki: [4.23, 0.23],
    ec50: [0.934, 0.068],
  },
  {
    label: 'Semaglutide at GLP-1 receptor',
    drug: 'semaglutide',
    receptor: 'GLP-1R',
    ki: [1.97, 0.47],
    ec50: [0.0571, 0.0117],
  },
];

// ------------------------------------------------------------------------------------------
// SURPASS: type 2 diabetes
// ------------------------------------------------------------------------------------------

export interface SurpassTrial {
  trial: string;
  ref: Ref;
  n: number;
  weeks: number;
  background: string;
  comparator: string;
  comparatorColor: string;
  baselineHba1c: number;
  /** Change in HbA1c, percentage points: tirzepatide 5, 10, 15 mg, then the comparator. */
  hba1c: readonly [number, number, number, number];
  /** Change in body weight, kg, same order. */
  weightKg: readonly [number, number, number, number];
}

/**
 * The five registration trials in type 2 diabetes. HbA1c and weight are the treatment-regimen
 * estimand as tabulated in the Mounjaro label (section 14), so all five use one analysis; the
 * Lancet abstracts report the efficacy estimand, which runs about 0.1 to 0.2 points larger.
 * Baseline HbA1c: abstract (SURPASS-1, -3), full text (SURPASS-2, -5), registry (SURPASS-4).
 */
export const SURPASS: readonly SurpassTrial[] = [
  {
    trial: 'SURPASS-1',
    ref: REFS.surpass1,
    n: 478,
    weeks: 40,
    background: 'diet and exercise alone',
    comparator: 'Placebo',
    comparatorColor: COLOR.placebo,
    baselineHba1c: 7.9,
    hba1c: [-1.8, -1.7, -1.7, -0.1],
    weightKg: [-6.3, -7.0, -7.8, -1.0],
  },
  {
    trial: 'SURPASS-2',
    ref: REFS.surpass2,
    n: 1879,
    weeks: 40,
    background: 'metformin',
    comparator: 'Semaglutide 1 mg',
    comparatorColor: COLOR.sema,
    baselineHba1c: 8.28,
    hba1c: [-2.0, -2.2, -2.3, -1.9],
    weightKg: [-7.6, -9.3, -11.2, -5.7],
  },
  {
    trial: 'SURPASS-3',
    ref: REFS.surpass3,
    n: 1444,
    weeks: 52,
    background: 'metformin ± SGLT2 inhibitor',
    comparator: 'Insulin degludec',
    comparatorColor: COLOR.insulin,
    baselineHba1c: 8.17,
    hba1c: [-1.9, -2.0, -2.1, -1.3],
    weightKg: [-7.0, -9.6, -11.3, 1.9],
  },
  {
    trial: 'SURPASS-4',
    ref: REFS.surpass4,
    n: 2002,
    weeks: 52,
    background: 'one to three oral agents, high cardiovascular risk',
    comparator: 'Insulin glargine',
    comparatorColor: COLOR.insulin,
    baselineHba1c: 8.52,
    hba1c: [-2.1, -2.3, -2.4, -1.4],
    weightKg: [-6.4, -8.9, -10.6, 1.7],
  },
  {
    trial: 'SURPASS-5',
    ref: REFS.surpass5,
    n: 475,
    weeks: 40,
    background: 'titrated insulin glargine ± metformin',
    comparator: 'Placebo',
    comparatorColor: COLOR.placebo,
    baselineHba1c: 8.31,
    hba1c: [-2.1, -2.4, -2.3, -0.9],
    weightKg: [-5.4, -7.5, -8.8, 1.6],
  },
];

/**
 * SURPASS-2 at week 40, treatment-regimen estimand, from the NEJM full text (Results and Table 2):
 * tirzepatide 5, 10, 15 mg and semaglutide 1 mg, with the estimated treatment difference against
 * semaglutide and its 95% CI.
 */
export const SURPASS2 = {
  arms: ['Tirzepatide 5 mg', 'Tirzepatide 10 mg', 'Tirzepatide 15 mg', 'Semaglutide 1 mg'],
  n: [470, 469, 470, 469],
  hba1c: [-2.01, -2.24, -2.3, -1.86],
  hba1cEtd: [
    [-0.15, -0.28, -0.03],
    [-0.39, -0.51, -0.26],
    [-0.45, -0.57, -0.32],
  ],
  weightKg: [-7.6, -9.3, -11.2, -5.7],
  weightEtd: [
    [-1.9, -2.8, -1.0],
    [-3.6, -4.5, -2.7],
    [-5.5, -6.4, -4.6],
  ],
  /** Adverse events, % of participants (Table 2). */
  nausea: [17.4, 19.2, 22.1, 17.9],
  diarrhoea: [13.2, 16.4, 13.8, 11.5],
  vomiting: [5.7, 8.5, 9.8, 8.3],
  stoppedForAe: [6.0, 8.5, 8.5, 4.1],
} as const;

/** A hazard ratio with its confidence interval. */
export interface Hazard {
  label: string;
  hr: number;
  lo: number;
  hi: number;
  /** Events as `active / comparator`, when published. */
  events?: string;
  note?: string;
}

/**
 * SURPASS-CVOT: tirzepatide (up to 15 mg) against dulaglutide 1.5 mg in 13,299 adults with type 2
 * diabetes and atherosclerotic cardiovascular disease. Primary endpoint from the NEJM abstract (a
 * 95.3% CI); components from the Mounjaro label (section 14.6) and the open-access JAMA Cardiology
 * post hoc paper. Only the primary endpoint was tested with control for multiplicity.
 */
export const SURPASS_CVOT: readonly Hazard[] = [
  {
    label: 'MACE-3 (primary)',
    hr: 0.92,
    lo: 0.83,
    hi: 1.01,
    events: '801 / 862',
    note: '95.3% CI; noninferiority P = 0.003, superiority P = 0.09',
  },
  { label: 'Cardiovascular death', hr: 0.89, lo: 0.77, hi: 1.02, events: '367 / 409' },
  { label: 'Myocardial infarction', hr: 0.86, lo: 0.74, hi: 1.0, events: '311 / 357' },
  { label: 'Stroke', hr: 0.91, lo: 0.76, hi: 1.09, events: '229 / 249' },
  { label: 'Coronary revascularisation', hr: 0.84, lo: 0.75, hi: 0.95, events: '527 / 617' },
  { label: 'Heart failure event', hr: 0.96, lo: 0.79, hi: 1.17, events: '198 / 204' },
  { label: 'Death from any cause', hr: 0.84, lo: 0.75, hi: 0.94, events: '566 / 669' },
  {
    label: 'Kidney composite',
    hr: 0.77,
    lo: 0.68,
    hi: 0.88,
    events: '396 / 498',
    note: 'prespecified exploratory',
  },
];

// ------------------------------------------------------------------------------------------
// SURMOUNT: obesity
// ------------------------------------------------------------------------------------------

/**
 * SURMOUNT-1 at week 72, treatment-regimen estimand: 2,539 adults with obesity, without diabetes;
 * baseline weight 104.8 kg, BMI 38.0. Weight change with 95% CI from the NEJM abstract; responder
 * proportions and cardiometabolic changes from the Zepbound label (Study 1).
 */
export const SURMOUNT1 = {
  arms: ['Placebo', 'Tirzepatide 5 mg', 'Tirzepatide 10 mg', 'Tirzepatide 15 mg'],
  colors: [COLOR.placebo, COLOR.tirz5, COLOR.tirz10, COLOR.tirz15],
  n: [643, 630, 636, 630],
  weightPct: [-3.1, -15.0, -19.5, -20.9],
  weightCi: [
    [-4.3, -1.9],
    [-15.9, -14.2],
    [-20.4, -18.5],
    [-21.8, -19.9],
  ],
  thresholds: ['≥5%', '≥10%', '≥15%', '≥20%'],
  /** % of participants reaching each threshold, one row per arm. */
  responders: [
    [34.5, 18.8, 8.8, 3.1],
    [85.1, 68.5, 48.0, 30.0],
    [88.9, 78.1, 66.6, 50.1],
    [90.9, 83.5, 70.6, 56.7],
  ],
  /** Lipids, % change from baseline, one row per arm. */
  lipidNames: [
    'Triglycerides',
    'Non-HDL cholesterol',
    'LDL cholesterol',
    'Total cholesterol',
    'HDL cholesterol',
  ],
  lipids: [
    [-5.6, -2.3, -1.7, -1.8, -0.7],
    [-21.2, -8.0, -4.6, -3.8, 6.9],
    [-23.8, -9.4, -5.6, -4.4, 9.2],
    [-29.1, -11.7, -7.1, -6.3, 8.0],
  ],
  /** Systolic and diastolic blood pressure, mmHg, per arm. */
  sbp: [-1.0, -6.6, -7.7, -7.4],
  dbp: [-0.8, -4.9, -5.0, -4.5],
  stoppedForAe: [2.6, 4.3, 7.1, 6.2],
} as const;

export interface Pair {
  trial: string;
  ref: Ref;
  population: string;
  weeks: string;
  n: number;
  tirz: number;
  comparator: number;
  comparatorName: string;
  comparatorColor: string;
  estimand: string;
}

/**
 * Percent change in body weight across the tirzepatide programme: the 15 mg or maximum tolerated
 * dose arm against the comparator. Treatment-regimen estimand except SUMMIT, where only the
 * registry's efficacy-estimand values were open.
 */
export const PROGRAMME: readonly Pair[] = [
  {
    trial: 'SURMOUNT-1',
    ref: REFS.surmount1,
    population: 'obesity, no diabetes',
    weeks: '72',
    n: 2539,
    tirz: -20.9,
    comparator: -3.1,
    comparatorName: 'Placebo',
    comparatorColor: COLOR.placebo,
    estimand: 'treatment-regimen',
  },
  {
    trial: 'SURMOUNT-2',
    ref: REFS.surmount2,
    population: 'obesity with type 2 diabetes',
    weeks: '72',
    n: 938,
    tirz: -14.7,
    comparator: -3.2,
    comparatorName: 'Placebo',
    comparatorColor: COLOR.placebo,
    estimand: 'treatment-regimen',
  },
  {
    trial: 'SURMOUNT-3',
    ref: REFS.surmount3,
    population: 'after a 12-week lifestyle lead-in (−6.9%)',
    weeks: '72, from randomisation',
    n: 579,
    tirz: -18.4,
    comparator: 2.5,
    comparatorName: 'Placebo',
    comparatorColor: COLOR.placebo,
    estimand: 'treatment-regimen',
  },
  {
    trial: 'SURMOUNT-4',
    ref: REFS.surmount4,
    population: 'after 36 weeks of open-label tirzepatide (−20.9%)',
    weeks: '36 to 88',
    n: 670,
    tirz: -5.5,
    comparator: 14.0,
    comparatorName: 'Switched to placebo',
    comparatorColor: COLOR.placebo,
    estimand: 'treatment-regimen',
  },
  {
    trial: 'SURMOUNT-5',
    ref: REFS.surmount5,
    population: 'obesity, no diabetes',
    weeks: '72',
    n: 751,
    tirz: -20.2,
    comparator: -13.7,
    comparatorName: 'Semaglutide 2.4 mg',
    comparatorColor: COLOR.sema,
    estimand: 'treatment-regimen',
  },
  {
    trial: 'SURMOUNT-OSA 1',
    ref: REFS.surmountOsa,
    population: 'sleep apnoea, not on PAP',
    weeks: '52',
    n: 234,
    tirz: -17.7,
    comparator: -1.6,
    comparatorName: 'Placebo',
    comparatorColor: COLOR.placebo,
    estimand: 'treatment-regimen',
  },
  {
    trial: 'SURMOUNT-OSA 2',
    ref: REFS.surmountOsa,
    population: 'sleep apnoea, on PAP',
    weeks: '52',
    n: 235,
    tirz: -19.6,
    comparator: -2.3,
    comparatorName: 'Placebo',
    comparatorColor: COLOR.placebo,
    estimand: 'treatment-regimen',
  },
  {
    trial: 'SUMMIT',
    ref: REFS.summit,
    population: 'heart failure with preserved ejection fraction',
    weeks: '52',
    n: 731,
    tirz: -13.9,
    comparator: -2.2,
    comparatorName: 'Placebo',
    comparatorColor: COLOR.placebo,
    estimand: 'efficacy (registry)',
  },
];

/**
 * SURMOUNT-5 at week 72: tirzepatide (10 or 15 mg) against semaglutide (1.7 or 2.4 mg), open label,
 * 751 adults with obesity. Means with 95% CI from the NEJM abstract. The responder proportions are
 * the ClinicalTrials.gov observed-case values (318 per arm) and may differ slightly from the
 * paper's, which were not open.
 */
export const SURMOUNT5 = {
  weightPct: { tirz: [-20.2, -21.4, -19.1], sema: [-13.7, -14.9, -12.6], diff: [-6.5, -8.1, -4.9] },
  waistCm: { tirz: [-18.4, -19.6, -17.2], sema: [-13.0, -14.3, -11.7], diff: [-5.4, -7.1, -3.6] },
  thresholds: ['≥10%', '≥15%', '≥20%', '≥25%', '≥30%'],
  responders: { tirz: [87.7, 71.7, 55.0, 36.5, 23.0], sema: [66.7, 45.0, 31.1, 18.6, 8.2] },
  /** Registry adverse-event counts as % of treated (374 and 376). */
  gi: {
    names: ['Nausea', 'Constipation', 'Diarrhoea', 'Vomiting'],
    tirz: [43.6, 27.0, 23.5, 15.0],
    sema: [44.4, 28.5, 23.4, 21.3],
  },
} as const;

export interface Landmark {
  name: string;
  ref: Ref;
  color: string;
  dash: 'solid' | 'dot';
  /** Week and percent change in body weight from week 0. */
  points: readonly (readonly [week: number, pct: number])[];
  /** The week treatment stopped, when it did. */
  stopWeek?: number;
  detail: string;
}

/**
 * What happens on stopping, as published landmark values (not per-visit curves, which exist only
 * as figures). SURMOUNT-4: everyone took tirzepatide for 36 weeks (−20.9%), then continued or
 * switched to placebo; week-88 values from the JAMA abstract. STEP 1 extension: 327 participants
 * followed for a year after semaglutide and lifestyle support ended at week 68; observed means
 * from the full text.
 */
export const WITHDRAWAL: readonly Landmark[] = [
  {
    name: 'Tirzepatide, continued',
    ref: REFS.surmount4,
    color: COLOR.tirz15,
    dash: 'solid',
    points: [
      [0, 0],
      [36, -20.9],
      [88, -25.3],
    ],
    detail: 'SURMOUNT-4, n = 335',
  },
  {
    name: 'Tirzepatide, switched to placebo at week 36',
    ref: REFS.surmount4,
    color: COLOR.tirz10,
    dash: 'dot',
    points: [
      [0, 0],
      [36, -20.9],
      [88, -9.9],
    ],
    stopWeek: 36,
    detail: 'SURMOUNT-4, n = 335',
  },
  {
    name: 'Semaglutide 2.4 mg, stopped at week 68',
    ref: REFS.step1Ext,
    color: COLOR.sema,
    dash: 'dot',
    points: [
      [0, 0],
      [68, -17.3],
      [120, -5.6],
    ],
    stopWeek: 68,
    detail: 'STEP 1 extension, n = 228',
  },
  {
    name: 'Placebo, stopped at week 68',
    ref: REFS.step1Ext,
    color: COLOR.placebo,
    dash: 'dot',
    points: [
      [0, 0],
      [68, -2.0],
      [120, -0.1],
    ],
    stopWeek: 68,
    detail: 'STEP 1 extension, n = 99',
  },
];

/** SURMOUNT-4 after randomisation at week 36 (JAMA full text, Table 2, treatment-regimen). */
export const SURMOUNT4 = {
  leadIn: -20.9,
  change36to88: { tirz: [-5.5, -6.8, -4.2], placebo: [14.0, 12.8, 15.2] },
  keptEightyPct: { tirz: 89.5, placebo: 16.6 },
} as const;

/** STEP 4 after randomisation at week 20 (JAMA abstract, treatment-policy): run-in −10.6%. */
export const STEP4 = {
  runIn: -10.6,
  change20to68: { sema: [-7.9, -8.6, -7.2], placebo: [6.9, 5.8, 7.9] },
} as const;

/**
 * SURMOUNT-1 extension: 1,032 participants with prediabetes, 176 weeks on treatment and 17 weeks
 * off (NEJM abstract).
 */
export const PREVENTION = {
  week176: { tirz: 1.3, placebo: 13.3, hr: 0.07, ci: [0.0, 0.1] },
  week193: { tirz: 2.4, placebo: 13.7, hr: 0.12, ci: [0.1, 0.2] },
  weight176: { arms: ['Placebo', '5 mg', '10 mg', '15 mg'], pct: [-1.3, -12.3, -18.7, -19.7] },
} as const;

/**
 * Body composition by DXA. Tirzepatide: SURMOUNT-1 substudy, pooled doses (n = 124) against
 * placebo (n = 36), week 72, full text. Semaglutide: STEP 1 substudy (n = 95), week 68, from the
 * conference abstract, which gives no placebo values for these measures.
 */
export const BODY_COMPOSITION = {
  measures: ['Body weight', 'Fat mass', 'Visceral fat', 'Lean mass'],
  tirz: [-21.3, -33.9, -40.1, -10.9],
  tirzPlacebo: [-5.3, -8.2, -7.3, -2.6],
  sema: [-15.0, -19.3, -27.4, -9.7],
  /** Share of the weight lost that was fat and lean mass, %. */
  share: { tirz: [74, 26], placebo: [75, 25] },
  kg: { tirzFat: -15.9, tirzLean: -5.6 },
} as const;

// ------------------------------------------------------------------------------------------
// Beyond weight
// ------------------------------------------------------------------------------------------

/**
 * SYNERGY-NASH: 190 adults with biopsy-confirmed MASH and F2 or F3 fibrosis, 52 weeks (NEJM
 * abstract). % of participants: placebo, then tirzepatide 5, 10 and 15 mg.
 */
export const SYNERGY_NASH = {
  arms: ['Placebo', '5 mg', '10 mg', '15 mg'],
  colors: [COLOR.placebo, COLOR.tirz5, COLOR.tirz10, COLOR.tirz15],
  resolution: [10, 44, 56, 62],
  /** Difference from placebo, percentage points, with 95% CI, for 5, 10 and 15 mg. */
  resolutionDiff: [
    [34, 17, 50],
    [46, 29, 62],
    [53, 37, 69],
  ],
  fibrosis: [30, 55, 51, 51],
  fibrosisDiff: [
    [25, 5, 46],
    [22, 1, 42],
    [21, 1, 42],
  ],
} as const;

/**
 * SURMOUNT-OSA: change in the apnoea-hypopnoea index at week 52, events per hour, with 95% CI
 * (treatment-regimen estimand, full text). Baseline AHI was about 50 events per hour.
 */
export const OSA = {
  trials: ['Trial 1: not on PAP', 'Trial 2: on PAP'],
  tirz: [
    [-25.3, -29.3, -21.2],
    [-29.3, -33.2, -25.4],
  ],
  placebo: [
    [-5.3, -9.4, -1.1],
    [-5.5, -9.9, -1.2],
  ],
  diff: [
    [-20.0, -25.8, -14.2],
    [-23.8, -29.6, -17.9],
  ],
} as const;

/** SUMMIT (NEJM abstract): 731 adults, median follow-up 104 weeks. */
export const SUMMIT = {
  composite: { hr: 0.62, lo: 0.41, hi: 0.95, events: '36 / 56' },
  worseningHf: { hr: 0.54, lo: 0.34, hi: 0.85, events: '29 / 52' },
  cvDeath: { hr: 1.58, lo: 0.52, hi: 4.83, events: '8 / 5' },
  kccq: { tirz: 19.5, placebo: 12.7, diff: [6.9, 3.3, 10.6] },
} as const;

// ------------------------------------------------------------------------------------------
// The class
// ------------------------------------------------------------------------------------------

export interface ClassTrial {
  drug: string;
  target: string;
  trial: string;
  ref: Ref;
  weeks: number;
  n: number;
  drugPct: number;
  placeboPct: number;
  color: string;
  route: 'injection' | 'oral';
  note?: string;
}

/**
 * Weight loss at the highest dose in each agent's main obesity trial in adults without diabetes.
 * All values are the treatment-policy (treatment-regimen) estimand, so they are comparable in
 * analysis, though not in population or duration: these are separate trials, not a head-to-head.
 */
export const CLASS_OBESITY: readonly ClassTrial[] = [
  {
    drug: 'Liraglutide 3 mg',
    target: 'GLP-1',
    trial: 'SCALE',
    ref: REFS.scale,
    weeks: 56,
    n: 3731,
    drugPct: -7.4,
    placeboPct: -3.0,
    color: COLOR.lira,
    route: 'injection',
    note: 'daily; values from the Saxenda label (multiple imputation)',
  },
  {
    drug: 'Orforglipron 36 mg',
    target: 'GLP-1, small molecule',
    trial: 'ATTAIN-1',
    ref: REFS.attain1,
    weeks: 72,
    n: 3127,
    drugPct: -11.2,
    placeboPct: -2.1,
    color: COLOR.orfo,
    route: 'oral',
  },
  {
    drug: 'Survodutide 6 mg',
    target: 'GLP-1 + glucagon',
    trial: 'SYNCHRONIZE-1',
    ref: REFS.synchronize1,
    weeks: 76,
    n: 725,
    drugPct: -13.0,
    placeboPct: -5.4,
    color: COLOR.survo,
    route: 'injection',
  },
  {
    drug: 'Semaglutide 2.4 mg',
    target: 'GLP-1',
    trial: 'STEP 1',
    ref: REFS.step1,
    weeks: 68,
    n: 1961,
    drugPct: -14.9,
    placeboPct: -2.4,
    color: COLOR.sema,
    route: 'injection',
  },
  {
    drug: 'Oral semaglutide 50 mg',
    target: 'GLP-1',
    trial: 'OASIS 1',
    ref: REFS.oasis1,
    weeks: 68,
    n: 667,
    drugPct: -15.1,
    placeboPct: -2.4,
    color: COLOR.sema,
    route: 'oral',
  },
  {
    drug: 'Cagrilintide + semaglutide',
    target: 'GLP-1 + amylin',
    trial: 'REDEFINE 1',
    ref: REFS.redefine1,
    weeks: 68,
    n: 3417,
    drugPct: -20.4,
    placeboPct: -3.0,
    color: COLOR.cagri,
    route: 'injection',
  },
  {
    drug: 'Tirzepatide 15 mg',
    target: 'GLP-1 + GIP',
    trial: 'SURMOUNT-1',
    ref: REFS.surmount1,
    weeks: 72,
    n: 2539,
    drugPct: -20.9,
    placeboPct: -3.1,
    color: COLOR.tirz,
    route: 'injection',
  },
  {
    drug: 'Retatrutide 12 mg',
    target: 'GLP-1 + GIP + glucagon',
    trial: 'TRIUMPH-1',
    ref: REFS.triumph1,
    weeks: 80,
    n: 2339,
    drugPct: -25.0,
    placeboPct: -3.9,
    color: COLOR.reta,
    route: 'injection',
  },
];

export interface Outcome extends Hazard {
  trial: string;
  drug: string;
  ref: Ref;
  n: number;
  followUp: string;
  group: 'GLP-1 receptor agonist vs placebo' | 'Tirzepatide';
  endpoint: string;
  comparator: string;
}

/**
 * Primary results of the outcome trials. The nine placebo-controlled GLP-1 receptor agonist
 * trials share a three-point MACE endpoint; FLOW's is a kidney composite. Tirzepatide's two
 * outcome trials answer different questions: SURPASS-CVOT compares it with dulaglutide, an agent
 * with proven benefit, not with placebo; SUMMIT is a heart-failure trial.
 */
export const OUTCOMES: readonly Outcome[] = [
  {
    trial: 'LEADER',
    drug: 'liraglutide',
    ref: REFS.leader,
    n: 9340,
    followUp: '3.8 y',
    group: 'GLP-1 receptor agonist vs placebo',
    endpoint: 'MACE',
    comparator: 'placebo',
    label: 'LEADER',
    hr: 0.87,
    lo: 0.78,
    hi: 0.97,
    events: '608 / 694',
  },
  {
    trial: 'SUSTAIN-6',
    drug: 'semaglutide 0.5–1 mg',
    ref: REFS.sustain6,
    n: 3297,
    followUp: '2.1 y',
    group: 'GLP-1 receptor agonist vs placebo',
    endpoint: 'MACE',
    comparator: 'placebo',
    label: 'SUSTAIN-6',
    hr: 0.74,
    lo: 0.58,
    hi: 0.95,
    events: '108 / 146',
  },
  {
    trial: 'EXSCEL',
    drug: 'exenatide weekly',
    ref: REFS.exscel,
    n: 14752,
    followUp: '3.2 y',
    group: 'GLP-1 receptor agonist vs placebo',
    endpoint: 'MACE',
    comparator: 'placebo',
    label: 'EXSCEL',
    hr: 0.91,
    lo: 0.83,
    hi: 1.0,
    events: '839 / 905',
  },
  {
    trial: 'Harmony Outcomes',
    drug: 'albiglutide',
    ref: REFS.harmony,
    n: 9463,
    followUp: '1.6 y',
    group: 'GLP-1 receptor agonist vs placebo',
    endpoint: 'MACE',
    comparator: 'placebo',
    label: 'Harmony Outcomes',
    hr: 0.78,
    lo: 0.68,
    hi: 0.9,
    events: '338 / 428',
  },
  {
    trial: 'REWIND',
    drug: 'dulaglutide',
    ref: REFS.rewind,
    n: 9901,
    followUp: '5.4 y',
    group: 'GLP-1 receptor agonist vs placebo',
    endpoint: 'MACE',
    comparator: 'placebo',
    label: 'REWIND',
    hr: 0.88,
    lo: 0.79,
    hi: 0.99,
    events: '594 / 663',
  },
  {
    trial: 'PIONEER 6',
    drug: 'oral semaglutide',
    ref: REFS.pioneer6,
    n: 3183,
    followUp: '1.3 y',
    group: 'GLP-1 receptor agonist vs placebo',
    endpoint: 'MACE',
    comparator: 'placebo',
    label: 'PIONEER 6',
    hr: 0.79,
    lo: 0.57,
    hi: 1.11,
    events: '61 / 76',
  },
  {
    trial: 'AMPLITUDE-O',
    drug: 'efpeglenatide',
    ref: REFS.amplitudeO,
    n: 4076,
    followUp: '1.8 y',
    group: 'GLP-1 receptor agonist vs placebo',
    endpoint: 'MACE',
    comparator: 'placebo',
    label: 'AMPLITUDE-O',
    hr: 0.73,
    lo: 0.58,
    hi: 0.92,
    events: '189 / 125',
    note: 'randomised 2:1',
  },
  {
    trial: 'SELECT',
    drug: 'semaglutide 2.4 mg',
    ref: REFS.select,
    n: 17604,
    followUp: '3.5 y (41.8 months)',
    group: 'GLP-1 receptor agonist vs placebo',
    endpoint: 'MACE',
    comparator: 'placebo',
    label: 'SELECT',
    hr: 0.8,
    lo: 0.72,
    hi: 0.9,
    events: '569 / 701',
    note: 'obesity without diabetes',
  },
  {
    trial: 'SOUL',
    drug: 'oral semaglutide',
    ref: REFS.soul,
    n: 9650,
    followUp: '4.1 y',
    group: 'GLP-1 receptor agonist vs placebo',
    endpoint: 'MACE',
    comparator: 'placebo',
    label: 'SOUL',
    hr: 0.86,
    lo: 0.77,
    hi: 0.96,
    events: '579 / 668',
  },
  {
    trial: 'FLOW',
    drug: 'semaglutide 1 mg',
    ref: REFS.flow,
    n: 3533,
    followUp: '3.4 y',
    group: 'GLP-1 receptor agonist vs placebo',
    endpoint: 'major kidney disease events',
    comparator: 'placebo',
    label: 'FLOW (kidney)',
    hr: 0.76,
    lo: 0.66,
    hi: 0.88,
    events: '331 / 410',
  },
  {
    trial: 'SURPASS-CVOT',
    drug: 'tirzepatide',
    ref: REFS.surpassCvot,
    n: 13299,
    followUp: '4.0 y',
    group: 'Tirzepatide',
    endpoint: 'MACE',
    comparator: 'dulaglutide 1.5 mg',
    label: 'SURPASS-CVOT (vs dulaglutide)',
    hr: 0.92,
    lo: 0.83,
    hi: 1.01,
    events: '801 / 862',
    note: '95.3% CI',
  },
  {
    trial: 'SUMMIT',
    drug: 'tirzepatide',
    ref: REFS.summit,
    n: 731,
    followUp: '2.0 y',
    group: 'Tirzepatide',
    endpoint: 'cardiovascular death or worsening heart failure',
    comparator: 'placebo',
    label: 'SUMMIT (heart failure)',
    hr: 0.62,
    lo: 0.41,
    hi: 0.95,
    events: '36 / 56',
  },
];

/**
 * Gastrointestinal adverse reactions in the US labels' pooled placebo-controlled obesity trials,
 * % of patients at the highest approved dose and on placebo. Pools differ in trials, duration and
 * titration, so compare each drug with its own placebo, not across drugs.
 */
export const LABEL_GI: readonly {
  drug: string;
  ref: Ref;
  color: string;
  n: readonly [drug: number, placebo: number];
  /** Nausea, diarrhoea, vomiting, constipation. */
  drugPct: readonly [number, number, number, number];
  placeboPct: readonly [number, number, number, number];
  stoppedForAe: readonly [drug: number, placebo: number];
}[] = [
  {
    drug: 'Liraglutide 3 mg',
    ref: REFS.saxenda,
    color: COLOR.lira,
    n: [3384, 1941],
    drugPct: [39.3, 20.9, 15.7, 19.4],
    placeboPct: [13.8, 9.9, 3.9, 8.5],
    stoppedForAe: [9.8, 4.3],
  },
  {
    drug: 'Semaglutide 2.4 mg',
    ref: REFS.wegovy,
    color: COLOR.sema,
    n: [2116, 1261],
    drugPct: [44, 30, 24, 24],
    placeboPct: [16, 16, 6, 11],
    stoppedForAe: [6.8, 3.2],
  },
  {
    drug: 'Tirzepatide 15 mg',
    ref: REFS.zepbound,
    color: COLOR.tirz,
    n: [941, 958],
    drugPct: [28, 23, 13, 11],
    placeboPct: [8, 8, 2, 5],
    stoppedForAe: [6.7, 3.4],
  },
  {
    drug: 'Orforglipron 17.2 mg',
    ref: REFS.foundayo,
    color: COLOR.orfo,
    n: [1049, 1576],
    drugPct: [35, 25, 24, 24],
    placeboPct: [10, 11, 4, 9],
    stoppedForAe: [10, 3],
  },
];
export const GI_EVENTS = ['Nausea', 'Diarrhoea', 'Vomiting', 'Constipation'] as const;

/** Tirzepatide's GI reactions by dose (Zepbound label, pooled SURMOUNT-1 and -2), % of patients. */
export const ZEPBOUND_GI = {
  arms: ['Placebo', '5 mg', '10 mg', '15 mg'],
  n: [958, 630, 948, 941],
  nausea: [8, 25, 29, 28],
  diarrhoea: [8, 19, 21, 23],
  vomiting: [2, 8, 11, 13],
  constipation: [5, 17, 14, 11],
  stoppedForGi: [0.5, 1.9, 3.3, 4.3],
} as const;

/** Formats a hazard ratio as `0.92 (0.83–1.01)`. */
export const fmtHr = (h: { hr: number; lo: number; hi: number }): string =>
  `${h.hr.toFixed(2)} (${h.lo.toFixed(2)}–${h.hi.toFixed(2)})`;

/** Formats a signed percentage, with a real minus sign. */
export const fmtPct = (v: number, digits = 1): string =>
  `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(digits)}%`;
