/**
 * Subpath entry `timarro/schema` — the canonical (Zod) contract for platform-side
 * validation and tooling. The core element entry stays dependency-free; never
 * import this module from src/index.ts or src/element.ts.
 */
export type * from './types';
export { PRECISIONS, SOURCE_TYPES, VISIBILITIES } from './literals';
export {
  precisionSchema,
  sourceTypeSchema,
  visibilitySchema,
  timarroDateSchema,
  timarroEventSchema,
  timelineMetaSchema,
  timarroTimelineDataSchema,
} from './zod';
export { validateTimelineData, explainDateProblem } from './validate';
export type { ValidationIssue, ValidationResult } from './validate';
