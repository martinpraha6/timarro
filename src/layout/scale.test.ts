import { describe, expect, it } from 'vitest';
import { utcTime } from '../model/date';
import { createTimeScale } from './scale';

describe('createTimeScale', () => {
  it('maps the padded domain edges onto the horizontal padding', () => {
    const scale = createTimeScale([utcTime(1961), utcTime(1973)], 1000);
    expect(scale.toPx(scale.domain[0])).toBeCloseTo(16);
    expect(scale.toPx(scale.domain[1])).toBeCloseTo(1000 - 16);
    const mid = (scale.domain[0] + scale.domain[1]) / 2;
    expect(scale.toPx(mid)).toBeCloseTo(500);
  });

  it('picks the major unit from the span', () => {
    expect(createTimeScale([utcTime(1316), utcTime(1379)], 1000).unit).toBe('decade'); // 63 y
    expect(createTimeScale([utcTime(1961), utcTime(1973)], 1000).unit).toBe('year'); // 12 y
    expect(createTimeScale([utcTime(1969, 1), utcTime(1969, 12)], 1000).unit).toBe('month');
    expect(createTimeScale([utcTime(1969, 7, 1), utcTime(1969, 7, 30)], 1000).unit).toBe('day');
  });

  it('emits calendar-aligned major ticks inside the domain', () => {
    const scale = createTimeScale([utcTime(1961), utcTime(1973)], 1000);
    const majors = scale.ticks().filter((t) => t.level === 'major');
    expect(majors.length).toBeGreaterThanOrEqual(12);
    for (const tick of majors) {
      const d = new Date(tick.t);
      expect(d.getUTCMonth()).toBe(0);
      expect(d.getUTCDate()).toBe(1);
      expect(tick.t).toBeGreaterThanOrEqual(scale.domain[0]);
      expect(tick.t).toBeLessThanOrEqual(scale.domain[1]);
    }
  });

  it('adds minor ticks only when they have room', () => {
    const wide = createTimeScale([utcTime(1316), utcTime(1379)], 2000);
    expect(wide.ticks().some((t) => t.level === 'minor')).toBe(true); // years fit at ~30px
    const narrow = createTimeScale([utcTime(1316), utcTime(1379)], 200);
    expect(narrow.ticks().some((t) => t.level === 'minor')).toBe(false); // years at ~2.6px
  });

  it('handles a degenerate single-instant domain', () => {
    const t = utcTime(1969, 7, 21, 2, 56);
    const scale = createTimeScale([t, t], 800);
    expect(scale.domain[1]).toBeGreaterThan(scale.domain[0]); // half-day padding each side
    expect(Number.isFinite(scale.toPx(t))).toBe(true);
    expect(scale.ticks().length).toBeGreaterThan(0);
  });
});
