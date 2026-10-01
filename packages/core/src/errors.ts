/**
 * Base class of the errors holochart throws or rejects with on purpose (S1.8, S2.4):
 * `error instanceof HolochartError`.
 */
export class HolochartError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'HolochartError';
  }
}
