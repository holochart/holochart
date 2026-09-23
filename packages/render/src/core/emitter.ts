/**
 * Minimal typed event emitter used by the render loop and render root.
 *
 * Listener lists are copy-on-write arrays so `emit` (called every frame) iterates by index without
 * allocating, and listeners may unsubscribe themselves during dispatch.
 */
export class Emitter<Events extends object> {
  #listeners = new Map<keyof Events, ReadonlyArray<(payload: never) => void>>();

  /** Subscribe to `type`. Returns an idempotent unsubscribe function. */
  on<K extends keyof Events>(type: K, listener: (payload: Events[K]) => void): () => void {
    const list = this.#listeners.get(type) ?? [];
    this.#listeners.set(type, [...list, listener as (payload: never) => void]);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const current = this.#listeners.get(type);
      if (!current) return;
      const next = current.filter((l) => l !== listener);
      if (next.length) this.#listeners.set(type, next);
      else this.#listeners.delete(type);
    };
  }

  /** Whether anything listens to `type` (lets callers skip building payloads). */
  has(type: keyof Events): boolean {
    return this.#listeners.has(type);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const list = this.#listeners.get(type) as ReadonlyArray<(p: Events[K]) => void> | undefined;
    if (!list) return;
    for (let i = 0; i < list.length; i++) list[i]!(payload);
  }

  clear(): void {
    this.#listeners.clear();
  }
}
