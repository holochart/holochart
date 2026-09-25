/**
 * Update menus (plan E5.10): the component, its attributes and the pure layout helpers behind it.
 * The DOM view and the API command dispatch and binding tracking it shares with sliders
 * (`commands.ts`) load on first use (`shared/lazy-view.ts`).
 */
// The API command dispatch and binding tracking (`commands.ts`) load with the views.
export type {
  CommandBinding,
  CommandChart,
  CommandLike,
  CommandMethod,
  SimpleBinding,
} from './commands.ts';
export type { ButtonClickedEvent } from './events.ts';
export {
  layoutUpdatemenu,
  placeUpdatemenu,
  resolveXAnchor,
  resolveYAnchor,
  UPDATEMENU_METRICS,
  updatemenuMarginPush,
  visibleUpdatemenus,
} from './layout.ts';
export type { MenuItemBox, MenuLayout } from './layout.ts';
export {
  supplyUpdatemenuDefaults,
  UPDATEMENU_LIGHT,
  updatemenuButtonAttributes,
  updatemenusAttributes,
} from './schema.ts';
export type { FullUpdatemenu, FullUpdatemenuButton } from './schema.ts';
export { updatemenusComponent, updatemenusMarginPushes } from './updatemenus.ts';
// The DOM view loads on first use (`shared/lazy-view.ts`); its types stay public.
export type {
  UpdatemenusChartLike,
  UpdatemenusView,
  UpdatemenusViewContext,
  UpdatemenusViewOptions,
} from './view.ts';
