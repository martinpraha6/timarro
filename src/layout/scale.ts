import { utcTime } from '../model/date';

export type TickUnit = 'decade' | 'year' | 'month' | 'day';

export interface Tick {
  /** UTC epoch ms of the boundary. */
  t: number;
  level: 'major' | 'minor';
}

export interface TimeScale {
  /** Padded domain actually mapped onto the axis. */
  domain: [number, number];
  /** Canvas width in px the domain maps onto. */
  width: number;
  /** Unit of the major ticks (labels use this). */
  unit: TickUnit;
  toPx(t: number): number;
  ticks(): Tick[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HORIZONTAL_PAD_PX = 16;
const MAX_TICKS_PER_LEVEL = 500;
const MIN_MINOR_SPACING_PX = 8;

/**
 * Linear time→px scale over the (padded) domain, with calendar-aligned ticks.
 * Major unit by span: > 40 y → decades, > 4 y → years, > 4 months → months, else days.
 */
export function createTimeScale(rawDomain: [number, number], width: number): TimeScale {
  const rawSpan = Math.max(rawDomain[1] - rawDomain[0], 0);
  const pad = Math.max(rawSpan * 0.05, 12 * 60 * 60 * 1000); // ≥ half a day of padding
  const domain: [number, number] = [rawDomain[0] - pad, rawDomain[1] + pad];
  const span = domain[1] - domain[0];

  const spanDays = span / DAY_MS;
  const unit: TickUnit =
    spanDays > 40 * 365 ? 'decade' : spanDays > 4 * 365 ? 'year' : spanDays > 120 ? 'month' : 'day';

  const x0 = HORIZONTAL_PAD_PX;
  const x1 = width - HORIZONTAL_PAD_PX;

  function toPx(t: number): number {
    return x0 + ((t - domain[0]) / span) * (x1 - x0);
  }

  function ticks(): Tick[] {
    const majors = boundaries(unit, domain);
    const result: Tick[] = majors.map((t) => ({ t, level: 'major' as const }));

    const minorUnit = finerUnit(unit);
    if (minorUnit) {
      const minors = boundaries(minorUnit, domain);
      const spacing = minors.length > 1 ? toPx(minors[1]!) - toPx(minors[0]!) : Infinity;
      if (minors.length <= MAX_TICKS_PER_LEVEL && spacing >= MIN_MINOR_SPACING_PX) {
        const majorSet = new Set(majors);
        for (const t of minors) {
          if (!majorSet.has(t)) result.push({ t, level: 'minor' });
        }
      }
    }
    return result.sort((a, b) => a.t - b.t);
  }

  return { domain, width, unit, toPx, ticks };
}

function finerUnit(unit: TickUnit): TickUnit | null {
  switch (unit) {
    case 'decade':
      return 'year';
    case 'year':
      return 'month';
    case 'month':
      return 'day';
    case 'day':
      return null;
  }
}

/** Calendar-aligned boundaries of `unit` inside `[d0, d1]`, capped for safety. */
function boundaries(unit: TickUnit, [d0, d1]: [number, number]): number[] {
  const out: number[] = [];
  const push = (t: number): boolean => {
    if (t >= d0 && t <= d1) out.push(t);
    return out.length < MAX_TICKS_PER_LEVEL && t <= d1;
  };

  const startYear = new Date(d0).getUTCFullYear();
  if (unit === 'decade' || unit === 'year') {
    const step = unit === 'decade' ? 10 : 1;
    let year = unit === 'decade' ? Math.floor(startYear / 10) * 10 : startYear;
    while (push(utcTime(year))) year += step;
  } else if (unit === 'month') {
    let year = startYear;
    let month = new Date(d0).getUTCMonth() + 1;
    while (push(utcTime(year, month))) {
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  } else {
    let t = Math.floor(d0 / DAY_MS) * DAY_MS;
    while (push(t)) t += DAY_MS;
  }
  return out;
}
