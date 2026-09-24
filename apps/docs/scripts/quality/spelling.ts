/**
 * Lightweight spelling check for the docs quality gates (report only). There is no English word
 * list in CI and no new dependencies, so this is NOT a dictionary spell check: it flags a list of
 * common misspellings and doubled words ("the the") in prose (code, inline code, comments and tags
 * are ignored). `dictionary.txt` lists allowed exceptions. Full dictionary checking is deferred.
 */
import { lineAt, proseView } from './markdown.ts';

/** Common misspelling → correction. Whole words, case-insensitive. */
export const MISSPELLINGS: Readonly<Record<string, string>> = {
  accomodate: 'accommodate',
  acheive: 'achieve',
  accross: 'across',
  adress: 'address',
  agressive: 'aggressive',
  alot: 'a lot',
  aparent: 'apparent',
  apparant: 'apparent',
  arguement: 'argument',
  assesment: 'assessment',
  begining: 'beginning',
  beleive: 'believe',
  calender: 'calendar',
  catagory: 'category',
  commited: 'committed',
  completly: 'completely',
  concensus: 'consensus',
  consistant: 'consistent',
  definately: 'definitely',
  dependancy: 'dependency',
  dependancies: 'dependencies',
  dependant: 'dependent (adjective) / dependency',
  desciption: 'description',
  enviroment: 'environment',
  existant: 'existent',
  explicitely: 'explicitly',
  familar: 'familiar',
  finaly: 'finally',
  foward: 'forward',
  goverment: 'government',
  guage: 'gauge',
  heigth: 'height',
  hierachy: 'hierarchy',
  immediatly: 'immediately',
  independant: 'independent',
  interupt: 'interrupt',
  lenght: 'length',
  maintainance: 'maintenance',
  managable: 'manageable',
  neccessary: 'necessary',
  necessery: 'necessary',
  noticable: 'noticeable',
  occassion: 'occasion',
  occured: 'occurred',
  occurence: 'occurrence',
  occurrance: 'occurrence',
  parralel: 'parallel',
  paramter: 'parameter',
  persistant: 'persistent',
  posible: 'possible',
  prefered: 'preferred',
  propery: 'property',
  publically: 'publicly',
  recieve: 'receive',
  recieved: 'received',
  recomend: 'recommend',
  refered: 'referred',
  relevent: 'relevant',
  reponse: 'response',
  seperate: 'separate',
  seperately: 'separately',
  similiar: 'similar',
  succesful: 'successful',
  sucessful: 'successful',
  supress: 'suppress',
  teh: 'the',
  thier: 'their',
  threshhold: 'threshold',
  tranparent: 'transparent',
  transparant: 'transparent',
  truely: 'truly',
  untill: 'until',
  usefull: 'useful',
  wich: 'which',
  widht: 'width',
  wierd: 'weird',
  withing: 'within',
  writting: 'writing',
};

/** A spelling finding. */
export interface SpellingFinding {
  /** `page.md:line`. */
  location: string;
  message: string;
}

/**
 * Parse `dictionary.txt`: one allowed word or doubled-word phrase per line, `#` comments. Entries
 * are case-insensitive.
 */
export function parseDictionary(text: string): Set<string> {
  return new Set(
    text
      .split(/\r?\n/)
      .map((l) => l.replace(/#.*$/, '').trim().toLowerCase())
      .filter((l) => l !== ''),
  );
}

/** Check one page's prose. */
export function checkSpelling(
  page: string,
  source: string,
  allowed: ReadonlySet<string>,
): SpellingFinding[] {
  // Code and tags become `_`, so the words around them are never adjacent ("to `mode` to").
  const prose = proseView(source, '_')
    // Link targets and bare URLs are not prose.
    .replace(/\]\([^)]*\)/g, (m) => `]${' '.repeat(m.length - 1)}`)
    .replace(/https?:\/\/\S+/g, (m) => ' '.repeat(m.length));
  const out: SpellingFinding[] = [];
  for (const m of prose.matchAll(/[A-Za-z]+(?:'[A-Za-z]+)?/g)) {
    const word = m[0].toLowerCase();
    const fix = MISSPELLINGS[word];
    if (fix && !allowed.has(word)) {
      out.push({
        location: `${page}:${lineAt(prose, m.index)}`,
        message: `"${m[0]}" → ${fix}`,
      });
    }
  }
  // Doubled words, also across one line break; not across punctuation or paragraphs.
  for (const m of prose.matchAll(/\b([A-Za-z]+)(?:[ \t]+|[ \t]*\n[ \t]*(?:>[ \t]*)?)(\1)\b/gi)) {
    const word = (m[1] as string).toLowerCase();
    if (word !== (m[2] as string).toLowerCase() || allowed.has(`${word} ${word}`)) continue;
    out.push({
      location: `${page}:${lineAt(prose, m.index)}`,
      message: `doubled word "${m[1]} ${m[2]}"`,
    });
  }
  return out.sort((a, b) => a.location.localeCompare(b.location, 'en', { numeric: true }));
}
