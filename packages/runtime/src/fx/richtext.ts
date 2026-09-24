/**
 * Plotly pseudo-HTML → DOM nodes, for DOM hover labels. Parsing is core's rich-text parser
 * (E2.10), shared with the SDF text renderer, so hover labels, titles and annotations agree on
 * tags, entities, malformed input and link sanitizing.
 *
 * Text always goes through text nodes, never `innerHTML`: templates carry user data, so only the
 * whitelisted tags become elements (with attributes rebuilt from validated values) and everything
 * else stays literal text.
 */
import {
  decodeEntities as decode,
  parseRichText,
  richTextToPlain,
  type RichTextElement,
  type RichTextNode,
} from '@mk7s/holochart-core';

/** Decode the HTML entities Plotly labels use (`&amp;`, `&lt;`, `&#123;`, `&#x1F;`, …). */
export function decodeEntities(text: string): string {
  return decode(text);
}

/** Element per tag. `<strong>` / `<em>` keep Holochart's historical `b` / `i` elements. */
const ELEMENTS: Readonly<Record<RichTextElement['tag'], string>> = {
  b: 'b',
  strong: 'b',
  i: 'i',
  em: 'i',
  u: 'u',
  s: 's',
  sup: 'sup',
  sub: 'sub',
  span: 'span',
  a: 'a',
};

function element(doc: Document, node: RichTextElement): HTMLElement {
  const el = doc.createElement(ELEMENTS[node.tag]);
  const style = node.style.map((d) => `${d.property}:${d.value}`);
  // Plotly draws <em> bold italic.
  if (node.tag === 'em') style.push('font-weight:bold');
  if (style.length > 0) el.setAttribute('style', style.join(';'));
  if (node.link) {
    el.setAttribute('href', node.link.href);
    el.setAttribute('target', node.link.target);
    el.setAttribute('rel', 'noopener noreferrer');
  }
  return el;
}

function append(parent: Node, nodes: readonly RichTextNode[], doc: Document): void {
  for (const node of nodes) {
    if (node.kind === 'text') parent.appendChild(doc.createTextNode(node.text));
    else if (node.kind === 'br') parent.appendChild(doc.createElement('br'));
    else {
      const el = element(doc, node);
      append(el, node.children, doc);
      parent.appendChild(el);
    }
  }
}

/**
 * Append `text` (Plotly pseudo-HTML) to `parent` as DOM nodes. Unknown tags stay literal text,
 * stray closing tags are dropped and mismatched ones close the innermost tag (as in Plotly);
 * `<br>` breaks lines and raw newlines are spaces (Plotly; the labels are `white-space: nowrap`).
 */
export function appendRichText(parent: HTMLElement, text: string): void {
  append(parent, parseRichText(text, { newlines: 'space' }), parent.ownerDocument);
}

/** Plain text of a pseudo-HTML string (tags removed, `<br>` → newline), e.g. for measuring. */
export function plainText(text: string): string {
  return richTextToPlain(text, { newlines: 'space' });
}
