import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Holochart from './index.ts';

/** A figure that touches most of what a template styles: two subplots, bars, lines, a colorbar. */
const figure = (template?: unknown): Holochart.FigureInput => ({
  data: [
    { type: 'bar', name: 'a', x: ['Q1', 'Q2', 'Q3'], y: [4, -2, 6] },
    { type: 'bar', name: 'b', x: ['Q1', 'Q2', 'Q3'], y: [5, 3, 7] },
    { type: 'scatter', name: 'line', mode: 'lines+markers', x: ['Q1', 'Q2', 'Q3'], y: [5, 6, 7] },
    {
      type: 'scatter',
      name: 'scaled',
      mode: 'markers',
      x: [1, 2, 3],
      y: [3, 1, 2],
      xaxis: 'x2',
      yaxis: 'y2',
      marker: { color: [1, 2, 3], showscale: true },
    },
    { type: 'pie', labels: ['u', 'v'], values: [1, 2], domain: { x: [0.8, 1], y: [0, 0.3] } },
  ],
  layout: {
    ...(template === undefined ? {} : { template }),
    title: { text: 'T' },
    xaxis: { domain: [0, 0.45], title: { text: 'X' } },
    xaxis2: { domain: [0.55, 1], anchor: 'y2' },
    yaxis2: { anchor: 'x2' },
    annotations: [{ text: 'note', x: 'Q2', y: 6 }],
    shapes: [{ type: 'line', x0: 0, x1: 1, y0: 0, y1: 1, xref: 'paper', yref: 'paper' }],
  },
});

/** Public defaulted figure, without the resolved template object itself. */
function defaulted(template?: unknown): string {
  const { fullData, fullLayout } = Holochart.supplyDefaults(
    figure(template),
    Holochart.registry.core,
    { onIssue: () => undefined },
  );
  const { template: _t, ...layout } = Holochart.stripInternal(fullLayout) as Record<
    string,
    unknown
  >;
  return `${JSON.stringify({ layout, data: Holochart.stripInternal(fullData) }, null, 1)}\n`;
}

const PLOTLY_LOOK = './__snapshots__/plotly-look.json.snap';

describe('default look (ADR-021)', () => {
  afterEach(() => {
    Holochart.setDefaultTemplate('holochart');
  });

  it('plotly-classic, none and null give exactly the pre-ADR-021 fullLayout and fullData', async () => {
    // Recorded before the default look existed, with `layout.template` unset.
    for (const template of ['plotly-classic', 'none', null]) {
      await expect(defaulted(template)).toMatchFileSnapshot(PLOTLY_LOOK);
    }
  });

  it('the bundle applies the holochart template when layout.template is unset', async () => {
    expect(Holochart.registry.list().defaultTemplate).toBe('holochart');
    const { fullLayout, fullData } = Holochart.supplyDefaults(figure(), Holochart.registry.core, {
      onIssue: () => undefined,
    });
    expect(fullLayout.template).toBe(Holochart.holochartTemplate);
    expect(fullLayout.template).toBe(Holochart.themes.holochart);
    expect(fullLayout.paper_bgcolor).toBe('rgb(10, 10, 15)');
    expect(fullLayout.font).toMatchObject({ size: 9, color: 'rgb(164, 167, 181)' });
    expect(fullLayout.title.font.size).toBe(11);
    expect(fullLayout.margin).toMatchObject({ l: 40, r: 16, b: 32, pad: 0 });
    expect(fullLayout['legend']).toMatchObject({ orientation: 'h', yanchor: 'bottom' });
    expect(fullLayout.xaxis2).toMatchObject({ ticks: 'outside', ticklen: 3, showline: true });
    expect(fullData[0]!['marker']).toMatchObject({ color: 'rgb(234, 42, 55)', line: { width: 0 } });
    expect(fullData[2]!['line']).toMatchObject({ width: 1.25 });
    await expect(defaulted()).toMatchFileSnapshot('./__snapshots__/holochart-look.json.snap');
  });

  it('the holochart template is valid against the full schema', () => {
    // Charts add the `fx` component (hover/drag settings) when created; a fresh registry with it
    // keeps the shared one untouched for the snapshots above.
    const full = Holochart.createChartRegistry().register(
      ...Holochart.builtins,
      Holochart.fxComponent,
    );
    const template = Holochart.holochartTemplate;
    expect(Holochart.validate([], { template }, full.core)).toEqual([]);
  });

  it('user values beat the default template (§8)', () => {
    const { fullLayout, fullData } = Holochart.supplyDefaults(
      {
        data: [
          { type: 'scatter', y: [1, 2], line: { width: 3 }, marker: { size: 9 } },
          { type: 'scatter', y: [2, 1] },
        ],
        layout: {
          paper_bgcolor: 'white',
          font: { size: 14 },
          colorway: ['#010203', '#040506'],
          margin: { t: 90 },
          legend: { orientation: 'v' },
          xaxis: { gridcolor: 'blue', ticks: '' },
          title: { text: 'T', x: 0.5 },
        },
      },
      Holochart.registry.core,
      { onIssue: () => undefined },
    );
    expect(fullLayout.paper_bgcolor).toBe('rgb(255, 255, 255)');
    expect(fullLayout.plot_bgcolor).toBe('rgb(10, 10, 15)');
    expect(fullLayout.font.size).toBe(14);
    expect(fullLayout.font.color).toBe('rgb(164, 167, 181)');
    expect(fullLayout.margin).toMatchObject({ t: 90, l: 40 });
    expect(fullLayout['legend']).toMatchObject({ orientation: 'v' });
    expect(fullLayout.xaxis).toMatchObject({ gridcolor: 'rgb(0, 0, 255)', ticks: '' });
    expect(fullLayout.yaxis).toMatchObject({ gridcolor: 'rgb(26, 26, 34)', ticks: 'outside' });
    expect(fullLayout.title).toMatchObject({ x: 0.5, xanchor: 'auto' });
    expect(fullData[0]!['line']).toMatchObject({ width: 3, color: 'rgb(1, 2, 3)' });
    expect(fullData[0]!['marker']).toMatchObject({ size: 9 });
    expect(fullData[1]!['line']).toMatchObject({ width: 1.25, color: 'rgb(4, 5, 6)' });
  });

  it('setDefaultTemplate round-trips through the shared registry', async () => {
    expect(Holochart.setDefaultTemplate('plotly-classic')).toBe(Holochart.registry);
    expect(Holochart.registry.list().defaultTemplate).toBe('plotly-classic');
    await expect(defaulted()).toMatchFileSnapshot(PLOTLY_LOOK);
    Holochart.setDefaultTemplate(undefined);
    expect(Holochart.registry.core.defaultTemplate).toBeUndefined();
    await expect(defaulted()).toMatchFileSnapshot(PLOTLY_LOOK);
    Holochart.setDefaultTemplate('holochart');
    expect(defaulted()).toBe(defaulted('holochart'));
  });

  it('setDefaultTemplate warns about unregistered names', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      Holochart.setDefaultTemplate('plotly-clasic');
      expect(warn).toHaveBeenCalledOnce();
      expect(String(warn.mock.calls[0]?.[0])).toContain("no template 'plotly-clasic'");
    } finally {
      warn.mockRestore();
    }
  });

  it('registering the themes again is silent (same template objects)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      Holochart.register(...Holochart.themes.builtinThemes);
      expect(warn).not.toHaveBeenCalled();
      expect(Holochart.registry.list().defaultTemplate).toBe('holochart');
    } finally {
      warn.mockRestore();
    }
  });
});
