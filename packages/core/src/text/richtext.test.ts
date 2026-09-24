import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  decodeEntities,
  isStyledRichText,
  parseRichText,
  parseRichTextStyle,
  richTextLines,
  richTextToPlain,
  sanitizeHref,
  uniformRichTextStyle,
} from './richtext.ts';

const lines = (text: string, size = 10) => richTextLines(text, { size });
const NBSP = String.fromCharCode(0xa0);

describe('parseRichText', () => {
  it('builds a tree of the known tags', () => {
    expect(parseRichText('a<b>b<i>c</i></b>')).toEqual([
      { kind: 'text', text: 'a' },
      {
        kind: 'element',
        tag: 'b',
        style: [],
        children: [
          { kind: 'text', text: 'b' },
          { kind: 'element', tag: 'i', style: [], children: [{ kind: 'text', text: 'c' }] },
        ],
      },
    ]);
  });

  it('is case-insensitive and accepts <br> variants', () => {
    const nodes = parseRichText('a<BR>b<br/>c<br />d</br>e<B>f</B>');
    expect(nodes.filter((n) => n.kind === 'br')).toHaveLength(4);
    expect(nodes.at(-1)).toMatchObject({ kind: 'element', tag: 'b' });
  });

  it('keeps unknown and malformed tags as literal text', () => {
    const text = '<script>x</script><img src=x onerror=y>< b>a<bx>';
    expect(parseRichText(text).every((n) => n.kind === 'text')).toBe(true);
    expect(richTextToPlain(text)).toBe(text);
  });

  it('closes the innermost tag on any closing tag and drops stray ones', () => {
    // Plotly: "Start tag <b> doesnt match end tag <i>. Pretending it did match."
    expect(lines('<b>a</i>b</b>c')).toEqual([
      [{ text: 'a', font: { weight: 'bold' } }, { text: 'bc' }],
    ]);
    expect(richTextToPlain('</b>x</sup>')).toBe('x');
  });

  it('closes tags left open at the end', () => {
    expect(lines('a<b>b')).toEqual([[{ text: 'a' }, { text: 'b', font: { weight: 'bold' } }]]);
  });

  it('decodes entities in text but never turns them into tags', () => {
    expect(parseRichText('&lt;b&gt;x&lt;/b&gt;')).toEqual([{ kind: 'text', text: '<b>x</b>' }]);
  });

  it('breaks lines at raw newlines by default, or turns them into spaces (Plotly)', () => {
    expect(richTextToPlain('a\nb\r\nc')).toBe('a\nb\nc');
    expect(richTextToPlain('a\nb\r\n<b>c</b>', { newlines: 'space' })).toBe('a b c');
    expect(richTextToPlain('a\nb', { newlines: 'space' })).toBe('a b');
  });

  it('keeps only safe links', () => {
    const link = (html: string) => {
      const el = parseRichText(html)[0];
      return el?.kind === 'element' ? el.link : undefined;
    };
    expect(link('<a href="https://x.org/a b">l</a>')).toEqual({
      href: 'https://x.org/a%20b',
      target: '_blank',
    });
    expect(link(`<a href='/rel' target='_self'>l</a>`)).toEqual({ href: '/rel', target: '_self' });
    expect(link('<a href="mailto:a@b.c">l</a>')?.href).toBe('mailto:a@b.c');
    expect(link('<a href="javascript:alert(1)">l</a>')).toBeUndefined();
    expect(link('<a href="JaVaScRiPt:alert(1)">l</a>')).toBeUndefined();
    expect(link('<a href="java&#x09;script:alert(1)">l</a>')).toBeUndefined();
    expect(link('<a href="data:text/html,x">l</a>')).toBeUndefined();
    expect(link('<a>l</a>')).toBeUndefined();
  });

  it('parses and filters span styles', () => {
    expect(
      parseRichTextStyle(
        'color: red; position: absolute; background: url(x); font-size: 12px; font-weight:bold;' +
          'color:expression(alert(1)); font-family: "Open Sans", serif; text-decoration: underline',
      ),
    ).toEqual([
      { property: 'color', value: 'red' },
      { property: 'font-size', value: '12px' },
      { property: 'font-weight', value: 'bold' },
      { property: 'font-family', value: '"Open Sans", serif' },
      { property: 'text-decoration', value: 'underline' },
    ]);
    expect(parseRichTextStyle('color: rgb(255, 0, 0)')).toEqual([
      { property: 'color', value: 'rgb(255, 0, 0)' },
    ]);
    expect(parseRichTextStyle('font-size: 12; color: notacolor')).toEqual([]);
  });
});

