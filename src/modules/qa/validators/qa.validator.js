import { z } from 'zod';
import { QUESTION_STATUS } from '../../../config/security.js';
import { objectId } from '../../courses/validators/common.js';

export const createQuestionBody = z
  .object({
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().min(3).max(5000),
    lessonId: objectId.optional().nullable(),
  })
  .strict();

export const createReplyBody = z
  .object({
    message: z.string().trim().min(1).max(5000),
    attachments: z
      .array(
        z
          .object({
            mediaAssetId: objectId.optional().nullable(),
            fileName: z.string().trim().max(255).optional(),
            mimeType: z.string().trim().max(120).optional(),
            publicUrl: z.string().trim().max(2000).optional(),
          })
          .strict()
      )
      .max(5)
      .optional(),
    idempotencyKey: z.string().trim().min(8).max(120).optional(),
  })
  .strict();

export const questionStatusBody = z
  .object({
    status: z.enum([QUESTION_STATUS.OPEN, QUESTION_STATUS.RESOLVED]),
  })
  .strict();

export const studentQuestionListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  courseId: objectId.optional(),
  status: z.enum([QUESTION_STATUS.OPEN, QUESTION_STATUS.RESOLVED]).optional(),
  sort: z.enum(['newest', 'last_activity']).default('newest'),
});

export const adminQuestionListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  courseId: objectId.optional(),
  status: z.enum([QUESTION_STATUS.OPEN, QUESTION_STATUS.RESOLVED]).optional(),
  /** unanswered = replyCount 0; answered = replyCount > 0 */
  answered: z.enum(['all', 'unanswered', 'answered']).default('all'),
  search: z.string().trim().max(200).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  sort: z.enum(['newest', 'last_activity']).default('newest'),
});

export const idParam = z.object({ id: objectId });
export const courseIdParam = z.object({ id: objectId });
