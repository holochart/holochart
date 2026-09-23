// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { appendRichText, decodeEntities, plainText } from './richtext.ts';

function render(text: string): HTMLDivElement {
  const div = document.createElement('div');
  appendRichText(div, text);
  return div;
}

/** Every element's tag name and attribute names under `root`. */
function elementsOf(root: Element): { tag: string; attrs: string[] }[] {
  return Array.from(root.querySelectorAll('*'), (el) => ({
    tag: el.tagName.toLowerCase(),
    attrs: el.getAttributeNames(),
  }));
}

describe('appendRichText', () => {
  it('builds whitelisted formatting tags', () => {
    const div = render('<b>bold</b> and <i>it</i>, x<sup>2</sup>, a<sub>i</sub>, <s>old</s>');
    expect(div.textContent).toBe('bold and it, x2, ai, old');
    expect(elementsOf(div).map((e) => e.tag)).toEqual(['b', 'i', 'sup', 'sub', 's']);
    expect(div.querySelector('b')?.textContent).toBe('bold');
  });

  it('maps strong / em to b / i, nests, and is case-insensitive', () => {
    const div = render('<STRONG>a<em>b</em></STRONG>c');
    expect(div.querySelector('b > i')?.textContent).toBe('b');
    expect(div.querySelector('b')?.textContent).toBe('ab');
    expect(div.lastChild?.textContent).toBe('c');
  });

  it('turns <br> variants into line breaks', () => {
    const div = render('a<br>b<br/>c<BR />d');
    expect(div.querySelectorAll('br')).toHaveLength(3);
    expect(div.textContent).toBe('abcd');
  });

  it('keeps unknown tags as literal text and never creates script or img elements', () => {
    const text = '<script>alert(1)</script><img src=x onerror=alert(1)><a href="#">l</a>';
    const div = render(text);
    expect(div.children).toHaveLength(0);
    expect(div.textContent).toBe(text);
  });

  it('drops attributes other than a filtered style', () => {
    const div = render(
      '<b onclick="steal()">x</b><span onmouseover="steal()" style="color:red">y</span>',
    );
    for (const { attrs } of elementsOf(div)) {
      expect(attrs.filter((a) => a.startsWith('on'))).toEqual([]);
    }
    expect(div.querySelector('span')?.getAttribute('style')).toBe('color:red');
  });

  it('keeps only safe style properties on spans', () => {
    const div = render(
      `<span style="color: red; position: absolute; background: url(x); font-size: 12px">a</span>` +
        `<span style='font-weight:bold;color:expression(alert(1))'>b</span>`,
    );
    const spans = div.querySelectorAll('span');
    expect(spans[0]?.getAttribute('style')).toBe('color:red;font-size:12px');
    expect(spans[1]?.getAttribute('style')).toBe('font-weight:bold');
  });

  it('keeps unbalanced closing tags as literal text', () => {
    expect(render('</b>x').textContent).toBe('</b>x');
    const div = render('<b>a</i>b</b>');
    expect(div.children).toHaveLength(1);
    expect(div.querySelector('b')?.textContent).toBe('a</i>b');
  });

  it('decodes entities without turning them into tags', () => {
    const div = render('&lt;b&gt;1 &amp; 2&lt;/b&gt;');
    expect(div.children).toHaveLength(0);
    expect(div.textContent).toBe('<b>1 & 2</b>');
  });

  it('appends after existing children', () => {
    const div = document.createElement('div');
    div.append('pre:');
    appendRichText(div, '<b>x</b>');
    expect(div.textContent).toBe('pre:x');
  });
});

describe('decodeEntities', () => {
  it('decodes named and numeric entities', () => {
    expect(decodeEntities('&amp;&lt;&gt;&quot;')).toBe('&<>"');
    expect(decodeEntities('&apos;&#39;&nbsp;')).toBe(`''\u00a0`);
    expect(decodeEntities('&#65;&#x42;&#X43;&AMP;')).toBe('ABC&');
  });

  it('leaves unknown or out-of-range entities alone', () => {
    expect(decodeEntities('&foo; &#0; &#x110000; & alone')).toBe('&foo; &#0; &#x110000; & alone');
  });
});

describe('plainText', () => {
  it('strips tags and turns <br> into newlines', () => {
    expect(plainText('<b>a</b><br>b &amp; <span style="color:red">c</span><br/>d')).toBe(
      'a\nb & c\nd',
    );
  });
});
