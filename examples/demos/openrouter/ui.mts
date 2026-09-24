/**
 * DOM helpers shared by the OpenRouter demo examples: a toolbar row above the chart with
 * segmented toggles, styled after the default `holochart` template (ADR-021) so the controls look
 * the same in the sandbox, the visual tests and the docs.
 *
 * A `.mts` file, like `analysis.mts`, so the example registry does not treat it as an example.
 */
import type { Chart } from '@mk7s/holochart';

/** Colors of the default template (packages/core/src/templates/builtin.ts). */
export const LOOK = {
  bg: '#0a0a0f',
  grid: '#1a1a22',
  axis: '#2c2c38',
  zero: '#3e3e4c',
  text: '#a4a7b5',
  tick: '#80838f',
  title: '#eceef4',
  font: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  colorway: [
    '#ea2a37',
    '#5e74d5',
    '#9962c0',
    '#118e36',
    '#cc540a',
    '#128b8b',
    '#997600',
    '#b8267e',
  ],
} as const;

export interface Frame {
  /** The element the chart is created in. */
  chartEl: HTMLElement;
  /** The toolbar row above the chart. */
  toolbar: HTMLElement;
  /** Removes what `frame` added to the container. */
  dispose(): void;
}

/**
 * Splits `el` into a toolbar row and a chart area that takes the rest of the height, so the
 * example keeps the size it was given (the visual tests and the docs size the container).
 */
export function frame(el: HTMLElement): Frame {
  const root = document.createElement('div');
  root.style.cssText =
    'display:flex;flex-direction:column;width:100%;height:100%;' + `background:${LOOK.bg};`;
  const toolbar = document.createElement('div');
  toolbar.style.cssText =
    'display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:center;gap:6px 12px;' +
    `padding:6px 8px 0;font:9px/1 ${LOOK.font};color:${LOOK.tick};`;
  const chartEl = document.createElement('div');
  chartEl.style.cssText = 'flex:1 1 auto;min-height:0;position:relative;';
  root.append(toolbar, chartEl);
  el.appendChild(root);
  return { chartEl, toolbar, dispose: () => root.remove() };
}

/**
 * A segmented toggle (`aria-pressed` buttons in a labelled group). Calls `onChange` with the
 * chosen value; the first option starts selected unless `initial` says otherwise.
 */
export function segmented<T extends string>(
  parent: HTMLElement,
  label: string,
  options: readonly { value: T; text: string }[],
  onChange: (value: T) => void,
  initial: T | undefined = options[0]?.value,
): { set(value: T): void } {
  const group = document.createElement('div');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  group.style.cssText =
    `display:inline-flex;border:1px solid ${LOOK.axis};border-radius:3px;padding:1px;` +
    `background:${LOOK.bg};`;
  const caption = document.createElement('span');
  caption.textContent = label;
  caption.style.cssText = `font:9px/1 ${LOOK.font};color:${LOOK.tick};`;

  const buttons = options.map((option) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = option.text;
    button.dataset['value'] = option.value;
    button.style.cssText =
      'border:0;border-radius:2px;padding:4px 8px;cursor:pointer;' +
      `font:10px/1 ${LOOK.font};background:transparent;color:${LOOK.tick};`;
    button.addEventListener('click', () => {
      set(option.value);
      onChange(option.value);
    });
    return button;
  });

  function set(value: T): void {
    for (const button of buttons) {
      const on = button.dataset['value'] === value;
      button.setAttribute('aria-pressed', String(on));
      button.style.background = on ? LOOK.grid : 'transparent';
      button.style.color = on ? LOOK.title : LOOK.tick;
      button.style.boxShadow = on ? `inset 0 0 0 1px ${LOOK.zero}` : 'none';
    }
  }

  group.append(...buttons);
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:inline-flex;align-items:center;gap:6px;';
  wrap.append(caption, group);
  parent.appendChild(wrap);
  if (initial !== undefined) set(initial);
  return { set };
}

/**
 * Resolves once text is typeset and drawn. Text typesets asynchronously and the chart redraws when
 * it is done, but `chart.ready` only covers the first frame, so wait until frames stop coming.
 */
export function settled(chart: Chart, quietMs = 300, maxMs = 15_000): Promise<void> {
  return chart.ready.then(
    () =>
      new Promise<void>((resolve) => {
        const start = performance.now();
        let timer = 0;
        const done = (): void => {
          off();
          resolve();
        };
        const arm = (): void => {
          clearTimeout(timer);
          timer = window.setTimeout(done, performance.now() - start > maxMs ? 0 : quietMs);
        };
        const off = chart.on('afterrender', arm);
        arm();
      }),
  );
}

/**
 * Phone-sized containers (under 600 px): the examples drop their figure title there (the docs page
 * names every chart in a heading, and a title next to a wrapped horizontal legend overlaps it,
 * ADR-021) and hide the modebar, which touch devices show permanently over the legend.
 */
export function isNarrow(el: HTMLElement): boolean {
  return el.clientWidth > 0 && el.clientWidth < 600;
}

/** The demo charts' `config`: responsive, and no modebar on narrow containers. */
export function chartConfig(narrow: boolean): Record<string, unknown> {
  return narrow ? { responsive: true, displayModeBar: false } : { responsive: true };
}