describe('richTextLines', () => {
  it('styles every tag like Plotly', () => {
    expect(lines('<b>b</b><i>i</i><em>e</em><strong>s</strong>')).toEqual([
      [
        { text: 'b', font: { weight: 'bold' } },
        { text: 'i', font: { style: 'italic' } },
        { text: 'e', font: { weight: 'bold', style: 'italic' } },
        { text: 's', font: { weight: 'bold' } },
      ],
    ]);
    expect(lines('<u>u</u><s>s</s><u><s>us</s></u>')).toEqual([
      [
        { text: 'u', font: { lineposition: 'under' } },
        { text: 's', font: { lineposition: 'through' } },
        { text: 'us', font: { lineposition: 'under+through' } },
      ],
    ]);
  });

  it('shrinks and shifts sup/sub, nested', () => {
    const [line] = lines('x<sup>2<sup>n</sup></sup>H<sub>2</sub>', 10);
    expect(line?.[0]).toEqual({ text: 'x' });
    expect(line?.[1]?.font?.size).toBeCloseTo(7);
    expect(line?.[1]?.shift).toBeCloseTo(4.2);
    expect(line?.[2]?.font?.size).toBeCloseTo(4.9);
    expect(line?.[2]?.shift).toBeCloseTo(4.2 + 0.6 * 4.9);
    expect(line?.[3]).toEqual({ text: 'H' });
    expect(line?.[4]?.shift).toBeCloseTo(-2.1);
  });

  it('applies span styles; tag styles win over the style attribute', () => {
    const [line] = lines(
      '<span style="color:#f00;font-size:20px;font-family:Mono">a</span>' +
        '<span style="font-size:150%">b</span><b style="font-weight:normal">c</b>' +
        '<span style="font-weight:300;font-style:oblique">d</span>',
    );
    expect(line?.[0]).toEqual({
      text: 'a',
      font: { family: 'Mono', size: 20 },
      color: [1, 0, 0, 1],
    });
    expect(line?.[1]?.font?.size).toBe(15);
    expect(line?.[2]?.font?.weight).toBe('bold');
    expect(line?.[3]?.font).toEqual({ weight: 300, style: 'italic' });
  });

  it('carries styles across <br> and merges equal runs', () => {
    expect(lines('<b>a<br>b</b>c<x>d')).toEqual([
      [{ text: 'a', font: { weight: 'bold' } }],
      [{ text: 'b', font: { weight: 'bold' } }, { text: 'c<x>d' }],
    ]);
    expect(lines('')).toEqual([[]]);
    expect(lines('a<br>')).toEqual([[{ text: 'a' }], []]);
  });

  it('attaches links to runs', () => {
    const [line] = lines('go <a href="https://a.b">here</a>');
    expect(line?.[1]).toEqual({ text: 'here', link: { href: 'https://a.b', target: '_blank' } });
    expect(isStyledRichText(lines('plain <x>'))).toBe(false);
    expect(isStyledRichText(lines('<a href="/x">l</a>'))).toBe(true);
  });

  it('reports a style shared by every run', () => {
    expect(uniformRichTextStyle(lines('<b>A<br>B</b>'))).toEqual({ font: { weight: 'bold' } });
    expect(uniformRichTextStyle(lines('<b>A</b>B'))).toBeNull();
    expect(uniformRichTextStyle(lines('x<sup>2</sup>'))).toBeNull();
    expect(uniformRichTextStyle(lines('plain'))).toEqual({});
  });
});

describe('decodeEntities', () => {
  it('decodes named and numeric entities, leaving others alone', () => {
    expect(decodeEntities('&amp;&lt;&gt;&quot;&apos;&#39;&nbsp;&AMP;')).toBe(`&<>"''${NBSP}&`);
    expect(decodeEntities('&mu;&times;&plusmn;&deg;&#65;&#x42;&#X43;')).toBe('μ×±°ABC');
    expect(decodeEntities('&foo; &#0; &#x110000; & alone')).toBe('&foo; &#0; &#x110000; & alone');
    expect(decodeEntities('&amp;lt;')).toBe('&lt;');
  });
});

describe('sanitizeHref', () => {
  it('allows http(s), mailto and relative URLs only', () => {
    expect(sanitizeHref('https://example.com/?q=1')).toBe('https://example.com/?q=1');
    expect(sanitizeHref('page.html#x')).toBe('page.html#x');
    expect(sanitizeHref('//cdn.example.com/x')).toBe('//cdn.example.com/x');
    for (const bad of [
      'javascript:alert(1)',
      ' javascript:alert(1)',
      'java\nscript:alert(1)',
      '%6Aavascript:alert(1)',
      'data:text/html;base64,xx',
      'vbscript:x',
      'file:///etc/passwd',
      '%E0%A4%A',
      '',
    ]) {
      expect(sanitizeHref(bad), bad).toBeNull();
    }
  });
});

// ---- Property tests ----------------------------------------------------------------------------

const TAGS = ['b', 'i', 'em', 'strong', 'u', 's', 'sup', 'sub', 'span', 'a'];
const ENTITIES: [string, string][] = [
  ['&amp;', '&'],
  ['&lt;', '<'],
  ['&gt;', '>'],
  ['&#65;', 'A'],
  ['&deg;', '°'],
];

/** A fragment and its expected plain text. */
const fragment = fc.oneof(
  fc.string({ unit: fc.constantFrom('a', 'b', ' ', 'é', '1', NBSP) }).map((t) => [t, t]),
  fc.constantFrom(...ENTITIES),
  fc.constantFrom(...TAGS).map((t) => [`<${t}>`, '']),
  fc.constantFrom(...TAGS).map((t) => [`</${t}>`, '']),
  fc.constant(['<span style="color:red;font-size:9px">', '']),
  fc.constant(['<a href="https://x.y" target="_top">', '']),
  fc.constant(['<br>', '\n']),
  fc.constant(['<unknown>', '<unknown>']),
) as fc.Arbitrary<[string, string]>;

describe('rich text properties', () => {
  it('never throws on arbitrary input', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (s) => {
        parseRichText(s);
        richTextLines(s, { size: 12 });
        richTextToPlain(s, { newlines: 'space' });
      }),
    );
  });

  it('plain text equals the input with tags removed and entities decoded', () => {
    fc.assert(
      fc.property(fc.array(fragment, { maxLength: 20 }), (parts) => {
        const input = parts.map((p) => p[0]).join('');
        const expected = parts.map((p) => p[1]).join('');
        expect(richTextToPlain(input)).toBe(expected);
        const joined = richTextLines(input, { size: 10 })
          .map((l) => l.map((r) => r.text).join(''))
          .join('\n');
        expect(joined).toBe(expected);
      }),
    );
  });
});
