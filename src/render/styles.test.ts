import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyStyles } from './styles';

describe('applyStyles', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to a <style> element when adoptedStyleSheets is unavailable', () => {
    // No `adoptedStyleSheets` own/inherited key → constructable stylesheets unsupported.
    const append = vi.fn();
    const root = { append } as unknown as ShadowRoot;

    applyStyles(root);

    expect(append).toHaveBeenCalledTimes(1);
    const style = append.mock.calls[0]?.[0] as HTMLStyleElement;
    expect(style).toBeInstanceOf(HTMLStyleElement);
    expect(style.textContent?.length).toBeGreaterThan(100);
  });
});
