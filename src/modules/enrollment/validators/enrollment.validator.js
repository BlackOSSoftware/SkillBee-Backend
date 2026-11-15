import { z } from 'zod';
import {
  COURSE_COMPLETION_STATUSES,
  ENROLLMENT_STATUSES,
  ENROLLMENT_TYPES,
} from '../../../models/CourseEnrollment.js';

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid ObjectId');

export const createEnrollmentBody = z.object({
  studentId: objectId,
  courseId: objectId,
  enrollmentType: z.enum(ENROLLMENT_TYPES).optional().default('admin_granted'),
  status: z.enum(['active', 'pending']).optional().default('active'),
  enrollmentExpiresAt: z.coerce.date().optional().nullable(),
  reason: z.string().trim().max(2000).optional(),
  allowUnpublished: z.boolean().optional().default(false),
});

export const updateEnrollmentBody = z
  .object({
    status: z.enum(ENROLLMENT_STATUSES).optional(),
    enrollmentType: z.enum(ENROLLMENT_TYPES).optional(),
    enrollmentExpiresAt: z.coerce.date().nullable().optional(),
    reason: z.string().trim().max(2000).optional(),
    revocationReason: z.string().trim().max(2000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field required' });

export const statusBody = z.object({
  status: z.enum(ENROLLMENT_STATUSES),
  reason: z.string().trim().max(2000).optional(),
});

export const revokeBody = z
  .object({
    reason: z.string().trim().max(2000).optional(),
  })
  .default({});

export const selfEnrollBody = z.object({
  courseId: objectId,
});

export const enrollmentIdParams = z.object({
  id: objectId,
});

export const courseIdParams = z.object({
  courseId: objectId,
});

export const studentIdParams = z.object({
  studentId: objectId,
});

export const lessonIdParams = z.object({
  id: objectId,
});

export const adminListQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  courseId: objectId.optional(),
  studentId: objectId.optional(),
  status: z.enum(ENROLLMENT_STATUSES).optional(),
  enrollmentType: z.enum(ENROLLMENT_TYPES).optional(),
  search: z.string().trim().max(200).optional(),
  enrolledFrom: z.coerce.date().optional(),
  enrolledTo: z.coerce.date().optional(),
  expiresFrom: z.coerce.date().optional(),
  expiresTo: z.coerce.date().optional(),
  progressMin: z.coerce.number().min(0).max(100).optional(),
  progressMax: z.coerce.number().min(0).max(100).optional(),
  courseCompletionStatus: z.enum(COURSE_COMPLETION_STATUSES).optional(),
  sortBy: z
    .enum(['enrolledAt', 'expiresAt', 'progressPercentage', 'createdAt', 'updatedAt'])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const myCoursesQuery = z.object({
  filter: z
    .enum(['all', 'active', 'in_progress', 'completed', 'pending', 'not_started', 'expired'])
    .optional()
    .default('all'),
});

export const completeLessonBody = z
  .object({
    watchDurationSeconds: z.number().int().min(0).optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    // Defense in depth — trusted progress fields must never be accepted
    const forbidden = [
      'progressPercentage',
      'completedLessonsCount',
      'isCourseCompleted',
      'courseCompletionStatus',
    ];
    for (const key of forbidden) {
      if (Object.prototype.hasOwnProperty.call(val, key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Field ${key} is not allowed`,
          path: [key],
        });
      }
    }
  });
