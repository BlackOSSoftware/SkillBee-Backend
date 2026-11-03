import { z } from 'zod';
import { SUBMISSION_STATUS } from '../../../config/security.js';
import { objectId } from './assignment.validator.js';

export const submitAssignmentSchema = z
  .object({
    textContent: z.string().max(50000).optional(),
  })
  .strict()
  .refine(
    (data) => {
      const forbidden = [
        'marksAwarded',
        'feedback',
        'evaluatedBy',
        'evaluatedAt',
        'submissionStatus',
        'isLate',
      ];
      return !forbidden.some((k) => Object.prototype.hasOwnProperty.call(data, k));
    },
    { message: 'Student cannot submit grading fields' }
  );

export const gradeSubmissionSchema = z
  .object({
    marksAwarded: z.number().min(0),
    feedback: z.string().max(10000).optional(),
    status: z.enum(['evaluated', 'returned']).optional(),
  })
  .strict();

export const returnSubmissionSchema = z
  .object({
    feedback: z.string().max(10000).optional(),
  })
  .strict();

export const submissionIdParamSchema = z.object({ id: objectId }).strict();

export const listSubmissionsQuerySchema = z
  .object({
    assignmentId: objectId.optional(),
    courseId: objectId.optional(),
    studentId: objectId.optional(),
    status: z.enum(SUBMISSION_STATUS).optional(),
    isLate: z.union([z.literal('true'), z.literal('false'), z.boolean()]).optional(),
    search: z.string().max(200).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  })
  .strict();
