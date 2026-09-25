/**
 * `buttonclicked` (alias `plotly_buttonclicked`), emitted by the update-menus component. The
 * payload follows Plotly's `{ menu, button, active }`.
 */
import type { FullUpdatemenu, FullUpdatemenuButton } from './schema.ts';

/** Payload of `buttonclicked`. */
export interface ButtonClickedEvent {
  /** The menu after defaults (its `active` already updated). */
  readonly menu: FullUpdatemenu;
  /** The clicked button after defaults. */
  readonly button: FullUpdatemenuButton;
  /** The menu's active button index after the click (`-1` when an `args2` toggle turned it off). */
  readonly active: number;
  /** The DOM event behind the click (absent for programmatic clicks). */
  readonly event?: Event;
}

declare module '@mk7s/holochart-runtime' {
  interface ChartEvents {
    /** An update-menu button was clicked (E5.10), after its method ran (unless `execute: false`). */
    buttonclicked: ButtonClickedEvent;
  }
}
