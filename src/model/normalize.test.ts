import { describe, expect, it } from 'vitest';
import type { TimarroDate, TimarroEvent, TimarroTimelineData } from '../schema/types';
import { normalizeTimelineData } from './normalize';

function makeData(events: TimarroEvent[]): TimarroTimelineData {
  return { timeline: { id: 't', title: 'Test' }, events };
}

function makeEvent(id: string, date: TimarroDate, extra: Partial<TimarroEvent> = {}): TimarroEvent {
  return { id, title: `Event ${id}`, date, ...extra };
}

describe('normalizeTimelineData', () => {
  it('sorts by interval midpoint (a June day sorts before its bare year)', () => {
    const { events } = normalizeTimelineData(
      makeData([
        makeEvent('year', { start: '1943', precision: 'year' }),
        makeEvent('day', { start: '1943-06-15', precision: 'day' }),
      ]),
    );
    // Day midpoint = June 15 12:00; year midpoint = ~July 2 — day comes first.
    expect(events.map((e) => e.src.id)).toEqual(['day', 'year']);
  });

  it('tie-breaks identical instants by order, then title, then id', () => {
    const date: TimarroDate = { start: '1969-07-20', precision: 'day' };
    const { events } = normalizeTimelineData(
      makeData([
        makeEvent('b', date, { title: 'Zulu', order: 2 }),
        makeEvent('a', date, { title: 'Alpha', order: 1 }),
        makeEvent('d', date, { title: 'Same title' }),
        makeEvent('c', date, { title: 'Same title' }),
      ]),
    );
    // order 0 (default) precedes 1 and 2; equal titles fall back to id.
    expect(events.map((e) => e.src.id)).toEqual(['c', 'd', 'a', 'b']);
  });

  it('computes the domain across starts and range ends', () => {
    const { domain } = normalizeTimelineData(
      makeData([
        makeEvent('range', { start: '1943', end: '1945', precision: 'year' }),
        makeEvent('point', { start: '1944-06-06', precision: 'day' }),
      ]),
    );
    expect(domain).toEqual([Date.UTC(1943, 0, 1), Date.UTC(1946, 0, 1)]);
  });

  it('returns a null domain for an empty timeline', () => {
    expect(normalizeTimelineData(makeData([])).domain).toBeNull();
  });

  it('flags year/month precision and circa as fuzzy', () => {
    const { events } = normalizeTimelineData(
      makeData([
        makeEvent('y', { start: '1943', precision: 'year' }),
        makeEvent('m', { start: '1943-05', precision: 'month' }),
        makeEvent('d', { start: '1943-05-12', precision: 'day' }),
        makeEvent('dc', { start: '1943-05-13', precision: 'day', circa: true }),
        makeEvent('dt', { start: '1943-05-12T14:30Z', precision: 'datetime' }),
      ]),
    );
    const fuzzyById = Object.fromEntries(events.map((e) => [e.src.id, e.fuzzy]));
    expect(fuzzyById).toEqual({ y: true, m: true, d: false, dc: true, dt: false });
  });
});
