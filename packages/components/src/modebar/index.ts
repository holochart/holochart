/**
 * The modebar (plan E5.8): the component, and the pure helpers behind it (button-set resolution,
 * zoom/reset range math) for custom toolbars and tests.
 */
export {
  MODEBAR_ZOOM_IN_FACTOR,
  MODEBAR_ZOOM_OUT_FACTOR,
  modebarAutoscaleUpdate,
  modebarAxisFixed,
  modebarDownloadImage,
  modebarResetUpdate,
  modebarSpikelinesState,
  modebarSpikelinesUpdate,
  modebarZoomRange,
  modebarZoomUpdate,
  recordModebarResetState,
} from './actions.ts';
export type {
  ModebarAxisLike,
  ModebarAxisResetEntry,
  ModebarImageSource,
  ModebarLayoutUpdate,
  ModebarResetState,
} from './actions.ts';
export {
  MODEBAR_BUILTIN_BUTTONS,
  modebarBuiltinButton,
  modebarButtonActive,
  modebarButtonsKey,
  resolveModebarButtons,
} from './buttons.ts';
export type {
  ModebarActiveState,
  ModebarBuiltinName,
  ModebarButton,
  ModebarButtonGroup,
  ModebarButtonKind,
  ModebarCustomButton,
  ModebarResolveInput,
} from './buttons.ts';
export { isModebarIcon, modebarIcons } from './icons.ts';
export type { ModebarIcon } from './icons.ts';
export {
  createModebarView,
  modebarComponent,
  modebarLayoutSchema,
  supplyModebarDefaults,
} from './modebar.ts';
export type {
  ModebarChartLike,
  ModebarView,
  ModebarViewContext,
  ModebarViewOptions,
} from './modebar.ts';
