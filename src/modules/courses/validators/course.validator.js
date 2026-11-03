import { z } from 'zod';
import {
  cloudinaryMediaInput,
  COURSE_LEVELS,
  COURSE_STATUS,
  DURATION_UNITS,
  objectId,
  pricingInput,
  seoInput,
} from './common.js';

const learningObjective = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(1000).optional(),
    sortOrder: z.number().int().nonnegative().optional(),
  })
  .strict();

const faq = z
  .object({
    question: z.string().trim().min(1).max(300),
    answer: z.string().trim().min(1).max(2000),
    sortOrder: z.number().int().nonnegative().optional(),
  })
  .strict();

export const createCourseSchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    shortDescription: z.string().max(500).optional(),
    description: z.string().max(100000).optional(),
    thumbnail: cloudinaryMediaInput.nullable().optional(),
    gallery: z.array(cloudinaryMediaInput).max(20).optional(),
    categoryIds: z.array(objectId).max(20).optional(),
    instructorIds: z.array(objectId).max(20).optional(),
    level: z.enum(COURSE_LEVELS).optional(),
    language: z.string().trim().toLowerCase().min(2).max(10).optional(),
    durationValue: z.number().nonnegative().optional(),
    durationUnit: z.enum(DURATION_UNITS).optional(),
    isFeatured: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    learningObjectives: z.array(learningObjective).max(50).optional(),
    requirements: z.array(z.string().max(300)).max(50).optional(),
    targetAudience: z.array(z.string().max(300)).max(50).optional(),
    faqs: z.array(faq).max(50).optional(),
    tags: z.array(z.string().max(50)).max(50).optional(),
    certificate: z
      .object({
        enabled: z.boolean().optional(),
        templateId: objectId.nullable().optional(),
        minimumCompletionPercentage: z.number().min(0).max(100).optional(),
        autoIssue: z.boolean().optional(),
      })
      .strict()
      .optional(),
    enrollment: z
      .object({
        limitEnabled: z.boolean().optional(),
        maximumStudents: z.number().int().nonnegative().optional(),
      })
      .strict()
      .optional(),
    expiry: z
      .object({
        enabled: z.boolean().optional(),
        durationValue: z.number().nonnegative().optional(),
        durationUnit: z.enum(DURATION_UNITS).optional(),
      })
      .strict()
      .optional(),
    seo: seoInput.optional(),
    pricing: pricingInput.optional(),
  })
  .strict();

export const updateCourseSchema = createCourseSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field is required' }
);

export const courseStatusSchema = z
  .object({
    status: z.enum(Object.values(COURSE_STATUS)),
  })
  .strict();

export const listCoursesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  status: z.enum(Object.values(COURSE_STATUS)).optional(),
  categoryId: objectId.optional(),
  instructorId: objectId.optional(),
  level: z.enum(COURSE_LEVELS).optional(),
  language: z.string().trim().toLowerCase().optional(),
  pricingType: z.enum(['free', 'paid']).optional(),
  isFeatured: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === true || v === 'true')),
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'publishedAt', 'title', 'sortOrder'])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const reorderCoursesSchema = z
  .object({
    sortOrder: z.number().int(),
  })
  .strict();

export const assignInstructorsSchema = z
  .object({
    instructorIds: z.array(objectId).max(20),
  })
  .strict();

export const courseIdParamSchema = z.object({ id: objectId });
export const courseIdOnlyParamSchema = z.object({ courseId: objectId });
