import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import apollo from '../../demo/data/apollo.json';
import charlesIv from '../../demo/data/charles-iv.json';
import type { TimarroTimelineData } from './types';
import { validateTimelineData } from './validate';
import { timarroTimelineDataSchema } from './zod';

const invalidFixtures = import.meta.glob<{
  default: { expectIssueContaining: string; data: unknown };
}>('../../test/fixtures/invalid/*.json', {
  eager: true,
});

/**
 * The hand-rolled validator (shipped in the embed bundle) and the canonical Zod
 * schema (timarro/schema) must agree on every fixture — they share the date
 * semantics via explainDateProblem, and this test pins the structural parts.
 */
describe('validate.ts ↔ zod schema parity', () => {
  it.each([
    ['apollo', apollo],
    ['charles-iv', charlesIv],
  ])('both accept the %s fixture', (_name, fixture) => {
    expect(validateTimelineData(fixture).ok).toBe(true);
    expect(timarroTimelineDataSchema.safeParse(fixture).success).toBe(true);
  });

  it.each(Object.entries(invalidFixtures))('both reject %s', (_path, module) => {
    const { data } = module.default;
    expect(validateTimelineData(data).ok).toBe(false);
    expect(timarroTimelineDataSchema.safeParse(data).success).toBe(false);
  });
});

describe('zod schema ↔ TS types parity', () => {
  it('z.infer matches the hand-written TimarroTimelineData (compile-time check)', () => {
    type Inferred = z.infer<typeof timarroTimelineDataSchema>;
    // Mutual assignability — fails typecheck (tsc --noEmit) if the shapes drift.
    const toType: TimarroTimelineData = {} as Inferred;
    const toInferred: Inferred = {} as TimarroTimelineData;
    void toType;
    void toInferred;
    expect(true).toBe(true);
  });
});
