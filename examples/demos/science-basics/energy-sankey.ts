import { createChart, type Chart, type SankeyTrace } from '@mk7s/holochart';
import type { ExampleHandle, ExampleMeta } from '../../_lib/types.ts';
import { chartConfig, frame, isNarrow, LOOK, settled } from './ui.mts';
import { tint } from './waves-fields-planets.mts';

/**
 * Where the energy in a car's fuel goes, as a `sankey`: of every 100 units of energy in the petrol,
 * most leaves the engine as heat and only about 18 reach the wheels, where they are used up
 * against air resistance, rolling resistance and in the brakes. Energy is never lost, only passed
 * on, so the widths add up at every node. The values are typical, rounded figures for a petrol car
 * in mixed driving, not measurements of one car. The useful flows are one color and the losses
 * another (`link.color`, `node.color`), and the nodes are placed by hand (`node.x`, `node.y`) so that no
 * links cross; hover gives each flow's share (`valuesuffix`).
 */
export const meta: ExampleMeta = {
  title: 'Energy: where a car’s fuel goes',
  description:
    'Sankey of 100 units of fuel energy in a petrol car: engine heat and other losses, and the 18 units that reach the wheels (typical, rounded values).',
  tags: ['demo', 'sankey', 'flow', 'hover', 'physics'],
  size: { width: 960, height: 480 },
  testTolerance: 0.004,
};

const USEFUL = '#118e36';
const LOSS = '#cc540a';
const FUEL = '#8a8e9e';

/** Flows in percent of the fuel's energy: [from, to, value, useful]. */
const FLOWS: readonly (readonly [string, string, number, boolean])[] = [
  ['Fuel', 'Engine heat (exhaust and cooling)', 62, false],
  ['Fuel', 'Engine friction and pumping', 8, false],
  ['Fuel', 'Idling', 3, false],
  ['Fuel', 'Accessories (lights, air conditioning)', 4, false],
  ['Fuel', 'Drivetrain losses (gearbox, axles)', 5, false],
  ['Fuel', 'To the wheels', 18, true],
  ['To the wheels', 'Air resistance', 8, true],
  ['To the wheels', 'Rolling resistance (tyres)', 5, true],
  ['To the wheels', 'Braking', 5, true],
];

export function run(el: HTMLElement): ExampleHandle {
  const { chartEl, dispose } = frame(el);
  const narrow = isNarrow(el);

  const names = [...new Set(FLOWS.flatMap(([from, to]) => [from, to]))];
  const total = (name: string): number =>
    name === 'Fuel'
      ? 100
      : FLOWS.filter(([, to]) => to === name).reduce((sum, [, , v]) => sum + v, 0);
  const useful = (name: string): boolean => FLOWS.some(([, to, , u]) => to === name && u);

  // Fixed positions (`node.x`, `node.y`: centers as fractions of the plot): the losses stacked in
  // the middle column with the useful share at the bottom, and its three uses to the right of it.
  const GAP = 0.035;
  const unit = (1 - 5 * GAP) / 100;
  const position = new Map<string, { x: number; y: number }>([['Fuel', { x: 0.001, y: 0.5 }]]);
  let top = 0;
  for (const [, to, v] of FLOWS.filter(([from]) => from === 'Fuel')) {
    position.set(to, { x: 0.5, y: top + (v * unit) / 2 });
    top += v * unit + GAP;
  }
  top = 1 - 18 * unit - 2 * GAP;
  for (const [, to, v] of FLOWS.filter(([from]) => from === 'To the wheels')) {
    position.set(to, { x: 0.999, y: top + (v * unit) / 2 });
    top += v * unit + GAP;
  }

  const trace: SankeyTrace = {
    arrangement: 'fixed',
    type: 'sankey',
    valueformat: '.0f',
    valuesuffix: '%',
    node: {
      label: names.map((name) => `${name} ${total(name)}%`),
      color: names.map((name) => (name === 'Fuel' ? FUEL : useful(name) ? USEFUL : LOSS)),
      x: names.map((name) => position.get(name)?.x ?? 0.5),
      y: names.map((name) => position.get(name)?.y ?? 0.5),
      pad: 14,
      thickness: 14,
      line: { width: 0 },
      hovertemplate: '%{label} of the fuel’s energy<extra></extra>',
    },
    link: {
      source: FLOWS.map(([from]) => names.indexOf(from)),
      target: FLOWS.map(([, to]) => names.indexOf(to)),
      value: FLOWS.map(([, , v]) => v),
      color: FLOWS.map(([, , , u]) => tint(u ? USEFUL : LOSS, 0.55)),
      hovertemplate:
        '%{source.label} → %{target.label}<br><b>%{value}</b> of the fuel’s energy<extra></extra>',
    },
  };

  const chart: Chart = createChart(chartEl, {
    data: [trace],
    layout: {
      title: {
        text: narrow ? '' : 'Where the energy in a car’s fuel goes (petrol car, typical, rounded)',
      },
      margin: { l: 16, r: 16, b: 40 },
      font: { color: LOOK.text },
      annotations: [
        {
          xref: 'paper',
          yref: 'paper',
          x: 0,
          y: 0,
          xanchor: 'left',
          yanchor: 'top',
          yshift: -8,
          showarrow: false,
          text: narrow
            ? 'Green: moves the car. Orange: lost as heat.'
            : 'Green: energy that moves the car. Orange: energy lost as heat before it reaches the wheels. In the end all of it becomes heat.',
          font: { size: 10, color: LOOK.tick },
        },
      ],
    },
    config: chartConfig(narrow),
  });

  return {
    ready: settled(chart),
    renderer: chart.three.renderer,
    dispose: () => {
      chart.destroy();
      dispose();
    },
  };
}
