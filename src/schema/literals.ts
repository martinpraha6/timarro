/**
 * Shared enumerations for the timeline JSON contract.
 *
 * Kept dependency-free so both the embed validator and the Zod schema can
 * import the same values — types are derived from the arrays, not duplicated.
 */

export const PRECISIONS = ['year', 'month', 'day', 'datetime'] as const;
export const SOURCE_TYPES = ['manual', 'text', 'json', 'video', 'audio'] as const;
export const VISIBILITIES = ['public', 'unlisted', 'private'] as const;

export type Precision = (typeof PRECISIONS)[number];
export type SourceType = (typeof SOURCE_TYPES)[number];
export type Visibility = (typeof VISIBILITIES)[number];
