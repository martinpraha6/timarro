import { describe, expect, it, vi } from 'vitest';
import type { ResolvedEvent } from '../model/normalize';
import { renderPopover, renderRangeBand, safeCssColor } from './event-card';
import type { PositionedEvent } from './event-card';

describe('safeCssColor', () => {
  it('rejects empty and overlong values', () => {
    expect(safeCssColor('')).toBeNull();
    expect(safeCssColor('  ')).toBeNull();
    expect(safeCssColor(`#${'a'.repeat(70)}`)).toBeNull();
  });

  it('uses the literal fallback when CSS.supports is unavailable', () => {
    const original = globalThis.CSS;
    vi.stubGlobal('CSS', undefined);
    expect(safeCssColor('#0d9488')).toBe('#0d9488');
    expect(safeCssColor('not a color!!!')).toBeNull();
    vi.stubGlobal('CSS', original);
  });
});

describe('renderRangeBand', () => {
  it('returns null when no rangeBand is positioned', () => {
    const positioned = { rangeBand: undefined } as PositionedEvent;
    expect(renderRangeBand(positioned)).toBeNull();
  });
});

describe('renderPopover extras', () => {
  it('drops non-http media URLs', () => {
    const ev = {
      src: {
        id: 'e',
        title: 'T',
        date: { start: '1969', precision: 'year' },
        mediaUrls: ['javascript:alert(1)', 'ftp://example.com/x.png', 'https://example.com/ok.png'],
      },
      start: { earliest: 0, latest: 1, mid: 0.5 },
      startParts: { precision: 'year', year: 1969 },
      fuzzy: true,
    } as unknown as ResolvedEvent;

    const popover = renderPopover(ev, undefined, () => undefined);
    const imgs = popover.querySelectorAll('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0]?.src).toContain('https://example.com/ok.png');
  });
});
