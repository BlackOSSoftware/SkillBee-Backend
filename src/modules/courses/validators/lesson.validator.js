import { z } from 'zod';
import { LESSON_TYPES } from '../../../config/security.js';
import { objectId } from './common.js';

const textContentSchema = z
  .object({
    body: z.string().max(200000),
    format: z.enum(['html', 'markdown']).optional(),
  })
  .strict();

const liveSessionSchema = z
  .object({
    meetingProvider: z.string().max(100).optional(),
    meetingUrl: z.string().url().optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    timezone: z.string().optional(),
    instructions: z.string().max(2000).optional(),
  })
  .strict();

const resourceContentSchema = z
  .object({
    resourceIds: z.array(objectId).max(50).optional(),
    instructions: z.string().max(2000).optional(),
  })
  .strict();

const videoInputSchema = z
  .object({
    source: z.enum(['uploaded', 'external']).optional(),
    provider: z.enum(['local', 'youtube', 'vimeo', 'other']).optional(),
    externalUrl: z.string().url().optional(),
  })
  .strict();

export const createLessonSchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    description: z.string().max(20000).optional(),
    type: z.enum(LESSON_TYPES),
    textContent: textContentSchema.optional(),
    liveSession: liveSessionSchema.optional(),
    resourceContent: resourceContentSchema.optional(),
    video: videoInputSchema.optional(),
    content: z
      .object({
        textContent: z.union([z.string(), textContentSchema]).optional(),
        liveSession: liveSessionSchema.optional(),
        resourceContent: resourceContentSchema.optional(),
        video: videoInputSchema.optional(),
      })
      .strict()
      .optional(),
    durationSeconds: z.number().nonnegative().optional(),
    isPreview: z.boolean().optional(),
    isRequired: z.boolean().optional(),
    sortOrder: z.number().int().nonnegative().optional(),
    scheduledAt: z.coerce.date().nullable().optional(),
    status: z.enum(['draft', 'published', 'archived']).optional(),
  })
  .strict();

export const updateLessonSchema = createLessonSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field is required' }
);

export const lessonStatusSchema = z
  .object({
    status: z.enum(['draft', 'published', 'archived']),
  })
  .strict();

export const reorderLessonsSchema = z
  .object({
    lessonIds: z.array(objectId).min(1).max(500).optional(),
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
  .refine((data) => data.lessonIds?.length || data.items?.length, {
    message: 'lessonIds or items is required',
  });

export const moveLessonSchema = z
  .object({
    targetTopicId: objectId,
    targetPosition: z.number().int().nonnegative().optional(),
    sortOrder: z.number().int().nonnegative().optional(),
  })
  .strict();

export const listLessonsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(100),
  type: z.enum(LESSON_TYPES).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  search: z.string().trim().optional(),
  scheduledAt: z.coerce.date().optional(),
  isPreview: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === true || v === 'true')),
});

export const attachmentMetaSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    resourceType: z
      .enum(['pdf', 'document', 'spreadsheet', 'presentation', 'archive', 'text'])
      .optional(),
    visibility: z.enum(['enrolled', 'preview', 'instructor_only']).optional(),
    sortOrder: z.number().int().nonnegative().optional(),
  })
  .strict();

export const updateAttachmentSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    visibility: z.enum(['enrolled', 'preview', 'instructor_only']).optional(),
    sortOrder: z.number().int().nonnegative().optional(),
    status: z.enum(['active', 'archived']).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

export const lessonIdParamSchema = z.object({
  lessonId: objectId.optional(),
  id: objectId.optional(),
}).refine((d) => d.lessonId || d.id, { message: 'lesson id required' });

export const topicIdParamSchema = z.object({ topicId: objectId });
