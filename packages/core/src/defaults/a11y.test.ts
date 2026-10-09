import { describe, expect, it } from 'vitest';
import { colorwayNames, getColorway, registerColorway } from '../colors/registry.ts';
import { createRegistry } from '../registry/registry.ts';
import { reducedMotion } from './a11y.ts';
import { supplyDefaults } from './supply-defaults.ts';

/** A window whose `prefers-reduced-motion` query answers `reduce`. */
function view(reduce: boolean): Window {
  return { matchMedia: (q: string) => ({ matches: reduce && q.includes('reduce') }) } as never;
}

describe('reducedMotion (E17.5)', () => {
  it("follows the user's preference by default", () => {
    expect(reducedMotion({ _reducedMotion: 'auto' }, view(true))).toBe(true);
    expect(reducedMotion({ _reducedMotion: 'auto' }, view(false))).toBe(false);
    expect(reducedMotion(undefined, view(true))).toBe(true);
    expect(reducedMotion({}, null)).toBe(false);
  });

  it('is forced on or off by config.a11y.reducedMotion', () => {
    expect(reducedMotion({ _reducedMotion: true }, view(false))).toBe(true);
    expect(reducedMotion({ _reducedMotion: false }, view(true))).toBe(false);
  });

  it('survives a throwing matchMedia', () => {
    const broken = {
      matchMedia: () => {
        throw new Error('no');
      },
    } as never;
    expect(reducedMotion({}, broken)).toBe(false);
  });
});

describe('what supply-defaults keeps of the config on the full layout', () => {
  const full = (config: Record<string, unknown>) =>
    supplyDefaults({ data: [], layout: {}, config }, createRegistry()).fullLayout;

  it('says whether the plot is static, for views that would move things by themselves', () => {
    expect(full({})._staticPlot).toBe(false);
    expect(full({ staticPlot: true })._staticPlot).toBe(true);
  });

  it('keeps config.worker, the default of a trace that can work off the main thread', () => {
    expect(full({})._worker).toBe(false);
    expect(full({ worker: 'auto' })._worker).toBe('auto');
    expect(full({ worker: true })._worker).toBe(true);
  });
});

describe('Safe palette (E17.5)', () => {
  it("is CARTO's colorblind-safe palette, always available by name", () => {
    // plotly.py `px.colors.qualitative.Safe`.
    expect(getColorway('Safe')).toEqual(
      [
        '#88CCEE',
        '#CC6677',
        '#DDCC77',
        '#117733',
        '#332288',
        '#AA4499',
        '#44AA99',
        '#999933',
        '#882255',
        '#661100',
        '#888888',
      ].map((hex) => {
        const n = parseInt(hex.slice(1), 16);
        return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
      }),
    );
    expect(getColorway(' SAFE ')).toBe(getColorway('Safe'));
    expect(colorwayNames()).toContain('Safe');
  });

  it('can be replaced by registering a colorway of that name', () => {
    const off = registerColorway('Safe', ['#000']);
    expect(getColorway('safe')).toEqual(['#000']);
    expect(colorwayNames().filter((n) => n.toLowerCase() === 'safe')).toHaveLength(1);
    off();
    expect(getColorway('safe')?.length).toBe(11);
  });
});
