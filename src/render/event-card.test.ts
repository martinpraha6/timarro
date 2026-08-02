import { describe, expect, it, vi } from 'vitest';
import type { ResolvedEvent } from '../model/normalize';
import {
  estimateLabelWidth,
  MAX_LABEL_PX,
  MIN_RANGE_LABEL_PX,
  POINT_LABEL_CHARS,
  renderEvent,
  renderPopover,
  renderRangeBand,
  safeCssColor,
  shortenPointTitle,
} from './event-card';
import type { PositionedEvent } from './event-card';

describe('shortenPointTitle', () => {
  it('keeps short titles and truncates long ones with an ellipsis', () => {
    expect(shortenPointTitle('Battle')).toBe('Battle');
    expect(shortenPointTitle('Death of Přemysl')).toBe('Death of Př…');
    expect(shortenPointTitle('Death of Přemysl', 15)).toBe('Death of Přemy…');
    expect(shortenPointTitle('x'.repeat(POINT_LABEL_CHARS))).toHaveLength(POINT_LABEL_CHARS);
  });
});

describe('estimateLabelWidth', () => {
  it('caps range labels and sizes points from the shortened title', () => {
    expect(estimateLabelWidth('Short', 40)).toBe(MIN_RANGE_LABEL_PX);
    expect(estimateLabelWidth('Career chapter', 320)).toBe(320);
    const long = 'A very long professional role title goes here';
    expect(estimateLabelWidth(long, 50)).toBeGreaterThanOrEqual(MIN_RANGE_LABEL_PX);
    expect(estimateLabelWidth(long, 50)).toBeLessThanOrEqual(MAX_LABEL_PX);
    expect(estimateLabelWidth(long)).toBe(estimateLabelWidth(shortenPointTitle(long)));
  });
});

describe('renderEvent label placement', () => {
  const baseEv = {
    src: {
      id: 'e',
      title: 'Senior Frontend Engineer — Acme Corp',
      date: { start: '2018', end: '2019', precision: 'year' },
    },
    start: { earliest: 0, latest: 1, mid: 0.5 },
    end: { earliest: 2, latest: 3, mid: 2.5 },
    startParts: { precision: 'year', year: 2018 },
    endParts: { precision: 'year', year: 2019 },
    fuzzy: true,
  } as unknown as ResolvedEvent;

  it('places range copy above the bar (never beside/through the stripe)', () => {
    const positioned: PositionedEvent = {
      ev: baseEv,
      kind: 'range',
      x: 10,
      barWidth: 120,
      left: 10,
      top: 20,
      extent: [10, 130],
      lane: 0,
    };
    const el = renderEvent(positioned, undefined, () => undefined);
    expect(el.classList.contains('event--range')).toBe(true);
    const kids = [...el.children].map((c) => c.className);
    expect(kids[0]).toContain('event-copy');
    expect(kids[1]).toContain('marker--range');
    const label = el.querySelector('.label') as HTMLElement;
    expect(label.style.maxWidth).toBe(`${estimateLabelWidth(baseEv.src.title, 120)}px`);
    expect(label.textContent).toBe(baseEv.src.title);
    expect(label.title).toBe('');
  });

  it('shortens point labels and toggles the full title on click', () => {
    const pointEv = {
      ...baseEv,
      src: { ...baseEv.src, date: { start: '2018', precision: 'year' } },
      end: undefined,
      endParts: undefined,
    } as unknown as ResolvedEvent;
    const positioned: PositionedEvent = {
      ev: pointEv,
      kind: 'point',
      x: 40,
      barWidth: 0,
      left: 34,
      top: 10,
      extent: [34, 120],
      lane: 0,
    };
    const el = renderEvent(positioned, undefined, () => undefined);
    expect(el.classList.contains('event--point')).toBe(true);
    const kids = [...el.children].map((c) => c.className);
    expect(kids[0]).toContain('event-copy');
    expect(kids[1]).toContain('marker--point');
    const label = el.querySelector('.label') as HTMLButtonElement;
    expect(label.tagName).toBe('BUTTON');
    expect(label.textContent).toBe(shortenPointTitle(pointEv.src.title));
    expect(label.title).toBe(pointEv.src.title);
    expect(label.getAttribute('aria-expanded')).toBe('false');

    label.click();
    expect(label.textContent).toBe(pointEv.src.title);
    expect(label.classList.contains('label--expanded')).toBe(true);
    expect(label.getAttribute('aria-expanded')).toBe('true');
    expect(label.title).toBe('');
    expect(Number(el.style.zIndex)).toBeGreaterThan(0);

    label.click();
    expect(label.textContent).toBe(shortenPointTitle(pointEv.src.title));
    expect(label.classList.contains('label--expanded')).toBe(false);
    expect(label.getAttribute('aria-expanded')).toBe('false');
    expect(label.title).toBe(pointEv.src.title);
    expect(el.style.zIndex).toBe('');
  });

  it('stacks the most recently expanded title above earlier ones', () => {
    const makePoint = (id: string, title: string): PositionedEvent => ({
      ev: {
        ...baseEv,
        src: { id, title, date: { start: '2018', precision: 'year' } },
        end: undefined,
        endParts: undefined,
      } as unknown as ResolvedEvent,
      kind: 'point',
      x: 40,
      barWidth: 0,
      left: 34,
      top: 10,
      extent: [34, 120],
      lane: 0,
    });

    const first = renderEvent(
      makePoint('a', 'Přemysl receives Moravian margraviate'),
      undefined,
      () => undefined,
    );
    const second = renderEvent(
      makePoint('b', 'Přemysl seizes control of the country'),
      undefined,
      () => undefined,
    );
    const labelA = first.querySelector('.label') as HTMLButtonElement;
    const labelB = second.querySelector('.label') as HTMLButtonElement;

    labelA.click();
    const zA = Number(first.style.zIndex);
    labelB.click();
    const zB = Number(second.style.zIndex);
    expect(zB).toBeGreaterThan(zA);

    labelA.click(); // collapse
    labelA.click(); // re-expand — should rise above second
    expect(Number(first.style.zIndex)).toBeGreaterThan(zB);
  });
});

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
