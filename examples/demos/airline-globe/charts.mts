import { createChart, type Figure } from '@mk7s/holochart';
import '@mk7s/holochart/geo';
import '@mk7s/holochart/graph';
import type { ExampleHandle } from '../../_lib/types.ts';
import { frame, isNarrow, LOOK, segmented, settled } from '../openrouter/ui.mts';
import {
  ADJACENCY,
  AIRPORTS,
  CARRIERS,
  DISTANCE_BINS,
  HUB_METRICS,
  REGION_LINKS,
  REGION_NAMES,
} from './analysis.mts';
import industry from './data/industry.json' with { type: 'json' };
import { BASE_LAYOUT, CONFIG, REGIONS, globeFigure } from './network.mts';

const axis = {
  gridcolor: LOOK.grid,
  zerolinecolor: LOOK.zero,
  linecolor: LOOK.axis,
  tickfont: { color: LOOK.tick, size: 11 },
  automargin: true,
};
const layout = {
  ...BASE_LAYOUT,
  margin: { l: 68, r: 24, t: 20, b: 56 },
  xaxis: { ...axis },
  yaxis: { ...axis },
};
const regionColor = (name: string): string =>
  REGIONS[name === 'Asia Pacific' ? 'Asia' : name === 'Latin America' ? 'South America' : name]!;

