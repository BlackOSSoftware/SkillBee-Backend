import { z } from 'zod';
import { objectId } from './common.js';

export const createTopicSchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    description: z.string().max(5000).optional(),
    sortOrder: z.number().int().nonnegative().optional(),
    availabilityType: z.enum(['immediate', 'immediately', 'scheduled']).optional(),
    availableAt: z.coerce.date().nullable().optional(),
    status: z.enum(['draft', 'published', 'archived']).optional(),
    isRequired: z.boolean().optional(),
  })
  .strict();

export const updateTopicSchema = createTopicSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field is required' }
);

export const topicStatusSchema = z
  .object({
    status: z.enum(['draft', 'published', 'archived']),
  })
  .strict();

export const reorderTopicsSchema = z
  .object({
    topicIds: z.array(objectId).min(1).max(500).optional(),
    items: z
      .array(
        z
          .object({
            id: objectId,
            sortOrder: z.number().int().nonnegative(),
          })
          .strict()
      )
      .min(1)
      .max(500)
      .optional(),
  })
  .strict()
  .refine((data) => data.topicIds?.length || data.items?.length, {
    message: 'topicIds or items is required',
  });

export const listTopicsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(100),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  search: z.string().trim().optional(),
  includeLessons: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
});

export const topicIdParamSchema = z.object({ id: objectId });
export const topicParamsSchema = z.object({
  courseId: objectId,
  topicId: objectId.optional(),
  id: objectId.optional(),
});
