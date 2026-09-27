/** `indicator` supply-defaults (plan E12.7), following plotly.js `traces/indicator/defaults.js`. */
import {
  coerceItems,
  getIn,
  isArrayLike,
  type Children,
  type FullTrace,
  type ItemsNode,
  type TraceDefaultsContext,
} from '@mk7s/holochart-core';
import { indicatorAttributes } from './attributes.ts';

/** Plotly's indicator constants (`traces/indicator/constants`). */
export const INDICATOR = {
  /** Number font size before fitting, when `number.font.size` is unset. */
  numberFontSize: 80,
  /** Share of the domain width the number takes next to a bullet gauge. */
  bulletNumberDomainSize: 0.25,
  /** Gap between a bullet gauge and its number or title, as a share of the domain width. */
  bulletPadding: 0.025,
  /** Inner radius of an angular gauge, as a share of its radius. */
  innerRadius: 0.75,
  /** Default value bar thickness (halved on bullet gauges). */
  valueThickness: 0.5,
  /** Gap between the title and what it sits on, px. */
  titlePadding: 5,
} as const;

type Font = Record<string, unknown>;

/** The layout font without its size (Plotly's `extendFlat({}, layout.font); size = undefined`). */
function fontDefaults(ctx: TraceDefaultsContext, size?: number): Font {
  const f = ctx.fullLayout.font;
  return {
    family: f.family,
    color: f.color,
    weight: f.weight,
    style: f.style,
    ...(size !== undefined ? { size } : {}),
  };
}

/** Plotly's tick value, label and mark defaults of the gauge axis (`gauge.axis.*`). */
function supplyGaugeAxisDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  axis: Record<string, unknown>,
  ctx: TraceDefaultsContext,
): void {
  const c = <T = unknown>(k: string, dflt?: unknown): T => ctx.coerce<T>(`gauge.axis.${k}`, dflt);
  const axisIn = (getIn(traceIn, 'gauge.axis') ?? {}) as Record<string, unknown>;
  const tmpl = (getIn(ctx.template, 'gauge.axis') ?? {}) as Record<string, unknown>;
  const input = (k: string): unknown => axisIn[k] ?? tmpl[k];

  // Tick values (`tick_value_defaults`).
  const dtickIn = input('dtick');
  const tickmode = c<string>(
    'tickmode',
    isArrayLike(input('tickvals')) ? 'array' : dtickIn ? 'linear' : 'auto',
  );
  if (tickmode === 'auto') c('nticks');
  else if (tickmode === 'linear') {
    // Plotly's `cleanTicks` on a linear axis: a positive step (default 1) from a numeric tick0.
    const dtick = Number(dtickIn);
    axis['dtick'] = Number.isFinite(dtick) && dtick > 0 ? dtick : 1;
    const tick0 = Number(input('tick0'));
    axis['tick0'] = input('tick0') !== undefined && Number.isFinite(tick0) ? tick0 : 0;
  } else if (c('tickvals') === undefined) axis['tickmode'] = 'auto';
  else c('ticktext');

  // Prefix and suffix (`prefix_suffix_defaults`).
  if (c('tickprefix')) c('showtickprefix');
  if (c('ticksuffix')) c('showticksuffix');

  // Tick labels (`tick_label_defaults`).
  if (c('showticklabels')) {
    ctx.coerceContainer('gauge.axis.tickfont', fontDefaults(ctx, ctx.fullLayout.font.size));
    c('ticklabelstep');
    c('tickangle');
    const tickformat = c('tickformat');
    axis['tickformatstops'] = coerceItems(
      (indicatorAttributes.children.gauge.children.axis.children as unknown as Children)[
        'tickformatstops'
      ] as unknown as ItemsNode,
      axisIn['tickformatstops'],
      tmpl['tickformatstops'],
      tmpl['tickformatstopdefaults'],
    );
    if (!tickformat) {
      c('showexponent');
      c('exponentformat');
      c('minexponent');
      c('separatethousands');
    }
  }

  // Tick marks (`tick_mark_defaults`, with Plotly's `outerTicks`).
  if (c('ticks')) {
    c('ticklen');
    c('tickwidth');
    c('tickcolor');
  }
}

/**
 * Supply indicator defaults. Sets `_hasNumber`, `_hasDelta`, `_hasGauge`, `_isAngular`,
 * `_isBullet`, `_range` (the axis numbers are formatted on) and `_scaleNumbers` (fit the number and
 * delta to the domain: neither has a font size). `domain` was coerced by core before this runs.
 */
