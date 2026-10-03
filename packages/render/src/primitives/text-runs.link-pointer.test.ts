import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  handleTextLinkPointer,
  openTextLink,
  type TextLink,
  type TextLinkPointerEvent,
} from './text-runs.ts';

const link: TextLink = { href: 'https://example.org/a' };

/** A browser-like `window` with a recording `open`. */
function stubWindow() {
  const open = vi.fn();
  vi.stubGlobal('window', { open });
  return open;
}

const event = (type: string, button = 0): TextLinkPointerEvent => ({
  type,
  button,
  cursor: undefined,
});

afterEach(() => vi.unstubAllGlobals());

describe('openTextLink', () => {
  it('opens in a new tab by default, without an opener', () => {
    const open = stubWindow();
    openTextLink(link);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('https://example.org/a', '_blank', 'noopener');
  });

  it("opens in the link's target", () => {
    const open = stubWindow();
    openTextLink({ href: 'https://example.org/b', target: '_self' });
    expect(open).toHaveBeenCalledWith('https://example.org/b', '_self', 'noopener');
  });
});

describe('handleTextLinkPointer', () => {
  it('shows a pointer cursor while over a link, without opening it', () => {
    const open = stubWindow();
    const move = event('move');
    expect(handleTextLinkPointer(move, link)).toBe(true);
    expect(move.cursor).toBe('pointer');
    expect(open).not.toHaveBeenCalled();
  });

  it('opens the link on a primary click only', () => {
    const open = stubWindow();
    expect(handleTextLinkPointer(event('click', 0), link)).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('https://example.org/a', '_blank', 'noopener');
    // Middle and secondary clicks are taken (no zoom or pan starts) but open nothing.
    expect(handleTextLinkPointer(event('click', 1), link)).toBe(true);
    expect(handleTextLinkPointer(event('click', 2), link)).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('takes down, up and dblclick so the gesture does nothing else, leaving the cursor alone', () => {
    const open = stubWindow();
    for (const type of ['down', 'up', 'dblclick']) {
      const e = event(type);
      expect(handleTextLinkPointer(e, link)).toBe(true);
      expect(e.cursor).toBeUndefined();
    }
    expect(open).not.toHaveBeenCalled();
  });

  it('leaves wheel and leave to the chart, even over a link', () => {
    const open = stubWindow();
    expect(handleTextLinkPointer(event('wheel'), link)).toBe(false);
    expect(handleTextLinkPointer(event('leave'), link)).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('handles nothing where there is no link', () => {
    const open = stubWindow();
    for (const type of ['move', 'click', 'down']) {
      const e = event(type);
      expect(handleTextLinkPointer(e, null)).toBe(false);
      expect(e.cursor).toBeUndefined();
    }
    expect(open).not.toHaveBeenCalled();
  });

  it('still takes the click where there is no window to open the link in', () => {
    // Server-side or worker use: no `window`.
    expect(typeof window).toBe('undefined');
    expect(handleTextLinkPointer(event('click', 0), link)).toBe(true);
  });
});
