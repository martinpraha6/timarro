import { describe, expect, it } from 'vitest';
import { parseFuzzyDate, utcTime } from '../model/date';
import { normalizeTimelineData, type ResolvedEvent } from '../model/normalize';
import type { TimarroDate } from '../schema/types';
import { formatDateLabel, formatEventAria, formatEventDate, formatTickLabel } from './format';

const LOCALE = 'en-US';

function resolvedEvent(date: TimarroDate): ResolvedEvent {
  const { events } = normalizeTimelineData({
    timeline: { id: 't', title: 'T' },
    events: [{ id: 'e', title: 'Event', date }],
  });
  return events[0]!;
}

describe('formatDateLabel', () => {
  it('formats per precision in UTC', () => {
    expect(formatDateLabel(parseFuzzyDate('1943'), false, LOCALE)).toBe('1943');
    expect(formatDateLabel(parseFuzzyDate('1943-05'), false, LOCALE)).toBe('May 1943');
    expect(formatDateLabel(parseFuzzyDate('1943-05-12'), false, LOCALE)).toBe('May 12, 1943');
    const dt = formatDateLabel(parseFuzzyDate('1969-07-16T13:32Z'), false, LOCALE);
    expect(dt).toContain('Jul 16, 1969');
    expect(dt).toMatch(/1:32/);
  });

  it('prefixes circa with a tilde', () => {
    expect(formatDateLabel(parseFuzzyDate('1357'), true, LOCALE)).toBe('~1357');
  });
});

describe('formatEventDate / formatEventAria', () => {
  it('formats ranges with an en dash', () => {
    const ev = resolvedEvent({ start: '1943', end: '1945-05', precision: 'year' });
    expect(formatEventDate(ev, LOCALE)).toBe('1943 – May 1945');
  });

  it('marks approximate dates in the accessible name', () => {
    const ev = resolvedEvent({ start: '1357', precision: 'year', circa: true });
    expect(formatEventAria(ev, LOCALE)).toBe('Event, ~1357, approximate');
  });
});

describe('formatTickLabel', () => {
  it('labels ticks per unit', () => {
    expect(formatTickLabel(utcTime(1969), 'year', LOCALE)).toBe('1969');
    expect(formatTickLabel(utcTime(1960), 'decade', LOCALE)).toBe('1960');
    expect(formatTickLabel(utcTime(1969, 5), 'month', LOCALE)).toBe('May');
    expect(formatTickLabel(utcTime(1969, 1), 'month', LOCALE)).toBe('Jan 1969'); // January carries the year
    expect(formatTickLabel(utcTime(1969, 7, 16), 'day', LOCALE)).toBe('Jul 16');
  });
});
