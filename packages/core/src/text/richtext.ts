/**
 * Plotly pseudo-HTML rich text (plan E2.10): the tag subset Plotly draws in titles, labels,
 * annotations and hover text, parsed into a tree (for DOM output) and flattened into lines of
 * styled runs (for the SDF text renderer, which draws each run as one batch member).
 *
 * Renderer-free and DOM-free: it runs in workers and node, and never builds HTML from its input.
 *
 * ## Semantics (plotly.js `src/lib/svg_text_utils.js`)
 *
 * - Tags: `<b>`, `<i>`, `<em>` (bold italic, as in Plotly), `<u>`, `<s>`, `<sup>`, `<sub>`,
 *   `<span>`, `<a href target>` and `<br>`, case-insensitive; every one may carry a
 *   `style="…"` attribute. `<strong>` (bold) is a Holochart extension: Plotly shows it literally.
 * - `<sup>` / `<sub>`: 70% of the surrounding size, baseline raised by 0.6 / lowered by 0.3 of the
 *   *new* size (Plotly's `dy` in em of the 70% tspan). They nest.
 * - `style`: `color`, `font-size` (`px`, `pt`, `em`, `rem`, `%`), `font-family`, `font-weight`,
 *   `font-style` and `text-decoration` (`underline`, `line-through`, `overline`) are applied;
 *   other properties are dropped. A tag's own style wins over its `style` attribute (Plotly
 *   appends it), so `<b style="font-weight:normal">` is still bold.
 * - Unknown tags (`<script>`, `<img …>`, `< b>`) stay literal text. A closing tag closes the
 *   innermost open tag whatever its name ("pretending it did match"); a closing tag with nothing
 *   open is dropped; tags left open close at the end. Styles continue across `<br>`.
 * - Entities: `&amp; &lt; &gt; &quot; &apos; &nbsp; &mu; &times; &plusmn; &deg;` (any case) and
 *   numeric ones (`&#39;`, `&#x27;`); anything else stays literal. They are decoded after tags are
 *   found, so `&lt;b&gt;` is the text `<b>`, never a tag.
 * - Links: `href` is kept only for `http:`, `https:`, `mailto:` and relative URLs (checked before
 *   and after percent-decoding, like Plotly's `sanitizeHref`); `target` defaults to `_blank`.
 *
 * Deviations: raw newlines (`\n`, `\r\n`) break lines by default (`newlines: 'break'`), as the
 * text primitive has always done; Plotly turns them into spaces (`newlines: 'space'`). `<br/>` is
 * a line break too (Plotly shows `<br/>` literally). The `popup` link attribute is ignored.
 */
import { toRGBA, type RGBA } from '../coerce/color.ts';

/** Formatting tags (every known tag except `<br>`). */
export type RichTextTag = 'b' | 'strong' | 'i' | 'em' | 'u' | 's' | 'sup' | 'sub' | 'span' | 'a';

/** A validated `style` declaration: a lowercase property and its trimmed value. */
export interface RichTextDeclaration {
  readonly property:
    'color' | 'font-size' | 'font-family' | 'font-weight' | 'font-style' | 'text-decoration';
  readonly value: string;
}

/** A link: a sanitized `href` and its `target` (default `_blank`). */
export interface RichTextLink {
  readonly href: string;
  readonly target: string;
}

/** A text node: decoded text (entities resolved, no tags). */
export interface RichTextString {
  readonly kind: 'text';
  readonly text: string;
}

/** A line break (`<br>`, or a raw newline with `newlines: 'break'`). */
export interface RichTextBreak {
  readonly kind: 'br';
}

/** A formatting element and its children. */
export interface RichTextElement {
  readonly kind: 'element';
  readonly tag: RichTextTag;
  /** The validated declarations of its `style` attribute, in source order. */
  readonly style: readonly RichTextDeclaration[];
  /** `<a>` with a safe `href` only. */
  readonly link?: RichTextLink;
  readonly children: readonly RichTextNode[];
}

/** A node of a parsed rich text. */
export type RichTextNode = RichTextString | RichTextBreak | RichTextElement;

