/**
 * Config schema (plan E1.9): non-visual, per-chart behavior. Config has its own schema so it gets
 * validation, defaults and generated docs like data and layout. Changing config re-creates the
 * chart, so edit types here are informational.
 */
import { attr } from '../schema/attr.ts';

/** The config schema. */
export const configSchema = attr.object(
  {
    responsive: attr.boolean({
      dflt: false,
      description: 'Resize the chart when its container or the window resizes.',
    }),
    staticPlot: attr.boolean({
      dflt: false,
      description: 'Render once with no interactivity (no hover, zoom or modebar).',
    }),
    displayModeBar: attr.enumerated({
      values: ['hover', true, false],
      dflt: 'hover',
      description: 'Show the modebar always (`true`), never (`false`) or on hover.',
    }),
    modeBarButtonsToRemove: attr.infoArray({
      items: attr.string(),
      freeLength: true,
      dflt: [],
      description: 'Names of default modebar buttons to remove.',
    }),
    modeBarButtonsToAdd: attr.any({
      dflt: [],
      description: 'Extra modebar buttons: names of built-in buttons or custom button objects.',
    }),
    scrollZoom: attr.flaglist({
      flags: ['cartesian', 'scene', 'geo', 'map'],
      extras: [true, false],
      dflt: 'scene+geo+map',
      description:
        'Which subplot kinds zoom on mouse wheel. `true`/`false` enable/disable all of them.',
    }),
    doubleClick: attr.enumerated({
      values: [false, 'reset', 'autosize', 'reset+autosize'],
      dflt: 'reset+autosize',
      description: 'What double-clicking the plot area does.',
    }),
    doubleClickDelay: attr.number({
      min: 0,
      dflt: 300,
      description: 'Maximum delay between two clicks of a double-click, in milliseconds.',
    }),
    editable: attr.boolean({
      dflt: false,
      description: 'Make titles, legend, annotations and shapes editable in place (E6.7).',
    }),
    edits: attr.object(
      {
        annotationPosition: attr.boolean({ dflt: false, description: 'Drag annotations.' }),
        annotationTail: attr.boolean({ dflt: false, description: 'Drag annotation arrow tails.' }),
        annotationText: attr.boolean({ dflt: false, description: 'Edit annotation text.' }),
        axisTitleText: attr.boolean({ dflt: false, description: 'Edit axis titles.' }),
        colorbarPosition: attr.boolean({ dflt: false, description: 'Drag colorbars.' }),
        colorbarTitleText: attr.boolean({ dflt: false, description: 'Edit colorbar titles.' }),
        legendPosition: attr.boolean({ dflt: false, description: 'Drag the legend.' }),
        legendText: attr.boolean({ dflt: false, description: 'Edit trace names in the legend.' }),
        shapePosition: attr.boolean({ dflt: false, description: 'Drag and resize shapes.' }),
        titleText: attr.boolean({ dflt: false, description: 'Edit the figure title.' }),
      },
      { description: 'Fine-grained editability, overriding `editable` per element.' },
    ),
    locale: attr.string({
      dflt: 'en-US',
      noBlank: true,
      description: 'BCP 47 locale for number/date formatting and UI strings.',
    }),
    toImageButtonOptions: attr.object(
      {
        format: attr.enumerated({
          values: ['png', 'jpeg', 'webp'],
          dflt: 'png',
          description: 'Image format.',
        }),
        filename: attr.string({ dflt: 'newplot', noBlank: true, description: 'File name.' }),
        width: attr.number({ min: 1, description: 'Width in CSS pixels (defaults to the chart).' }),
        height: attr.number({
          min: 1,
          description: 'Height in CSS pixels (defaults to the chart).',
        }),
        scale: attr.number({ min: 0, dflt: 1, description: 'Resolution multiplier.' }),
      },
      { description: 'Options for the modebar "download image" button.' },
    ),
    pixelRatio: attr.number({
      min: 0.25,
      max: 8,
      extras: ['auto'],
      dflt: 'auto',
      description: 'Renderer pixel ratio. `auto` uses `window.devicePixelRatio`.',
    }),
    antialias: attr.boolean({
      dflt: true,
      description: 'Request an antialiased WebGL context (fixed at context creation).',
    }),
    powerPreference: attr.enumerated({
      values: ['default', 'high-performance', 'low-power'],
      dflt: 'default',
      description: 'WebGL context power preference hint.',
    }),
    worker: attr.enumerated({
      values: [true, false, 'auto'],
      dflt: false,
      description:
        'Run the calc stage in a Web Worker (ADR-011). `auto` switches on above a data-size threshold.',
    }),
    textRenderer: attr.enumerated({
      values: ['webgl', 'dom'],
      dflt: 'webgl',
      description: 'Render text as WebGL SDF glyphs or as a DOM overlay (ADR-005).',
    }),
    strict: attr.boolean({
      dflt: false,
      description:
        'Throw on the first validation error instead of warning (once per attribute path).',
    }),
    debug: attr.boolean({
      dflt: false,
      description: 'Log update plans and pipeline timings to the console.',
    }),
  },
  { editType: 'plot', description: 'Chart configuration (non-visual behavior).' },
);
