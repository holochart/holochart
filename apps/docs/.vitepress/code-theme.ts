/**
 * Shiki theme for code blocks, derived from the `holochart` chart template (ADR-021): the page
 * background `#0a0a0f`, the template's text greys, and lightened tints of its colorway so every
 * token has at least 4.5:1 contrast on the `#0e0e15` code-block background.
 *
 * Only the colors Shiki needs are set; VitePress draws the block background itself
 * (`--vp-code-block-bg` in `theme/custom.css`).
 */
import type { MarkdownOptions } from 'vitepress';

type ShikiTheme = Extract<NonNullable<MarkdownOptions['theme']>, { name?: string }>;

const c = {
  fg: '#c9ccd6',
  muted: '#9a9dab',
  comment: '#7d8090',
  red: '#ff6b73', // colorway red   #ea2a37
  blue: '#8d9df0', // colorway blue  #5e74d5
  indigo: '#c49bea', // colorway indigo #9962c0
  emerald: '#5fd08a', // colorway emerald #118e36
  orange: '#ff9e4a', // colorway orange #cc540a
  teal: '#5fcfcf', // colorway teal  #128b8b
  gold: '#e0b43a', // colorway gold  #997600
  magenta: '#e76fb8', // colorway magenta #b8267e
};

export const holochartCodeTheme = {
  name: 'holochart-dark',
  type: 'dark',
  colors: {
    'editor.background': '#0e0e15',
    'editor.foreground': c.fg,
  },
  fg: c.fg,
  bg: '#0e0e15',
  tokenColors: [
    {
      scope: ['comment', 'punctuation.definition.comment', 'string.comment'],
      settings: { foreground: c.comment, fontStyle: 'italic' },
    },
    {
      scope: [
        'keyword',
        'storage',
        'storage.type',
        'storage.modifier',
        'keyword.control',
        'keyword.operator.new',
        'keyword.operator.expression',
        'keyword.operator.logical.python',
      ],
      settings: { foreground: c.red },
    },
    {
      scope: [
        'keyword.operator',
        'punctuation',
        'meta.brace',
        'punctuation.separator',
        'punctuation.terminator',
      ],
      settings: { foreground: c.muted },
    },
    {
      scope: ['string', 'string.quoted', 'string.template', 'punctuation.definition.string'],
      settings: { foreground: c.emerald },
    },
    { scope: ['constant.character.escape', 'string.regexp'], settings: { foreground: c.teal } },
    {
      scope: [
        'constant.numeric',
        'constant.language',
        'constant.language.boolean',
        'constant.language.null',
        'constant.language.undefined',
        'support.constant',
      ],
      settings: { foreground: c.orange },
    },
    {
      scope: ['variable.other.constant', 'variable.other.enummember'],
      settings: { foreground: c.gold },
    },
    {
      scope: [
        'entity.name.function',
        'support.function',
        'meta.function-call entity.name.function',
        'variable.function',
      ],
      settings: { foreground: c.blue },
    },
    {
      scope: [
        'entity.name.type',
        'entity.name.class',
        'support.type',
        'support.class',
        'entity.other.inherited-class',
        'storage.type.class.jsdoc',
        'entity.name.type.module',
      ],
      settings: { foreground: c.indigo },
    },
    {
      scope: [
        'variable.other.property',
        'variable.other.object.property',
        'support.variable.property',
        'meta.object-literal.key',
        'support.type.property-name',
        'entity.name.tag.yaml',
      ],
      settings: { foreground: c.teal },
    },
    {
      scope: [
        'variable',
        'variable.other.readwrite',
        'variable.parameter',
        'meta.definition.variable',
      ],
      settings: { foreground: c.fg },
    },
    { scope: ['variable.language', 'variable.language.this'], settings: { foreground: c.magenta } },
    { scope: ['entity.name.tag', 'punctuation.definition.tag'], settings: { foreground: c.red } },
    { scope: ['entity.other.attribute-name'], settings: { foreground: c.gold } },
    {
      scope: ['markup.heading', 'entity.name.section'],
      settings: { foreground: c.blue, fontStyle: 'bold' },
    },
    { scope: ['markup.bold'], settings: { fontStyle: 'bold' } },
    { scope: ['markup.italic'], settings: { fontStyle: 'italic' } },
    { scope: ['markup.inline.raw', 'markup.fenced_code'], settings: { foreground: c.emerald } },
    { scope: ['markup.underline.link', 'string.other.link'], settings: { foreground: c.blue } },
    {
      scope: ['markup.inserted', 'punctuation.definition.inserted'],
      settings: { foreground: c.emerald },
    },
    {
      scope: ['markup.deleted', 'punctuation.definition.deleted'],
      settings: { foreground: c.red },
    },
    {
      scope: ['markup.changed', 'punctuation.definition.changed'],
      settings: { foreground: c.gold },
    },
    { scope: ['meta.diff.header', 'meta.diff.range'], settings: { foreground: c.indigo } },
    { scope: ['invalid'], settings: { foreground: c.red, fontStyle: 'underline' } },
  ],
} satisfies ShikiTheme;
