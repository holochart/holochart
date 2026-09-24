/**
 * The OpenRouter demo's other datasets (see `data/SOURCES.md`), typed, plus the display names
 * and colors every chart of the demo uses for model authors, so an author has one color across the
 * stacked area, the donut and the bubble chart.
 *
 * A `.mts` file, like `analysis.mts`, so the example registry does not treat it as an example.
 */
import authorsJson from './data/authors.json';
import categoriesJson from './data/categories.json';
import industryJson from './data/industry.json';
import modelsJson from './data/models.json';
import weeklyModelsJson from './data/weekly-models.json';
import { LOOK } from './ui.mts';

export interface AuthorWeek {
  week: string;
  tokensT: Record<string, number>;
  partial?: boolean;
  truncated?: boolean;
}

export interface RequestWeek {
  week: string;
  requestsB: Record<string, number>;
  partial?: boolean;
  truncated?: boolean;
}

export interface Model {
  id: string;
  name: string;
  author: string;
  created: string;
  contextLength: number;
  promptPerM: number;
  completionPerM: number;
  weeklyTokensT?: number;
  weeklyTokensWeek?: string;
}

export interface Category {
  name: string;
  group: string;
  share: number;
  tokensT: number;
}

export interface PlatformWeek {
  week: string;
  tokensT: number;
  partial?: boolean;
  truncated?: boolean;
}

/** Retrieval date of the data, `YYYY-MM-DD`. */
export const RETRIEVED: string = authorsJson.retrieved;

/** Authors of the token series (top 8 by 53-week total, then `others`). */
export const AUTHORS: readonly string[] = authorsJson.authors;
/** Complete weeks of tokens by author (the truncated first and the partial last week dropped). */
export const AUTHOR_WEEKS: readonly AuthorWeek[] = (authorsJson.weeks as AuthorWeek[]).filter(
  (w) => !w.partial && !w.truncated,
);

/** Authors of OpenRouter's market-share chart (by requests), then `others`. */
export const REQUEST_AUTHORS: readonly string[] = authorsJson.requestShare.authors;
/** Complete weeks of requests by author, in billions. */
export const REQUEST_WEEKS: readonly RequestWeek[] = (
  authorsJson.requestShare.weeks as RequestWeek[]
).filter((w) => !w.partial && !w.truncated);

/** Whole-platform weekly tokens (53 weeks), complete weeks only. */
export const PLATFORM_WEEKS: readonly PlatformWeek[] = (
  weeklyModelsJson.weeks as PlatformWeek[]
).filter((w) => !w.partial && !w.truncated);

/** Text-output models with prices (the catalog as of the retrieval date). */
export const MODELS: readonly Model[] = modelsJson.models as Model[];

/** Task categories: share of tokens over a trailing 30-day window. */
export const CATEGORIES: readonly Category[] = categoriesJson.categories as Category[];
export const CATEGORY_WINDOW = { start: categoriesJson.week, days: categoriesJson.windowDays };

export interface IndustryPoint {
  /** `YYYY-MM-DD`: the period the figure refers to when stated, else the announcement date. */
  date: string;
  /** The figure in the series' own unit. */
  value: number;
  /** The figure in trillion tokens per day. */
  perDayT: number;
  source: string;
  note?: string;
}

export interface IndustrySeries {
  name: string;
  /** The provider's own unit, e.g. `trillion tokens per month`. */
  unit: string;
  points: IndustryPoint[];
}

/** Published token-volume figures by provider (see `data/SOURCES.md`). */
export const INDUSTRY: readonly IndustrySeries[] = industryJson.series as IndustrySeries[];

const NAMES: Record<string, string> = {
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  google: 'Google',
  'meta-llama': 'Meta',
  minimax: 'MiniMax',
  mistralai: 'Mistral',
  moonshotai: 'Moonshot AI',
  openai: 'OpenAI',
  others: 'Others',
  qwen: 'Qwen',
  stepfun: 'StepFun',
  tencent: 'Tencent',
  xiaomi: 'Xiaomi',
  'z-ai': 'Z.ai',
};

/** Display name of an author id (`z-ai` → `Z.ai`). */
export const authorName = (id: string): string => NAMES[id] ?? id;

/** Neutral color for "others" and authors outside the top 8. */
export const OTHER_COLOR = '#4b475c';

/** One colorway color per top-8 author, in the order of `AUTHORS`; grey for the rest. */
export function authorColor(id: string): string {
  const i = AUTHORS.indexOf(id);
  return id !== 'others' && i >= 0 && i < LOOK.colorway.length
    ? (LOOK.colorway[i] as string)
    : OTHER_COLOR;
}
