import type { TimarroEvent, TimarroTimelineData } from '../schema/types';
import { parseFuzzyDate, resolveInstant, type DateParts, type ResolvedInstant } from './date';

/** A validated event resolved onto the time axis — the renderer's working unit. */
export interface ResolvedEvent {
  src: TimarroEvent;
  start: ResolvedInstant;
  end?: ResolvedInstant | undefined;
  startParts: DateParts;
  endParts?: DateParts | undefined;
  /** True when the event carries visible uncertainty: year/month precision or `circa`. */
  fuzzy: boolean;
}

export interface NormalizedTimeline {
  /** Chronologically sorted (start.mid, then order, then title, then id). */
  events: ResolvedEvent[];
  /** `[min earliest, max latest]` across all events; null for an empty timeline. */
  domain: [number, number] | null;
}

/**
 * Resolve + sort validated data. Assumes `validateTimelineData` (or the Zod schema)
 * accepted the input — parse errors here indicate a bug, not bad user data.
 */
export function normalizeTimelineData(data: TimarroTimelineData): NormalizedTimeline {
  const events = data.events
    .map((src): ResolvedEvent => {
      const startParts = parseFuzzyDate(src.date.start);
      const endParts = src.date.end !== undefined ? parseFuzzyDate(src.date.end) : undefined;
      const start = resolveInstant(startParts);
      const end = endParts !== undefined ? resolveInstant(endParts) : undefined;
      const fuzzy =
        src.date.precision === 'year' || src.date.precision === 'month' || src.date.circa === true;
      return { src, start, end, startParts, endParts, fuzzy };
    })
    .sort(compareResolvedEvents);

  let domain: [number, number] | null = null;
  if (events.length > 0) {
    let min = Infinity;
    let max = -Infinity;
    for (const ev of events) {
      min = Math.min(min, ev.start.earliest);
      max = Math.max(max, (ev.end ?? ev.start).latest);
    }
    domain = [min, max];
  }
  return { events, domain };
}

/**
 * Total, deterministic order: start midpoint → `order` (default 0) → title → id.
 * Title/id compare by code points (not locale) so sorting is stable across environments.
 */
export function compareResolvedEvents(a: ResolvedEvent, b: ResolvedEvent): number {
  if (a.start.mid !== b.start.mid) return a.start.mid - b.start.mid;
  const orderA = a.src.order ?? 0;
  const orderB = b.src.order ?? 0;
  if (orderA !== orderB) return orderA - orderB;
  if (a.src.title !== b.src.title) return a.src.title < b.src.title ? -1 : 1;
  if (a.src.id !== b.src.id) return a.src.id < b.src.id ? -1 : 1;
  return 0;
}
