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
  /** Inverse of {@link toPx}; extrapolates linearly outside the canvas. */
  toTime(px: number): number;
  ticks(): Tick[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HORIZONTAL_PAD_PX = 16;
const MAX_TICKS_PER_LEVEL = 500;
const MIN_MINOR_SPACING_PX = 8;

/** Mean length of each unit, for estimating a tick count without generating one. */
const UNIT_MS: Record<TickUnit, number> = {
  day: DAY_MS,
  month: 30.44 * DAY_MS,
  year: 365.25 * DAY_MS,
  decade: 3652.5 * DAY_MS,
};

/**
 * Linear time→px scale over the (padded) domain, with calendar-aligned ticks.
 *
 * Major unit by span: > 40 y → decades, > 4 y → years, > 4 months → months, else
 * days. Those thresholds describe one screen-width of canvas, so a zoomed-in
 * canvas divides the span by `zoom` before choosing: 4× the pixels buys 4× the
 * tick detail, and the axis refines decade → year → month → day as the user
 * zooms in. The result is then coarsened while it would overrun the per-level
 * tick cap, so a long domain degrades to bigger units instead of a half-drawn
 * axis — up to the point where it can't. Decade is the coarsest unit there is,
 * so a domain past ~5,000 years exhausts the cap anyway and its ticks stop
 * part-way across the canvas; covering those spans needs a century unit.
 */
export function createTimeScale(rawDomain: [number, number], width: number, zoom = 1): TimeScale {
  const rawSpan = Math.max(rawDomain[1] - rawDomain[0], 0);
  const pad = Math.max(rawSpan * 0.05, 12 * 60 * 60 * 1000); // ≥ half a day of padding
  const domain: [number, number] = [rawDomain[0] - pad, rawDomain[1] + pad];
  const span = domain[1] - domain[0];

  const spanDays = span / DAY_MS / (zoom > 0 ? zoom : 1);
  let unit: TickUnit =
    spanDays > 40 * 365 ? 'decade' : spanDays > 4 * 365 ? 'year' : spanDays > 120 ? 'month' : 'day';
  while (tickCount(unit, span) > MAX_TICKS_PER_LEVEL) {
    const coarser = coarserUnit(unit);
    if (coarser === null) break;
    unit = coarser;
  }

  const x0 = HORIZONTAL_PAD_PX;
  const x1 = width - HORIZONTAL_PAD_PX;

  function toPx(t: number): number {
    return x0 + ((t - domain[0]) / span) * (x1 - x0);
  }

  function toTime(px: number): number {
    const usable = x1 - x0;
    if (usable <= 0) return domain[0];
    return domain[0] + ((px - x0) / usable) * span;
  }

  function ticks(): Tick[] {
    const majors = boundaries(unit, domain);
    const result: Tick[] = majors.map((t) => ({ t, level: 'major' as const }));

    // Minors are optional detail: skip them outright when there would be too
    // many to generate, so a truncated run never covers only part of the axis.
    const minorUnit = finerUnit(unit);
    if (minorUnit && tickCount(minorUnit, span) <= MAX_TICKS_PER_LEVEL) {
      const minors = boundaries(minorUnit, domain);
      const spacing = minors.length > 1 ? toPx(minors[1]!) - toPx(minors[0]!) : Infinity;
      if (spacing >= MIN_MINOR_SPACING_PX) {
        const majorSet = new Set(majors);
        for (const t of minors) {
          if (!majorSet.has(t)) result.push({ t, level: 'minor' });
        }
      }
    }
    return result.sort((a, b) => a.t - b.t);
  }

  return { domain, width, unit, toPx, toTime, ticks };
}

/** Rough boundary count for `unit` across `span` ms — good enough to cap on. */
function tickCount(unit: TickUnit, span: number): number {
  return span / UNIT_MS[unit];
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

function coarserUnit(unit: TickUnit): TickUnit | null {
  switch (unit) {
    case 'day':
      return 'month';
    case 'month':
      return 'year';
    case 'year':
      return 'decade';
    case 'decade':
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
