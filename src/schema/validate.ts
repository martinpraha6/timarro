import { parseFuzzyDate, resolveInstant } from '../model/date';
import { PRECISIONS, SOURCE_TYPES, VISIBILITIES } from './literals';
import type { Precision, TimarroDate, TimarroTimelineData } from './types';

/**
 * Dependency-free structural validator — used by the element at runtime so the
 * embed bundle ships without zod. The canonical Zod schema (`timarro/schema`)
 * delegates its date semantics to {@link explainDateProblem}, keeping the two
 * validators in sync by construction (plus a parity test).
 *
 * Semantics: collects ALL issues (no fail-fast); unknown extra fields are ignored;
 * on success returns the same object reference, typed.
 */

export interface ValidationIssue {
  /** Dotted/indexed path, e.g. `events[3].date.precision`; `(root)` for the top level. */
  path: string;
  message: string;
}

export type ValidationResult =
  { ok: true; data: TimarroTimelineData } | { ok: false; issues: ValidationIssue[] };

/**
 * The single source of truth for date-field semantics (grammar, precision match,
 * end-not-before-start). Returns `null` when the date object is consistent.
 */
export function explainDateProblem(
  date: TimarroDate,
): { field: 'start' | 'end' | 'precision'; message: string } | null {
  let startParts;
  try {
    startParts = parseFuzzyDate(date.start);
  } catch (error) {
    return { field: 'start', message: messageOf(error) };
  }
  if (date.precision !== startParts.precision) {
    return {
      field: 'precision',
      message: `precision "${date.precision}" does not match start "${date.start}" (which is ${startParts.precision}-precision)`,
    };
  }
  if (date.end !== undefined) {
    let endParts;
    try {
      endParts = parseFuzzyDate(date.end);
    } catch (error) {
      return { field: 'end', message: messageOf(error) };
    }
    const start = resolveInstant(startParts);
    const end = resolveInstant(endParts);
    if (end.latest < start.earliest) {
      return { field: 'end', message: `end "${date.end}" is before start "${date.start}"` };
    }
  }
  return null;
}

export function validateTimelineData(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  const push = (path: string, message: string) => issues.push({ path, message });

  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [{ path: '(root)', message: 'expected an object with { timeline, events }' }],
    };
  }

  const timeline = input['timeline'];
  if (!isRecord(timeline)) {
    push('timeline', 'expected an object');
  } else {
    requireNonEmptyString(timeline, 'id', 'timeline', push);
    requireNonEmptyString(timeline, 'title', 'timeline', push);
    optionalString(timeline, 'description', 'timeline', push);
    optionalString(timeline, 'coverImageUrl', 'timeline', push);
    optionalString(timeline, 'createdBy', 'timeline', push);
    optionalEnum(timeline, 'visibility', 'timeline', VISIBILITIES, push);
    optionalStringArray(timeline, 'sourceTypes', 'timeline', push, SOURCE_TYPES);
  }

  const events = input['events'];
  if (!Array.isArray(events)) {
    push('events', 'expected an array');
  } else {
    events.forEach((event, i) => {
      validateEvent(event, `events[${i}]`, push);
    });
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, data: input as unknown as TimarroTimelineData };
}

function validateEvent(event: unknown, base: string, push: (p: string, m: string) => void): void {
  if (!isRecord(event)) {
    push(base, 'expected an object');
    return;
  }
  requireNonEmptyString(event, 'id', base, push);
  requireNonEmptyString(event, 'title', base, push);
  optionalString(event, 'description', base, push);
  optionalString(event, 'sourceRef', base, push);
  optionalString(event, 'color', base, push);
  optionalString(event, 'timelineId', base, push);
  optionalStringArray(event, 'entities', base, push);
  optionalStringArray(event, 'mediaUrls', base, push);
  optionalFiniteNumber(event, 'order', base, push);
  optionalFiniteNumber(event, 'revision', base, push);

  const date = event['date'];
  if (!isRecord(date)) {
    push(`${base}.date`, 'expected an object with { start, precision }');
    return;
  }
  let structurallySound = true;
  if (typeof date['start'] !== 'string') {
    push(`${base}.date.start`, 'expected a string');
    structurallySound = false;
  }
  if (!PRECISIONS.includes(date['precision'] as Precision)) {
    push(`${base}.date.precision`, `expected one of: ${PRECISIONS.join(', ')}`);
    structurallySound = false;
  }
  if (date['end'] !== undefined && typeof date['end'] !== 'string') {
    push(`${base}.date.end`, 'expected a string');
    structurallySound = false;
  }
  if (date['circa'] !== undefined && typeof date['circa'] !== 'boolean') {
    push(`${base}.date.circa`, 'expected a boolean');
  }
  if (structurallySound) {
    const problem = explainDateProblem(date as unknown as TimarroDate);
    if (problem) push(`${base}.date.${problem.field}`, problem.message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requireNonEmptyString(
  obj: Record<string, unknown>,
  key: string,
  base: string,
  push: (p: string, m: string) => void,
): void {
  const value = obj[key];
  if (typeof value !== 'string' || value.length === 0) {
    push(`${base}.${key}`, 'expected a non-empty string');
  }
}

function optionalString(
  obj: Record<string, unknown>,
  key: string,
  base: string,
  push: (p: string, m: string) => void,
): void {
  const value = obj[key];
  if (value !== undefined && typeof value !== 'string') {
    push(`${base}.${key}`, 'expected a string');
  }
}

function optionalEnum(
  obj: Record<string, unknown>,
  key: string,
  base: string,
  allowed: readonly string[],
  push: (p: string, m: string) => void,
): void {
  const value = obj[key];
  if (value === undefined) return;
  if (typeof value !== 'string' || !allowed.includes(value)) {
    push(`${base}.${key}`, `expected one of: ${allowed.join(', ')}`);
  }
}

function optionalFiniteNumber(
  obj: Record<string, unknown>,
  key: string,
  base: string,
  push: (p: string, m: string) => void,
): void {
  const value = obj[key];
  if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) {
    push(`${base}.${key}`, 'expected a finite number');
  }
}

function optionalStringArray(
  obj: Record<string, unknown>,
  key: string,
  base: string,
  push: (p: string, m: string) => void,
  allowed?: readonly string[],
): void {
  const value = obj[key];
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    push(`${base}.${key}`, 'expected an array of strings');
    return;
  }
  value.forEach((item, i) => {
    if (typeof item !== 'string') {
      push(`${base}.${key}[${i}]`, 'expected a string');
    } else if (allowed && !allowed.includes(item)) {
      push(`${base}.${key}[${i}]`, `expected one of: ${allowed.join(', ')}`);
    }
  });
}
