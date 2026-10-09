import { describe, expect, it } from 'vitest';
import {
  exampleIds,
  isInternalExample,
  lintPage,
  parsePage,
  type Finding,
} from '../../apps/docs/scripts/lint-pages.ts';

const KNOWN = new Set(['scatter/basic', '_dev/hello-cube', '_spikes/a-markers']);

function lint(body: string, file = 'fundamentals/page.md'): Finding[] {
  const source = `---\ntitle: Page\nstatus: draft\n---\n\n# Page\n\n${body}\n`;
  return lintPage(parsePage(file, source), KNOWN);
}

const internal = (id: string): string =>
  `<Example id="${id}">: internal example embedded in a public page; embed a public example.`;

describe('lint-pages: example embeds', () => {
  it('accepts public examples that exist', () => {
    expect(lint('<Example id="scatter/basic" :height="320" />')).toEqual([]);
  });

  it('reports examples that do not exist', () => {
    expect(lint('<Example id="scatter/nope" />')).toEqual([
      {
        file: 'fundamentals/page.md',
        level: 'error',
        message: '<Example id="scatter/nope"> does not exist in examples/.',
      },
    ]);
  });

  it('reports internal examples, whether they exist or not', () => {
    const findings = lint(
      [
        '<Example id="_dev/hello-cube" />',
        `<Example :height="400" id='_spikes/a-markers' />`,
        '<Example id="_dev/gone" />',
      ].join('\n\n'),
    );
    expect(findings.map((f) => [f.level, f.message])).toEqual([
      ['error', internal('_dev/hello-cube')],
      ['error', internal('_spikes/a-markers')],
      ['error', internal('_dev/gone')],
    ]);
  });

  it('reports internal examples on chart pages too', () => {
    const findings = lint('<Example id="_dev/hello-cube" />', 'charts/basic/scatter.md');
    expect(findings.map((f) => f.message)).toContain(internal('_dev/hello-cube'));
  });

  it('ignores embeds inside code fences and HTML comments', () => {
    const body = [
      '```md',
      '<Example id="_dev/hello-cube" />',
      '```',
      '',
      '<!-- <Example id="_dev/hello-cube" /> -->',
    ].join('\n');
    expect(exampleIds(parsePage('page.md', body).body)).toEqual([]);
    expect(lint(body)).toEqual([]);
  });

  it('knows internal ids by their first segment', () => {
    expect(isInternalExample('_dev/hello-cube')).toBe(true);
    expect(isInternalExample('_spikes/a-markers')).toBe(true);
    expect(isInternalExample('scatter/basic')).toBe(false);
    expect(isInternalExample('demos/_draft')).toBe(false);
  });
});
