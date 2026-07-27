/**
 * The engine's input contract — mirrors §5 of the Timarro concept doc.
 *
 * Platform bookkeeping fields (`timelineId`, `revision`, `createdBy`, `visibility`,
 * `sourceTypes`) are optional here: the renderer must not require them to draw.
 * Unknown extra fields are ignored by validation.
 *
 * Optional fields are typed as `T | undefined` (not bare `T?`) so they stay
 * assignable under `exactOptionalPropertyTypes` with Zod's `.optional()` inference
 * and with values that may be explicitly `undefined`.
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
  end?: string | undefined;
  precision: Precision;
  circa?: boolean | undefined;
}

export interface TimarroEvent {
  id: string;
  title: string;
  date: TimarroDate;
  description?: string | undefined;
  /** Free-text people/places/orgs (v1 — no normalized entity table yet). */
  entities?: string[] | undefined;
  /** Only http(s) URLs are rendered; others are dropped at render time. */
  mediaUrls?: string[] | undefined;
  /** Pointer back into the original source (timestamp, page, …) — shown as plain text. */
  sourceRef?: string | undefined;
  /**
   * Optional per-event accent (any CSS color: `#d6451b`, `rebeccapurple`,
   * `rgb(…)`, …). Overrides `--timarro-accent` for this event's marker, range
   * band, and uncertainty band. Invalid values are ignored at render time.
   */
  color?: string | undefined;
  /** Sort tie-break for events with identical start instants (default 0). */
  order?: number | undefined;
  timelineId?: string | undefined;
  revision?: number | undefined;
}

export interface TimelineMeta {
  id: string;
  title: string;
  description?: string | undefined;
  coverImageUrl?: string | undefined;
  createdBy?: string | undefined;
  visibility?: 'public' | 'unlisted' | 'private' | undefined;
  sourceTypes?: SourceType[] | undefined;
}

export interface TimarroTimelineData {
  timeline: TimelineMeta;
  events: TimarroEvent[];
}
