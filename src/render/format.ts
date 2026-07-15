import type { DateParts } from '../model/date';
import { resolveInstant, utcTime } from '../model/date';
import type { ResolvedEvent } from '../model/normalize';
import type { TickUnit } from '../layout/scale';

/**
 * All formatting goes through Intl with an explicit `timeZone: 'UTC'` — resolved
 * instants are UTC, and letting the viewer's zone shift a date-only value by
 * ±1 day would be a correctness bug, not a localization feature.
 */

export function formatDateLabel(parts: DateParts, circa: boolean, locale?: string): string {
  const prefix = circa ? '~' : '';
  switch (parts.precision) {
    case 'year':
      return prefix + String(parts.year);
    case 'month':
      return (
        prefix +
        new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
          utcTime(parts.year, parts.month ?? 1),
        )
      );
    case 'day':
      return (
        prefix +
        new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
          utcTime(parts.year, parts.month ?? 1, parts.day ?? 1),
        )
      );
    case 'datetime':
      return (
        prefix +
        new Intl.DateTimeFormat(locale, {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: 'UTC',
        }).format(resolveInstant(parts).mid)
      );
  }
}

/** "May 12, 1943" / "May 1943" / "1943" / "~1943" / "1943 – May 1945". */
export function formatEventDate(ev: ResolvedEvent, locale?: string): string {
  const circa = ev.src.date.circa === true;
  const startLabel = formatDateLabel(ev.startParts, circa, locale);
  if (!ev.endParts) return startLabel;
  return `${startLabel} – ${formatDateLabel(ev.endParts, false, locale)}`;
}

/** Accessible name for an event's marker button. */
export function formatEventAria(ev: ResolvedEvent, locale?: string): string {
  const approx = ev.src.date.circa === true ? ', approximate' : '';
  return `${ev.src.title}, ${formatEventDate(ev, locale)}${approx}`;
}

export function formatTickLabel(t: number, unit: TickUnit, locale?: string): string {
  const d = new Date(t);
  switch (unit) {
    case 'decade':
    case 'year':
      return String(d.getUTCFullYear());
    case 'month': {
      const month = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(t);
      return d.getUTCMonth() === 0 ? `${month} ${d.getUTCFullYear()}` : month;
    }
    case 'day':
      return new Intl.DateTimeFormat(locale, {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }).format(t);
  }
}
