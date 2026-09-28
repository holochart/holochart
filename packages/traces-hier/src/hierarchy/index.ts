/**
 * The hierarchy engine (plan E13.1) shared by `sunburst`, `treemap` and `icicle`: rows → tree
 * (`build.ts`), levels, drill-down targets and the partition layout (`levels.ts`), node colors
 * (`colors.ts`), labels, hover and event fields (`format.ts`), the shared calc (`calc.ts`),
 * attributes and defaults (`attributes.ts`, `defaults.ts`) and the accessible description
 * (`describe.ts`).
 */
export * from './attributes.ts';
export * from './build.ts';
export * from './calc.ts';
export * from './colors.ts';
export * from './defaults.ts';
export * from './describe.ts';
export * from './format.ts';
export * from './levels.ts';