/** Options for {@link parseRichText} and {@link richTextLines}. */
export interface RichTextParseOptions {
  /**
   * Raw newlines: `'break'` (default) starts a new line, `'space'` becomes a space (Plotly's SVG
   * text, where only `<br>` breaks lines).
   */
  newlines?: 'break' | 'space';
}

/** Font overrides of a run, relative to the text's base font (unset fields inherit). */
export interface RichTextRunFont {
  family?: string;
  /** Absolute size in px (set when it differs from the base size). */
  size?: number;
  weight?: number | 'normal' | 'bold';
  style?: 'normal' | 'italic';
  /** Decoration lines as a `font.lineposition` flaglist, e.g. `'under+through'`. */
  lineposition?: string;
}

/** A run of text drawn with one style. */
export interface RichTextRun {
  /** Decoded text, never containing a newline. */
  text: string;
  /** Overrides of the base font; absent when the run uses the base font. */
  font?: RichTextRunFont;
  /** sRGB 0–1 RGBA from a `color` style; absent for the base color. */
  color?: RGBA;
  /** Baseline shift in px, positive up (`<sup>`), negative down (`<sub>`). */
  shift?: number;
  /** The enclosing link, if any. */
  link?: RichTextLink;
}

/** One line of runs (possibly empty). */
export type RichTextLine = readonly RichTextRun[];

/** Options for {@link richTextLines}. */
export interface RichTextLinesOptions extends RichTextParseOptions {
  /** Base font size in px: sizes and baseline shifts are resolved against it. */
  size: number;
}

/** Size factor of `<sup>` / `<sub>` (Plotly's `font-size:70%`). */
export const SCRIPT_SIZE = 0.7;
/** `<sup>` baseline raise, in em of the superscript's own size (Plotly `dy: -0.6em`). */
export const SUP_SHIFT = 0.6;
/** `<sub>` baseline drop, in em of the subscript's own size (Plotly `dy: 0.3em`). */
export const SUB_SHIFT = 0.3;

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mu: 'μ',
  times: '×',
  plusmn: '±',
  deg: '°',
};

