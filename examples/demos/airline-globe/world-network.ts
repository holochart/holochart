import { createChart } from '@mk7s/holochart';
import '@mk7s/holochart/geo';
import '@mk7s/holochart/graph';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { LOOK, segmented, settled } from '../openrouter/ui.mts';
import {
  CONFIG,
  HUBS,
  LINKS,
  REGIONS,
  focus,
  globeData,
  globeFigure,
  graphData,
  graphFigure,
} from './network.mts';

export const meta: ExampleMeta = {
  title: 'Airlines around the world',
  description:
    'A worldwide airline hub graph projected onto a rotating globe, with raised route edges and a linked network view.',
  tags: ['demo', 'geo', 'globe3d', '3d', 'scattergeo', 'graph', 'airlines', 'network', 'arcs'],
  size: { width: 1120, height: 740 },
  testTolerance: 0.006,
};

/** Docs theme variables inherit when embedded; the shared demo look is the sandbox fallback. */
const STYLE = `
.airline-demo{height:100%;width:100%;display:flex;flex-direction:column;min-width:0;background:var(--hc-bg,${LOOK.bg});color:var(--hc-text,${LOOK.text});font:11px/1.5 var(--vp-font-family-base,${LOOK.font});overflow:hidden}
.airline-demo *{box-sizing:border-box}
.airline-demo .airline-tools{display:flex;justify-content:flex-end;align-items:center;gap:6px 12px;flex-wrap:wrap;padding:8px 12px;border-bottom:1px solid var(--hc-grid,${LOOK.grid})}
.airline-demo label{display:flex;gap:6px;align-items:center;min-width:0;color:var(--hc-tick,${LOOK.tick});font-size:10px}
.airline-demo select,.airline-demo button[data-reset]{font:10px/1.4 var(--vp-font-family-base,${LOOK.font});color:var(--hc-text,${LOOK.text});background:var(--hc-bg,${LOOK.bg});border:1px solid var(--hc-axis,${LOOK.axis});border-radius:3px;padding:4px 8px}
.airline-demo select{width:210px;max-width:100%;text-overflow:ellipsis}
.airline-demo button{cursor:pointer}
.airline-demo select:focus-visible,.airline-demo button:focus-visible,.airline-demo input:focus-visible{outline:2px solid var(--hc-text,${LOOK.text});outline-offset:2px}
.airline-demo button[data-reset]:hover{background:var(--hc-grid,${LOOK.grid});color:var(--hc-title,${LOOK.title})}
.airline-demo input{accent-color:var(--hc-red,${LOOK.colorway[0]})}
.airline-demo input[type=range]{width:80px;min-width:0}
.airline-demo output{font-variant-numeric:tabular-nums;min-width:3ch}
.airline-demo .airline-panels{display:grid;grid-template-columns:minmax(0,1.8fr) minmax(0,1fr);flex:1;min-height:0}
.airline-demo section{display:flex;flex-direction:column;min-height:0;min-width:0;position:relative}
.airline-demo section+section{border-left:1px solid var(--hc-grid,${LOOK.grid})}
.airline-demo .airline-panel-title{display:flex;justify-content:space-between;gap:4px 12px;flex-wrap:wrap;padding:10px 12px 0;color:var(--hc-title,${LOOK.title});font-size:11px}
.airline-demo .airline-panel-title span{color:var(--hc-tick,${LOOK.tick});font-size:9px}
.airline-demo .airline-chart{flex:1;min-height:0;position:relative}
.airline-demo .airline-footer{display:flex;justify-content:space-between;gap:6px 12px;flex-wrap:wrap;padding:8px 12px;border-top:1px solid var(--hc-grid,${LOOK.grid});color:var(--hc-tick,${LOOK.tick});font-size:9px}
.airline-demo .airline-legend{display:flex;gap:6px 10px;flex-wrap:wrap}
.airline-demo .airline-legend span::before{content:'';display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--region);margin-right:5px}
.airline-demo[data-narrow=true] .airline-panels{grid-template-columns:1fr;grid-template-rows:1.3fr 1fr}
.airline-demo[data-narrow=true] section+section{border-left:0;border-top:1px solid var(--hc-grid,${LOOK.grid})}
.airline-demo[data-narrow=true] .airline-tools{justify-content:flex-start;padding:8px 12px}
`;

