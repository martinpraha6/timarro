/**
 * The engine's input contract — mirrors §5 of the Timarro concept doc.
 *
 * Platform bookkeeping fields (`timelineId`, `revision`, `createdBy`, `visibility`,
 * `sourceTypes`) are optional here: the renderer must not require them to draw.
 * Unknown extra fields are ignored by validation.
 */

export type Precision = 'year' | 'month' | 'day' | 'datetime';

export type SourceType = 'manual' | 'text' | 'json' | 'video' | 'audio';

/**
 * Fuzzy-date grammar (v1):
 *
 *   start/end ::= YYYY | YYYY-MM | YYYY-MM-DD | YYYY-MM-DDTHH:mm[:ss][Z|±HH:MM]
 *
 * - `precision` must match the granularity of `start` (validation error otherwise).
 * - `end` is optional and may use a different granularity than `start`.
 * - Date-only values are UTC calendar dates; naive datetimes are treated as UTC.
 * - Every value resolves to a half-open interval `[earliest, latest)`; markers sit at
 *   the midpoint, uncertainty bands span the interval.
 * - `circa` is a rendering affordance ("~1943"); it does not widen the interval in v1.
 * - BCE dates (and ISO year 0000, which means 1 BCE) are rejected in v1.
 */
export interface TimarroDate {
  start: string;
  end?: string;
  precision: Precision;
  circa?: boolean;
}

export interface TimarroEvent {
  id: string;
  title: string;
  date: TimarroDate;
  description?: string;
  /** Free-text people/places/orgs (v1 — no normalized entity table yet). */
  entities?: string[];
  /** Only http(s) URLs are rendered; others are dropped at render time. */
  mediaUrls?: string[];
  /** Pointer back into the original source (timestamp, page, …) — shown as plain text. */
  sourceRef?: string;
  /** Sort tie-break for events with identical start instants (default 0). */
  order?: number;
  timelineId?: string;
  revision?: number;
}

export interface TimelineMeta {
  id: string;
  title: string;
  description?: string;
  coverImageUrl?: string;
  createdBy?: string;
  visibility?: 'public' | 'unlisted' | 'private';
  sourceTypes?: SourceType[];
}

export interface TimarroTimelineData {
  timeline: TimelineMeta;
  events: TimarroEvent[];
}