const ENTITY = /&(#\d+|#x[\da-f]+|[a-z]+);/gi;

/**
 * Decode the HTML entities Plotly labels use (see the module notes). Unknown names, `&#0;` and
 * code points past U+10FFFF stay literal.
 */
export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(ENTITY, (match, name: string) => {
    if (name.charCodeAt(0) === 35 /* # */) {
      const hex = name[1] === 'x' || name[1] === 'X';
      const code = hex ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[name.toLowerCase()] ?? match;
  });
}

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', '']);

/** The scheme a browser would give `url` (`''` for relative URLs), per the WHATWG URL parser. */
function protocolOf(url: string): string {
  // Browsers drop tabs/newlines anywhere and C0 controls or spaces at either end, so
  // `java\tscript:` and ` javascript:` are both javascript: URLs.
  // eslint-disable-next-line no-control-regex
  const s = url.replace(/[\t\n\r]/g, '').replace(/^[\u0000- ]+/, '');
  const m = /^([a-z][a-z\d+.-]*):/i.exec(s);
  return m ? `${(m[1] as string).toLowerCase()}:` : '';
}

/**
 * Plotly's `sanitizeHref`: the URL (percent-decoded, then re-encoded) when both it and the raw
 * input use a safe protocol (`http:`, `https:`, `mailto:` or none, i.e. relative), else `null`.
 * Malformed percent-encoding is rejected.
 */
export function sanitizeHref(href: string): string | null {
  if (href === '') return null;
  let decoded: string;
  try {
    decoded = encodeURI(decodeURI(href));
  } catch {
    return null;
  }
  return SAFE_PROTOCOLS.has(protocolOf(href)) && SAFE_PROTOCOLS.has(protocolOf(decoded))
    ? decoded
    : null;
}

const KNOWN_TAGS: ReadonlySet<string> = new Set<RichTextTag>([
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'sup',
  'sub',
  'span',
  'a',
]);

/** A `<…>` without nested angle brackets (Plotly's `SPLIT_TAGS`). */
const SPLIT_TAGS = /(<[^<>]*>)/;
/** Tag name, then the rest (attributes, or a self-closing slash). */
const ONE_TAG = /^<(\/?)([^\s/>]*)([\s\S]*)>$/;

/** Quoted attribute value (`name="…"` or `name='…'`), entity-decoded, or `undefined`. */
function attribute(attrs: string, name: string): string | undefined {
  const re = new RegExp(`(?:^|[\\s"'])${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
  const m = re.exec(attrs);
  const value = m ? (m[1] ?? m[2]) : undefined;
  return value === undefined ? undefined : decodeEntities(value);
}

/** CSS length units `font-size` accepts, as px per unit (em/rem/% are relative). */
const FONT_SIZE = /^(\d+(?:\.\d*)?|\.\d+)(px|pt|em|rem|%)$/i;

/** Characters never allowed in a kept style value (no declarations, blocks, functions, markup). */
const UNSAFE_VALUE = /[;{}<>\\]|\/\*|url\s*\(|expression\s*\(/i;

/** Validate one declaration; `undefined` drops it. */
function declaration(property: string, value: string): RichTextDeclaration | undefined {
  if (value === '' || UNSAFE_VALUE.test(value)) return undefined;
  switch (property) {
    case 'color':
      return toRGBA(value) ? { property, value } : undefined;
    case 'font-size':
      return FONT_SIZE.test(value) ? { property, value } : undefined;
    case 'font-family':
      return /[()]/.test(value) ? undefined : { property, value };
    case 'font-weight':
      return /^(normal|bold|bolder|lighter|[1-9]\d{0,2}|1000)$/i.test(value)
        ? { property, value }
        : undefined;
    case 'font-style':
      return /^(normal|italic|oblique)$/i.test(value) ? { property, value } : undefined;
    case 'text-decoration':
      return /^(none|underline|overline|line-through)(\s+(underline|overline|line-through))*$/i.test(
        value,
      )
        ? { property, value }
        : undefined;
    default:
      return undefined;
  }
}

/** Parse a `style` attribute into validated declarations (unknown or unsafe ones dropped). */
export function parseRichTextStyle(style: string): RichTextDeclaration[] {
  const out: RichTextDeclaration[] = [];
  for (const decl of style.split(';')) {
    const colon = decl.indexOf(':');
    if (colon < 0) continue;
    const d = declaration(decl.slice(0, colon).trim().toLowerCase(), decl.slice(colon + 1).trim());
    if (d) out.push(d);
  }
  return out;
}

interface OpenElement {
  tag: RichTextTag;
  style: RichTextDeclaration[];
  link?: RichTextLink;
  children: RichTextNode[];
}

const NEWLINES = /\r\n?|\n/g;

/**
 * Parse Plotly pseudo-HTML into a tree (see the module notes for the semantics). Never throws;
 * text nodes hold decoded text.
 *
 * @example
 * ```ts
 * parseRichText('a<b>b</b>');
 * // [{ kind: 'text', text: 'a' }, { kind: 'element', tag: 'b', style: [], children: [{ kind: 'text', text: 'b' }] }]
 * ```
 */
export function parseRichText(text: string, options: RichTextParseOptions = {}): RichTextNode[] {
  const root: RichTextNode[] = [];
  const stack: OpenElement[] = [];
  const children = (): RichTextNode[] => stack[stack.length - 1]?.children ?? root;
  const breakNewlines = options.newlines !== 'space';
  const pushText = (raw: string): void => {
    if (raw === '') return;
    const decoded = decodeEntities(raw);
    if (!breakNewlines) {
      children().push({ kind: 'text', text: decoded.replace(NEWLINES, ' ') });
      return;
    }
    const parts = decoded.split(NEWLINES);
    parts.forEach((part, k) => {
      if (k > 0) children().push({ kind: 'br' });
      if (part !== '') children().push({ kind: 'text', text: part });
    });
  };
  const str = String(text ?? '');
  // Plotly turns raw newlines into spaces before looking at tags; entity-encoded ones stay.
  const source = breakNewlines ? str : str.replace(NEWLINES, ' ');
  const parts = source.split(SPLIT_TAGS);
  for (let p = 0; p < parts.length; p++) {
    const part = parts[p] as string;
    // split() with a capture group alternates text (even) and tags (odd).
    const m = p % 2 === 1 ? ONE_TAG.exec(part) : null;
    const name = m ? (m[2] as string).toLowerCase() : '';
    const rest = m ? (m[3] as string) : '';
    const selfClosing = /^\s*\/\s*$/.test(rest);
    const wellFormed = m !== null && (rest === '' || selfClosing || /^\s/.test(rest));
    if (wellFormed && name === 'br') {
      children().push({ kind: 'br' });
      continue;
    }
    if (!wellFormed || !KNOWN_TAGS.has(name)) {
      pushText(part);
      continue;
    }
    if (m[1] === '/') {
      // Close the innermost open tag, whatever its name; a stray closing tag is dropped.
      const open = stack.pop();
      if (open) children().push(freeze(open));
      continue;
    }
    const tag = name as RichTextTag;
    const styleAttr = attribute(rest, 'style');
    const el: OpenElement = {
      tag,
      style: styleAttr ? parseRichTextStyle(styleAttr) : [],
      children: [],
    };
    if (tag === 'a') {
      const href = attribute(rest, 'href');
      const safe = href ? sanitizeHref(href) : null;
      if (safe) {
        const target = attribute(rest, 'target');
        el.link = { href: safe, target: target && !/\s/.test(target) ? target : '_blank' };
      }
    }
    if (selfClosing) children().push(freeze(el));
    else stack.push(el);
  }
  while (stack.length > 0) {
    const open = stack.pop() as OpenElement;
    children().push(freeze(open));
  }
  return root;
}

function freeze(el: OpenElement): RichTextElement {
  return {
    kind: 'element',
    tag: el.tag,
    style: el.style,
    ...(el.link ? { link: el.link } : {}),
    children: el.children,
  };
}

/** Whether `text` may contain markup or entities (cheap pre-check for a plain-text fast path). */
export function mayContainRichText(text: string): boolean {
  return /[<&]/.test(text);
}

/**
 * Plain text of a rich text: tags removed, entities decoded, line breaks as `\n` (raw newlines
 * per `options.newlines`). Unknown tags stay, as they are drawn literally.
 */
export function richTextToPlain(
  input: string | readonly RichTextNode[],
  options: RichTextParseOptions = {},
): string {
  if (typeof input === 'string' && !mayContainRichText(input)) {
    return options.newlines === 'space'
      ? input.replace(NEWLINES, ' ')
      : input.replace(/\r\n?/g, '\n');
  }
  const nodes = typeof input === 'string' ? parseRichText(input, options) : input;
  let out = '';
  const walk = (list: readonly RichTextNode[]): void => {
    for (const node of list) {
      if (node.kind === 'text') out += node.text;
      else if (node.kind === 'br') out += '\n';
      else walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

interface RunState {
  size: number;
  shift: number;
  weight: RichTextRunFont['weight'];
  style: RichTextRunFont['style'];
  family: string | undefined;
  color: RGBA | undefined;
  under: boolean;
  over: boolean;
  through: boolean;
  link: RichTextLink | undefined;
}

/** A `font-size` value in px, relative to `size` (current) and `base` (root). */
function fontSizePx(value: string, size: number, base: number): number | undefined {
  const m = FONT_SIZE.exec(value);
  if (!m) return undefined;
  const v = Number(m[1]);
  switch ((m[2] as string).toLowerCase()) {
    case 'px':
      return v;
    case 'pt':
      return (v * 4) / 3;
    case 'em':
      return v * size;
    case 'rem':
      return v * base;
    default:
      return (v / 100) * size;
  }
}

/** Apply `style` declarations to a run state (in order; later ones win). */
function applyDeclarations(
  s: RunState,
  style: readonly RichTextDeclaration[],
  base: number,
  script: boolean,
): void {
  for (const { property, value } of style) {
    const v = value.toLowerCase();
    switch (property) {
      case 'color':
        s.color = toRGBA(value) ?? s.color;
        break;
      case 'font-size':
        // A sup/sub's own 70% comes after the user's style in Plotly, so it wins.
        if (!script) s.size = fontSizePx(value, s.size, base) ?? s.size;
        break;
      case 'font-family':
        s.family = value;
        break;
      case 'font-weight':
        s.weight =
          v === 'bold' || v === 'bolder'
            ? 'bold'
            : v === 'normal' || v === 'lighter'
              ? 'normal'
              : Number(v);
        break;
      case 'font-style':
        s.style = v === 'normal' ? 'normal' : 'italic';
        break;
      case 'text-decoration':
        // Decorations propagate to descendants and can't be removed by them (CSS), so `none` is
        // a no-op for inherited lines.
        if (v.includes('underline')) s.under = true;
        if (v.includes('overline')) s.over = true;
        if (v.includes('line-through')) s.through = true;
        break;
    }
  }
}

/** The run state inside `el`, derived from its parent's. */
function enter(parent: RunState, el: RichTextElement, base: number): RunState {
  const s: RunState = { ...parent };
  const script = el.tag === 'sup' || el.tag === 'sub';
  applyDeclarations(s, el.style, base, script);
  switch (el.tag) {
    case 'b':
    case 'strong':
      s.weight = 'bold';
      break;
    case 'i':
      s.style = 'italic';
      break;
    case 'em':
      s.weight = 'bold';
      s.style = 'italic';
      break;
    case 'u':
      s.under = true;
      break;
    case 's':
      s.through = true;
      break;
    case 'sup':
      s.size = parent.size * SCRIPT_SIZE;
      s.shift = parent.shift + SUP_SHIFT * s.size;
      break;
    case 'sub':
      s.size = parent.size * SCRIPT_SIZE;
      s.shift = parent.shift - SUB_SHIFT * s.size;
      break;
    case 'a':
      if (el.link) s.link = el.link;
      break;
    case 'span':
      break;
  }
  return s;
}

function runOf(text: string, s: RunState, base: number): RichTextRun {
  const font: RichTextRunFont = {};
  if (s.family !== undefined) font.family = s.family;
  if (s.size !== base) font.size = s.size;
  if (s.weight !== undefined) font.weight = s.weight;
  if (s.style !== undefined) font.style = s.style;
  if (s.under || s.over || s.through) {
    font.lineposition = [s.under && 'under', s.over && 'over', s.through && 'through']
      .filter(Boolean)
      .join('+');
  }
  const run: RichTextRun = { text };
  if (Object.keys(font).length > 0) run.font = font;
  if (s.color) run.color = s.color;
  if (s.shift !== 0) run.shift = s.shift;
  if (s.link) run.link = s.link;
  return run;
}

function sameRunStyle(a: RichTextRun, b: RichTextRun): boolean {
  const fa = a.font;
  const fb = b.font;
  return (
    a.shift === b.shift &&
    a.link === b.link &&
    (a.color === b.color ||
      (a.color !== undefined &&
        b.color !== undefined &&
        a.color.every((c, k) => c === (b.color as RGBA)[k]))) &&
    fa?.family === fb?.family &&
    fa?.size === fb?.size &&
    fa?.weight === fb?.weight &&
    fa?.style === fb?.style &&
    fa?.lineposition === fb?.lineposition
  );
}

/**
 * Flatten a rich text into lines of styled runs, resolving sizes and baseline shifts against
 * `options.size`. Adjacent runs with the same style are merged; empty runs are dropped; there is
 * always at least one line.
 *
 * @example
 * ```ts
 * richTextLines('x<sup>2</sup>', { size: 10 });
 * // [[{ text: 'x' }, { text: '2', font: { size: 7 }, shift: 4.2 }]]
 * ```
 */
export function richTextLines(
  input: string | readonly RichTextNode[],
  options: RichTextLinesOptions,
): RichTextRun[][] {
  const base = options.size;
  const lines: RichTextRun[][] = [[]];
  if (typeof input === 'string' && !mayContainRichText(input)) {
    const parts =
      options.newlines === 'space' ? [input.replace(NEWLINES, ' ')] : input.split(NEWLINES);
    return parts.map((t) => (t === '' ? [] : [{ text: t }]));
  }
  const nodes = typeof input === 'string' ? parseRichText(input, options) : input;
  const root: RunState = {
    size: base,
    shift: 0,
    weight: undefined,
    style: undefined,
    family: undefined,
    color: undefined,
    under: false,
    over: false,
    through: false,
    link: undefined,
  };
  const walk = (list: readonly RichTextNode[], state: RunState): void => {
    for (const node of list) {
      if (node.kind === 'br') {
        lines.push([]);
      } else if (node.kind === 'text') {
        if (node.text === '') continue;
        const line = lines[lines.length - 1] as RichTextRun[];
        const run = runOf(node.text, state, base);
        const prev = line[line.length - 1];
        if (prev && sameRunStyle(prev, run)) prev.text += run.text;
        else line.push(run);
      } else {
        walk(node.children, enter(state, node, base));
      }
    }
  };
  walk(nodes, root);
  return lines;
}

/** Whether any run of `lines` is styled (font, color, shift or link), i.e. not plain text. */
export function isStyledRichText(lines: readonly RichTextLine[]): boolean {
  return lines.some((line) =>
    line.some(
      (r) =>
        r.font !== undefined ||
        r.color !== undefined ||
        r.shift !== undefined ||
        r.link !== undefined,
    ),
  );
}

/**
 * The style shared by every run of `lines`, when they all have the same one (e.g. a title wrapped
 * in `<b>…</b>`), so the text can be drawn as one plain label with that font and color; `null`
 * when runs differ or carry a baseline shift or a link.
 */
export function uniformRichTextStyle(
  lines: readonly RichTextLine[],
): Pick<RichTextRun, 'font' | 'color'> | null {
  let first: RichTextRun | undefined;
  for (const line of lines) {
    for (const r of line) {
      if (r.shift !== undefined || r.link !== undefined) return null;
      if (!first) first = r;
      else if (!sameRunStyle(first, r)) return null;
    }
  }
  if (!first) return {};
  return {
    ...(first.font ? { font: first.font } : {}),
    ...(first.color ? { color: first.color } : {}),
  };
}

/** A label resolved by {@link richTextLabel}. */
export interface RichTextLabel<F> {
  /** Plain equivalent: tags removed, entities decoded, one `\n` per line break. */
  readonly text: string;
  /** The base font, with the label-wide style merged in when every run shares one. */
  readonly font: F;
  /** Styled runs when they differ (absolute sizes in px); unset for a single-style label. */
  readonly runs?: RichTextRun[][];
  readonly lineCount: number;
}

const LINE_FLAGS = ['under', 'over', 'through'] as const;

/**
 * Resolve Plotly pseudo-HTML against a base font for a text renderer: `undefined` for text
 * without markup or entities (keep the plain path); a single-style label (a whole title in
 * `<b>…</b>`, or markup that is only `<br>` and entities) as plain text with that style merged
 * into `font`; anything else with its runs. A label-wide color stays in runs (the label color
 * may carry opacity, contrast or selection styling).
 */
export function richTextLabel<
  F extends { size: number; lineposition?: string | undefined } & Omit<
    RichTextRunFont,
    'size' | 'lineposition'
  >,
>(text: string, font: F, options: RichTextParseOptions = {}): RichTextLabel<F> | undefined {
  if (text === '' || !mayContainRichText(text)) return undefined;
  const lines = richTextLines(text, { ...options, size: font.size });
  const plain = lines.map((l) => l.map((r) => r.text).join('')).join('\n');
  const lineCount = lines.length;
  const uniform = uniformRichTextStyle(lines);
  if (!uniform || uniform.color) return { text: plain, font, runs: lines, lineCount };
  const u = uniform.font;
  if (!u) return { text: plain, font, lineCount };
  const merged: F = { ...font, ...u };
  if (u.lineposition !== undefined) {
    const has = (s: string | undefined, f: string) => (s ?? '').split('+').includes(f);
    const flags = LINE_FLAGS.filter((f) => has(font.lineposition, f) || has(u.lineposition, f));
    merged.lineposition = flags.length > 0 ? flags.join('+') : 'none';
  }
  return { text: plain, font: merged, lineCount };
}
