import type { Precision } from '../schema/types';

/** Thrown by {@link parseFuzzyDate} with a human-readable message. */
export class TimarroDateError extends Error {
  override name = 'TimarroDateError';
}

export interface TimeOfDay {
  hour: number;
  minute: number;
  second: number;
  /** Signed minutes east of UTC; 0 for `Z` and for naive datetimes (treated as UTC). */
  offsetMinutes: number;
}

export interface DateParts {
  year: number;
  month?: number; // 1–12
  day?: number; // 1–31
  time?: TimeOfDay;
  /** Granularity derived from the string shape. */
  precision: Precision;
}

/**
 * A fuzzy value resolved to a half-open interval `[earliest, latest)` in UTC epoch ms.
 * `datetime` values are exact points (`earliest === latest === mid`).
 */
export interface ResolvedInstant {
  earliest: number;
  latest: number;
  mid: number;
}

const YEAR_RE = /^(\d{4})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})?$/;

const GRAMMAR_HINT = 'expected YYYY, YYYY-MM, YYYY-MM-DD, or YYYY-MM-DDTHH:mm[:ss][Z|±HH:MM]';

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function monthLength(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH[month - 1] ?? 0;
}

/**
 * UTC epoch ms without `Date.UTC`'s 0–99 → 1900+ mapping (years like 0079 must work).
 */
function utcTime(year: number, month = 1, day = 1, hour = 0, minute = 0, second = 0): number {
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  d.setUTCHours(hour, minute, second, 0);
  return d.getTime();
}

/** Parse a v1 fuzzy-date string (see grammar in schema/types.ts). Throws {@link TimarroDateError}. */
export function parseFuzzyDate(input: string): DateParts {
  if (input.startsWith('-') || input.startsWith('−')) {
    throw new TimarroDateError(`BCE dates are not supported in v1 (got "${input}")`);
  }
  if (/^\d{5,}/.test(input)) {
    throw new TimarroDateError(`years beyond 9999 are not supported (got "${input}")`);
  }

  let match: RegExpExecArray | null;
  let parts: DateParts;

  if ((match = YEAR_RE.exec(input))) {
    parts = { year: Number(match[1]), precision: 'year' };
  } else if ((match = MONTH_RE.exec(input))) {
    parts = { year: Number(match[1]), month: Number(match[2]), precision: 'month' };
  } else if ((match = DAY_RE.exec(input))) {
    parts = {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      precision: 'day',
    };
  } else if ((match = DATETIME_RE.exec(input))) {
    parts = {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      time: {
        hour: Number(match[4]),
        minute: Number(match[5]),
        second: match[6] !== undefined ? Number(match[6]) : 0,
        offsetMinutes: parseOffset(match[7], input),
      },
      precision: 'datetime',
    };
  } else {
    throw new TimarroDateError(`invalid date "${input}" — ${GRAMMAR_HINT}`);
  }

  if (parts.year === 0) {
    // ISO 8601 year 0000 is 1 BCE.
    throw new TimarroDateError(`BCE dates are not supported in v1 (got "${input}")`);
  }
  if (parts.month !== undefined && (parts.month < 1 || parts.month > 12)) {
    throw new TimarroDateError(`month out of range in "${input}"`);
  }
  if (parts.day !== undefined) {
    const max = monthLength(parts.year, parts.month ?? 1);
    if (parts.day < 1 || parts.day > max) {
      throw new TimarroDateError(`day out of range in "${input}" (month has ${max} days)`);
    }
  }
  if (parts.time) {
    const { hour, minute, second } = parts.time;
    if (hour > 23) throw new TimarroDateError(`hour out of range in "${input}"`);
    if (minute > 59) throw new TimarroDateError(`minute out of range in "${input}"`);
    if (second > 59) throw new TimarroDateError(`second out of range in "${input}"`);
  }
  return parts;
}

function parseOffset(raw: string | undefined, input: string): number {
  if (raw === undefined || raw === 'Z') return 0;
  const sign = raw.startsWith('-') ? -1 : 1;
  const hours = Number(raw.slice(1, 3));
  const minutes = Number(raw.slice(4, 6));
  if (hours > 14) throw new TimarroDateError(`UTC offset out of range in "${input}"`);
  if (minutes > 59) throw new TimarroDateError(`UTC offset minutes out of range in "${input}"`);
  return sign * (hours * 60 + minutes);
}

/** Resolve parsed parts to their uncertainty interval (see {@link ResolvedInstant}). */
export function resolveInstant(parts: DateParts): ResolvedInstant {
  let earliest: number;
  let latest: number;

  switch (parts.precision) {
    case 'year':
      earliest = utcTime(parts.year);
      latest = utcTime(parts.year + 1);
      break;
    case 'month': {
      const m = parts.month ?? 1;
      earliest = utcTime(parts.year, m);
      latest = m === 12 ? utcTime(parts.year + 1, 1) : utcTime(parts.year, m + 1);
      break;
    }
    case 'day':
      earliest = utcTime(parts.year, parts.month ?? 1, parts.day ?? 1);
      latest = earliest + 24 * 60 * 60 * 1000;
      break;
    case 'datetime': {
      const t = parts.time ?? { hour: 0, minute: 0, second: 0, offsetMinutes: 0 };
      const naive = utcTime(
        parts.year,
        parts.month ?? 1,
        parts.day ?? 1,
        t.hour,
        t.minute,
        t.second,
      );
      earliest = naive - t.offsetMinutes * 60 * 1000;
      latest = earliest;
      break;
    }
  }
  return { earliest, latest, mid: (earliest + latest) / 2 };
}
