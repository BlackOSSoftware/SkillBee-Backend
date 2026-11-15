import { z } from 'zod';
import { COURSE_TYPES } from '../../../config/security.js';
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

const liveSessionInput = z
  .object({
    batchName: z.string().trim().max(200).optional(),
    startDate: z.coerce.date().nullable().optional(),
    endDate: z.coerce.date().nullable().optional(),
    sessionMode: z.string().trim().max(100).optional(),
    sessionSchedule: z.string().trim().max(2000).optional(),
  })
  .strict();

const coursePayloadSchema = z
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
    courseType: z.enum(COURSE_TYPES).optional(),
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
    liveSession: liveSessionInput.optional(),
  })
  .strict();

export const createCourseSchema = coursePayloadSchema.superRefine((data, ctx) => {
  // Conditional pricing rules per course type (create-time).
  if (data.courseType === 'FREE') {
    if (data.pricing && data.pricing.type !== 'free') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'FREE courses must use free pricing (no payment required)',
        path: ['pricing', 'type'],
      });
    }
  }
  if (data.courseType === 'PRE_RECORDED') {
    if (!data.pricing || data.pricing.type !== 'paid' || !(data.pricing.regularPrice > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'PRE_RECORDED courses require paid pricing with regularPrice > 0',
        path: ['pricing', 'regularPrice'],
      });
    }
  }
  // LIVE_SESSION: pricing optional — enrollment is application-based;
  // price may be configured for the post-approval payment step.
  if (data.liveSession && data.courseType !== 'LIVE_SESSION') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'liveSession details are only allowed for LIVE_SESSION courses',
      path: ['liveSession'],
    });
  }
});

export const updateCourseSchema = coursePayloadSchema.partial().refine(
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
  courseType: z.enum(COURSE_TYPES).optional(),
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

export const courseSlugParamSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(220),
});

const phoneRegex = /^\+?[0-9][0-9\s\-()]{6,19}$/;

/**
 * Public free-course registration: visitor contact details captured as a
 * lead before account creation / enrollment.
 */
export const freeRegistrationBody = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254),
    whatsappNumber: z.string().trim().regex(phoneRegex, 'Invalid WhatsApp number'),
    currentCompany: z.string().trim().min(1).max(200),
    currentCity: z.string().trim().min(1).max(120),
  })
  .strict();
