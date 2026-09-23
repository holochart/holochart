const nativeDescriptor =
  Object.getOwnPropertyDescriptor(window, 'devicePixelRatio') ??
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window) as object, 'devicePixelRatio');

/**
 * Overrides `window.devicePixelRatio` so examples (which read it when they start) render at a
 * chosen pixel ratio. `null` restores the native value. Must be applied before `run(el)`.
 */
export function setDevicePixelRatio(value: number | null): void {
  if (value === null) {
    if (nativeDescriptor) Object.defineProperty(window, 'devicePixelRatio', nativeDescriptor);
    return;
  }
  Object.defineProperty(window, 'devicePixelRatio', {
    configurable: true,
    enumerable: true,
    get: () => value,
  });
}