export const FIGURES = {
  'demand-capacity': (narrow: boolean): Figure => {
    const rows = [...industry.regions].sort((a, b) => b.demand - a.demand);
    return {
      data: [
        {
          type: 'bar',
          name: 'Demand · RPK',
          orientation: 'h',
          y: rows.map((r) => r.name),
          x: rows.map((r) => r.demand),
          marker: { color: LOOK.colorway[0] },
          text: rows.map((r) => `${r.demand.toFixed(1)}%`),
          textposition: 'outside',
          hovertemplate: '%{y}<br>Demand growth: %{x:.1f}%<extra>2025 vs 2024</extra>',
        },
        {
          type: 'bar',
          name: 'Capacity · ASK',
          orientation: 'h',
          y: rows.map((r) => r.name),
          x: rows.map((r) => r.capacity),
          marker: { color: LOOK.colorway[1] },
          text: rows.map((r) => `${r.capacity.toFixed(1)}%`),
          textposition: 'outside',
          hovertemplate: '%{y}<br>Capacity growth: %{x:.1f}%<extra>2025 vs 2024</extra>',
        },
      ],
      layout: {
        ...layout,
        barmode: 'group',
        bargap: 0.26,
        margin: { l: narrow ? 108 : 124, r: 28, t: 20, b: 56 },
        xaxis: { ...axis, title: { text: 'Annual growth (%)' }, range: [0, 11], ticksuffix: '%' },
        yaxis: { ...axis, autorange: 'reversed', showgrid: false },
      },
    };
  },
  'traffic-share': (): Figure => ({
    data: [
      {
        type: 'pie',
        labels: industry.regions.map((r) => r.name),
        values: industry.regions.map((r) => r.share),
        hole: 0.65,
        sort: false,
        textinfo: 'percent',
        textposition: 'inside',
        textfont: { size: 12, color: '#fff' },
        marker: {
          colors: industry.regions.map((r) => regionColor(r.name)),
          line: { color: LOOK.bg, width: 3 },
        },
        title: {
          text: '<b>2025</b><br>passenger traffic',
          position: 'middle center',
          font: { size: 17, color: LOOK.title },
        },
        hovertemplate: '%{label}<br>%{value:.1f}% of global RPK<extra>Carrier region</extra>',
      },
    ],
    layout: {
      ...BASE_LAYOUT,
      margin: { l: 16, r: 16, t: 12, b: 12 },
    },
  }),
  'load-factors': (narrow: boolean): Figure => {
    const rows = [...industry.regions].sort((a, b) => b.load - a.load);
    return {
      data: [
        {
          type: 'bar',
          name: 'Used seat capacity',
          orientation: 'h',
          y: rows.map((r) => r.name),
          x: rows.map((r) => r.load),
          marker: { color: rows.map((r) => regionColor(r.name)) },
          text: rows.map((r) => `${r.load.toFixed(1)}%`),
          textposition: 'inside',
          textfont: { color: '#fff', size: 12 },
          hovertemplate: '%{y}<br>Load factor: %{x:.1f}%<extra>2025 · RPK / ASK</extra>',
        },
        {
          type: 'bar',
          name: 'Unused seat capacity',
          orientation: 'h',
          y: rows.map((r) => r.name),
          x: rows.map((r) => 100 - r.load),
          marker: { color: LOOK.axis },
          hovertemplate: '%{y}<br>Unused: %{x:.1f}%<extra>Seat kilometers</extra>',
        },
      ],
      layout: {
        ...layout,
        barmode: 'stack',
        bargap: 0.35,
        margin: { l: narrow ? 108 : 124, r: 24, t: 20, b: 62 },
        xaxis: {
          ...axis,
          range: [0, 100],
          ticksuffix: '%',
          title: { text: 'Share of available seat kilometers' },
        },
        yaxis: { ...axis, autorange: 'reversed', showgrid: false },
      },
    };
  },
  'hub-map': (): Figure => ({
    data: [
      {
        type: 'scattergeo',
        mode: 'markers',
        lat: HUB_METRICS.map((h) => h.lat),
        lon: HUB_METRICS.map((h) => h.lon),
        text: HUB_METRICS.map((h) => `${h.code} · ${h.city}`),
        customdata: HUB_METRICS.map(
          (h) =>
            `${h.region}<br>${h.degree} connected airports<br>${h.reach} destination regions<br>Median route ${Math.round(h.medianKm).toLocaleString('en-US')} km`,
        ),
        marker: {
          size: HUB_METRICS.map((h) => h.degree),
          sizemode: 'area',
          sizeref: 0.1,
          color: HUB_METRICS.map((h) => REGIONS[h.region]!),
          opacity: 0.82,
          line: { color: LOOK.title, width: 0.8 },
        },
        hovertemplate: '<b>%{text}</b><br>%{customdata}<extra>2014 sample</extra>',
      },
    ],
    layout: {
      ...BASE_LAYOUT,
      geo: {
        ...globeFigure().layout!.geo,
        projection: { type: 'natural earth' },
        lonaxis: { showgrid: false },
        lataxis: { showgrid: false },
      },
    },
  }),
  'hub-ranking': (narrow: boolean, sort = 'degree'): Figure => {
    const rows = [...HUB_METRICS].sort((a, b) =>
      sort === 'reach'
        ? b.reach - a.reach || b.degree - a.degree
        : b.degree - a.degree || a.code.localeCompare(b.code),
    );
    const labels = rows.map((h) => h.code);
    return {
      data:
        sort === 'reach'
          ? [
              {
                type: 'bar',
                orientation: 'h',
                y: labels,
                x: rows.map((h) => h.reach),
                marker: { color: rows.map((h) => REGIONS[h.region]!) },
                text: rows.map((h) => String(h.reach)),
                textposition: 'outside',
                customdata: rows.map((h) => h.city),
                hovertemplate:
                  '%{y} · %{customdata}<br>%{x} destination regions<extra>2014 sample</extra>',
              },
            ]
          : [
              {
                type: 'bar',
                name: 'Within region',
                orientation: 'h',
                y: labels,
                x: rows.map((h) => h.within),
                marker: { color: LOOK.colorway[1] },
                customdata: rows.map((h) => h.city),
                hovertemplate:
                  '%{y} · %{customdata}<br>%{x} within-region connections<extra>2014 sample</extra>',
              },
              {
                type: 'bar',
                name: 'Across regions',
                orientation: 'h',
                y: labels,
                x: rows.map((h) => h.across),
                marker: { color: LOOK.colorway[0] },
                text: rows.map((h) => String(h.degree)),
                textposition: 'outside',
                customdata: rows.map((h) => h.city),
                hovertemplate:
                  '%{y} · %{customdata}<br>%{x} across-region connections<extra>2014 sample</extra>',
              },
            ],
      layout: {
        ...layout,
        barmode: 'stack',
        bargap: 0.22,
        margin: { l: narrow ? 44 : 56, r: 24, t: 12, b: 54 },
        xaxis: {
          ...axis,
          title: { text: sort === 'reach' ? 'Destination regions' : 'Connected airports' },
          range: [0, sort === 'reach' ? 8 : 24],
          dtick: sort === 'reach' ? 1 : 5,
        },
        yaxis: { ...axis, autorange: 'reversed', showgrid: false, tickfont: { size: 10 } },
      },
    };
  },
  'region-chord': (narrow: boolean): Figure => ({
    data: [
      {
        type: 'chord',
        directed: false,
        valuesuffix: ' airport pairs',
        node: {
          label: REGION_NAMES,
          color: REGION_NAMES.map((r) => REGIONS[r]!),
          hovertemplate:
            '%{label}<br>%{value} route endpoints<extra>Internal routes contribute two endpoints</extra>',
        },
        link: {
          source: REGION_LINKS.map((r) => r.source),
          target: REGION_LINKS.map((r) => r.target),
          value: REGION_LINKS.map((r) => r.value),
          opacity: 0.6,
          hovertemplate:
            '%{source.label} ↔ %{target.label}<br>%{value} airport pairs<extra>2014 sample</extra>',
        },
        textfont: { size: narrow ? 10 : 12, color: LOOK.text },
      },
    ],
    layout: { ...BASE_LAYOUT, margin: { l: 42, r: 42, t: 42, b: 42 } },
  }),
  'route-distance': (): Figure => ({
    data: [
      {
        type: 'bar',
        name: 'Within region',
        x: DISTANCE_BINS.map((b) => b.label),
        y: DISTANCE_BINS.map((b) => b.within),
        marker: { color: LOOK.colorway[1] },
      },
      {
        type: 'bar',
        name: 'Across regions',
        x: DISTANCE_BINS.map((b) => b.label),
        y: DISTANCE_BINS.map((b) => b.across),
        marker: { color: LOOK.colorway[0] },
      },
    ].map((trace) => ({
      ...trace,
      hovertemplate: '%{x} km<br>%{y} airport pairs<extra>%{fullData.name}</extra>',
    })) as Figure['data'],
    layout: {
      ...layout,
      barmode: 'stack',
      bargap: 0.12,
      xaxis: { ...axis, title: { text: 'Great-circle distance (km)' }, type: 'category' },
      yaxis: { ...axis, title: { text: 'Airport pairs' }, rangemode: 'tozero' },
    },
  }),
  'carrier-portfolio': (narrow: boolean): Figure => {
    const labels: Readonly<Record<string, string>> = {
      'Delta Air Lines': 'Delta',
      Emirates: 'Emirates',
      'Cathay Pacific': 'Cathay',
      'All Nippon Airways': 'ANA',
      'Aerolíneas Argentinas': 'Aerolíneas',
      Egyptair: 'Egyptair',
    };
    return {
      data: [
        {
          type: 'scatter',
          mode: narrow ? 'markers' : 'markers+text',
          x: CARRIERS.map((c) => c.routes),
          y: CARRIERS.map((c) => c.medianKm),
          text: CARRIERS.map((c) => labels[c.name] ?? ''),
          textposition: 'top center',
          textfont: { size: 11 },
          customdata: CARRIERS.map(
            (c) => `${c.name}<br>${c.region}<br>${c.airports} airports in sample`,
          ),
          marker: {
            size: CARRIERS.map((c) => c.airports),
            sizemode: 'area',
            sizeref: 0.075,
            color: CARRIERS.map((c) => REGIONS[c.region]!),
            opacity: 0.85,
            line: { color: LOOK.title, width: 0.8 },
          },
          hovertemplate:
            '<b>%{customdata}</b><br>%{x} airport pairs<br>Median distance %{y:,.0f} km<extra>2014 sample</extra>',
        },
      ],
      layout: {
        ...layout,
        xaxis: { ...axis, title: { text: 'Airport pairs per carrier' }, range: [0, 25], dtick: 5 },
        yaxis: {
          ...axis,
          title: { text: 'Median route distance (km)' },
          range: [0, 11000],
          tickformat: '~s',
        },
      },
    };
  },
  'route-matrix': (narrow: boolean): Figure => ({
    data: [
      {
        type: 'heatmap',
        x: AIRPORTS.map((h) => h.code),
        y: AIRPORTS.map((h) => h.code),
        z: ADJACENCY,
        xgap: 2,
        ygap: 2,
        zmin: 0,
        zmax: Math.max(...ADJACENCY.flat()),
        colorscale: [
          [0, LOOK.grid],
          [0.2, '#524a76'],
          [0.6, LOOK.colorway[2]],
          [1, LOOK.colorway[0]],
        ],
        colorbar: { title: { text: 'Carriers' }, thickness: 12, tick0: 0, dtick: 1 },
        hovertemplate:
          '%{y} ↔ %{x}<br>%{z} selected carriers recorded<extra>0 means no record in this sample</extra>',
      },
    ],
    layout: {
      ...BASE_LAYOUT,
      margin: { l: 48, r: narrow ? 65 : 88, t: 18, b: 56 },
      xaxis: {
        ...axis,
        tickangle: -90,
        tickfont: { size: narrow ? 8 : 10 },
        showgrid: false,
        constrain: 'domain',
      },
      yaxis: {
        ...axis,
        autorange: 'reversed',
        tickfont: { size: narrow ? 8 : 10 },
        showgrid: false,
        scaleanchor: 'x',
        scaleratio: 1,
      },
    },
  }),
};