export function supplyIndicatorDefaults(
  traceIn: Readonly<Record<string, unknown>>,
  traceOut: FullTrace,
  ctx: TraceDefaultsContext,
): void {
  const mode = ctx.coerce<string>('mode');
  const hasNumber = mode.includes('number');
  const hasDelta = mode.includes('delta');
  const hasGauge = mode.includes('gauge');
  traceOut['_hasNumber'] = hasNumber;
  traceOut['_hasDelta'] = hasDelta;
  traceOut['_hasGauge'] = hasGauge;

  const value = ctx.coerce<number | undefined>('value');
  let range: unknown = [0, typeof value === 'number' ? 1.5 * value : 1];

  // The number, sized to fit the domain unless it has a font size.
  let numberSize: number | undefined;
  let autoNumber = false;
  if (hasNumber) {
    ctx.coerce('number.valueformat');
    ctx.coerceContainer('number.font', fontDefaults(ctx));
    const font = getIn(traceOut, 'number.font') as Font;
    if (font['size'] === undefined) {
      font['size'] = INDICATOR.numberFontSize;
      autoNumber = true;
    }
    ctx.coerce('number.prefix');
    ctx.coerce('number.suffix');
    numberSize = font['size'] as number;
  }

  let deltaSize: number | undefined;
  let autoDelta = false;
  if (hasDelta) {
    ctx.coerceContainer('delta.font', fontDefaults(ctx));
    const font = getIn(traceOut, 'delta.font') as Font;
    if (font['size'] === undefined) {
      font['size'] = (hasNumber ? 0.5 : 1) * (numberSize ?? INDICATOR.numberFontSize);
      autoDelta = true;
    }
    ctx.coerce('delta.reference', value);
    const relative = ctx.coerce<boolean>('delta.relative');
    ctx.coerce('delta.valueformat', relative ? '2%' : '');
    ctx.coerce('delta.increasing.symbol');
    ctx.coerce('delta.increasing.color');
    ctx.coerce('delta.decreasing.symbol');
    ctx.coerce('delta.decreasing.color');
    ctx.coerce('delta.position');
    ctx.coerce('delta.prefix');
    ctx.coerce('delta.suffix');
    deltaSize = font['size'] as number;
  }
  traceOut['_scaleNumbers'] = (!hasNumber || autoNumber) && (!hasDelta || autoDelta);

  const titleSize = 0.25 * (numberSize ?? deltaSize ?? INDICATOR.numberFontSize);
  ctx.coerceContainer('title.font', fontDefaults(ctx, titleSize));
  ctx.coerce('title.text');

  if (hasGauge) {
    const shape = ctx.coerce<string>('gauge.shape');
    const bullet = shape === 'bullet';
    traceOut['_isBullet'] = bullet;
    traceOut['_isAngular'] = !bullet;
    // A bullet gauge's title sits left of the domain; an angular gauge centers its numbers.
    if (!bullet) ctx.coerce('title.align', 'center');
    else ctx.coerce('align', 'center');

    ctx.coerce('gauge.bgcolor', ctx.fullLayout.paper_bgcolor);
    ctx.coerce('gauge.borderwidth');
    ctx.coerce('gauge.bordercolor');

    ctx.coerce('gauge.bar.color');
    ctx.coerce('gauge.bar.line.color');
    ctx.coerce('gauge.bar.line.width');
    ctx.coerce('gauge.bar.thickness', INDICATOR.valueThickness * (bullet ? 0.5 : 1));

    const gauge = getIn(traceOut, 'gauge') as Record<string, unknown>;
    gauge['steps'] = coerceItems(
      indicatorAttributes.children.gauge.children.steps as unknown as ItemsNode,
      getIn(traceIn, 'gauge.steps'),
      getIn(ctx.template, 'gauge.steps'),
      getIn(ctx.template, 'gauge.stepdefaults'),
    );

    ctx.coerce('gauge.threshold.value');
    ctx.coerce('gauge.threshold.thickness');
    ctx.coerce('gauge.threshold.line.width');
    ctx.coerce('gauge.threshold.line.color');

    ctx.coerce('gauge.axis.visible');
    // Plotly's info_array coercion: an invalid end takes the default's.
    const dflt = range as [number, number];
    const r = ctx.coerce<unknown[]>('gauge.axis.range', dflt);
    range = dflt.map((d, i) => {
      const v = r[i];
      return typeof v === 'number' && Number.isFinite(v) ? v : d;
    });
    (getIn(traceOut, 'gauge.axis') as Record<string, unknown>)['range'] = range;
    supplyGaugeAxisDefaults(traceIn, getIn(traceOut, 'gauge.axis') as Record<string, unknown>, ctx);
  } else {
    ctx.coerce('title.align', 'center');
    ctx.coerce('align', 'center');
    traceOut['_isAngular'] = false;
    traceOut['_isBullet'] = false;
  }
  traceOut['_range'] = range;
}
