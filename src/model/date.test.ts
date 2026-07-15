import { describe, expect, it } from 'vitest';
import { parseFuzzyDate, resolveInstant, TimarroDateError } from './date';

function resolve(input: string) {
  return resolveInstant(parseFuzzyDate(input));
}

describe('parseFuzzyDate — grammar', () => {
  it('derives precision from the string shape', () => {
    expect(parseFuzzyDate('1943').precision).toBe('year');
    expect(parseFuzzyDate('1943-05').precision).toBe('month');
    expect(parseFuzzyDate('1943-05-12').precision).toBe('day');
    expect(parseFuzzyDate('1943-05-12T14:30').precision).toBe('datetime');
    expect(parseFuzzyDate('1943-05-12T14:30:15Z').precision).toBe('datetime');
    expect(parseFuzzyDate('1943-05-12T14:30+02:00').precision).toBe('datetime');
  });

  it('rejects non-grammar strings', () => {
    for (const bad of [
      'May 1943',
      '1943-5',
      '1943-05-1',
      '43',
      '1943/05/12',
      '',
      '1943-05-12 14:30',
    ]) {
      expect(() => parseFuzzyDate(bad), bad).toThrow(TimarroDateError);
      expect(() => parseFuzzyDate(bad), bad).toThrow(/invalid date/);
    }
  });

  it('rejects BCE dates with a specific message', () => {
    expect(() => parseFuzzyDate('-0044')).toThrow(/BCE dates are not supported/);
    expect(() => parseFuzzyDate('0000')).toThrow(/BCE dates are not supported/);
    expect(() => parseFuzzyDate('0000-05')).toThrow(/BCE dates are not supported/);
  });

  it('rejects years beyond 9999', () => {
    expect(() => parseFuzzyDate('12345')).toThrow(/years beyond 9999/);
  });

  it('validates calendar ranges', () => {
    expect(() => parseFuzzyDate('1943-13')).toThrow(/month out of range/);
    expect(() => parseFuzzyDate('1943-00')).toThrow(/month out of range/);
    expect(() => parseFuzzyDate('1943-05-00')).toThrow(/day out of range/);
    expect(() => parseFuzzyDate('1943-04-31')).toThrow(/day out of range/);
    expect(() => parseFuzzyDate('1943-05-12T24:00')).toThrow(/hour out of range/);
    expect(() => parseFuzzyDate('1943-05-12T14:60')).toThrow(/minute out of range/);
    expect(() => parseFuzzyDate('1943-05-12T14:30:60')).toThrow(/second out of range/);
    expect(() => parseFuzzyDate('1943-05-12T14:30+15:00')).toThrow(/offset out of range/);
    expect(() => parseFuzzyDate('1943-05-12T14:30+02:60')).toThrow(/offset minutes out of range/);
  });

  it('applies Gregorian leap-year rules', () => {
    expect(parseFuzzyDate('1944-02-29').day).toBe(29); // divisible by 4
    expect(parseFuzzyDate('2000-02-29').day).toBe(29); // divisible by 400
    expect(() => parseFuzzyDate('1943-02-29')).toThrow(/month has 28 days/);
    expect(() => parseFuzzyDate('1900-02-29')).toThrow(/month has 28 days/); // century, not /400
  });
});

describe('resolveInstant — uncertainty intervals', () => {
  it('resolves a year to the whole-year interval', () => {
    const r = resolve('1943');
    expect(r.earliest).toBe(Date.UTC(1943, 0, 1));
    expect(r.latest).toBe(Date.UTC(1944, 0, 1));
    expect(r.mid).toBe((r.earliest + r.latest) / 2);
  });

  it('resolves months, including December rollover and leap February', () => {
    const feb = resolve('1944-02');
    expect(feb.earliest).toBe(Date.UTC(1944, 1, 1));
    expect(feb.latest).toBe(Date.UTC(1944, 2, 1)); // 29 days wide
    const dec = resolve('1943-12');
    expect(dec.latest).toBe(Date.UTC(1944, 0, 1));
  });

  it('resolves a day to a 24h interval', () => {
    const r = resolve('1969-07-21');
    expect(r.earliest).toBe(Date.UTC(1969, 6, 21));
    expect(r.latest - r.earliest).toBe(24 * 60 * 60 * 1000);
  });

  it('resolves datetimes to exact points, honoring offsets', () => {
    const zulu = resolve('1969-07-16T13:32Z');
    expect(zulu.earliest).toBe(Date.UTC(1969, 6, 16, 13, 32));
    expect(zulu.latest).toBe(zulu.earliest);
    expect(zulu.mid).toBe(zulu.earliest);

    const naive = resolve('1969-07-16T13:32');
    expect(naive.earliest).toBe(zulu.earliest); // naive datetimes are UTC

    const offset = resolve('1969-07-16T13:32+02:00');
    expect(offset.earliest).toBe(Date.UTC(1969, 6, 16, 11, 32));

    const seconds = resolve('1969-07-21T02:56:15Z');
    expect(seconds.earliest).toBe(Date.UTC(1969, 6, 21, 2, 56, 15));
  });

  it('handles low 4-digit years without the Date.UTC 1900 mapping', () => {
    const r = resolve('0079');
    expect(new Date(r.earliest).toISOString()).toBe('0079-01-01T00:00:00.000Z');
    expect(new Date(r.latest).toISOString()).toBe('0080-01-01T00:00:00.000Z');
  });
});