export type InfographicChart = keyof typeof FIGURES;

export function runInfographic(el: HTMLElement, id: InfographicChart): ExampleHandle {
  const { chartEl, toolbar, dispose } = frame(el);
  const narrow = isNarrow(el);
  // A wrapping HTML legend stays outside the plotting area at every container size.
  const entries: readonly (readonly [string, string])[] =
    id === 'traffic-share'
      ? industry.regions.map((r) => [r.name, regionColor(r.name)] as const)
      : id === 'demand-capacity'
        ? [
            ['Demand · RPK', LOOK.colorway[0]],
            ['Capacity · ASK', LOOK.colorway[1]],
          ]
        : id === 'hub-ranking' || id === 'route-distance'
          ? [
              ['Within region', LOOK.colorway[1]],
              ['Across regions', LOOK.colorway[0]],
            ]
          : [];
  const footer = document.createElement('div');
  footer.setAttribute('role', 'list');
  footer.setAttribute('aria-label', 'Chart legend');
  footer.style.cssText = `display:flex;flex-wrap:wrap;gap:8px 18px;padding:8px 16px 14px;font:11px/1.4 ${LOOK.font};color:${LOOK.text};`;
  for (const [name, color] of entries) {
    const item = document.createElement('span');
    item.setAttribute('role', 'listitem');
    item.style.cssText = 'display:inline-flex;align-items:center;gap:7px;';
    const swatch = document.createElement('span');
    swatch.setAttribute('aria-hidden', 'true');
    swatch.style.cssText = `width:10px;height:10px;background:${color};`;
    item.append(swatch, name);
    footer.appendChild(item);
  }
  if (entries.length) chartEl.after(footer);
  const chart = createChart(chartEl, { ...FIGURES[id](narrow), config: CONFIG });
  let pending: Promise<unknown> = chart.ready;
  let disposed = false;
  let revision = 0;
  chartEl.dataset['airlineChart'] = id;
  chartEl.setAttribute('aria-busy', 'false');
  if (id === 'hub-ranking') {
    segmented(
      toolbar,
      'Rank by',
      [
        { value: 'degree', text: 'Connections' },
        { value: 'reach', text: 'Regions reached' },
      ],
      (sort) => {
        footer.style.display = sort === 'degree' ? 'flex' : 'none';
        const current = ++revision;
        chartEl.setAttribute('aria-busy', 'true');
        pending = pending
          .then(async () => {
            if (!disposed)
              await chart.react({ ...FIGURES['hub-ranking'](narrow, sort), config: CONFIG });
          })
          .catch((error: unknown) => {
            if (disposed) return;
            const status = document.createElement('span');
            status.setAttribute('role', 'status');
            status.textContent = `Could not update ranking: ${error instanceof Error ? error.message : String(error)}`;
            toolbar.appendChild(status);
          })
          .finally(() => {
            if (!disposed && current === revision) chartEl.setAttribute('aria-busy', 'false');
          });
      },
    );
  }
  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      disposed = true;
      chart.destroy();
      dispose();
    },
  };
}
