import { z } from 'zod';
import { explainDateProblem } from './validate';

/**
 * Canonical Zod schema — the platform-side contract (`import from 'timarro/schema'`).
 *
 * Date semantics (grammar, precision match, end-not-before-start) delegate to
 * {@link explainDateProblem}, the same function the dependency-free runtime
 * validator uses — one grammar implementation, two validation surfaces.
 *
 * MUST NOT be imported from the core element entry (src/index.ts / src/element.ts):
 * the embed bundle ships zod-free.
 */

export const precisionSchema = z.enum(['year', 'month', 'day', 'datetime']);

export const sourceTypeSchema = z.enum(['manual', 'text', 'json', 'video', 'audio']);

export const timarroDateSchema = z
  .object({
    start: z.string(),
    end: z.string().optional(),
    precision: precisionSchema,
    circa: z.boolean().optional(),
  })
  .superRefine((date, ctx) => {
    const problem = explainDateProblem(date);
    if (problem) {
      ctx.addIssue({ code: 'custom', path: [problem.field], message: problem.message });
    }
  });

export const timarroEventSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  date: timarroDateSchema,
  description: z.string().optional(),
  entities: z.array(z.string()).optional(),
  mediaUrls: z.array(z.string()).optional(),
  sourceRef: z.string().optional(),
  color: z.string().optional(),
  order: z.number().optional(),
  timelineId: z.string().optional(),
  revision: z.number().optional(),
});

export const timelineMetaSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  coverImageUrl: z.string().optional(),
  createdBy: z.string().optional(),
  visibility: z.enum(['public', 'unlisted', 'private']).optional(),
  sourceTypes: z.array(sourceTypeSchema).optional(),
});

export const timarroTimelineDataSchema = z.object({
  timeline: timelineMetaSchema,
  events: z.array(timarroEventSchema),
});
