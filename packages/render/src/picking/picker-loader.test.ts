import { describe, expect, it } from 'vitest';
import { createPicker } from './picker.ts';
import { loadPicker } from './picker-loader.ts';

describe('loadPicker', () => {
  it('resolves with createPicker, once loaded at once', async () => {
    const first = loadPicker();
    const second = loadPicker();
    expect(await first).toBe(createPicker);
    expect(await second).toBe(createPicker);
    expect(await loadPicker()).toBe(createPicker);
  });
});