export function run(el: HTMLElement): ExampleHandle {
  const root = document.createElement('div');
  root.className = 'airline-demo';
  root.innerHTML = `<style>${STYLE}</style>
    <div class="airline-tools">
      <label>Airline hub <select aria-label="Airline hub"><option value="all">All hubs</option></select></label>
      <label>Arc height <input aria-label="Arc height" type="range" min="0" max="0.4" step="0.02" value="0.22"><output>0.22</output></label>
      <label><input aria-label="Airport labels" type="checkbox" checked>Labels</label>
      <div data-views></div>
      <button type="button" data-reset>Reset</button>
    </div>
    <div class="airline-panels">
      <section aria-label="Airline route globe"><div class="airline-panel-title">Globe<span>Drag to turn · scroll to zoom</span></div><div class="airline-chart" data-globe></div></section>
      <section aria-label="Airline connection graph"><div class="airline-panel-title">Connections<span>Click a hub to explore</span></div><div class="airline-chart" data-graph></div></section>
    </div>
    <footer class="airline-footer"><div class="airline-legend"></div><div role="status" aria-live="polite"></div><div>24 hubs · June 2014 routes</div></footer>`;
  el.appendChild(root);
  const select = root.querySelector<HTMLSelectElement>('select')!;
  HUBS.forEach((h, i) => select.add(new Option(`${h.code} · ${h.city} / ${h.airline}`, String(i))));
  const legend = root.querySelector<HTMLElement>('.airline-legend')!;
  for (const [region, color] of Object.entries(REGIONS)) {
    const item = document.createElement('span');
    item.textContent = region;
    item.style.setProperty('--region', color);
    legend.appendChild(item);
  }
  const resize = new ResizeObserver(([entry]) => {
    root.dataset['narrow'] = String(entry!.contentRect.width < 700);
  });
  root.dataset['narrow'] = String(el.clientWidth < 700);
  resize.observe(root);

  const globe = createChart(root.querySelector<HTMLElement>('[data-globe]')!, globeFigure());
  const graph = createChart(root.querySelector<HTMLElement>('[data-graph]')!, graphFigure());
  const slider = root.querySelector<HTMLInputElement>('[aria-label="Arc height"]')!;
  const labels = root.querySelector<HTMLInputElement>('[aria-label="Airport labels"]')!;
  const output = root.querySelector('output')!;
  const status = root.querySelector<HTMLElement>('[role="status"]')!;
  let hub: number | null = null;
  let disposed = false;
  // Serialize edits so fast slider/select changes cannot leave the views on different hubs.
  let pending: Promise<void> = Promise.all([globe.ready, graph.ready]).then(() => undefined);

  let revision = 0;
  function enqueue(task: () => Promise<void>): void {
    const current = ++revision;
    root.setAttribute('aria-busy', 'true');
    pending = pending
      .then(async () => {
        if (!disposed) await task();
      })
      .catch((error: unknown) => {
        if (!disposed)
          status.textContent = `Could not update: ${error instanceof Error ? error.message : String(error)}`;
      })
      .finally(() => {
        if (!disposed && current === revision) root.setAttribute('aria-busy', 'false');
      });
  }

  function report(): void {
    status.textContent =
      hub === null
        ? `${LINKS.length} connections shown`
        : `${HUBS[hub]!.code} · ${focus(hub).links.length} connections`;
  }
  function refresh(center: boolean): void {
    report();
    const selected = hub;
    const lift = Number(slider.value);
    const showLabels = labels.checked;
    output.value = lift.toFixed(2);
    const layout =
      center && selected !== null
        ? {
            'geo.projection.rotation.lon': HUBS[selected]!.lon,
            'geo.projection.rotation.lat': HUBS[selected]!.lat,
          }
        : {};
    enqueue(async () => {
      await Promise.all([
        globe.react({
          data: globeData(selected, lift, showLabels),
          layout: { ...globe.layout },
          config: CONFIG,
        }),
        graph.react({ data: graphData(selected), layout: { ...graph.layout }, config: CONFIG }),
      ]);
      if (Object.keys(layout).length > 0) await globe.relayout(layout);
    });
  }

  function choose(index: number | null): void {
    hub = index;
    select.value = index === null ? 'all' : String(index);
    refresh(true);
  }
  select.addEventListener('change', () =>
    choose(select.value === 'all' ? null : Number(select.value)),
  );
  slider.addEventListener('input', () => refresh(false));
  labels.addEventListener('change', () => refresh(false));

  const off = [
    globe.on('click', (event) => {
      const point = event.points[0];
      if (point?.curveNumber === globe.data.length - 1 && typeof point.pointNumber === 'number')
        choose(point.pointNumber);
    }),
    graph.on('click', (event) => {
      const point = event.points[0];
      if (point?.['kind'] === 'node' && typeof point.pointNumber === 'number')
        choose(point.pointNumber);
    }),
  ];
  const views: Record<string, [number, number]> = {
    world: [20, 20],
    atlantic: [-35, 25],
    asia: [85, 20],
    pacific: [160, 5],
  };
  function turn(lon: number, lat: number): void {
    enqueue(async () => {
      await globe.relayout({
        'geo.projection.rotation.lon': lon,
        'geo.projection.rotation.lat': lat,
      });
    });
  }

  const viewControl = segmented<string>(
    root.querySelector<HTMLElement>('[data-views]')!,
    'View',
    [
      { value: 'world', text: 'World' },
      { value: 'atlantic', text: 'Atlantic' },
      { value: 'asia', text: 'Asia' },
      { value: 'pacific', text: 'Pacific' },
    ],
    (view) => turn(...views[view]!),
  );
  off.push(
    globe.on('relayout', () => {
      const geo = globe.layout['geo'] as { projection: { rotation: { lon: number; lat: number } } };
      const { lon, lat } = geo.projection.rotation;
      const match = Object.entries(views).find(
        ([, [x, y]]) => Math.abs(lon - x) < 0.01 && Math.abs(lat - y) < 0.01,
      );
      viewControl.set(match?.[0] ?? 'custom');
    }),
  );
  root.querySelector('[data-reset]')!.addEventListener('click', () => {
    slider.value = '0.22';
    labels.checked = true;
    choose(null);
    turn(20, 20);
    enqueue(async () => {
      await globe.relayout({ 'geo.projection.scale': 0.62 });
    });
  });
  report();
  return {
    ready: Promise.all([settled(globe), settled(graph)]).then(() => undefined),
    renderer: globe.three.renderer,
    dispose: () => {
      disposed = true;
      resize.disconnect();
      off.forEach((stop) => stop());
      globe.destroy();
      graph.destroy();
      root.remove();
    },
  };
}
