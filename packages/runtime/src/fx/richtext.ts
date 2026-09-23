/**
 * Plotly pseudo-HTML (`<b>`, `<i>`, `<br>`, `<sup>`, `<sub>`, `<span style>`) → DOM nodes, for DOM
 * hover labels. Text always goes through `textContent`, never `innerHTML`: templates carry user
 * data, so only the whitelisted tags become elements and everything else stays literal text.
 */

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  '#39': "'",
};

/** Decode the few HTML entities Plotly labels use (`&amp;`, `&lt;`, `&#123;`, `&#x1F;`). */
export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, name: string) => {
    if (name[0] === '#') {
      const code =
        name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[name.toLowerCase()] ?? m;
  });
}

const TAGS: Readonly<Record<string, string>> = {
  b: 'b',
  strong: 'b',
  i: 'i',
  em: 'i',
  sup: 'sup',
  sub: 'sub',
  s: 's',
  span: 'span',
};

/** CSS properties a `<span style>` may set (no url(), no positioning). */
const STYLE_PROPS = new Set(['color', 'font-weight', 'font-style', 'font-size', 'font-family']);

function safeStyle(style: string): string {
  const out: string[] = [];
  for (const decl of style.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const value = decl.slice(i + 1).trim();
    if (STYLE_PROPS.has(prop) && !/[()<>"\\]/.test(value)) out.push(`${prop}:${value}`);
  }
  return out.join(';');
}

const TOKEN = /<(\/?)([a-z]+)\s*([^>]*)>/gi;

/**
 * Append `text` (Plotly pseudo-HTML) to `parent` as DOM nodes. Unknown or unbalanced tags stay
 * literal text; `<br>` becomes a line break.
 */
export function appendRichText(parent: HTMLElement, text: string): void {
  const doc = parent.ownerDocument;
  const stack: HTMLElement[] = [parent];
  let last = 0;
  const top = (): HTMLElement => stack[stack.length - 1] as HTMLElement;
  const pushText = (s: string): void => {
    if (s) top().appendChild(doc.createTextNode(decodeEntities(s)));
  };
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(text); m; m = TOKEN.exec(text)) {
    const closing = m[1] === '/';
    const name = (m[2] ?? '').toLowerCase();
    const attrs = m[3] ?? '';
    if (name === 'br') {
      pushText(text.slice(last, m.index));
      top().appendChild(doc.createElement('br'));
      last = m.index + m[0].length;
      continue;
    }
    const tag = TAGS[name];
    if (!tag) continue;
    if (closing) {
      // Close only a matching open tag; otherwise leave the text literal.
      const open = stack.length > 1 && top().dataset['tag'] === name;
      if (!open) continue;
      pushText(text.slice(last, m.index));
      stack.pop();
    } else {
      pushText(text.slice(last, m.index));
      const el = doc.createElement(tag);
      el.dataset['tag'] = name;
      if (tag === 'span') {
        const style = /style\s*=\s*(["'])(.*?)\1/i.exec(attrs)?.[2];
        if (style) el.setAttribute('style', safeStyle(style));
      }
      top().appendChild(el);
      stack.push(el);
    }
    last = m.index + m[0].length;
  }
  pushText(text.slice(last));
}

/** Plain text of a pseudo-HTML string (tags removed, `<br>` → newline), e.g. for measuring. */
export function plainText(text: string): string {
  return decodeEntities(text.replace(/<br\s*\/?>/gi, '\n').replace(/<\/?[a-z][^>]*>/gi, ''));
}
